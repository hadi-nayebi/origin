import { readAgentState } from "./state.mjs";
import { feedbackMode } from "./service.mjs";
import { channelContext } from "./scope.mjs";

export function inspectChannelStop(scope) {
  const state = readAgentState(scope);
  // The ledger owns responsibility. A crash between journal commit and projection
  // must never allow Stop based on a stale idle data.json.
  const mode = state.mode === "paused" ? state : feedbackMode(scope);
  const { channel } = channelContext(scope);
  const command = channel === "contextual-feedback" ? "feedback" : "telegram";
  return {
    reference: mode.reference,
    block: mode.mode === "active",
    mode: mode.mode,
    reason: `${channel} preserves unresolved user responsibility. ${mode.reason} Read the durable thread with npm run ${command} -- get ${mode.reference?.id || ""}. Address its request, verify the result, and prepare user review; do not mark it resolved yourself. Only a recorded dependency or user pause permits waiting while work remains.`,
  };
}
