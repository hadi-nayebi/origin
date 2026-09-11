import crypto from "node:crypto";
import {
  createFeedbackMutation,
  addFeedbackMessageMutation,
  reviewFeedbackMutation,
  getFeedback,
  listFeedback,
  reconcileAgentState,
  recordVersion,
  commitAgentReply,
} from "../../_engagement-core/lib/service.mjs";
import { pauseAgent, resumeAgent, readAgentState } from "../../_engagement-core/lib/state.mjs";
import { readTransport, updateTransport, scopeFor } from "./storage.mjs";

export function authorized(message, config) {
  return (
    message &&
    String(message.chat?.id) === config.chatId &&
    String(message.from?.id) === config.userId &&
    message.from?.is_bot !== true
  );
}
export function mediaOf(message) {
  const files = [];
  if (message.photo?.length) files.push({ kind: "photo", ...message.photo.at(-1) });
  for (const kind of [
    "voice",
    "audio",
    "document",
    "video",
    "video_note",
    "animation",
    "sticker",
  ]) {
    if (message[kind]?.file_id) files.push({ kind, ...message[kind] });
  }
  return files;
}
export function receiveUpdate(root, config, update) {
  if (!Number.isSafeInteger(update.update_id) || update.update_id < 0)
    throw new Error("Invalid Telegram update ID.");
  return updateTransport(root, (state) => {
    if (state.botId && state.botId !== config.botId)
      throw new Error("Transport belongs to a different bot.");
    state.botId = config.botId;
    if (update.update_id < state.offset) return "duplicate";
    const callback = update.callback_query;
    const message = update.message || update.edited_message;
    if (callback) {
      const auth = { ...callback.message, from: callback.from };
      if (authorized(auth, config)) {
        const action = state.callbacks[callback.data];
        if (action && !action.used && action.expiresAt > Date.now()) {
          const current = getFeedback(scopeFor(root), action.threadId);
          if (recordVersion(current) === action.version) {
            reviewFeedbackMutation(scopeFor(root), action.threadId, action.status, {
              expectedVersion: action.version,
              acceptance: "Accepted by paired Telegram owner.",
              reason: "Paired Telegram owner requested another review.",
            });
            action.used = true;
          }
        }
      }
    } else if (authorized(message, config)) {
      const key = String(update.update_id);
      if (!state.inbox[key]) {
        const text = message.text || message.caption || "";
        const files = mediaOf(message);
        const command = text.trim();
        if (command === "/pause")
          pauseAgent(scopeFor(root), "Paused by the paired Telegram owner.");
        else if (command === "/resume") {
          if (readAgentState(scopeFor(root)).mode === "paused") resumeAgent(scopeFor(root));
        } else if (command === "/voice-sample")
          state.enrollment = { expiresAt: Date.now() + 600000 };
        else {
          const sample =
            state.enrollment?.expiresAt > Date.now() &&
            files.some((f) => ["voice", "audio"].includes(f.kind));
          if (sample) state.enrollment = null;
          const reply = message.reply_to_message?.message_id;
          const original = Object.values(state.inbox).find(
            (item) => item.messageId === message.message_id && item.threadId,
          );
          state.inbox[key] = {
            updateId: update.update_id,
            messageId: message.message_id,
            source: update,
            threadId: original?.threadId || state.replies[String(reply)] || null,
            kind: sample ? "voice-sample" : "engagement",
            text,
            files,
            status: "received",
            attempts: 0,
            nextAttemptAt: 0,
            receivedAt: new Date().toISOString(),
          };
        }
      }
    }
    // This offset is committed in the SAME atomic write as the raw envelope.
    state.offset = update.update_id + 1;
    return "persisted";
  });
}

export function materializeThread(root, config, updateId, text, materials = []) {
  return updateTransport(root, (state) => {
    const item = state.inbox[String(updateId)];
    if (!item) throw new Error("Inbox item is missing.");
    const scope = scopeFor(root);
    const id = item.threadId || `telegram-${config.botId}-${updateId}`;
    const messageId = `telegram-message-${config.botId}-${updateId}`;
    let mutation;
    const body = text || "Material received; inspect the preserved attachment and source metadata.";
    if (item.threadId) mutation = addFeedbackMessageMutation(scope, id, { body }, { messageId });
    else
      mutation = createFeedbackMutation(scope, {
        externalId: id,
        kind: "update",
        body,
        pagePath: "/telegram",
        pageLabel: "Telegram conversation",
      });
    item.threadId = id;
    item.materials = materials;
    item.status = "ready";
    item.error = null;
    state.replies[String(item.messageId)] = id;
    return mutation.record;
  });
}

export function getThread(root, id) {
  const thread = getFeedback(scopeFor(root), id);
  return {
    ...thread,
    version: recordVersion(thread),
    inputs: Object.values(readTransport(root).inbox).filter((item) => item.threadId === id),
  };
}
export function associateInput(root, updateId, targetId) {
  getFeedback(scopeFor(root), targetId);
  return updateTransport(root, (state) => {
    const item = state.inbox[String(updateId)];
    if (!item) throw new Error("Input is missing.");
    if (item.threadId === targetId) return item;
    const previous = item.threadId;
    // Never delete or silently resolve the old thread. Preserve an explicit link.
    const body = `${item.text || "Related material"}\n\nRelated Telegram input ${updateId}; previous thread: ${previous || "unassigned"}.`;
    addFeedbackMessageMutation(
      scopeFor(root),
      targetId,
      { body },
      { messageId: `association-${updateId}-${crypto.randomUUID()}` },
    );
    item.associations = [
      ...(item.associations || []),
      { from: previous, to: targetId, at: new Date().toISOString() },
    ];
    item.threadId = targetId;
    state.replies[String(item.messageId)] = targetId;
    return item;
  });
}

export function queueReply(root, id, text, kind = "progress", materials = []) {
  const scope = scopeFor(root);
  // Prepare a durable intent before mutating the conversation. Recovery replays
  // the intent using its stable ID; the sender never invents acceptance.
  const packageId = crypto.randomUUID();
  return updateTransport(root, (state) => {
    const current = getFeedback(scope, id);
    if (!["progress", "question", "review", "preview"].includes(kind))
      throw new Error("Unknown reply kind.");
    if (!text.trim()) throw new Error("A reply needs readable text for its voice caption.");
    const intent = {
      id: packageId,
      threadId: id,
      text,
      kind,
      materials,
      status: "prepared",
      createdAt: new Date().toISOString(),
      attempts: 0,
      nextAttemptAt: 0,
      chunks: [],
    };
    state.outbox[packageId] = intent;
    intent.expectedVersion = recordVersion(current);
    return intent;
  });
}
export function commitReply(root, packageId) {
  return updateTransport(root, (state) => {
    const item = state.outbox[packageId];
    if (!item || item.committed) return;
    const scope = scopeFor(root);
    const record = commitAgentReply(scope, item.threadId, item);
    item.committed = true;
    item.reviewVersion = recordVersion(record);
    if (item.kind === "review") {
      item.buttons = [
        ["Accept", "resolved"],
        ["Reopen", "open"],
      ].map(([text, status]) => {
        const token = crypto.randomBytes(16).toString("hex");
        state.callbacks[token] = {
          threadId: item.threadId,
          version: item.reviewVersion,
          status,
          expiresAt: Date.now() + 7 * 86400000,
          used: false,
        };
        return { text, callback_data: token };
      });
    }
  });
}
export function recoverChannel(root) {
  return reconcileAgentState(scopeFor(root));
}
export function channelStatus(root) {
  const state = readTransport(root);
  return {
    threads: listFeedback(scopeFor(root)).map(({ id, status }) => ({ id, status })),
    inbox: Object.values(state.inbox).map(({ updateId, status, error }) => ({
      updateId,
      status,
      error,
    })),
    outbox: Object.values(state.outbox).map(({ id, status, error }) => ({ id, status, error })),
  };
}
