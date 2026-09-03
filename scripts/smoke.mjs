#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startOriginServer } from "../server/index.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "origin-smoke-"));
let server;

try {
  fs.cpSync(path.join(sourceRoot, "dist"), path.join(fixtureRoot, "dist"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "docs"));
  fs.cpSync(path.join(sourceRoot, "docs", "wiki"), path.join(fixtureRoot, "docs", "wiki"), {
    recursive: true,
  });
  server = await startOriginServer({
    root: fixtureRoot,
    port: 0,
    host: "127.0.0.1",
    deliverWakes: false,
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const [healthResponse, pageResponse] = await Promise.all([
    fetch(`${baseUrl}/api/health`),
    fetch(baseUrl),
  ]);
  if (!healthResponse.ok) throw new Error(`Health endpoint returned ${healthResponse.status}.`);
  if (!pageResponse.ok) throw new Error(`Dashboard returned ${pageResponse.status}.`);
  const health = await healthResponse.json();
  const page = await pageResponse.text();
  if (health.name !== "origin" || health.status !== "ready" || health.localOnly !== true)
    throw new Error("Health endpoint did not return Origin's ready contract.");
  if (!page.includes('<div id="root"></div>'))
    throw new Error("Production dashboard shell was not served.");
  console.log(`PASS  Isolated production server startup and health check (${baseUrl})`);
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
