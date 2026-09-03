import { spawnSync } from "node:child_process";

export function inspectMachine(options = {}) {
  const run = options.run || runCommand;
  const platform = options.platform || process.platform;
  const release = options.release || process.release;
  const checks = [];
  checks.push(
    check("Node.js 22+", Number(process.versions.node.split(".")[0]) >= 22, process.version),
  );
  checks.push(commandCheck(run, "git", ["--version"], "Git"));
  checks.push(commandCheck(run, "tmux", ["-V"], "tmux"));
  checks.push(commandCheck(run, "codex", ["--version"], "Codex CLI"));
  const codex = checks.find((item) => item.name === "Codex CLI");
  checks.push(
    codex?.ok
      ? commandCheck(run, "codex", ["login", "status"], "Codex authentication")
      : check("Codex authentication", false, "Codex CLI is unavailable."),
  );
  const nativeWindows = platform === "win32" && !release?.name?.toLowerCase().includes("wsl");
  checks.push(
    check(
      "Interactive platform",
      !nativeWindows,
      nativeWindows
        ? "Run Origin inside WSL2; native Windows does not provide the required tmux transport."
        : "Supported interactive shell.",
    ),
  );
  return Object.freeze({
    ok: checks.every((item) => item.ok),
    checks: Object.freeze(checks),
    platform,
  });
}

export function assertMachineReady(options = {}) {
  const report = inspectMachine(options);
  if (!report.ok) {
    const failures = report.checks
      .filter((item) => !item.ok)
      .map((item) => `${item.name}: ${item.detail}`)
      .join("\n");
    throw new Error(
      `Origin requires the complete interactive Codex kit:\n${failures}\nRun the platform installer described in INSTALL.md, then retry.`,
    );
  }
  return report;
}

function commandCheck(run, command, args, name) {
  const result = run(command, args);
  return check(
    name,
    result.status === 0,
    String(result.stdout || result.stderr || `${command} is unavailable.`).trim(),
  );
}
function check(name, ok, detail) {
  return Object.freeze({ name, ok: Boolean(ok), detail: String(detail).slice(0, 500) });
}
function runCommand(command, args) {
  return spawnSync(command, args, { encoding: "utf8", shell: false, windowsHide: true });
}
