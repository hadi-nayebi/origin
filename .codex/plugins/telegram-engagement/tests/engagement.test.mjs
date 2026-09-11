import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  createFeedback,
  addFeedbackMessage,
  transitionFeedback,
  reviewFeedback,
  listFeedback,
  recordVersion,
  reconcileAgentState,
  getFeedback,
} from "../../_engagement-core/lib/service.mjs";
import { ensureAgentState, pauseAgent, readAgentState } from "../../_engagement-core/lib/state.mjs";
import { inspectChannelStop } from "../../_engagement-core/lib/stop.mjs";
import {
  directory,
  scopeFor,
  readTransport,
  atomicJSON,
  updateTransport,
} from "../lib/storage.mjs";
import {
  receiveUpdate,
  materializeThread,
  mediaOf,
  queueReply,
  getThread,
} from "../lib/service.mjs";
import { prepareInput, deliverReply } from "../lib/runtime.mjs";
import { captionChunks } from "../lib/voice.mjs";
import { BotAPI } from "../lib/api.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const config = { botId: "42", chatId: "100", userId: "200", maxMediaBytes: 1024 };
function fixture(t) {
  const base = path.join(repo, ".origin", "test-fixtures");
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, "engagement-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  ensureAgentState(root);
  ensureAgentState(scopeFor(root));
  return root;
}
const input = (id, text = "Please inspect this request", extra = {}) => ({
  update_id: id,
  message: {
    message_id: id,
    chat: { id: 100, type: "private" },
    from: { id: 200 },
    text,
    ...extra,
  },
});
const request = (root) =>
  createFeedback(root, {
    kind: "feature",
    body: "Please inspect this request",
    pagePath: "/",
    pageLabel: "Canvas",
  });
function ready(root, id) {
  transitionFeedback(root, id, "in_progress");
  return transitionFeedback(root, id, "ready_for_review", {
    verification: "Verified the requested behavior with focused regression checks.",
  });
}

test("each channel keeps Stop blocked after the other is resolved", (t) => {
  const root = fixture(t);
  const remote = scopeFor(root);
  const a = request(root);
  const b = request(remote);
  assert.equal(inspectChannelStop(root).block, true);
  assert.equal(inspectChannelStop(remote).block, true);
  ready(root, a.id);
  reviewFeedback(root, a.id, "resolved");
  assert.equal(inspectChannelStop(root).block, false);
  assert.equal(inspectChannelStop(remote).block, true);
  ready(remote, b.id);
  reviewFeedback(remote, b.id, "resolved");
  assert.equal(inspectChannelStop(remote).block, false);
  assert.notEqual(
    path.join(directory(root), "data.json"),
    path.join(root, ".origin/contextual-feedback/data.json"),
  );
});
test("pause belongs only to its channel and arrivals survive resume", (t) => {
  const root = fixture(t);
  const remote = scopeFor(root);
  pauseAgent(root, "User paused dashboard.");
  request(root);
  request(remote);
  assert.equal(readAgentState(root).mode, "paused");
  assert.equal(readAgentState(root).resumeState.mode, "active");
  assert.equal(inspectChannelStop(root).block, false);
  assert.equal(inspectChannelStop(remote).block, true);
});
test("authoritative ledger protects against stale idle projection after a crash", (t) => {
  const root = fixture(t);
  const before = readAgentState(root);
  request(root);
  atomicJSON(path.join(root, ".origin/contextual-feedback/data.json"), before);
  assert.equal(inspectChannelStop(root).block, true);
});
for (const removed of ["contextual-feedback", "telegram-engagement"])
  test(`physical deletion of ${removed} leaves the other CLI and Stop hook working`, (t) => {
    const root = fixture(t);
    fs.cpSync(path.join(repo, ".codex"), path.join(root, ".codex"), { recursive: true });
    fs.mkdirSync(path.join(root, "scripts"));
    fs.copyFileSync(
      path.join(repo, "scripts/channel-hook.mjs"),
      path.join(root, "scripts/channel-hook.mjs"),
    );
    fs.rmSync(path.join(root, ".codex/plugins", removed), { recursive: true });
    const remaining =
      removed === "contextual-feedback" ? "telegram-engagement" : "contextual-feedback";
    const target = { root, channel: remaining };
    request(target);
    atomicJSON(path.join(directory(root), "enabled.json"), { enabled: true });
    for (const channel of [remaining, removed]) {
      const run = spawnSync(
        process.execPath,
        [path.join(root, "scripts/channel-hook.mjs"), channel],
        { input: '{"hook_event_name":"Stop"}', encoding: "utf8" },
      );
      assert.equal(run.status, channel === remaining ? 2 : 0, run.stderr);
    }
    const command = remaining === "contextual-feedback" ? "feedback" : "telegram";
    const result = spawnSync(
      process.execPath,
      [path.join(root, `.codex/plugins/${remaining}/scripts/${command}.mjs`), "list"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).length, 1);
  });
test("durable ingress preserves caption plus media, ignores foreign sender, and deduplicates by update identity", (t) => {
  const root = fixture(t);
  const update = input(1, "Caption", { photo: [{ file_id: "small" }, { file_id: "large" }] });
  receiveUpdate(root, config, update);
  receiveUpdate(root, config, update);
  receiveUpdate(root, config, input(2, "Foreign", { from: { id: 201 } }));
  const state = readTransport(root);
  assert.equal(Object.keys(state.inbox).length, 1);
  assert.equal(state.offset, 3);
  assert.equal(state.inbox[1].text, "Caption");
  assert.equal(state.inbox[1].files[0].file_id, "large");
  assert.deepEqual(mediaOf({ document: { file_id: "doc" }, caption: "Document" }), [
    { kind: "document", file_id: "doc" },
  ]);
});
test("crash replay creates one thread; replies attach; repeated independent text remains separate", (t) => {
  const root = fixture(t);
  receiveUpdate(root, config, input(1));
  const first = materializeThread(root, config, 1, "Please inspect this request");
  // Simulate transport persistence loss after authoritative creation.
  updateTransport(root, (s) => {
    s.inbox[1].threadId = null;
    s.inbox[1].status = "received";
  });
  materializeThread(root, config, 1, "Please inspect this request");
  receiveUpdate(
    root,
    config,
    input(2, "An additional detail", { reply_to_message: { message_id: 1 } }),
  );
  materializeThread(root, config, 2, "An additional detail");
  materializeThread(root, config, 2, "An additional detail");
  assert.equal(getThread(root, first.id).messages.length, 2);
  receiveUpdate(root, config, input(3));
  materializeThread(root, config, 3, "Please inspect this request");
  assert.equal(listFeedback(scopeFor(root)).length, 2);
});
test("a new contribution invalidates old review, reopens the thread, and preserves all messages", (t) => {
  const root = fixture(t);
  const item = request(root);
  const before = ready(root, item.id);
  addFeedbackMessage(root, item.id, { body: "One more requirement before I accept." });
  assert.equal(getFeedback(root, item.id).status, "open");
  assert.throws(
    () => reviewFeedback(root, item.id, "resolved", { expectedVersion: recordVersion(before) }),
    /changed/,
  );
  assert.equal(getFeedback(root, item.id).messages.length, 2);
});
test("media preparation does not drop caption and preserves exact file metadata", async (t) => {
  const root = fixture(t);
  receiveUpdate(
    root,
    config,
    input(1, "Read this file", { document: { file_id: "doc", file_name: "notes.txt" } }),
  );
  const api = {
    download: async (_id, file) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "original bytes");
    },
  };
  await prepareInput(root, config, api, {}, readTransport(root).inbox[1]);
  const item = readTransport(root).inbox[1];
  assert.equal(item.status, "ready");
  assert.equal(item.materials[0].file_name, "notes.txt");
  assert.equal(getThread(root, item.threadId).body, "Read this file");
});
test("voice failure preserves an unsent reply; successful voice and captions stay paired", async (t) => {
  const root = fixture(t);
  const thread = request(scopeFor(root));
  const reply = queueReply(root, thread.id, "Here is the requested explanation.");
  let sends = 0;
  const api = {
    sendFile: async (_method, _field, _file, _config, extra) => {
      sends++;
      assert.equal(extra.caption, reply.text);
      return { message_id: 900 };
    },
  };
  await assert.rejects(
    deliverReply(
      root,
      config,
      api,
      {
        render: async () => {
          throw new Error("render failed");
        },
      },
      reply,
    ),
  );
  assert.equal(sends, 0);
  await deliverReply(root, config, api, { render: async () => ({}) }, reply);
  assert.equal(sends, 1);
  assert.equal(readTransport(root).outbox[reply.id].status, "sent");
});
test("uncertain send is never automatically replayed", async (t) => {
  const root = fixture(t);
  const thread = request(scopeFor(root));
  const reply = queueReply(root, thread.id, "A bounded response.");
  let sends = 0;
  const api = {
    sendFile: async () => {
      sends++;
      throw Object.assign(new Error("unknown outcome"), { uncertain: true });
    },
  };
  await assert.rejects(deliverReply(root, config, api, { render: async () => ({}) }, reply));
  await deliverReply(root, config, api, { render: async () => ({}) }, reply);
  assert.equal(sends, 1);
  assert.equal(readTransport(root).outbox[reply.id].status, "indeterminate");
});
test("token-bearing fetch failures are redacted and throttling is preserved", async () => {
  const token = "42:secret-value";
  const api = new BotAPI(token, async () => {
    throw new Error(`fetch https://api.telegram.org/bot${token}`);
  });
  await assert.rejects(api.call("sendMessage"), (e) => e.uncertain && !e.message.includes(token));
  const throttled = new BotAPI(token, async () => ({
    json: async () => ({ ok: false, error_code: 429, parameters: { retry_after: 30 } }),
  }));
  await assert.rejects(throttled.call("sendMessage"), (e) => e.retryAfter === 30 && !e.uncertain);
});
test("long unicode speech splits into bounded complete captions", () => {
  const words = "🙂 explanation ".repeat(700);
  const chunks = captionChunks(words);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => Array.from(c).length <= 900));
  assert.equal(chunks.join(" ").replace(/\s/g, ""), words.replace(/\s/g, ""));
});
test("legacy global pause migrates only into dashboard state", (t) => {
  const root = fixture(t);
  pauseAgent(root, "Pause before upgrade.");
  const legacy = readAgentState(root);
  atomicJSON(path.join(root, ".origin/agent-stop-state/data.json"), legacy);
  fs.rmSync(path.join(root, ".origin/contextual-feedback/data.json"));
  ensureAgentState(root);
  reconcileAgentState(root);
  assert.equal(readAgentState(root).mode, "paused");
  assert.equal(readAgentState(scopeFor(root)).mode, "idle");
});
