#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  feedbackBackups,
  heartbeatFeedback,
  listFeedback,
  migrateFeedback,
  nextFeedback,
  recoverStaleFeedback,
  restoreFeedback,
  stopOutcome,
  transitionFeedback,
  verifyFeedback,
} from "../lib/service.mjs";
import { feedbackRunnerStatus, launchFeedbackRunner } from "../lib/delivery.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const [command, id, ...words] = process.argv.slice(2);
try {
  let result;
  if (command === "list") result = listFeedback(root);
  else if (command === "next") result = nextFeedback(root);
  else if (command === "outcome") result = stopOutcome(root);
  else if (command === "start") result = transitionFeedback(root, required(id), "in_progress");
  else if (command === "wait")
    result = transitionFeedback(root, required(id), "waiting", {
      waitReason: required(words.join(" ")),
    });
  else if (command === "resolve")
    result = transitionFeedback(root, required(id), "resolved", {
      resolution: required(words.join(" ")),
    });
  else if (command === "dismiss")
    result = transitionFeedback(root, required(id), "dismissed", {
      reason: required(words.join(" ")),
    });
  else if (command === "reopen")
    result = transitionFeedback(root, required(id), "open", { reason: required(words.join(" ")) });
  else if (command === "heartbeat") result = heartbeatFeedback(root, required(id));
  else if (command === "recover")
    result = recoverStaleFeedback(root, { maximumAgeMs: id ? Number(id) : undefined });
  else if (command === "verify") result = verifyFeedback(root);
  else if (command === "migrate") result = migrateFeedback(root);
  else if (command === "backups") result = feedbackBackups(root);
  else if (command === "restore") result = restoreFeedback(root, required(id));
  else if (command === "wake") result = launchFeedbackRunner(root);
  else if (command === "runner-status") result = feedbackRunnerStatus(root);
  else
    throw new Error(
      "Usage: feedback.mjs <list|next|outcome|start|wait|resolve|dismiss|reopen|heartbeat|recover|verify|migrate|backups|restore|wake|runner-status> [id] [reason]",
    );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
function required(value) {
  if (!value) throw new Error("The command is missing a required value.");
  return value;
}
