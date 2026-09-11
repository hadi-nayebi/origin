import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { directory, readJSON } from "./storage.mjs";
import { loadConfig } from "./config.mjs";

export async function startBackground(root) {
  loadConfig(root);
  const dir = directory(root);
  const owner = readJSON(path.join(dir, "listener.lock"), null);
  if (owner) {
    if (owner.host !== os.hostname() || !Number.isInteger(owner.pid))
      throw new Error("Telegram listener has an unrecognized owner; inspect its local lock.");
    let alive = true;
    try {
      process.kill(owner.pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") alive = false;
      else throw error;
    }
    if (alive)
      return {
        status: "existing-listener",
        pid: owner.pid,
        readiness: readJSON(path.join(dir, "runtime.json"), null),
      };
  }
  const log = fs.openSync(path.join(dir, "runtime.log"), "a", 0o600);
  const child = spawn(
    process.execPath,
    [path.join(root, ".codex/plugins/telegram-engagement/scripts/telegram.mjs"), "run"],
    { cwd: root, detached: true, stdio: ["ignore", log, log] },
  );
  fs.closeSync(log);
  child.unref();
  let failure;
  child.once("error", () => {
    failure = new Error("Could not launch Telegram listener; inspect runtime.log.");
  });
  for (let attempt = 0; attempt < 16; attempt++) {
    if (failure) throw failure;
    const status = readJSON(path.join(dir, "runtime.json"), null);
    if (status?.pid === child.pid && status.status === "ready") return status;
    if (child.exitCode !== null || child.signalCode)
      throw new Error("Telegram listener exited during startup; inspect its private runtime.log.");
    await delay(500);
  }
  throw new Error(
    "Telegram startup readiness is not yet confirmed. Inspect runtime.log and status before starting another listener.",
  );
}
