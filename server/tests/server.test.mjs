import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";
import { startOriginServer } from "../index.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function fixtureServer(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "origin-server-"));
  fs.mkdirSync(path.join(root, "docs"));
  fs.cpSync(path.join(repositoryRoot, "docs", "wiki"), path.join(root, "docs", "wiki"), {
    recursive: true,
  });
  const server = await startOriginServer({
    root,
    port: 0,
    host: "127.0.0.1",
    serveUi: false,
    launchRunner: options.launchRunner ?? false,
  });
  const address = server.address();
  return { root, server, base: `http://127.0.0.1:${address.port}` };
}

test("local API captures, transitions, and verifies feedback", async (context) => {
  const app = await fixtureServer();
  context.after(() => app.server.close());
  const health = await fetch(`${app.base}/api/health`);
  assert.equal(health.status, 200);
  assert.match(health.headers.get("content-security-policy"), /default-src 'self'/);
  const createdResponse = await fetch(`${app.base}/api/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "feature",
      body: "Create a useful page",
      pagePath: "/",
      pageLabel: "Origin canvas",
    }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.delivery.state, "disabled");
  const started = await fetch(`${app.base}/api/feedback/${created.record.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "in_progress" }),
  });
  assert.equal(started.status, 200);
  const resolved = await fetch(`${app.base}/api/feedback/${created.record.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      status: "resolved",
      evidence: "Implemented the page and verified its rendered output.",
    }),
  });
  assert.equal(resolved.status, 200);
  const listing = await (await fetch(`${app.base}/api/feedback`)).json();
  assert.equal(listing.records[0].status, "resolved");
  assert.equal(listing.outcome.mode, "idle");
});

test("API rejects cross-origin and non-JSON mutations", async (context) => {
  const app = await fixtureServer();
  context.after(() => app.server.close());
  const crossOrigin = await fetch(`${app.base}/api/feedback`, {
    headers: { origin: "https://attacker.example" },
  });
  assert.equal(crossOrigin.status, 403);
  const crossPort = await fetch(`${app.base}/api/feedback`, {
    headers: { origin: "http://127.0.0.1:9" },
  });
  assert.equal(crossPort.status, 403);
  const wrongType = await fetch(`${app.base}/api/feedback`, { method: "POST", body: "{}" });
  assert.equal(wrongType.status, 400);
  const malformed = await fetch(`${app.base}/api/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.deepEqual(await malformed.json(), { error: "Invalid JSON body." });
  const missing = await fetch(`${app.base}/api/missing`);
  assert.equal(missing.status, 404);
  const oversized = await fetch(`${app.base}/api/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "x".repeat(17_000) }),
  });
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { error: "JSON body exceeds the 16 KiB limit." });
  assert.equal(await requestWithHost(app.base, "attacker.example"), 403);
});

test("feedback POST launches the real runner and shell-free agent adapter", async (context) => {
  const previous = {
    command: process.env.ORIGIN_AGENT_COMMAND,
    args: process.env.ORIGIN_AGENT_ARGS_JSON,
    autostart: process.env.ORIGIN_AGENT_AUTOSTART,
  };
  const fakeAgent = path.join(
    repositoryRoot,
    ".codex",
    "plugins",
    "feedback-loop",
    "tests",
    "fake-agent.mjs",
  );
  process.env.ORIGIN_AGENT_COMMAND = process.execPath;
  process.env.ORIGIN_AGENT_ARGS_JSON = JSON.stringify([fakeAgent]);
  delete process.env.ORIGIN_AGENT_AUTOSTART;
  const app = await fixtureServer({ launchRunner: true });
  context.after(() => {
    app.server.close();
    restoreEnvironment("ORIGIN_AGENT_COMMAND", previous.command);
    restoreEnvironment("ORIGIN_AGENT_ARGS_JSON", previous.args);
    restoreEnvironment("ORIGIN_AGENT_AUTOSTART", previous.autostart);
  });
  const created = await fetch(`${app.base}/api/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "feature",
      body: "Deliver this request through the complete local path",
      pagePath: "/",
      pageLabel: "Origin canvas",
    }),
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).delivery.state, "starting");
  const listing = await poll(async () => {
    const value = await (await fetch(`${app.base}/api/feedback`)).json();
    return value.records[0]?.status === "resolved" &&
      value.delivery.last?.type === "delivery.completed"
      ? value
      : null;
  });
  assert.equal(listing.outcome.mode, "idle");
  assert.equal(listing.delivery.last.type, "delivery.completed");
});

test("wiki index and chapters come from tracked Markdown", async (context) => {
  const app = await fixtureServer();
  context.after(() => app.server.close());
  const index = await (await fetch(`${app.base}/api/wiki`)).json();
  assert.equal(index.chapters.length, 10);
  const chapter = await (await fetch(`${app.base}/api/wiki/${index.chapters[0].slug}`)).json();
  assert.match(chapter.content, /^# /);
  assert.doesNotMatch(chapter.content, /^---/);
});

async function poll(operation, timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await operation();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for the Origin runner.");
}

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function requestWithHost(base, host) {
  const target = new URL("/api/feedback", base);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        headers: { host },
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode));
      },
    );
    request.once("error", reject);
    request.end();
  });
}
