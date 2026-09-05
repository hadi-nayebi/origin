import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const waitArray = new Int32Array(new SharedArrayBuffer(4));

export function resolveCodexPane(root, options = {}) {
  const run = options.run || runCommand;
  const result = run("tmux", [
    "list-panes",
    "-a",
    "-F",
    "#{pane_id}\t#{pane_current_path}\t#{pane_pid}\t#{pane_current_command}\t#{session_name}",
  ]);
  assertSuccess(result, "tmux pane discovery");
  const repositoryRoot = canonical(root);
  const processes = readProcesses(run);
  const panes = String(result.stdout || "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, cwd, pid, command, session] = line.split("\t");
      return { id, cwd, pid: Number(pid), command, session };
    })
    .filter((pane) => canonical(pane.cwd) === repositoryRoot)
    .filter((pane) => /codex/i.test(pane.command) || processTreeOwnsCodex(pane.pid, processes));
  if (panes.length !== 1)
    throw new Error(
      panes.length
        ? `Origin found ${panes.length} Codex panes for this repository; exactly one is required.`
        : "Origin could not find the interactive Codex pane for this repository.",
    );
  return Object.freeze(panes[0]);
}

export function deliverCodexWake(root, input, options = {}) {
  const prompt = bounded(input?.prompt, "Wake prompt", 1, 2000);
  const marker = bounded(input?.marker, "Wake marker", 3, 120);
  if (!prompt.includes(marker)) throw new Error("Wake prompt must contain its marker.");
  const run = options.run || runCommand;
  const wait = options.wait || ((milliseconds) => Atomics.wait(waitArray, 0, 0, milliseconds));
  const waitMilliseconds = Number(options.waitMilliseconds ?? 15_000);
  return withWakeLease(root, () => {
    const pane = resolveCodexPane(root, { run });
    const before = capture(run, pane.id);
    const wasBusy = codexIsBusy(before);
    const buffer = `origin-${process.pid}-${crypto.randomBytes(5).toString("hex")}`;
    assertSuccess(run("tmux", ["set-buffer", "-b", buffer, "--", prompt]), "tmux buffer write");
    assertSuccess(
      run("tmux", ["paste-buffer", "-p", "-d", "-b", buffer, "-t", pane.id]),
      "tmux prompt paste",
    );
    let current = "";
    const pasteAttempts = Math.max(1, Math.min(150, Math.ceil(waitMilliseconds / 100)));
    for (let attempt = 0; attempt < pasteAttempts; attempt += 1) {
      wait(100);
      current = capture(run, pane.id);
      if (editorPending(current, marker, { before, promptLength: prompt.length })) break;
    }
    if (!editorPending(current, marker, { before, promptLength: prompt.length }))
      throw new Error("Origin could not verify that the wake prompt reached the Codex editor.");
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const key = attempt % 2 === 0 ? "C-m" : "Enter";
      assertSuccess(run("tmux", ["send-keys", "-t", pane.id, key]), "tmux prompt submit");
      wait(250);
      current = capture(run, pane.id);
      if (
        submissionAccepted({
          value: current,
          marker,
          wasBusy,
          before,
          promptLength: prompt.length,
        })
      )
        return Object.freeze({
          state: wasBusy ? "queued-without-interruption" : "submitted",
          transport: "tmux",
          pane: pane.id,
          session: pane.session,
        });
    }
    throw new Error("Origin pasted the wake prompt but could not verify its submission to Codex.");
  });
}

export function codexIsBusy(captured) {
  return /esc to interrupt|ctrl-c to interrupt|Working \(\d+|Messages to be submitted after next tool call/i.test(
    captured,
  );
}

export function editorPending(value, marker, options = {}) {
  const tail = String(value).split("\n").slice(-40).join("\n");
  const previous = String(options.before || "")
    .split("\n")
    .slice(-40)
    .join("\n");
  const pasted = pastedLengths(tail);
  const previousPasted = pastedLengths(previous);
  if (pasted.length > previousPasted.length) return true;
  const markerIndex = tail.lastIndexOf(marker);
  if (markerIndex < 0) return false;
  return tail.indexOf("\n› ", markerIndex + marker.length) < 0;
}

export function submissionAccepted({ value, marker, wasBusy, before, promptLength }) {
  const queued = /Messages to be submitted after next tool call/i;
  return (
    !editorPending(value, marker, { before, promptLength }) ||
    (!wasBusy && codexIsBusy(value)) ||
    (wasBusy && queued.test(String(value)) && !queued.test(String(before || "")))
  );
}

function pastedLengths(value) {
  return [...String(value).matchAll(/\[Pasted (?:Content|text)\s+(\d+)\s+chars?\]/gi)].map(
    (match) => Number(match[1]),
  );
}

function capture(run, pane) {
  const result = run("tmux", ["capture-pane", "-p", "-J", "-t", pane, "-S", "-80"]);
  assertSuccess(result, "tmux pane capture");
  return String(result.stdout || "");
}

function readProcesses(run) {
  const result = run("ps", ["-eo", "pid=,ppid=,command="]);
  if (result.status !== 0) return [];
  return String(result.stdout || "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
      return match ? { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] } : null;
    })
    .filter(Boolean);
}

function processTreeOwnsCodex(rootPid, processes) {
  const descendants = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of processes) {
      if (descendants.has(process.ppid) && !descendants.has(process.pid)) {
        descendants.add(process.pid);
        changed = true;
      }
    }
  }
  return processes.some(
    (process) => descendants.has(process.pid) && /(^|[/\s])codex([\s]|$)/i.test(process.command),
  );
}

function withWakeLease(root, operation) {
  const directory = path.join(path.resolve(root), ".origin");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, "wake.lock");
  const token = crypto.randomUUID();
  let descriptor;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      descriptor = fs.openSync(file, "wx", 0o600);
      fs.writeFileSync(
        descriptor,
        JSON.stringify({
          token,
          pid: process.pid,
          host: os.hostname(),
          at: new Date().toISOString(),
        }),
      );
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      clearStaleLease(file);
      Atomics.wait(waitArray, 0, 0, 10);
    }
  }
  if (descriptor === undefined) throw new Error("Origin wake delivery is busy.");
  try {
    return operation();
  } finally {
    fs.closeSync(descriptor);
    try {
      if (JSON.parse(fs.readFileSync(file, "utf8")).token === token) fs.unlinkSync(file);
    } catch {}
  }
}

function clearStaleLease(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Date.now() - Date.parse(value.at) > 30_000) fs.unlinkSync(file);
  } catch {}
}

function canonical(value) {
  try {
    return fs.realpathSync(path.resolve(value));
  } catch {
    return path.resolve(value || ".");
  }
}
function bounded(value, label, minimum, maximum) {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    throw new Error(`${label} is invalid.`);
  return value;
}
function assertSuccess(result, label) {
  if (result.status !== 0)
    throw new Error(`${label} failed: ${String(result.stderr || "unknown error").trim()}`);
}
function runCommand(command, args) {
  return spawnSync(command, args, { encoding: "utf8", shell: false, windowsHide: true });
}
