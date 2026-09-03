import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export async function ensureDashboardRuntime(root, options = {}) {
  const instanceId = runtimeInstanceId(root);
  const port = Number(options.port || process.env.ORIGIN_PORT || 5173);
  const url = `http://127.0.0.1:${port}`;
  const initial = await inspectRuntime(url, instanceId, options.fetch || fetch);
  if (initial === "matching") {
    if (options.openBrowser !== false) openBrowser(url, options);
    return Object.freeze({ state: "reused", url });
  }
  if (initial === "occupied") throw portConflict(port);
  const directory = path.join(path.resolve(root), ".origin");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const logPath = path.join(directory, "dashboard.log");
  const log = fs.openSync(logPath, "a", 0o600);
  const spawnProcess = options.spawnProcess || spawn;
  const child = spawnProcess(process.execPath, ["server/index.mjs", "--dev"], {
    cwd: path.resolve(root),
    detached: true,
    stdio: ["ignore", log, log],
    windowsHide: true,
    env: { ...process.env, ORIGIN_PORT: String(port) },
  });
  child.unref?.();
  fs.closeSync(log);
  atomicJson(path.join(directory, "runtime.json"), {
    schemaVersion: 1,
    pid: child.pid,
    url,
    startedAt: new Date().toISOString(),
  });
  const wait =
    options.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await inspectRuntime(url, instanceId, options.fetch || fetch);
    if (state === "matching") {
      if (options.openBrowser !== false) openBrowser(url, options);
      return Object.freeze({
        state: "started",
        url,
        pid: child.pid,
        logPath: ".origin/dashboard.log",
      });
    }
    if (state === "occupied") throw portConflict(port);
    await wait(125);
  }
  throw new Error("Origin dashboard did not become healthy. Inspect .origin/dashboard.log.");
}

export function runtimeInstanceId(root) {
  let canonical;
  try {
    canonical = fs.realpathSync(path.resolve(root));
  } catch {
    canonical = path.resolve(root);
  }
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

async function inspectRuntime(url, expectedInstanceId, fetcher) {
  let response;
  try {
    response = await fetcher(`${url}/api/health`, { signal: AbortSignal.timeout(700) });
  } catch {
    return "unavailable";
  }
  try {
    const body = await response.json();
    return response.ok && body.name === "origin" && body.instanceId === expectedInstanceId
      ? "matching"
      : "occupied";
  } catch {
    return "occupied";
  }
}

function portConflict(port) {
  return new Error(
    `Port ${port} is already used by another service or Origin clone. Stop that service or rerun with ORIGIN_PORT set to an available port.`,
  );
}

function openBrowser(url, options) {
  const spawnProcess = options.spawnProcess || spawn;
  const command =
    process.platform === "darwin"
      ? "open"
      : process.env.WSL_DISTRO_NAME
        ? "powershell.exe"
        : "xdg-open";
  const args = command === "powershell.exe" ? ["Start-Process", url] : [url];
  try {
    const child = spawnProcess(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once?.("error", () => {});
    child.unref?.();
  } catch {}
}

function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.next`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  fs.renameSync(temporary, file);
}
