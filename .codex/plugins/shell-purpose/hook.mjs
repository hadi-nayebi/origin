import { pathToFileURL } from "node:url";
import { renderVoice } from "./voices.mjs";
import { commandDigest, loadPolicy, persistTransaction, statePath } from "./state.mjs";

const PURPOSE_PREFIX = "# Purpose: ";
const MAX_PURPOSE = 240;
const MAX_SEGMENTS = 32;
const MAX_EXECUTABLE = 128;

export function commandText(value) {
  if (typeof value === "string") return value;
  // Codex can report Bash as an executable/argv array. Accept only a recognized -c payload.
  if (!Array.isArray(value) || !value.every((part) => typeof part === "string")) return null;
  if (!/(?:^|[\/])(?:bash|sh|zsh)$/.test(value[0] ?? "")) return null;
  const index = value.findIndex((part, i) => i > 0 && /^-[a-z]*c[a-z]*$/.test(part));
  return index > 0 && index + 1 < value.length ? value[index + 1] : null;
}

export function validPurpose(command) {
  if (typeof command !== "string") return false;
  const [first, ...rest] = command.split(/\r?\n/);
  if (!first.startsWith(PURPOSE_PREFIX)) return false;
  const purpose = first.slice(PURPOSE_PREFIX.length).trim();
  const length = [...purpose].length;
  if (length < 20 || length > 240 || /[\x00-\x1f\x7f]/.test(purpose)) return false;
  return rest.some((line) => line.trim() && !line.trimStart().startsWith("#"));
}

export function purposeText(command) {
  if (typeof command !== "string") return null;
  const first = command.split(/\r?\n/, 1)[0];
  if (!first.startsWith(PURPOSE_PREFIX)) return null;
  return first.slice(PURPOSE_PREFIX.length).trim() || null;
}

function commandBody(command) {
  if (typeof command !== "string") return "";
  const lines = command.split(/\r?\n/);
  return lines
    .slice(lines[0].startsWith("# Purpose:") ? 1 : 0)
    .join("\n")
    .trim();
}

export function splitShellSegments(body) {
  const segments = [];
  const operators = [];
  let quote = null;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    const pair = body.slice(index, index + 2);
    const operator = ["&&", "||"].includes(pair)
      ? pair
      : ["|", ";"].includes(character)
        ? character
        : null;
    if (!operator) continue;
    segments.push(body.slice(start, index).trim());
    operators.push(operator);
    index += operator.length - 1;
    start = index + 1;
  }
  segments.push(body.slice(start).trim());
  return { segments, operators, balanced: !quote && !escaped };
}

function unquote(value) {
  return value?.replace(/^["']|["']$/g, "") ?? null;
}

export function classifyCommand(command) {
  const body = commandBody(command);
  const split = splitShellSegments(body);
  const tooManySegments = split.segments.length > MAX_SEGMENTS;
  const boundedSegments = split.segments.slice(0, MAX_SEGMENTS);
  const parts = boundedSegments.map((segment) => {
    const first = segment.match(/^\s*(?:env\s+)?([^\s]+)/)?.[1] ?? "";
    const executable = unquote(first).split(/[\\/]/).pop()?.slice(0, MAX_EXECUTABLE) || null;
    const cd = segment.match(/^\s*cd(?:\s+--)?\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
    const pluginLocation = /(?:^|[\s\\/])\.codex[\\/]plugins[\\/]/.test(segment);
    return {
      family: /^\s*cd(?:\s|$)/.test(segment)
        ? "cd"
        : pluginLocation
          ? "plugin-location"
          : "command",
      executable,
      target: cd
        ? unquote(cd[1] ?? cd[2] ?? cd[3])?.slice(0, 256)
        : pluginLocation
          ? ".codex/plugins/<path>"
          : null,
    };
  });
  const overall = split.operators.includes("|")
    ? "pipeline"
    : split.operators.length
      ? "chain"
      : (parts[0]?.family ?? "command");
  return {
    overall,
    shape: `${overall}:${parts.map((part) => part.family).join("+") || "empty"}`,
    operators: split.operators.slice(0, MAX_SEGMENTS - 1),
    segments: parts,
    valid:
      Boolean(body) &&
      split.balanced &&
      !tooManySegments &&
      boundedSegments.every(Boolean) &&
      parts.every((part) => part.executable && (part.family !== "cd" || part.target)),
  };
}

export function evaluate(input, policy = loadPolicy()) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid hook input");
  const event = input.hook_event_name;
  if (["SessionStart", "UserPromptSubmit", "SubagentStart"].includes(event)) {
    return {
      output: {
        hookSpecificOutput: {
          hookEventName: event,
          additionalContext: renderVoice(
            "orientation",
            event === "SessionStart" ? input.source : event,
          ),
        },
      },
      transaction: null,
    };
  }
  if (event !== "PreToolUse" || input.tool_name !== "Bash")
    return { output: null, transaction: null };
  const command = commandText(input.tool_input?.command);
  const classification = classifyCommand(command);
  const rawPurpose = purposeText(command);
  const purposeCharacters = rawPurpose === null ? [] : [...rawPurpose];
  const purpose = rawPurpose === null ? null : purposeCharacters.slice(0, MAX_PURPOSE).join("");
  const firstLine = typeof command === "string" ? command.split(/\r?\n/, 1)[0] : "";
  const purposeProvided = firstLine.startsWith("# Purpose:");
  const purposeValid = validPurpose(command);
  const purposeOptional =
    classification.valid &&
    (policy.purposeOptionalShapes.includes(classification.shape) ||
      (classification.segments.length > 0 &&
        classification.segments.every((part) =>
          policy.purposeOptionalExecutables.includes(part.executable),
        )));
  const valid = classification.valid && (purposeValid || (!purposeProvided && purposeOptional));
  const reason = !classification.valid
    ? "invalid-shape"
    : purposeValid
      ? purposeOptional
        ? "valid-purpose-optional-with-purpose"
        : "valid-observed-shape"
      : purposeProvided
        ? "invalid-purpose"
        : purposeOptional
          ? "valid-purpose-optional"
          : "missing-purpose";
  return {
    output: valid ? null : deny("blocked"),
    transaction: {
      at: new Date().toISOString(),
      inputShape:
        typeof input.tool_input?.command === "string"
          ? "string"
          : Array.isArray(input.tool_input?.command)
            ? "argv"
            : "unsupported",
      purpose,
      purposeTruncated: purposeCharacters.length > MAX_PURPOSE,
      commandDigest: commandDigest(command),
      classification,
      decision: valid ? "abstain" : "deny",
      reason,
    },
  };
}

export function respond(input) {
  return evaluate(input).output;
}

function deny(voice = "blocked") {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: renderVoice(voice, "PreToolUse"),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let result;
  try {
    const policy = loadPolicy();
    const evaluated = evaluate(JSON.parse(raw), policy);
    result = evaluated.output;
    if (evaluated.transaction) {
      try {
        persistTransaction(statePath(), policy, evaluated.transaction);
      } catch {
        result = deny("state-failure");
      }
    }
  } catch {
    result = deny();
  }
  if (result) process.stdout.write(JSON.stringify(result));
}
