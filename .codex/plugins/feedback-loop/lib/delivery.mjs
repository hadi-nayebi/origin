import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { nextFeedback, recoverStaleFeedback, stopOutcome } from "./service.mjs";
import { renderVoice } from "./voice.mjs";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const voiceFile = path.join(pluginRoot, "voice.xml");

export function buildAgentInvocation(reference, environment = process.env) {
  if (!/^[A-Za-z0-9-]{10,128}$/.test(reference))
    throw new Error("Invalid feedback reference for delivery.");
  const command = environment.ORIGIN_AGENT_COMMAND?.trim() || "codex";
  if (!command || command.length > 500 || /[\u0000-\u001f\u007f]/.test(command))
    throw new Error("Invalid agent command.");
  const configured = environment.ORIGIN_AGENT_ARGS_JSON
    ? JSON.parse(environment.ORIGIN_AGENT_ARGS_JSON)
    : ["exec", "--ephemeral", "--sandbox", "workspace-write"];
  if (
    !Array.isArray(configured) ||
    configured.length > 50 ||
    configured.some(
      (value) =>
        typeof value !== "string" || value.length > 500 || /[\u0000-\u001f\u007f]/.test(value),
    )
  )
    throw new Error("ORIGIN_AGENT_ARGS_JSON must be a bounded JSON array of strings.");
  const prompt = renderVoice(voiceFile, "delivery.wake", { reference });
  return Object.freeze({ command, args: [...configured, prompt] });
}

export function launchFeedbackRunner(repositoryRoot, options = {}) {
  if (process.env.ORIGIN_AGENT_AUTOSTART === "0" || options.disabled)
    return deliveryView("disabled");
  if (!stopOutcome(repositoryRoot).block) return deliveryView("idle");
  const active = feedbackRunnerStatus(repositoryRoot);
  if (["running", "retrying", "starting"].includes(active.state)) return active;
  const runner = path.join(pluginRoot, "scripts", "runner.mjs");
  const child = spawn(process.execPath, [runner], {
    cwd: path.resolve(repositoryRoot),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, ORIGIN_REPOSITORY_ROOT: path.resolve(repositoryRoot) },
  });
  child.unref();
  return deliveryView("starting", { pid: child.pid });
}

export function feedbackRunnerStatus(repositoryRoot) {
  const owner = readJson(runnerLock(repositoryRoot));
  const last = readLastJournal(repositoryRoot);
  if (owner && leaseIsFresh(owner))
    return deliveryView(last?.type === "delivery.unavailable" ? "retrying" : "running", {
      pid: owner.pid,
      startedAt: owner.startedAt,
      reference: owner.reference || null,
      ...(last ? { last } : {}),
    });
  if (!last) return deliveryView("idle");
  let actionable = true;
  try {
    actionable = stopOutcome(repositoryRoot).block;
  } catch {
    // Untrusted feedback state must never make an interrupted delivery appear healthy.
  }
  return deliveryView(
    last.reference === "journal-error" ||
      last.type === "delivery.started" ||
      (actionable && last.type === "delivery.unavailable")
      ? "unavailable"
      : "idle",
    {
      last,
    },
  );
}

export async function runFeedbackLoop(repositoryRoot, options = {}) {
  const root = path.resolve(repositoryRoot);
  const environment = options.environment || process.env;
  const lease = acquireRunnerLease(root);
  if (!lease) return Object.freeze({ state: "already-running" });
  const invokeAgent =
    options.invokeAgent ||
    ((workingRoot, reference) => invokeCodex(workingRoot, reference, environment));
  const wait =
    options.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const maximumCycles = options.maximumCycles ?? Number.POSITIVE_INFINITY;
  let attemptsWithoutProgress = 0;
  let consecutiveFailures = 0;
  let cycles = 0;
  let activeReference = null;
  const heartbeat = startLeaseHeartbeat(
    root,
    lease,
    () => activeReference,
    options.heartbeatMilliseconds,
  );
  try {
    recoverStaleFeedback(root, {
      maximumAgeMs: Number(environment.ORIGIN_FEEDBACK_STALE_MS || 14_400_000),
    });
    while (stopOutcome(root).block && cycles < maximumCycles) {
      const record = nextFeedback(root);
      if (!record) break;
      activeReference = record.id;
      updateRunnerLease(root, lease, record.id);
      const before = record.updatedAt;
      appendDeliveryEvent(root, {
        type: "delivery.started",
        reference: record.id,
        at: new Date().toISOString(),
      });
      let result;
      try {
        result = await invokeAgent(root, record.id);
      } catch (error) {
        result = { error: error instanceof Error ? error.message : "Agent invocation failed." };
      }
      const failed = result.error || result.code !== 0;
      appendDeliveryEvent(root, {
        type: failed ? "delivery.unavailable" : "delivery.completed",
        reference: record.id,
        at: new Date().toISOString(),
        ...(Number.isInteger(result.code) ? { code: result.code } : {}),
        ...(failed
          ? {
              error: boundedError(
                result.error ||
                  `Agent exited with code ${result.code}${result.signal ? ` (${result.signal})` : ""}.`,
              ),
            }
          : {}),
      });
      cycles += 1;
      if (failed) consecutiveFailures += 1;
      else {
        consecutiveFailures = 0;
        const current = nextFeedback(root);
        attemptsWithoutProgress =
          current?.id === record.id && current.updatedAt === before
            ? attemptsWithoutProgress + 1
            : 0;
      }
      if (stopOutcome(root).block && cycles < maximumCycles) {
        const delayedAttempts = failed ? consecutiveFailures : attemptsWithoutProgress;
        const delay = delayedAttempts
          ? Math.min(300_000, 5_000 * 2 ** Math.min(delayedAttempts - 1, 6))
          : 250;
        await wait(delay);
      }
    }
    return Object.freeze({ state: stopOutcome(root).block ? "active" : "idle", cycles });
  } finally {
    clearInterval(heartbeat);
    releaseRunnerLease(root, lease);
  }
}

async function invokeCodex(root, reference, environment) {
  const invocation = buildAgentInvocation(reference, environment);
  fs.mkdirSync(runtimeDirectory(root), { recursive: true, mode: 0o700 });
  const logFile = path.join(runtimeDirectory(root), "agent.log");
  rotateAgentLog(logFile);
  const log = fs.openSync(logFile, "a", 0o600);
  try {
    return await new Promise((resolve) => {
      let settled = false;
      const child = spawn(invocation.command, invocation.args, {
        cwd: root,
        shell: false,
        stdio: ["ignore", log, log],
        windowsHide: true,
        env: environment,
      });
      child.once("error", (error) => {
        if (!settled) {
          settled = true;
          resolve({ error: error.message });
        }
      });
      child.once("exit", (code, signal) => {
        if (!settled) {
          settled = true;
          resolve({ code: code ?? 1, signal });
        }
      });
    });
  } finally {
    fs.closeSync(log);
  }
}

function acquireRunnerLease(root) {
  const directory = runtimeDirectory(root);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = runnerLock(root);
  const existing = readJson(file);
  if (existing && leaseIsFresh(existing)) return null;
  if (existing) {
    try {
      fs.unlinkSync(file);
    } catch {}
  }
  const lease = {
    pid: process.pid,
    host: os.hostname(),
    token: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
    reference: null,
  };
  try {
    fs.writeFileSync(file, JSON.stringify(lease), { encoding: "utf8", mode: 0o600, flag: "wx" });
    return lease;
  } catch (error) {
    if (error.code === "EEXIST") return null;
    throw error;
  }
}

function updateRunnerLease(root, lease, reference) {
  const current = readJson(runnerLock(root));
  if (!current || current.token !== lease.token)
    throw new Error("Origin feedback runner lost its lease.");
  const next = { ...lease, reference, heartbeatAt: new Date().toISOString() };
  const temporary = path.join(
    runtimeDirectory(root),
    `agent-${process.pid}-${crypto.randomUUID()}.next`,
  );
  fs.writeFileSync(temporary, JSON.stringify(next), {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  fs.renameSync(temporary, runnerLock(root));
}

function startLeaseHeartbeat(root, lease, reference, intervalMilliseconds = 30_000) {
  const timer = setInterval(() => {
    try {
      updateRunnerLease(root, lease, typeof reference === "function" ? reference() : reference);
    } catch {
      // The foreground loop remains authoritative and will release only its own token.
    }
  }, intervalMilliseconds);
  timer.unref();
  return timer;
}

function releaseRunnerLease(root, lease) {
  try {
    const current = readJson(runnerLock(root));
    if (current?.token === lease.token) fs.unlinkSync(runnerLock(root));
  } catch {}
}

function appendDeliveryEvent(root, event) {
  const directory = runtimeDirectory(root);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.appendFileSync(
    path.join(directory, "delivery.jsonl"),
    `${JSON.stringify({ schemaVersion: 1, ...event })}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

function readLastJournal(root) {
  try {
    const lines = fs
      .readFileSync(path.join(runtimeDirectory(root), "delivery.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean);
    if (!lines.length) return null;
    const event = JSON.parse(lines.at(-1));
    if (
      event?.schemaVersion !== 1 ||
      !["delivery.started", "delivery.completed", "delivery.unavailable"].includes(event.type) ||
      typeof event.reference !== "string" ||
      !/^[A-Za-z0-9-]{10,128}$/.test(event.reference) ||
      typeof event.at !== "string" ||
      Number.isNaN(Date.parse(event.at))
    )
      throw new Error("Invalid delivery journal event.");
    return Object.freeze({
      type: event.type,
      reference: event.reference,
      at: event.at,
      ...(Number.isInteger(event.code) ? { code: event.code } : {}),
    });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return Object.freeze({
      type: "delivery.unavailable",
      reference: "journal-error",
      at: new Date(0).toISOString(),
    });
  }
}

function processAlive(pid, host) {
  if (host !== os.hostname() || !Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function leaseIsFresh(owner) {
  return (
    processAlive(owner.pid, owner.host) &&
    typeof owner.heartbeatAt === "string" &&
    Date.now() - Date.parse(owner.heartbeatAt) < 90_000
  );
}

function boundedError(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 500);
}
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
function runtimeDirectory(root) {
  return path.join(path.resolve(root), ".origin");
}
function runnerLock(root) {
  return path.join(runtimeDirectory(root), "agent.lock");
}

function rotateAgentLog(file) {
  try {
    if (fs.statSync(file).size <= 1_048_576) return;
    const previous = `${file}.1`;
    try {
      fs.unlinkSync(previous);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    fs.renameSync(file, previous);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function deliveryView(state, details = {}) {
  return Object.freeze({
    state,
    transport: "headless",
    logPath: ".origin/agent.log",
    ...details,
  });
}
