import { readAgentState, setAgentState } from "../../_engagement-core/lib/state.mjs";
import { feedbackMode } from "../../_engagement-core/lib/service.mjs";
import { scopeFor, readTransport } from "./storage.mjs";

export function telegramMode(root) {
  const scope = scopeFor(root);
  const business = feedbackMode(scope);
  if (business.mode === "active") return business;
  const state = readTransport(root);
  const pendingInput = Object.values(state.inbox).find(
    (i) => !["ready", "sample-ready"].includes(i.status),
  );
  const pendingOutput = Object.values(state.outbox).find(
    (i) => !["sent", "superseded", "cancelled"].includes(i.status),
  );
  if (pendingInput || pendingOutput)
    return {
      mode: "active",
      reason: "Telegram has an input or delivery that still needs processing or recovery.",
      nextAction:
        "Run npm run telegram -- status; repair or reconcile the recorded item. Never blindly repeat an indeterminate send.",
      reference: {
        plugin: "telegram-engagement",
        id: `transport-${pendingInput?.updateId ?? pendingOutput.id}`,
      },
    };
  return business;
}
export function reconcileTelegram(root) {
  const scope = scopeFor(root);
  const intent = telegramMode(root);
  let current;
  try {
    current = readAgentState(scope);
  } catch {
    return setAgentState(scope, intent);
  }
  const effective = current.mode === "paused" ? current.resumeState : current;
  if (
    ["mode", "reason", "nextAction", "reference"].every(
      (k) => JSON.stringify(effective[k]) === JSON.stringify(intent[k]),
    )
  )
    return current;
  return setAgentState(scope, intent);
}
export function inspectStop(scope) {
  const state = readAgentState(scope);
  const mode = state.mode === "paused" ? state : telegramMode(scope.root);
  return {
    reference: mode.reference,
    block: mode.mode === "active",
    mode: mode.mode,
    reason: `Telegram engagement: ${mode.reason} ${mode.nextAction || ""} Read the thread with npm run telegram -- get ID. Preserve user ownership of acceptance. A pending delivery is not a resolved conversation.`,
  };
}
