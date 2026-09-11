import { fileURLToPath } from "node:url";
import { inspectStop as inspect } from "../lib/continuation.mjs";
import { renderVoice } from "../../_engagement-core/lib/voice.mjs";
export function inspectStop(scope) {
  const outcome = inspect(scope);
  if (outcome.block)
    outcome.reason = renderVoice(
      fileURLToPath(new URL("../voice.xml", import.meta.url)),
      outcome.reference?.id?.startsWith("transport-") ? "stop.transport" : "stop.active",
      { reference: outcome.reference.id },
    );
  return outcome;
}
