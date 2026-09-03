#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn(process.execPath, ["server/index.mjs"], {
  cwd: root,
  env: { ...process.env, ORIGIN_PORT: "0" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";

try {
  const baseUrl = await waitForReady(child);
  const [healthResponse, pageResponse] = await Promise.all([
    fetch(`${baseUrl}/api/health`),
    fetch(baseUrl),
  ]);
  if (!healthResponse.ok) throw new Error(`Health endpoint returned ${healthResponse.status}.`);
  if (!pageResponse.ok) throw new Error(`Dashboard returned ${pageResponse.status}.`);
  const health = await healthResponse.json();
  const page = await pageResponse.text();
  if (health.name !== "origin" || health.status !== "ready" || health.localOnly !== true) {
    throw new Error("Health endpoint did not return Origin's ready contract.");
  }
  if (!page.includes('<div id="root"></div>')) {
    throw new Error("Production dashboard shell was not served.");
  }
  console.log(`PASS  Production server startup and health check (${baseUrl})`);
} finally {
  await stopChild(child);
}

function waitForReady(processHandle) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Origin did not become ready within 15 seconds.\n${output}`)),
      15_000,
    );
    const finish = (callback, value) => {
      clearTimeout(timeout);
      processHandle.stdout.off("data", onStdout);
      processHandle.stderr.off("data", onStderr);
      processHandle.off("error", onError);
      processHandle.off("exit", onExit);
      callback(value);
    };
    const onStdout = (chunk) => {
      output += chunk;
      const match = output.match(/Origin is ready at (https?:\/\/\S+)/);
      if (match) finish(resolve, match[1]);
    };
    const onStderr = (chunk) => {
      output += chunk;
    };
    const onError = (error) => finish(reject, error);
    const onExit = (code) =>
      finish(reject, new Error(`Origin exited before readiness with code ${code}.\n${output}`));
    processHandle.stdout.on("data", onStdout);
    processHandle.stderr.on("data", onStderr);
    processHandle.once("error", onError);
    processHandle.once("exit", onExit);
  });
}

async function stopChild(processHandle) {
  if (processHandle.exitCode !== null) return;
  processHandle.kill();
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5_000);
    processHandle.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
