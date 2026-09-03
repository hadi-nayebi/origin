import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";
import {
  askFeedbackQuestion,
  createFeedback,
  reviewFeedbackMutation,
  transitionFeedback,
} from "../../.codex/plugins/contextual-feedback/lib/service.mjs";
import { startOriginServer } from "../index.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function fixtureServer() {
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
    deliverWakes: false,
  });
  const address = server.address();
  return { root, server, base: `http://127.0.0.1:${address.port}` };
}

test("local API captures feedback, persists a wake, and exposes global state", async (context) => {
  const app = await fixtureServer();
  context.after(() => app.server.close());
  const health = await fetch(`${app.base}/api/health`);
  assert.equal(health.status, 200);
  assert.match(health.headers.get("content-security-policy"), /default-src 'self'/);
  const healthBody = await health.json();
  assert.equal(healthBody.agent.mode, "idle");
  assert.match(healthBody.instanceId, /^[a-f0-9]{16}$/);
  assert.equal(healthBody.delivery.transport, "tmux");
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
  assert.equal(created.delivery.state, "pending");
  assert.equal(created.wake.kind, "feedback.new");
  assert.match(created.wake.sourceEventHash, /^[a-f0-9]{64}$/);
  assert.equal(created.wake.sourceSequence, 1);
  const listing = await (await fetch(`${app.base}/api/feedback`)).json();
  assert.equal(listing.records[0].status, "open");
  assert.equal(listing.outcome.mode, "active");
  assert.equal(listing.delivery.pending, 1);
});

test("server startup repairs a feedback-to-wake crash window", async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "origin-server-recovery-"));
  fs.mkdirSync(path.join(root, "docs"));
  fs.cpSync(path.join(repositoryRoot, "docs", "wiki"), path.join(root, "docs", "wiki"), {
    recursive: true,
  });
  const record = createFeedback(root, {
    kind: "feature",
    body: "Persisted before the server process stopped",
    pagePath: "/",
    pageLabel: "Origin canvas",
  });
  const server = await startOriginServer({
    root,
    port: 0,
    host: "127.0.0.1",
    serveUi: false,
    deliverWakes: false,
  });
  context.after(() => server.close());
  const events = JSON.parse(
    fs.readFileSync(path.join(root, ".origin", "wake-outbox.json"), "utf8"),
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].reference, record.id);
  const source = JSON.parse(
    fs.readFileSync(path.join(root, ".origin", "feedback.jsonl"), "utf8").trim(),
  );
  assert.equal(events[0].sourceEventHash, source.hash);
  assert.equal(events[0].sourceSequence, source.sequence);
});

test("server startup repairs an accepted-review-to-wake crash window", async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "origin-server-accepted-recovery-"));
  fs.mkdirSync(path.join(root, "docs"));
  fs.cpSync(path.join(repositoryRoot, "docs", "wiki"), path.join(root, "docs", "wiki"), {
    recursive: true,
  });
  const record = createFeedback(root, {
    kind: "feature",
    body: "Complete and accept this request",
    pagePath: "/projects",
    pageLabel: "Projects",
  });
  transitionFeedback(root, record.id, "in_progress");
  transitionFeedback(root, record.id, "ready_for_review", {
    verification: "Verified the projects route and the complete browser interaction contract.",
  });
  const accepted = reviewFeedbackMutation(root, record.id, "resolved", {
    acceptance: "The dashboard user accepted this verified result.",
  });
  const server = await startOriginServer({
    root,
    port: 0,
    host: "127.0.0.1",
    serveUi: false,
    deliverWakes: false,
  });
  context.after(() => server.close());
  const events = JSON.parse(
    fs.readFileSync(path.join(root, ".origin", "wake-outbox.json"), "utf8"),
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "feedback.accepted");
  assert.equal(events[0].sourceEventHash, accepted.event.hash);
});

test("agent question and user answer form one thread and reactivate work", async (context) => {
  const app = await fixtureServer();
  context.after(() => app.server.close());
  const created = await (
    await fetch(`${app.base}/api/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "update",
        body: "Name this page",
        pagePath: "/",
        pageLabel: "Origin canvas",
      }),
    })
  ).json();
  askFeedbackQuestion(app.root, created.record.id, "Which page name should I use?");
  const answer = await fetch(`${app.base}/api/feedback/${created.record.id}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "Use Projects." }),
  });
  assert.equal(answer.status, 201);
  const payload = await answer.json();
  assert.equal(payload.record.status, "open");
  assert.equal(payload.record.messages.at(-1).type, "answer");
  assert.equal(payload.wake.kind, "feedback.answer");
  assert.equal((await (await fetch(`${app.base}/api/feedback`)).json()).outcome.mode, "active");
});

test("dashboard accepts verified work or reopens it but cannot impersonate agent work", async (context) => {
  const app = await fixtureServer();
  context.after(() => app.server.close());
  const created = await (
    await fetch(`${app.base}/api/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "bug",
        body: "Fix the control",
        pagePath: "/",
        pageLabel: "Origin canvas",
      }),
    })
  ).json();
  const denied = await fetch(`${app.base}/api/feedback/${created.record.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "in_progress" }),
  });
  assert.equal(denied.status, 400);
  transitionFeedback(app.root, created.record.id, "in_progress");
  transitionFeedback(app.root, created.record.id, "ready_for_review", {
    verification: "Repaired the control and verified the browser interaction test passes.",
  });
  const accepted = await fetch(`${app.base}/api/feedback/${created.record.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "resolved", acceptance: "Accepted by user." }),
  });
  assert.equal(accepted.status, 200);
  const payload = await accepted.json();
  assert.equal(payload.record.status, "resolved");
  assert.equal(payload.wake.kind, "feedback.accepted");
  const closedComment = await fetch(`${app.base}/api/feedback/${created.record.id}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "Change it again without reopening." }),
  });
  assert.equal(closedComment.status, 400);
});

test("a fresh interactive session receives a resume voice only when no wake is pending", async (context) => {
  const app = await fixtureServer();
  context.after(() => app.server.close());
  createFeedback(app.root, {
    kind: "feature",
    body: "Resume this durable responsibility",
    pagePath: "/projects",
    pageLabel: "Projects",
  });
  const first = await fetch(`${app.base}/api/session/wake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const firstPayload = await first.json();
  assert.equal(firstPayload.wake.kind, "feedback.resume");
  const second = await fetch(`${app.base}/api/session/wake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal((await second.json()).wake, null);
});

test("API rejects cross-origin, non-JSON, malformed, and oversized mutations", async (context) => {
  const app = await fixtureServer();
  context.after(() => app.server.close());
  assert.equal(
    (await fetch(`${app.base}/api/feedback`, { headers: { origin: "https://attacker.example" } }))
      .status,
    403,
  );
  assert.equal(
    (await fetch(`${app.base}/api/feedback`, { method: "POST", body: "{}" })).status,
    400,
  );
  assert.equal(
    (
      await fetch(`${app.base}/api/feedback/wake`, {
        method: "POST",
        body: "{}",
      })
    ).status,
    400,
  );
  const malformed = await fetch(`${app.base}/api/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.deepEqual(await malformed.json(), { error: "Invalid JSON body." });
  const oversized = await fetch(`${app.base}/api/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "x".repeat(17_000) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal(await requestWithHost(app.base, "attacker.example"), 403);
  assert.equal(
    (
      await fetch(`${app.base}/api/feedback`, {
        headers: { origin: "http://127.0.0.1:9" },
      })
    ).status,
    403,
  );
  assert.equal((await fetch(`${app.base}/api/missing`)).status, 404);
});

test("wiki index and chapters come from tracked Markdown", async (context) => {
  const app = await fixtureServer();
  context.after(() => app.server.close());
  const index = await (await fetch(`${app.base}/api/wiki`)).json();
  assert.equal(index.chapters.length, 10);
  const chapter = await (await fetch(`${app.base}/api/wiki/${index.chapters[0].slug}`)).json();
  assert.match(chapter.content, /^# /);
  assert.doesNotMatch(chapter.content, /^---/);
  assert.equal((await fetch(`${app.base}/api/wiki/not-present`)).status, 404);
  assert.equal((await fetch(`${app.base}/api/wiki/BAD!`)).status, 400);
});

function requestWithHost(base, host) {
  const target = new URL("/api/feedback", base);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { hostname: target.hostname, port: target.port, path: target.pathname, headers: { host } },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode));
      },
    );
    request.once("error", reject);
    request.end();
  });
}
