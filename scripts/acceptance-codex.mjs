#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runFeedbackLoop } from "../.codex/plugins/feedback-loop/lib/delivery.mjs";
import {
  createFeedback,
  listFeedback,
  stopOutcome,
} from "../.codex/plugins/feedback-loop/lib/service.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const acceptanceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "origin-codex-acceptance-"));
let succeeded = false;

try {
  copyTrackedRepository(sourceRoot, acceptanceRoot);
  git(acceptanceRoot, ["init", "--initial-branch=main"]);
  git(acceptanceRoot, ["config", "user.name", "Origin Acceptance"]);
  git(acceptanceRoot, ["config", "user.email", "origin-acceptance@localhost"]);
  git(acceptanceRoot, ["config", "commit.gpgsign", "false"]);
  git(acceptanceRoot, ["add", "."]);
  git(acceptanceRoot, ["commit", "-m", "Origin acceptance fixture"]);

  const command = process.env.ORIGIN_AGENT_COMMAND?.trim() || "codex";
  const available = spawnSync(command, ["--version"], {
    cwd: acceptanceRoot,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (available.status !== 0)
    throw new Error(`${command} is unavailable or not ready. Install and authenticate it first.`);

  const record = createFeedback(acceptanceRoot, {
    kind: "update",
    body: "Live acceptance only: do not modify tracked files. Read package.json, run `npm run feedback -- verify`, then resolve this record with evidence naming both checks.",
    pagePath: "/",
    pageLabel: "Origin acceptance fixture",
  });
  const result = await runFeedbackLoop(acceptanceRoot, { maximumCycles: 1 });
  const completed = listFeedback(acceptanceRoot).find((item) => item.id === record.id);
  if (result.state !== "idle" || completed?.status !== "resolved" || !completed.resolution)
    throw new Error("The agent returned without resolving the acceptance record with evidence.");
  if (stopOutcome(acceptanceRoot).mode !== "idle")
    throw new Error("The feedback Stop outcome did not return to idle.");
  const worktree = git(acceptanceRoot, ["status", "--porcelain", "--untracked-files=all"]);
  if (worktree.trim())
    throw new Error(`The acceptance agent changed tracked fixture files: ${worktree.trim()}`);

  console.log(`PASS  Agent command — ${command}`);
  console.log("PASS  Production delivery adapter — feedback reached the configured agent process");
  console.log("PASS  Agent operation — the record was resolved with verification evidence");
  console.log("PASS  Stop outcome — the queue returned to idle");
  console.log("PASS  Fixture isolation — no tracked file changed");
  if (path.basename(command).toLowerCase().startsWith("codex"))
    console.log("PASS  Authenticated Codex execution — Codex completed the acceptance record");
  else
    console.log(
      "NOTE  A configured test adapter passed; this run is not evidence of authenticated Codex execution",
    );
  succeeded = true;
} catch (error) {
  console.error(`FAIL  Live Codex acceptance — ${error.message}`);
  console.error(`Diagnostic fixture retained at ${acceptanceRoot}`);
  process.exitCode = 1;
} finally {
  if (succeeded) fs.rmSync(acceptanceRoot, { recursive: true, force: true });
}

function copyTrackedRepository(source, destination) {
  const listed = spawnSync("git", ["ls-files", "-z"], {
    cwd: source,
    encoding: "utf8",
    shell: false,
  });
  if (listed.status !== 0) throw new Error(listed.stderr.trim() || "Could not list tracked files.");
  for (const relative of listed.stdout.split("\0").filter(Boolean)) {
    const from = path.resolve(source, relative);
    const to = path.resolve(destination, relative);
    if (!to.startsWith(`${destination}${path.sep}`))
      throw new Error("Git returned a file outside the repository.");
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  if (result.status !== 0)
    throw new Error(result.stderr.trim() || `git ${args[0]} did not complete.`);
  return result.stdout;
}
