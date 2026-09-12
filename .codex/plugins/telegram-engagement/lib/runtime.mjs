import { deliverAsyncWake } from "../../_dashboard-runtime/lib/async-wake.mjs";
import { reconcileTelegram } from "./continuation.mjs";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import {
  directory,
  scopeFor,
  acquireLease,
  readTransport,
  updateTransport,
  privateDirectory,
  atomicJSON,
  readJSON,
} from "./storage.mjs";
import { receiveUpdate, materializeThread, commitReply, queueReply } from "./service.mjs";
import { loadConfig, saveConfig } from "./config.mjs";
import { BotAPI } from "./api.mjs";
import { LocalVoice, captionChunks } from "./voice.mjs";
import {
  reconcileAgentState,
  createFeedbackMutation,
  feedbackWakeIntents,
  getFeedback,
  recordVersion,
  replyVersion,
} from "../../_engagement-core/lib/service.mjs";
import { readAgentState } from "../../_engagement-core/lib/state.mjs";
import {
  enqueueFeedbackWake,
  wakeStatus,
  hasFeedbackWakeForEvent,
  deliverPendingWakes,
} from "../../_dashboard-runtime/lib/wake-outbox.mjs";

export function failure(root, lane, id, error) {
  updateTransport(root, (state) => {
    const item = state[lane][id];
    item.attempts = (item.attempts || 0) + 1;
    item.error = error.message;
    item.status =
      error.uncertain ||
      (lane === "outbox" &&
        [...(item.chunks || []), ...(item.materials || [])].some(
          (p) => p.status === "indeterminate",
        ))
        ? "indeterminate"
        : error.permanent || item.attempts >= 5
          ? "failed"
          : "retrying";
    item.nextAttemptAt =
      Date.now() +
      Math.max(
        (error.retryAfter || 0) * 1000,
        Math.min(60000, 1000 * 2 ** Math.min(item.attempts, 6)),
      );
  });
}
export async function prepareInput(root, config, api, voice, item, signal) {
  const material = [];
  let transcript = "";
  for (let index = 0; index < item.files.length; index++) {
    const file = item.files[index];
    const ext = ["voice", "audio"].includes(file.kind)
      ? ".ogg"
      : path
          .extname(file.file_name || "")
          .replace(/[^.a-zA-Z0-9]/g, "")
          .slice(0, 12) || ".bin";
    const target = path.join(directory(root), "media", `${item.updateId}-${index}${ext}`);
    if (!fs.existsSync(target))
      await api.download(file.file_id, target, config.maxMediaBytes, signal);
    const metadata = { ...file, localPath: target };
    if (["voice", "audio"].includes(file.kind)) {
      if (config.transcriptionEnabled) {
        if (!voice)
          throw new Error(
            "Speech transcription is enabled but unavailable. Run Telegram doctor; the source audio is preserved.",
          );
        const result = await voice.transcribe(target);
        if (!result.text.trim())
          throw new Error(
            "Voice has no recognizable speech; source audio is preserved for review.",
          );
        metadata.transcription = result;
        transcript += `${transcript ? "\n" : ""}${result.text}`;
      } else {
        metadata.processing = {
          status: "not-enabled",
          reason: "Optional speech transcription is not enabled; inspect the preserved audio.",
        };
      }
    }
    material.push(metadata);
  }
  if (item.kind === "voice-sample") {
    if (!config.transcriptionEnabled || !voice)
      throw new Error(
        "Voice enrollment needs the optional speech capability. Run npm run telegram -- install-voice; the source audio is preserved.",
      );
    const voiceDir = path.join(directory(root), "voice");
    privateDirectory(voiceDir);
    await convertSample(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-i",
        material[0].localPath,
        "-t",
        "30",
        "-ar",
        "24000",
        "-ac",
        "1",
        path.join(voiceDir, "reference.wav"),
      ],
      signal,
    );

    // Transcribe exactly the selected reference segment, not the full voice note.
    const reference = await voice.transcribe(path.join(voiceDir, "reference.wav"));
    fs.writeFileSync(path.join(voiceDir, "reference.txt"), reference.text + "\n", { mode: 0o600 });
    fs.chmodSync(path.join(voiceDir, "reference.wav"), 0o600);
    voice.close();
    config.voiceRepliesEnabled = true;
    saveConfig(root, config);
    const thread = createFeedbackMutation(scopeFor(root), {
      externalId: `telegram-${config.botId}-${item.updateId}`,
      kind: "update",
      body: "Voice sample enrollment. Review the local transcript and cloned-voice preview before confirming that this voice is ready.",
      pagePath: "/telegram",
      pageLabel: "Voice enrollment",
    }).record;
    queueReply(
      root,
      thread.id,
      `The selected sample transcript is: ${reference.text}. This is your locally generated voice preview. Please listen and reply with any correction or confirm that the voice sounds right.`,
      "progress",
      [],
      { packageId: `sample-preview-${item.updateId}` },
    );
    updateTransport(root, (state) => {
      const input = state.inbox[String(item.updateId)];
      input.status = "sample-ready";
      input.threadId = thread.id;
      input.materials = material;
      input.referenceTranscript = reference.text;
      state.replies[String(item.messageId)] = thread.id;
    });
    return;
  }
  const text = [item.text, transcript].filter(Boolean).join("\n\n");
  materializeThread(root, config, item.updateId, text, material);
}

export async function deliverReply(root, config, api, voice, original, options = {}) {
  const assertActive = () => {
    if (options.signal?.aborted || options.canSend?.() === false)
      throw new Error(
        "Delivery paused or disabled; retain the unsent parts until explicitly resumed.",
      );
  };
  assertActive();
  let item = readTransport(root).outbox[original.id];
  const scope = scopeFor(root);
  if (
    !item.committed &&
    !getFeedback(scope, item.threadId).messages.some((m) => m.id === `outbound-${item.id}`) &&
    (item.expectedReplyVersion
      ? replyVersion(getFeedback(scope, item.threadId)) !== item.expectedReplyVersion
      : recordVersion(getFeedback(scope, item.threadId)) !== item.expectedVersion)
  ) {
    updateTransport(root, (s) => {
      s.outbox[item.id].status = "superseded";
      s.outbox[item.id].error = "New conversation arrived. Prepare a fresh reply.";
    });
    return;
  }
  if (!item.chunks.length) {
    const deliveryMode = config.voiceRepliesEnabled ? "voice" : "text";
    const chunks = (
      deliveryMode === "voice"
        ? captionChunks(item.text, config.speechChunkChars || 300)
        : textChunks(item.text)
    ).map((text, index) => ({
      ...(deliveryMode === "voice"
        ? {
            caption: text,
            file: path.join(directory(root), "outbound", item.id, `${index}.ogg`),
          }
        : { text }),
      index,
      status: "prepared",
    }));
    updateTransport(root, (s) => {
      s.outbox[item.id].chunks = chunks;
      s.outbox[item.id].deliveryMode = deliveryMode;
    });
    item = readTransport(root).outbox[item.id];
  } else if (!item.deliveryMode) {
    // In-flight packages created by the voice-only preview predate this field.
    updateTransport(root, (s) => {
      s.outbox[item.id].deliveryMode = item.chunks.some((chunk) => chunk.file || chunk.caption)
        ? "voice"
        : "text";
    });
    item = readTransport(root).outbox[item.id];
  }
  if (item.deliveryMode === "voice") {
    if (!voice)
      throw new Error(
        "Cloned-voice replies are enabled but local speech is unavailable. Run Telegram doctor; the reply remains queued.",
      );
    for (const chunk of item.chunks) {
      if (chunk.status !== "prepared") continue;
      assertActive();
      await voice.render(chunk.caption, chunk.file);
      updateTransport(root, (s) => {
        s.outbox[item.id].chunks[chunk.index].status = "rendered";
      });
    }
  }
  assertActive();
  commitReply(root, item.id);
  item = readTransport(root).outbox[item.id];
  for (const chunk of item.chunks) {
    if (chunk.status === "sent") continue;
    if (chunk.status === "indeterminate") return;
    assertActive();
    updateTransport(root, (s) => {
      s.outbox[item.id].status = "indeterminate";
      s.outbox[item.id].chunks[chunk.index].status = "indeterminate";
    });
    const last = chunk.index === item.chunks.length - 1;
    let result;
    const extra = {
      reply_parameters: item.replyToMessageId
        ? { message_id: item.replyToMessageId, allow_sending_without_reply: true }
        : undefined,
      reply_markup: last && item.buttons ? { inline_keyboard: [item.buttons] } : undefined,
    };
    try {
      result =
        item.deliveryMode === "voice"
          ? await api.sendFile(
              "sendVoice",
              "voice",
              chunk.file,
              config,
              { caption: chunk.caption, ...extra },
              { signal: options.signal },
            )
          : await api.sendText(chunk.text, config, extra, { signal: options.signal });
    } catch (error) {
      if (!error.uncertain)
        updateTransport(root, (s) => {
          s.outbox[item.id].chunks[chunk.index].status =
            item.deliveryMode === "voice" ? "rendered" : "prepared";
        });
      throw error;
    }
    updateTransport(root, (s) => {
      s.outbox[item.id].chunks[chunk.index].status = "sent";
      s.outbox[item.id].chunks[chunk.index].messageId = result.message_id;
      s.outbox[item.id].status = "sending";
      s.replies[String(result.message_id)] = item.threadId;
    });
  }
  for (let index = 0; index < item.materials.length; index++) {
    assertActive();
    const attachment = readTransport(root).outbox[item.id].materials[index];
    if (attachment.status === "sent") continue;
    updateTransport(root, (s) => {
      s.outbox[item.id].status = "indeterminate";
      s.outbox[item.id].materials[index].status = "indeterminate";
    });
    if (attachment.status === "indeterminate") return;
    let result;
    try {
      result = await api.sendFile(
        "sendDocument",
        "document",
        attachment.path,
        config,
        {
          reply_parameters: item.replyToMessageId
            ? { message_id: item.replyToMessageId, allow_sending_without_reply: true }
            : undefined,
        },
        { signal: options.signal },
      );
    } catch (error) {
      if (!error.uncertain)
        updateTransport(root, (s) => {
          s.outbox[item.id].materials[index].status = "prepared";
        });
      throw error;
    }
    updateTransport(root, (s) => {
      s.outbox[item.id].materials[index].status = "sent";
      s.outbox[item.id].materials[index].messageId = result.message_id;
      s.replies[String(result.message_id)] = item.threadId;
    });
  }
  updateTransport(root, (s) => {
    s.outbox[item.id].status = "sent";
    s.outbox[item.id].error = null;
  });
}

export async function runTelegram(root, options = {}) {
  const config = options.config || loadConfig(root);
  const api = options.api || new BotAPI(config.token);
  const speechEnabled = config.transcriptionEnabled || config.voiceRepliesEnabled;
  const voice = options.voice ?? (speechEnabled ? new LocalVoice(root, config) : null);
  const release = acquireLease(directory(root), "listener");
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  const shutdown = () => controller.abort();
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  const scope = scopeFor(root);
  const enabled = () =>
    options.ignoreActivation ||
    readJSON(path.join(directory(root), "enabled.json"), {}).enabled === true;
  const jobs = new Set();
  const workingInputs = new Set();
  let sending = false;
  try {
    await api.verify(config);
    atomicJSON(path.join(directory(root), "runtime.json"), {
      pid: process.pid,
      status: "ready",
      at: new Date().toISOString(),
    });
    reconcileAgentState(scope);
    const poll = async () => {
      while (!signal.aborted) {
        try {
          const updates = await api.updates(readTransport(root).offset, signal);
          for (const update of updates) {
            receiveUpdate(root, config, update);
            if (update.callback_query)
              await api
                .call("answerCallbackQuery", {
                  callback_query_id: update.callback_query.id,
                  text:
                    readTransport(root).callbackReceipts?.[String(update.update_id)] ||
                    "This control was already processed.",
                })
                .catch(() => {});
          }
        } catch (error) {
          if (signal.aborted) break;
          if (error.code === 401 || error.code === 409)
            throw new Error(
              "Telegram token or polling ownership needs attention. Stop the competing consumer or repair setup.",
            );
          await delay(Math.max(2000, (error.retryAfter || 0) * 1000), undefined, { signal }).catch(
            () => {},
          );
        }
      }
    };
    const work = async () => {
      while (!signal.aborted) {
        if (!enabled()) {
          controller.abort();
          break;
        }
        reconcileTelegram(root);
        const state = readTransport(root);
        for (const item of Object.values(state.inbox)) {
          if (workingInputs.size >= 2) break;
          if (
            !["received", "retrying"].includes(item.status) ||
            item.nextAttemptAt > Date.now() ||
            workingInputs.has(item.updateId)
          )
            continue;
          workingInputs.add(item.updateId);
          const job = prepareInput(root, config, api, voice, item, signal)
            .catch((error) => failure(root, "inbox", item.updateId, error))
            .finally(() => {
              workingInputs.delete(item.updateId);
              jobs.delete(job);
            });
          jobs.add(job);
        }
        if (readAgentState(scope).mode !== "paused") {
          try {
            for (const intent of feedbackWakeIntents(scope))
              if (!hasFeedbackWakeForEvent(scope, intent.sourceEventHash))
                enqueueFeedbackWake(scope, intent);
            if (options.wakeOptions)
              await deliverPendingWakes(scope, { ...options.wakeOptions, maxDeliveries: 1 });
            else if (wakeStatus(scope).retryable > 0)
              await (options.deliverWake || deliverAsyncWake)(scope);
          } catch (error) {
            atomicJSON(path.join(directory(root), "wake-error.json"), {
              at: new Date().toISOString(),
              error: error.message,
            });
          }
          if (!sending) {
            const item = Object.values(readTransport(root).outbox).find(
              (p) =>
                ["prepared", "sending", "retrying"].includes(p.status) &&
                p.nextAttemptAt <= Date.now(),
            );
            if (item) {
              sending = true;
              const job = deliverReply(root, config, api, voice, item, {
                signal,
                canSend: () => enabled() && readAgentState(scope).mode !== "paused",
              })
                .catch((error) => failure(root, "outbox", item.id, error))
                .finally(() => {
                  sending = false;
                  jobs.delete(job);
                });
              jobs.add(job);
            }
          }
        }
        await delay(500, undefined, { signal }).catch(() => {});
      }
    };
    await Promise.all([poll().finally(shutdown), work().finally(shutdown)]);
  } finally {
    controller.abort();
    atomicJSON(path.join(directory(root), "runtime.json"), {
      pid: process.pid,
      status: "stopped",
      at: new Date().toISOString(),
    });
    voice?.close();
    await Promise.allSettled([...jobs]);
    release();
    process.removeListener("SIGTERM", shutdown);
    process.removeListener("SIGINT", shutdown);
  }
}

export function textChunks(value, limit = 4096) {
  const source = Array.from(String(value));
  const chunks = [];
  while (source.length > limit) {
    const window = source.slice(0, limit);
    let end = window.lastIndexOf("\n") + 1;
    if (end < Math.floor(limit / 2)) {
      const whitespace = window.findLastIndex((character) => /\s/u.test(character));
      end = whitespace + 1;
    }
    if (end < 1) end = limit;
    chunks.push(source.splice(0, end).join(""));
  }
  if (source.length || !chunks.length) chunks.push(source.join(""));
  return chunks;
}

function convertSample(command, args, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: "ignore",
      signal,
      timeout: 120000,
      killSignal: "SIGKILL",
    });
    child.once("error", () =>
      reject(
        new Error(
          "Could not prepare the local voice sample; inspect FFmpeg and the preserved input.",
        ),
      ),
    );
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(new Error("Could not prepare the local voice sample.")),
    );
  });
}
