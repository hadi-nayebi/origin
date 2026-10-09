import { pathToFileURL } from "node:url";
import { renderVoice } from "./voices.mjs";

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
  if (!first.startsWith("# Purpose: ")) return false;
  const purpose = first.slice("# Purpose: ".length).trim();
  const length = [...purpose].length;
  if (length < 20 || length > 240 || /[\x00-\x1f\x7f]/.test(purpose)) return false;
  return rest.some((line) => line.trim() && !line.trimStart().startsWith("#"));
}

export function respond(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid hook input");
  const event = input.hook_event_name;
  if (["SessionStart", "UserPromptSubmit", "SubagentStart"].includes(event)) {
    return {
      hookSpecificOutput: {
        hookEventName: event,
        additionalContext: renderVoice(
          "orientation",
          event === "SessionStart" ? input.source : event,
        ),
      },
    };
  }
  if (event !== "PreToolUse" || input.tool_name !== "Bash") return null;
  if (validPurpose(commandText(input.tool_input?.command))) return null;
  return deny();
}

function deny() {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: renderVoice("blocked", "PreToolUse"),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let result;
  try {
    result = respond(JSON.parse(raw));
  } catch {
    result = deny();
  }
  if (result) process.stdout.write(JSON.stringify(result));
}
