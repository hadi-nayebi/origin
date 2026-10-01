#!/usr/bin/env node
import { pluginPresent } from "../../_engagement-core/lib/scope.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureAgentState } from "../../_engagement-core/lib/state.mjs";
import { reconcileAgentState } from "../../_engagement-core/lib/service.mjs";
import { assertMachineReady } from "../lib/machine.mjs";
import { ensureDashboardRuntime } from "../lib/runtime-control.mjs";
import { resolveCodexPane } from "../lib/codex-wake-v1.mjs";
import { inspectGitHubRepositoryAccess } from "../../../../scripts/github-repository-access.mjs";

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(runtimeRoot, "../../..");

export async function startHarness(options = {}) {
  const run = options.run || runCommand;
  const repositoryRoot = path.resolve(options.root || root);
  assertMachineReady({ run, platform: options.platform, release: options.release });
  const repositoryAccess = inspectGitHubRepositoryAccess({ cwd: repositoryRoot, run });
  if (!repositoryAccess.ok)
    throw new Error(
      `Origin requires a writable GitHub work-unit repository: ${repositoryAccess.detail}`,
    );
  const feedbackEnabled =
    !options.telegramOnly &&
    !process.argv.includes("--telegram-only") &&
    pluginPresent(repositoryRoot);
  if (feedbackEnabled) {
    ensureAgentState(repositoryRoot);
    reconcileAgentState(repositoryRoot);
  }
  const runtime = feedbackEnabled
    ? await ensureDashboardRuntime(repositoryRoot, options)
    : { state: "disabled", url: "dashboard channel disabled" };
  const session = sessionName(repositoryRoot);
  // Current Codex releases make `resume --last` start fresh when the current
  // repository has no saved interactive session. Keep an explicit new-session
  // escape hatch for owners who do not want to continue the prior conversation.
  const resume = options.resumeLast ?? !process.argv.includes("--new-session");
  const bypass = "--dangerously-bypass-approvals-and-sandbox";
  const command = resume ? ["codex", "resume", "--last", bypass] : ["codex", bypass];
  const hasSession = run("tmux", ["has-session", "-t", session]).status === 0;
  if (!hasSession) {
    assertSuccess(
      run("tmux", ["new-session", "-d", "-s", session, "-c", repositoryRoot]),
      "tmux session creation",
    );
  }
  ensureTmuxCodex(run, session, command, repositoryRoot);
  if (feedbackEnabled) await requestSessionWake(runtime.url, options.fetch || fetch);
  if (
    pluginPresent({ root: repositoryRoot, channel: "telegram-engagement" }) &&
    fs.existsSync(path.join(repositoryRoot, ".origin/telegram-engagement/enabled.json")) &&
    JSON.parse(
      fs.readFileSync(
        path.join(repositoryRoot, ".origin/telegram-engagement/enabled.json"),
        "utf8",
      ),
    ).enabled === true
  ) {
    const { startBackground } = await import(
      pathToFileURL(
        path.join(repositoryRoot, ".codex/plugins/telegram-engagement/lib/launcher.mjs"),
      )
    );
    const telegram = await startBackground(repositoryRoot);
    process.stdout.write(`Telegram listener: ${telegram.status} (PID ${telegram.pid})\n`);
  }
  if (options.insideTmux ?? Boolean(process.env.TMUX)) {
    process.stdout.write(
      `Origin dashboard: ${runtime.url}\nSwitching to interactive Codex session: ${session}\n`,
    );
    const switched = run("tmux", ["switch-client", "-t", session], { stdio: "inherit" });
    if (switched.status !== 0) throw new Error("Could not switch to the Origin tmux session.");
    return { runtime, session, attached: true };
  }
  process.stdout.write(
    `Origin dashboard: ${runtime.url}\nAttaching interactive Codex session: ${session}\n`,
  );
  const attached = run("tmux", ["attach-session", "-t", session], { stdio: "inherit" });
  if (attached.status !== 0) throw new Error("Could not attach the Origin tmux session.");
  return { runtime, session, attached: true };
}

async function requestSessionWake(url, fetcher) {
  const response = await fetcher(`${url}/api/session/wake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok)
    throw new Error("Origin could not reconcile the feedback queue for this session.");
}

export function ensureTmuxCodex(run, session, command, repositoryRoot) {
  const pane = run("tmux", [
    "list-panes",
    "-t",
    session,
    "-F",
    "#{pane_current_command}\t#{pane_current_path}\t#{pane_pid}",
  ]);
  assertSuccess(pane, "tmux session inspection");
  const panes = String(pane.stdout || "")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [currentCommand, currentPath, pid] = line.split("\t");
      return { currentCommand, currentPath, pid: Number(pid) };
    });
  if (repositoryRoot) {
    const wrongPath = panes.find(
      (item) => canonical(item.currentPath) !== canonical(repositoryRoot),
    );
    if (wrongPath)
      throw new Error(
        `Origin tmux session ${session} contains a pane outside this repository: ${wrongPath.currentPath || "unknown path"}.`,
      );
  }
  const codexPanes = panes.filter((item) => /codex/i.test(item.currentCommand));
  if (codexPanes.length === 1) {
    assertFullAccessCodex(run, codexPanes[0].pid);
    return "running";
  }
  if (codexPanes.length > 1)
    throw new Error(`Origin tmux session ${session} contains more than one Codex pane.`);
  // npm's Codex launcher can appear as node while the native Codex process is
  // its descendant. Apply the same repository-scoped proof used by wake delivery.
  if (repositoryRoot && panes.length === 1 && currentIsWrapper(panes[0]?.currentCommand)) {
    const resolved = resolveCodexPane(repositoryRoot, { run });
    if (resolved.session === session) {
      assertFullAccessCodex(run, resolved.pid);
      return "running";
    }
    throw new Error(`Origin found Codex in another tmux session: ${resolved.session}.`);
  }
  const current = panes[0]?.currentCommand || "";
  if (panes.length === 1 && /^(ba|z|fi|da|k)?sh$|^fish$/i.test(current)) {
    assertSuccess(
      run("tmux", ["send-keys", "-t", session, command.join(" "), "C-m"]),
      "Codex launch",
    );
    return "started";
  }
  throw new Error(
    `Origin tmux session ${session} does not contain exactly one Codex pane or one idle shell. It reported: ${panes.map((item) => item.currentCommand).join(", ") || "no panes"}. Attach and inspect it before retrying.`,
  );
}

function assertFullAccessCodex(run, panePid) {
  const result = run("ps", ["-e", "-o", "pid=", "-o", "ppid=", "-o", "args="]);
  assertSuccess(result, "Codex execution mode inspection");
  const processes = String(result.stdout || "")
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/))
    .filter(Boolean)
    .map((match) => ({ pid: Number(match[1]), parent: Number(match[2]), args: match[3] }));
  const descendants = new Set([panePid]);
  for (let changed = true; changed;) {
    changed = false;
    for (const process of processes) {
      if (descendants.has(process.parent) && !descendants.has(process.pid)) {
        descendants.add(process.pid);
        changed = true;
      }
    }
  }
  const codex = processes.filter(
    (process) =>
      descendants.has(process.pid) && path.basename(process.args.split(/\s+/)[0]) === "codex",
  );
  if (
    codex.length === 1 &&
    codex[0].args.split(/\s+/).includes("--dangerously-bypass-approvals-and-sandbox")
  )
    return;
  throw new Error(
    "Origin cannot reuse Codex without verified Full Access. In the existing terminal, finish or interrupt the current turn and exit Codex, then run npm run origin again. Origin preserves the conversation and will resume it with --dangerously-bypass-approvals-and-sandbox. Plugin hooks still require owner trust.",
  );
}

function currentIsWrapper(command) {
  return /^(node|nodejs)$/i.test(command || "");
}

export function sessionName(repositoryRoot) {
  const base =
    path
      .basename(repositoryRoot)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "origin";
  const hash = crypto
    .createHash("sha256")
    .update(canonical(repositoryRoot))
    .digest("hex")
    .slice(0, 8);
  return `origin-${base}-${hash}`;
}

function canonical(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}
function assertSuccess(result, label) {
  if (result.status !== 0)
    throw new Error(`${label} failed: ${String(result.stderr || "unknown error").trim()}`);
}
function runCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: options.stdio ? undefined : "utf8",
    stdio: options.stdio,
    shell: false,
    windowsHide: true,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startHarness().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
