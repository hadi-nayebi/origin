import crypto from "node:crypto";
import { bounded } from "../../_engagement-core/lib/contracts.mjs";
import {
  createFeedbackMutation,
  addFeedbackMessageMutation,
  reviewFeedbackMutation,
  getFeedback,
  listFeedback,
  reconcileAgentState,
  recordVersion,
  replyVersion,
  commitAgentReply,
  mergeFeedback,
} from "../../_engagement-core/lib/service.mjs";
import { pauseAgent, resumeAgent, readAgentState } from "../../_engagement-core/lib/state.mjs";
import { requirePullRequestReference } from "../../_engagement-core/lib/work-reference.mjs";
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
      state.callbackReceipts ||= {};
      state.callbackReceipts[String(update.update_id)] =
        "This control is expired, already used, or the conversation changed. Read the latest reply.";
      const auth = { ...callback.message, from: callback.from };
      if (authorized(auth, config)) {
        const action = state.callbacks[callback.data];
        if (
          action &&
          !action.used &&
          action.expiresAt > Date.now() &&
          (!action.packageId || state.outbox[action.packageId]?.status === "sent")
        ) {
          const current = getFeedback(scopeFor(root), action.threadId);
          if (recordVersion(current) === action.version) {
            if (action.status === "resolved") {
              state.ownerActions[`callback-${update.update_id}`] = {
                id: `callback-${update.update_id}`,
                type: "merge",
                threadId: action.threadId,
                expectedVersion: action.version,
                replyToMessageId: callback.message?.message_id || null,
                status: "pending",
                createdAt: new Date().toISOString(),
              };
            } else
              reviewFeedbackMutation(scopeFor(root), action.threadId, action.status, {
                expectedVersion: action.version,
                reason:
                  action.status === "dismissed"
                    ? "Paired Telegram owner withdrew this request."
                    : "Paired Telegram owner requested another review.",
              });
            action.used = true;
            state.callbackReceipts[String(update.update_id)] =
              action.status === "resolved"
                ? "Merge requested."
                : action.status === "dismissed"
                  ? "Withdrawn; history preserved."
                  : "Reopened.";
          }
        }
      }
    } else if (authorized(message, config)) {
      const key = String(update.update_id);
      if (!state.inbox[key]) {
        const text = message.text || message.caption || "";
        const files = mediaOf(message);
        const command = files.length ? "" : text.trim();
        const merge = command.match(/^\/merge(?:@[A-Za-z0-9_]+)?\s+#?([1-9]\d*)$/);
        if (command === "/pause")
          pauseAgent(scopeFor(root), "Paused by the paired Telegram owner.");
        else if (command === "/resume") {
          if (readAgentState(scopeFor(root)).mode === "paused") resumeAgent(scopeFor(root));
        } else if (command === "/voice-sample")
          state.enrollment = { expiresAt: Date.now() + 600000 };
        else if (merge)
          state.ownerActions[`command-${update.update_id}`] = {
            id: `command-${update.update_id}`,
            type: "merge",
            pullRequestNumber: Number(merge[1]),
            replyToMessageId: message.message_id,
            status: "pending",
            createdAt: new Date().toISOString(),
          };
        else {
          const sample =
            state.enrollment?.expiresAt > Date.now() &&
            files.some((f) => ["voice", "audio"].includes(f.kind));
          if (sample) state.enrollment = null;
          const reply = message.reply_to_message?.message_id;
          const album =
            message.media_group_id &&
            Object.values(state.inbox).find(
              (item) =>
                item.source?.message?.media_group_id === message.media_group_id && item.threadId,
            );
          const original = Object.values(state.inbox).find(
            (item) => item.messageId === message.message_id && item.threadId,
          );
          state.inbox[key] = {
            updateId: update.update_id,
            messageId: message.message_id,
            source: update,
            threadId: original?.threadId || state.replies[String(reply)] || album?.threadId || null,
            kind: sample ? "voice-sample" : "engagement",
            text,
            files,
            status: "received",
            attempts: 0,
            nextAttemptAt: 0,
            receivedAt: new Date().toISOString(),
          };
          const item = state.inbox[key];
          {
            const threadId = item.threadId || `telegram-${config.botId}-${update.update_id}`;
            const rawBody =
              safeConversationText(text) ||
              "Media input received. Inspect the preserved source; local processing is pending.";
            let existing;
            try {
              existing = getFeedback(scopeFor(root), threadId);
            } catch (error) {
              if (error.message !== "Feedback record not found.") throw error;
            }
            if (existing && threadId !== `telegram-${config.botId}-${update.update_id}`)
              addFeedbackMessageMutation(
                scopeFor(root),
                threadId,
                { body: rawBody },
                { messageId: `telegram-raw-${config.botId}-${update.update_id}` },
              );
            else
              createFeedbackMutation(scopeFor(root), {
                externalId: threadId,
                kind: "update",
                body: rawBody,
                pagePath: "/telegram",
                pageLabel: "Telegram conversation",
              });
            item.threadId = threadId;
            state.replies[String(message.message_id)] = threadId;
          }
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
    const body =
      safeConversationText(text) ||
      "Material received; inspect the preserved attachment and source metadata.";
    if (item.threadId) {
      const existing = getFeedback(scope, id);
      mutation =
        body === safeConversationText(item.text)
          ? { record: existing }
          : addFeedbackMessageMutation(scope, id, { body }, { messageId });
    } else
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
    inputs: Object.values(readTransport(root).inbox).filter((item) => item.threadId === thread.id),
  };
}
export function associateInput(root, updateId, targetId) {
  getFeedback(scopeFor(root), targetId);
  return updateTransport(root, (state) => {
    const item = state.inbox[String(updateId)];
    if (!item) throw new Error("Input is missing.");
    if (item.threadId === targetId) return item;
    const previous = item.threadId;
    if (previous) mergeFeedback(scopeFor(root), previous, targetId);
    for (const related of Object.values(state.inbox)) {
      if (related === item || (previous && related.threadId === previous)) {
        related.associations = [
          ...(related.associations || []),
          { from: previous, to: targetId, at: new Date().toISOString() },
        ];
        related.threadId = targetId;
        state.replies[String(related.messageId)] = targetId;
      }
    }
    for (const [key, value] of Object.entries(state.replies))
      if (previous && value === previous) state.replies[key] = targetId;
    return item;
  });
}

export function queueReply(root, id, text, kind = "progress", materials = [], options = {}) {
  const scope = scopeFor(root);
  // Prepare a durable intent before mutating the conversation. Recovery replays
  // the intent using its stable ID; the sender never invents acceptance.
  const packageId = options.packageId || crypto.randomUUID();
  return updateTransport(root, (state) => {
    if (state.outbox[packageId]) return state.outbox[packageId];
    const current = getFeedback(scope, id);
    id = current.id;
    if (
      kind === "review" &&
      Object.values(state.inbox).some(
        (i) => i.threadId === id && !["ready", "sample-ready"].includes(i.status),
      )
    )
      throw new Error("Process all preserved inputs before offering review.");
    if (!["progress", "question", "review", "preview"].includes(kind))
      throw new Error("Unknown reply kind.");
    text = bounded(
      text,
      "Reply text",
      kind === "review" ? 20 : kind === "question" ? 5 : 1,
      kind === "review" ? 4000 : kind === "question" ? 1000 : 65536,
    );
    if (
      (kind === "review" && current.status !== "in_progress") ||
      (kind === "question" && !["open", "in_progress"].includes(current.status)) ||
      (["progress", "preview"].includes(kind) &&
        !["open", "in_progress", "waiting"].includes(current.status))
    )
      throw new Error(
        "Reply is invalid for the current thread status; inspect or start the thread first.",
      );
    if (kind === "review") requirePullRequestReference(current);
    const pending = Object.values(state.outbox).filter(
      (p) => p.threadId === id && !["sent", "superseded", "cancelled"].includes(p.status),
    );
    if (
      pending.some(
        (p) =>
          p.kind === "review" || (["question", "review"].includes(kind) && p.kind === "question"),
      )
    )
      throw new Error(
        "A lifecycle reply is already pending; finish or repair it before preparing another.",
      );
    const intent = {
      id: packageId,
      threadId: id,
      text,
      kind,
      materials,
      replyToMessageId:
        Object.values(state.inbox)
          .filter((i) => i.threadId === id)
          .at(-1)?.messageId || null,
      status: "prepared",
      createdAt: new Date().toISOString(),
      attempts: 0,
      nextAttemptAt: 0,
      chunks: [],
    };
    state.outbox[packageId] = intent;
    intent.expectedVersion = recordVersion(current);
    intent.expectedReplyVersion = replyVersion(current);
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
    {
      const actions =
        item.kind === "review"
          ? [
              ["Merge PR", "resolved"],
              ["Reopen", "open"],
              ["Withdraw", "dismissed"],
            ]
          : [["Withdraw", "dismissed"]];
      item.buttons = actions.map(([text, status]) => {
        const token = crypto.randomBytes(16).toString("hex");
        state.callbacks[token] = {
          threadId: item.threadId,
          packageId: item.id,
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
    ownerActions: Object.values(state.ownerActions).map(
      ({ id, type, threadId, pullRequestNumber, status, error }) => ({
        id,
        type,
        threadId,
        pullRequestNumber,
        status,
        error,
      }),
    ),
  };
}

export function reconcileDelivery(root, packageId, component, index, outcome, messageId, evidence) {
  if (
    !["text", "voice", "material"].includes(component) ||
    !["sent", "not-sent"].includes(outcome) ||
    !Number.isInteger(index) ||
    index < 0 ||
    !evidence ||
    evidence.length < 10
  )
    throw new Error("Specify the part, outcome and observed delivery evidence.");
  if (outcome === "sent" && (!Number.isSafeInteger(messageId) || messageId < 1))
    throw new Error("Confirmed delivery requires its Telegram message ID.");
  return updateTransport(root, (state) => {
    const item = state.outbox[packageId];
    const part = item?.[component === "material" ? "materials" : "chunks"][index];
    if (!part || part.status !== "indeterminate")
      throw new Error("This delivery part is not indeterminate.");
    part.reconciliation = { outcome, evidence, at: new Date().toISOString() };
    part.status = outcome === "sent" ? "sent" : component === "voice" ? "rendered" : "prepared";
    if (outcome === "sent") {
      part.messageId = messageId;
      state.replies[String(messageId)] = item.threadId;
    }
    item.status = "sending";
    item.nextAttemptAt = 0;
    item.error = null;
    return item;
  });
}

// Preserve the exact Telegram envelope separately; unsafe display characters must
// never poison polling and prevent all later updates from being received.
function safeConversationText(text) {
  return String(text || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "�")
    .trim()
    .slice(0, 65536);
}

export function retryOutput(root, id) {
  return updateTransport(root, (state) => {
    const item = state.outbox[id];
    if (!item || !["retrying", "failed"].includes(item.status))
      throw new Error("Output is not retryable; reconcile uncertain sends first.");
    item.status = "prepared";
    item.nextAttemptAt = 0;
    item.attempts = 0;
    item.error = null;
    return item;
  });
}
