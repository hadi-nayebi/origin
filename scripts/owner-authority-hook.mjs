#!/usr/bin/env node

let input;
try {
  input = JSON.parse(await readInput());
} catch {
  deny("Origin could not validate this tool call, so the owner-only merge boundary failed closed.");
  process.exit(0);
}

const toolName = String(input?.tool_name || "");
const toolInput = input?.tool_input || {};
const toolInputText =
  typeof toolInput === "string"
    ? toolInput
    : String(toolInput.patch || toolInput.input || toolInput.content || "");
const command = shellCommand(toolInput);
const protectedPath =
  /(?:^|[\s\\/])(?:\.codex[\\/]hooks\.json|scripts[\\/]owner-authority-hook\.mjs)\b/i;

let reason = null;
if (/github_merge_pull_request$/i.test(toolName) || /mergePullRequest/i.test(toolName))
  reason = "Pull-request merge is reserved for the user-facing Origin approval surface.";
else if (toolName === "apply_patch" && protectedPath.test(toolInputText))
  reason = "Origin authority controls cannot be changed through the agent editing tool.";
else if (command) reason = blockedShellReason(command, protectedPath);

if (reason) deny(reason);

function blockedShellReason(value, authorityPath) {
  const normalized = value.replace(/\\\s*\r?\n/g, " ");
  if (/\bgh\s+pr\s+merge\b/i.test(normalized))
    return "The agent may create and update PRs, but only the owner surface may merge one.";
  if (
    /\bgh\s+api\b/i.test(normalized) &&
    (/\/pulls\/[^\s'\"]+\/merge\b/i.test(normalized) || /mergePullRequest/i.test(normalized))
  )
    return "Direct GitHub merge API calls are reserved for the owner surface.";
  if (/mergePullRequest/i.test(normalized))
    return "GitHub's merge mutation is reserved for the owner surface.";
  if (/\/api\/feedback\/[^\s'\"]+\/merge\b/i.test(normalized))
    return "The local merge broker accepts user-interface actions, not agent shell calls.";
  if (/reviewFeedback(?:Mutation)?[\s\S]{0,160}["']resolved["']/i.test(normalized))
    return "Direct resolution is forbidden; only a GitHub-confirmed owner merge may resolve work.";
  if (/\bgit\s+push\b/i.test(normalized)) {
    const dangerousTarget =
      /(?:^|\s)(?:\+?[^\s:]+:)?(?:refs\/heads\/)?(?:main|master)(?:\s|$)/i.test(normalized) ||
      /--mirror\b|--all\b/i.test(normalized);
    if (dangerousTarget)
      return "The agent may push its feature branch, but cannot push directly to a protected base branch.";
  }
  if (
    authorityPath.test(normalized) &&
    /(?:^|[;&|]\s*|\s)(?:rm|mv|cp|install|truncate|tee|sed\s+-i|perl\s+-i)\b|>>?/i.test(normalized)
  )
    return "Origin authority hook files are owner-controlled and cannot be mutated by agent shell commands.";
  return null;
}

function shellCommand(value) {
  if (typeof value?.command === "string") return value.command;
  if (Array.isArray(value?.command)) return value.command.join(" ");
  return "";
}

function deny(reason) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })}\n`,
  );
}

async function readInput() {
  let source = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) source += chunk;
  return source;
}
