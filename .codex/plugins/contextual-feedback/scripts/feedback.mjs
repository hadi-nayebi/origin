#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  addFeedbackMessage,
  askFeedbackQuestion,
  feedbackBackups,
  feedbackMode,
  getFeedback,
  heartbeatFeedback,
  interpretFeedback,
  linkFeedbackWork,
  listFeedback,
  nextFeedback,
  recoverStaleFeedback,
  restoreFeedback,
  transitionFeedback,
  verifyFeedback,
} from "../lib/service.mjs";

const root = path.resolve(
  process.env.ORIGIN_REPOSITORY_ROOT ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.."),
);
const [command, id, ...words] = process.argv.slice(2);

try {
  let result;
  if (command === "list") result = listFeedback(root);
  else if (command === "get") result = getFeedback(root, required(id));
  else if (command === "next") result = nextFeedback(root);
  else if (command === "mode") result = feedbackMode(root);
  else if (command === "start") result = transitionFeedback(root, required(id), "in_progress");
  else if (command === "comment")
    result = addFeedbackMessage(
      root,
      required(id),
      {
        role: "agent",
        type: "progress",
        body: required(words.join(" ")),
      },
      { role: "agent" },
    );
  else if (command === "interpret") {
    const [classification, ...interpretation] = words;
    result = interpretFeedback(root, required(id), {
      classification: required(classification),
      interpretation: required(interpretation.join(" ")),
    });
  } else if (command === "link-work")
    result = linkFeedbackWork(root, required(id), required(words.join(" ")));
  else if (command === "ask")
    result = askFeedbackQuestion(root, required(id), required(words.join(" ")));
  else if (command === "review")
    result = transitionFeedback(root, required(id), "ready_for_review", {
      verification: required(words.join(" ")),
    });
  else if (command === "dismiss")
    result = transitionFeedback(root, required(id), "dismissed", {
      reason: required(words.join(" ")),
    });
  else if (command === "reopen")
    result = transitionFeedback(root, required(id), "open", {
      reason: required(words.join(" ")),
    });
  else if (command === "heartbeat") result = heartbeatFeedback(root, required(id));
  else if (command === "recover")
    result = recoverStaleFeedback(root, { maximumAgeMs: id ? Number(id) : undefined });
  else if (command === "verify") result = verifyFeedback(root);
  else if (command === "backups") result = feedbackBackups(root);
  else if (command === "restore") result = restoreFeedback(root, required(id));
  else
    throw new Error(
      "Usage: feedback.mjs <list|get|next|mode|start|comment|interpret|link-work|ask|review|dismiss|reopen|heartbeat|recover|verify|backups|restore> [id] [value]",
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
