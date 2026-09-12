import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { BotAPI } from "../lib/api.mjs";
import { runTelegram } from "../lib/runtime.mjs";
import { readTransport, directory } from "../lib/storage.mjs";
import { queueReply } from "../lib/service.mjs";

// Exercise the production listener, Bot API request/response adapter and durable
// files together. All external HTTP and model calls are explicit test doubles.
test("listener handles the media matrix, survives wake errors, and shuts down without a polling owner", async (t) => {
  const base = path.resolve(".origin/runtime-fixtures");
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, "telegram-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plugin = path.join(root, ".codex/plugins/telegram-engagement");
  fs.mkdirSync(plugin, { recursive: true });
  fs.copyFileSync(
    path.resolve(".codex/plugins/telegram-engagement/voice.xml"),
    path.join(plugin, "voice.xml"),
  );
  const controller = new AbortController();
  t.after(() => controller.abort());
  const config = {
    botId: "42",
    chatId: "100",
    userId: "200",
    maxMediaBytes: 1024,
    transcriptionEnabled: true,
    voiceRepliesEnabled: true,
  };
  const forms = [
    "voice",
    "audio",
    "photo",
    "document",
    "video",
    "video_note",
    "animation",
    "sticker",
  ];
  const updates = forms.map((kind, i) => ({
    update_id: i + 1,
    message: {
      message_id: i + 1,
      chat: { id: 100 },
      from: { id: 200 },
      caption: kind === "document" ? "/pause" : `Inspect ${kind}`,
      ...(kind === "photo" ? { photo: [{ file_id: kind }] } : { [kind]: { file_id: kind } }),
    },
  }));
  updates.push({
    update_id: 9,
    message: {
      message_id: 9,
      chat: { id: 100 },
      from: { id: 200 },
      location: { latitude: 1, longitude: 2 },
    },
  });
  const ok = (result) =>
    new Response(JSON.stringify({ ok: true, result }), {
      headers: { "content-type": "application/json" },
    });
  let polls = 0,
    voiceSends = 0,
    wakeErrors = 0,
    closed = false;
  const api = new BotAPI("fixture-only", async (url, options) => {
    const method = url.split("/").at(-1);
    if (url.includes("/file/")) return new Response(Buffer.from("abc"));
    if (method === "getMe") return ok({ id: 42 });
    if (method === "getWebhookInfo") return ok({ url: "" });
    if (method === "getUpdates") {
      polls++;
      await delay(20, undefined, { signal: options.signal });
      const { offset } = JSON.parse(options.body);
      return ok(updates.filter((u) => u.update_id >= offset));
    }
    if (method === "getFile") return ok({ file_path: "files/input", file_size: 3 });
    if (method === "sendVoice") {
      assert.equal(options.body.get("chat_id"), "100");
      assert.equal(JSON.parse(options.body.get("reply_parameters")).message_id, 1);
      assert.ok(options.body.get("voice") instanceof Blob);
      voiceSends++;
      return ok({ message_id: 99 });
    }
    throw new Error(`Unexpected test endpoint: ${method}`);
  });
  const voice = {
    transcribe: async () => ({ text: "Recognized local voice." }),
    render: async (_text, file) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "test-opus");
    },
    close: () => {
      closed = true;
    },
  };
  const running = runTelegram(root, {
    config,
    api,
    voice,
    ignoreActivation: true,
    signal: controller.signal,
    deliverWake: async () => {
      wakeErrors++;
      throw new Error("Injected terminal observation failure");
    },
  });
  try {
    const until = Date.now() + 8000;
    while (
      Date.now() < until &&
      Object.values(readTransport(root).inbox).filter((i) => i.status === "ready").length < 9
    )
      await delay(25);
    const state = readTransport(root);
    assert.equal(Object.keys(state.inbox).length, 9);
    assert.equal(
      Object.values(state.inbox).every((i) => i.status === "ready"),
      true,
    );
    assert.equal(state.inbox[4].text, "/pause");
    assert.equal(state.inbox[9].source.message.location.latitude, 1);
    assert.ok(wakeErrors > 0);
    assert.ok(polls > 1);
    const reply = queueReply(root, state.inbox[1].threadId, "Response to the first voice request.");
    while (Date.now() < until && readTransport(root).outbox[reply.id].status !== "sent")
      await delay(25);
    assert.equal(readTransport(root).outbox[reply.id].status, "sent");
    assert.equal(voiceSends, 1);
  } finally {
    controller.abort();
    await running;
  }
  assert.equal(closed, true);
  assert.equal(fs.existsSync(path.join(directory(root), "listener.lock")), false);
  assert.equal(fs.existsSync(path.join(root, ".origin/contextual-feedback/data.json")), false);
});
