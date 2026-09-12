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
  linkFeedbackWork,
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
import { prepareInput, deliverReply, processOwnerMerge, textChunks } from "../lib/runtime.mjs";
import { captionChunks } from "../lib/voice.mjs";
import { BotAPI } from "../lib/api.mjs";
import { defaults, loadConfig, saveConfig } from "../lib/config.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const config = {
  botId: "42",
  chatId: "100",
  userId: "200",
  maxMediaBytes: 1024,
  transcriptionEnabled: true,
  voiceRepliesEnabled: true,
};
const textConfig = { ...config, transcriptionEnabled: false, voiceRepliesEnabled: false };
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
  const current = getFeedback(root, id);
  if (!current.linkedWork.some((value) => value.startsWith("pull-request:")))
    linkFeedbackWork(root, id, "pull-request:https://github.com/example/origin/pull/42");
  transitionFeedback(root, id, "in_progress");
  return transitionFeedback(root, id, "ready_for_review", {
    verification: "Verified the requested behavior with focused regression checks.",
  });
}

test("new pairings default to text while legacy voice pairings retain their behavior", (t) => {
  const root = fixture(t);
  const dir = directory(root);
  fs.writeFileSync(path.join(dir, "bot-token"), `42:${"a".repeat(24)}\n`, { mode: 0o600 });
  saveConfig(root, {
    ...defaults(),
    botId: "42",
    chatId: "100",
    userId: "200",
  });
  let loaded = loadConfig(root);
  assert.equal(loaded.transcriptionEnabled, false);
  assert.equal(loaded.voiceRepliesEnabled, false);

  atomicJSON(path.join(dir, "config.json"), {
    ...defaults(),
    version: 1,
    botId: "42",
    chatId: "100",
    userId: "200",
    voiceRequired: true,
    transcriptionEnabled: undefined,
    voiceRepliesEnabled: undefined,
  });
  loaded = loadConfig(root);
  assert.equal(loaded.transcriptionEnabled, true);
  assert.equal(loaded.voiceRepliesEnabled, true);
  assert.equal("voiceRequired" in loaded, false);
});

test("doctor treats absent optional speech as healthy for a text-only pairing", (t) => {
  const root = fixture(t);
  const dir = directory(root);
  fs.writeFileSync(path.join(dir, "bot-token"), `42:${"a".repeat(24)}\n`, { mode: 0o600 });
  saveConfig(root, {
    ...defaults(),
    botId: "42",
    chatId: "100",
    userId: "200",
  });
  const run = spawnSync(
    process.execPath,
    [path.join(repo, ".codex/plugins/telegram-engagement/scripts/telegram.mjs"), "doctor"],
    {
      env: { ...process.env, ORIGIN_REPOSITORY_ROOT: root },
      encoding: "utf8",
    },
  );
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.text.ready, true);
  assert.equal(report.speech.transcriptionEnabled, false);
  assert.equal(report.speech.voiceRepliesEnabled, false);
  assert.equal(report.speech.modelsPresent, false);
});

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
test("text-only pairing receives audio as preserved material without loading speech", async (t) => {
  const root = fixture(t);
  receiveUpdate(
    root,
    textConfig,
    input(11, undefined, { text: undefined, voice: { file_id: "voice" } }),
  );
  const api = {
    download: async (_id, file) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "preserved audio");
    },
  };
  await prepareInput(root, textConfig, api, null, readTransport(root).inbox[11]);
  const item = readTransport(root).inbox[11];
  assert.equal(item.status, "ready");
  assert.equal(item.materials[0].processing.status, "not-enabled");
  assert.match(getThread(root, item.threadId).body, /Media input received/);
});
test("text-only replies retain threading, review controls and exact content", async (t) => {
  const root = fixture(t);
  receiveUpdate(root, textConfig, input(12, "Please make this change"));
  materializeThread(root, textConfig, 12, "Please make this change");
  const thread = getThread(root, readTransport(root).inbox[12].threadId);
  linkFeedbackWork(
    scopeFor(root),
    thread.id,
    "pull-request:https://github.com/example/origin/pull/42",
  );
  transitionFeedback(scopeFor(root), thread.id, "in_progress");
  const reply = queueReply(
    root,
    thread.id,
    "Verified the requested text-only behavior with focused regression coverage.",
    "review",
  );
  const sent = [];
  await deliverReply(
    root,
    textConfig,
    {
      sendText: async (text, _config, extra) => {
        sent.push({ text, extra });
        return { message_id: 812 };
      },
    },
    null,
    reply,
  );
  assert.equal(sent[0].text, reply.text);
  assert.equal(sent[0].extra.reply_parameters.message_id, 12);
  assert.equal(sent[0].extra.reply_markup.inline_keyboard[0][0].text, "Merge PR");
  assert.equal(readTransport(root).outbox[reply.id].deliveryMode, "text");
  assert.equal(readTransport(root).outbox[reply.id].status, "sent");
});
test("an in-flight package from the voice-only release resumes as voice", async (t) => {
  const root = fixture(t);
  const thread = request(scopeFor(root));
  const reply = queueReply(root, thread.id, "Resume the prepared voice response.");
  updateTransport(root, (state) => {
    state.outbox[reply.id].chunks = [
      {
        caption: reply.text,
        file: path.join(directory(root), "outbound", reply.id, "0.ogg"),
        index: 0,
        status: "rendered",
      },
    ];
  });
  let voiceSends = 0;
  await deliverReply(
    root,
    textConfig,
    {
      sendText: async () => assert.fail("legacy voice package must not change transport"),
      sendFile: async (method) => {
        assert.equal(method, "sendVoice");
        voiceSends++;
        return { message_id: 813 };
      },
    },
    { render: async () => assert.fail("rendered chunk must not render twice") },
    reply,
  );
  assert.equal(voiceSends, 1);
  assert.equal(readTransport(root).outbox[reply.id].deliveryMode, "voice");
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
test("long text replies split within Telegram limits without losing content", () => {
  const value = `${"one two three four\n".repeat(1000)}${"🙂".repeat(100)}`;
  const chunks = textChunks(value);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => Array.from(chunk).length <= 4096));
  assert.equal(chunks.join(""), value);
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

test("transport backlog independently blocks Stop until delivered or explicitly cancelled", async (t) => {
  const { inspectStop } = await import("../lib/continuation.mjs");
  const root = fixture(t);
  ensureAgentState(scopeFor(root));
  receiveUpdate(
    root,
    config,
    input(901, "a pending voice", { voice: { file_id: "voice", file_size: 100 } }),
  );
  assert.equal(inspectStop(scopeFor(root)).block, true);
  pauseAgent(scopeFor(root), "Owner paused remote processing.");
  assert.equal(inspectStop(scopeFor(root)).block, false);
});

test("private storage rejects symbolic ancestors", async (t) => {
  if (process.platform === "win32")
    return t.skip("Full harness uses WSL; native Windows symlinks require privileges.");
  const { privateDirectory } = await import("../lib/storage.mjs");
  const root = fixture(t);
  fs.mkdirSync(path.join(root, "outside"));
  fs.symlinkSync(path.join(root, "outside"), path.join(root, "link"));
  assert.throws(() => privateDirectory(path.join(root, "link", "nested")), /symlink/);
  assert.equal(fs.existsSync(path.join(root, "outside", "nested")), false);
});

test("associated conversations retain all history and resolve with their parent", async (t) => {
  const { associateInput } = await import("../lib/service.mjs");
  const root = fixture(t);
  const scope = scopeFor(root);
  receiveUpdate(root, config, input(801, "Main request"));
  receiveUpdate(root, config, input(802, "Additional detail"));
  const main = materializeThread(root, config, 801, "Main request");
  const detail = materializeThread(root, config, 802, "Additional detail");
  associateInput(root, 802, main.id);
  associateInput(root, 802, main.id);
  assert.equal(getFeedback(scope, main.id).messages.length, 2);
  assert.equal(getFeedback(scope, detail.id).id, main.id);
  ready(scope, main.id);
  reviewFeedback(scope, main.id, "resolved");
  assert.equal(getFeedback(scope, detail.id).status, "resolved");
  assert.equal(inspectChannelStop(scope).block, false);
  receiveUpdate(root, config, input(803, "More detail", { reply_to_message: { message_id: 802 } }));
  materializeThread(root, config, 803, "More detail");
  assert.equal(getFeedback(scope, main.id).status, "open");
});

test("journal commit replay recovers a question after transport receipt loss", async (t) => {
  const { commitReply } = await import("../lib/service.mjs");
  const root = fixture(t);
  const scope = scopeFor(root);
  const thread = request(scope);
  const intent = queueReply(root, thread.id, "Which option should I implement?", "question");
  const snapshot = readTransport(root);
  commitReply(root, intent.id);
  atomicJSON(path.join(directory(root), "transport.json"), snapshot);
  commitReply(root, intent.id);
  assert.equal(getFeedback(scope, thread.id).messages.length, 2);
  assert.equal(readTransport(root).outbox[intent.id].committed, true);
});

test("review buttons require delivered packages, owner identity and unchanged versions", async (t) => {
  const root = fixture(t);
  const scope = scopeFor(root);
  const thread = request(scope);
  linkFeedbackWork(scope, thread.id, "pull-request:https://github.com/example/origin/pull/42");
  transitionFeedback(scope, thread.id, "in_progress");
  const item = queueReply(
    root,
    thread.id,
    "Verified the requested behavior with regression checks.",
    "review",
  );
  const { commitReply } = await import("../lib/service.mjs");
  commitReply(root, item.id);
  const token = readTransport(root).outbox[item.id].buttons[0].callback_data;
  const callback = (update_id, user = 200) => ({
    update_id,
    callback_query: {
      id: String(update_id),
      data: token,
      from: { id: user },
      message: { chat: { id: 100 }, message_id: 900 },
    },
  });
  receiveUpdate(root, config, callback(910));
  assert.equal(getFeedback(scope, thread.id).status, "ready_for_review");
  await deliverReply(
    root,
    config,
    { sendFile: async () => ({ message_id: 900 }) },
    { render: async () => ({}) },
    item,
  );
  receiveUpdate(root, config, callback(911, 201));
  assert.equal(getFeedback(scope, thread.id).status, "ready_for_review");
  receiveUpdate(root, config, callback(912));
  assert.equal(getFeedback(scope, thread.id).status, "ready_for_review");
  const ownerAction = Object.values(readTransport(root).ownerActions)[0];
  assert.equal(ownerAction.status, "pending");
  await processOwnerMerge(
    root,
    config,
    { sendText: async () => ({ message_id: 901 }) },
    ownerAction,
    {
      merge: (_repositoryRoot, feedbackRoot, id) => ({
        record: reviewFeedback(feedbackRoot, id, "resolved", {
          acceptance: "User merged PR #42.",
        }),
      }),
    },
  );
  assert.equal(getFeedback(scope, thread.id).status, "resolved");
  addFeedbackMessage(scope, thread.id, { body: "Another request arrived." });
  receiveUpdate(root, config, callback(913));
  assert.equal(getFeedback(scope, thread.id).status, "open");
});

test("paired owner slash merge resolves the work unit and is not agent conversation", async (t) => {
  const root = fixture(t);
  const scope = scopeFor(root);
  const thread = request(scope);
  linkFeedbackWork(scope, thread.id, "pull-request:https://github.com/example/origin/pull/42");
  transitionFeedback(scope, thread.id, "in_progress");
  transitionFeedback(scope, thread.id, "ready_for_review", {
    verification: "Verified the linked pull request with focused regression coverage.",
  });
  receiveUpdate(root, config, input(930, "/merge 42"));
  const state = readTransport(root);
  assert.equal(state.inbox[930], undefined);
  const action = state.ownerActions["command-930"];
  assert.equal(action.pullRequestNumber, 42);
  await processOwnerMerge(root, config, { sendText: async () => ({ message_id: 931 }) }, action, {
    merge: (_repositoryRoot, feedbackRoot, id) => ({
      record: reviewFeedback(feedbackRoot, id, "resolved", {
        acceptance: "User merged PR #42.",
      }),
    }),
  });
  assert.equal(getFeedback(scope, thread.id).status, "resolved");
  assert.equal(readTransport(root).ownerActions["command-930"].status, "completed");
});

test("indeterminate delivery requires evidence and recovers without sending a confirmed part twice", async (t) => {
  const { reconcileDelivery } = await import("../lib/service.mjs");
  const root = fixture(t);
  const thread = request(scopeFor(root));
  const item = queueReply(root, thread.id, "Here is the result.");
  await assert.rejects(
    deliverReply(
      root,
      config,
      {
        sendFile: async () => {
          throw Object.assign(new Error("unknown"), { uncertain: true });
        },
      },
      { render: async () => ({}) },
      item,
    ),
  );
  assert.throws(() => reconcileDelivery(root, item.id, "voice", 0, "sent", 901, ""), /evidence/);
  reconcileDelivery(
    root,
    item.id,
    "voice",
    0,
    "sent",
    901,
    "Owner inspected the delivered Telegram message.",
  );
  await deliverReply(
    root,
    config,
    { sendFile: async () => assert.fail("must not duplicate confirmed delivery") },
    {},
    item,
  );
  assert.equal(readTransport(root).outbox[item.id].status, "sent");
});

test("owner sample enrollment preserves the sample and queues exactly one voice preview", async (t) => {
  if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0)
    return t.skip("FFmpeg is required for the sample conversion integration check.");
  const root = fixture(t);
  receiveUpdate(root, config, input(920, "/voice-sample"));
  receiveUpdate(
    root,
    config,
    input(921, undefined, { text: undefined, voice: { file_id: "sample" } }),
  );
  const item = readTransport(root).inbox[921];
  const api = {
    download: async (_id, target) => {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const result = spawnSync("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1",
        "-c:a",
        "libopus",
        target,
      ]);
      assert.equal(result.status, 0);
    },
  };
  const voice = {
    transcribe: async () => ({ text: "A synthetic fixture transcript." }),
    close() {},
  };
  await prepareInput(root, config, api, voice, item);
  await prepareInput(root, config, api, voice, item);
  const state = readTransport(root);
  assert.equal(state.inbox[921].status, "sample-ready");
  assert.equal(Object.values(state.outbox).length, 1);
  assert.match(Object.values(state.outbox)[0].text, /voice preview/);
  assert.equal(fs.existsSync(path.join(directory(root), "voice/reference.wav")), true);
});

test("HTTP dashboard remains healthy when its engagement plugin is physically removed", async (t) => {
  const { pathToFileURL } = await import("node:url");
  const root = fixture(t);
  fs.cpSync(path.join(repo, ".codex"), path.join(root, ".codex"), { recursive: true });
  fs.cpSync(path.join(repo, "server"), path.join(root, "server"), { recursive: true });
  fs.rmSync(path.join(root, ".codex/plugins/contextual-feedback"), { recursive: true });
  const { startOriginServer } = await import(pathToFileURL(path.join(root, "server/index.mjs")));
  const server = await startOriginServer({ root, port: 0, serveUi: false, deliverWakes: false });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.equal((await (await fetch(`${base}/api/feedback`)).json()).disabled, true);
  const response = await fetch(`${base}/api/session/wake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal((await response.json()).disabled, true);
});

test("related replies are assigned before slow media processing finishes", (t) => {
  const root = fixture(t);
  receiveUpdate(root, config, input(941, "", { voice: { file_id: "slow-audio" } }));
  receiveUpdate(
    root,
    config,
    input(942, "This belongs to my voice request", { reply_to_message: { message_id: 941 } }),
  );
  const state = readTransport(root);
  assert.equal(state.inbox[941].threadId, state.inbox[942].threadId);
  assert.equal(listFeedback(scopeFor(root)).length, 1);
  assert.throws(
    () =>
      queueReply(
        root,
        state.inbox[941].threadId,
        "Verified this result and all its material.",
        "review",
      ),
    /Process all/,
  );
});

test("a lost ingress snapshot cannot duplicate the initial raw contribution", (t) => {
  const root = fixture(t);
  const snapshot = readTransport(root);
  receiveUpdate(root, config, input(951, "Preserve this request once"));
  atomicJSON(path.join(directory(root), "transport.json"), snapshot);
  receiveUpdate(root, config, input(951, "Preserve this request once"));
  assert.equal(listFeedback(scopeFor(root))[0].messages.length, 1);
});

test("channel-owned Stop voices render validated responsibility pointers", async (t) => {
  const { inspectStop: inspectLocal } = await import("../../contextual-feedback/hooks/stop.mjs");
  const { inspectStop: inspectRemote } = await import("../hooks/stop.mjs");
  const root = fixture(t);
  const local = request(root);
  const remote = request(scopeFor(root));
  assert.match(inspectLocal(root).reason, new RegExp(local.id));
  assert.match(inspectRemote(scopeFor(root)).reason, new RegExp(remote.id));
  assert.match(inspectRemote(scopeFor(root)).reason, /npm run telegram/);
  assert.match(inspectLocal(root).reason, /npm run feedback/);
});

test("owner can withdraw a remote request without representing it as accepted", async (t) => {
  const root = fixture(t);
  const scope = scopeFor(root);
  const thread = request(scope);
  const item = queueReply(root, thread.id, "I have started reviewing your request.");
  await deliverReply(
    root,
    config,
    { sendFile: async () => ({ message_id: 990 }) },
    { render: async () => ({}) },
    item,
  );
  const token = readTransport(root).outbox[item.id].buttons[0].callback_data;
  receiveUpdate(root, config, {
    update_id: 991,
    callback_query: {
      id: "991",
      data: token,
      from: { id: 200 },
      message: { chat: { id: 100 }, message_id: 990 },
    },
  });
  assert.equal(getFeedback(scope, thread.id).status, "dismissed");
  assert.equal(getFeedback(scope, thread.id).acceptance, null);
  assert.match(readTransport(root).callbackReceipts[991], /Withdrawn/);
});

test("a later speech chunk failure sends no partial conversation and retains earlier renders", async (t) => {
  const root = fixture(t);
  const thread = request(scopeFor(root));
  const item = queueReply(root, thread.id, "A bounded sentence for this test. ".repeat(30));
  let renders = 0;
  let sends = 0;
  await assert.rejects(
    deliverReply(
      root,
      config,
      {
        sendFile: async () => {
          sends++;
        },
      },
      {
        render: async () => {
          if (++renders === 2) throw new Error("GPU_BUSY");
        },
      },
      item,
    ),
  );
  assert.equal(sends, 0);
  assert.equal(readTransport(root).outbox[item.id].chunks[0].status, "rendered");
  assert.equal(readTransport(root).outbox[item.id].chunks[1].status, "prepared");
});

test("albums stay in one thread and unsafe display bytes cannot poison later polling", (t) => {
  const root = fixture(t);
  receiveUpdate(
    root,
    config,
    input(1, "\u0000\u0007", { media_group_id: "album", photo: [{ file_id: "a" }] }),
  );
  receiveUpdate(
    root,
    config,
    input(2, "Second image", { media_group_id: "album", photo: [{ file_id: "b" }] }),
  );
  receiveUpdate(root, config, input(3, "Independent question"));
  const s = readTransport(root);
  assert.equal(s.offset, 4);
  assert.equal(s.inbox[1].source.message.text, "\u0000\u0007");
  assert.equal(s.inbox[1].threadId, s.inbox[2].threadId);
  assert.notEqual(s.inbox[2].threadId, s.inbox[3].threadId);
});

test("pause or disable during synthesis prevents the subsequent network send", async (t) => {
  const root = fixture(t);
  const thread = request(scopeFor(root));
  const item = queueReply(root, thread.id, "Render this response.");
  let active = true,
    sends = 0;
  await assert.rejects(
    deliverReply(
      root,
      config,
      {
        sendFile: async () => {
          sends++;
        },
      },
      {
        render: async () => {
          active = false;
        },
      },
      item,
      { canSend: () => active },
    ),
    /paused or disabled/,
  );
  assert.equal(sends, 0);
  assert.equal(readTransport(root).outbox[item.id].committed, undefined);
});

test("queued progress and materials do not supersede each other but new user input does", async (t) => {
  const root = fixture(t);
  receiveUpdate(root, config, input(1));
  const thread = readTransport(root).inbox[1].threadId;
  const first = queueReply(root, thread, "The first progress response.");
  const second = queueReply(root, thread, "Here are the accompanying materials.");
  let n = 100;
  const api = {
    sendFile: async (_m, _f, _p, _c, extra) => {
      assert.equal(extra.reply_parameters.message_id, 1);
      return { message_id: n++ };
    },
  };
  const voice = { render: async () => ({}) };
  await deliverReply(root, config, api, voice, first);
  await deliverReply(root, config, api, voice, second);
  assert.equal(readTransport(root).outbox[second.id].status, "sent");
  const stale = queueReply(root, thread, "This response will be superseded.");
  receiveUpdate(
    root,
    config,
    input(2, "A new correction", { reply_to_message: { message_id: 1 } }),
  );
  await deliverReply(root, config, api, voice, stale);
  assert.equal(readTransport(root).outbox[stale.id].status, "superseded");
});

test("invalid outgoing lifecycle requests fail before persisting an undeliverable intent", (t) => {
  const root = fixture(t);
  const thread = request(scopeFor(root));
  assert.throws(() => queueReply(root, thread.id, "Too short", "review"), /between/);
  assert.throws(
    () => queueReply(root, thread.id, "Verified a behavior before starting any work.", "review"),
    /status/,
  );
  assert.equal(Object.keys(readTransport(root).outbox).length, 0);
});

test("repeated processing failure becomes inspectable and explicit retry resets the budget", async (t) => {
  const { failure } = await import("../lib/runtime.mjs");
  const { retryOutput } = await import("../lib/service.mjs");
  const root = fixture(t);
  const thread = request(scopeFor(root));
  const item = queueReply(root, thread.id, "Waiting for local voice repair.");
  for (let i = 0; i < 5; i++)
    failure(root, "outbox", item.id, new Error("local model unavailable"));
  assert.equal(readTransport(root).outbox[item.id].status, "failed");
  retryOutput(root, item.id);
  assert.equal(readTransport(root).outbox[item.id].attempts, 0);
});

test("pending lifecycle replies cannot queue contradictory question or review transitions", (t) => {
  const root = fixture(t);
  const thread = request(scopeFor(root));
  queueReply(root, thread.id, "Which option do you prefer?", "question");
  assert.throws(
    () => queueReply(root, thread.id, "Which other option do you prefer?", "question"),
    /already pending/,
  );
  assert.equal(Object.values(readTransport(root).outbox).length, 1);
});
