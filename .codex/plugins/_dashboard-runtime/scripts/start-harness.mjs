#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureAgentState } from "../../agent-stop-state/lib/state.mjs";
import { reconcileAgentState } from "../../contextual-feedback/lib/service.mjs";
import { assertMachineReady } from "../lib/machine.mjs";
import { ensureDashboardRuntime } from "../lib/runtime-control.mjs";

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(runtimeRoot, "../../..");

export async function startHarness(options = {}) {
  const run = options.run || runCommand;
  const repositoryRoot = path.resolve(options.root || root);
  assertMachineReady({ run, platform: options.platform, release: options.release });
  ensureAgentState(repositoryRoot);
  reconcileAgentState(repositoryRoot);
  const runtime = await ensureDashboardRuntime(repositoryRoot, options);
  const session = sessionName(repositoryRoot);
  const resume = options.resumeLast ?? process.argv.includes("--resume-last");
  const command = resume ? ["codex", "resume", "--last"] : ["codex"];
  const hasSession = run("tmux", ["has-session", "-t", session]).status === 0;
  if (!hasSession) {
    assertSuccess(
      run("tmux", ["new-session", "-d", "-s", session, "-c", repositoryRoot]),
      "tmux session creation",
    );
  }
  ensureTmuxCodex(run, session, command, repositoryRoot);
  await requestSessionWake(runtime.url, options.fetch || fetch);
  if (process.env.TMUX || options.insideTmux) {
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
    "#{pane_current_command}\t#{pane_current_path}",
  ]);
  assertSuccess(pane, "tmux session inspection");
  const panes = String(pane.stdout || "")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [currentCommand, currentPath] = line.split("\t");
      return { currentCommand, currentPath };
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
  if (codexPanes.length === 1) return "running";
  if (codexPanes.length > 1)
    throw new Error(`Origin tmux session ${session} contains more than one Codex pane.`);
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
