export const voiceIds = ["orientation", "blocked"];

export function renderVoice(id, event) {
  if (!voiceIds.includes(id)) throw new Error("Unknown shell-purpose voice");
  const known = new Set([
    "startup",
    "resume",
    "clear",
    "compact",
    "UserPromptSubmit",
    "SubagentStart",
    "PreToolUse",
  ]);
  const label = known.has(event) ? event : "session boundary";
  return `[shell-purpose:${id}] Objective: connect each Bash call to its intended outcome. Event: ${label}. Authority: .codex/plugins/shell-purpose/AGENTS.md and hook.mjs. Before calling Bash, state the concrete purpose in the first command line: # Purpose: <20–240 Unicode characters after trimming>. Follow it with the command on subsequent lines. Example: # Purpose: Inspect the repository status before selecting files to edit. Then: git status --short. ${id === "blocked" ? "This call was blocked before execution; correct the missing or malformed header and resubmit the intended call." : "Apply this requirement to every next Bash call."} A filled field is not proof of sound judgment or permission. Other authority hooks still apply; do not work around this check through another tool. Exit: submit a shaped purpose plus a command within the existing authorized scope.`;
}
