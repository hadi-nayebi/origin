#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listFeedback, nextFeedback, stopOutcome, transitionFeedback } from "../lib/service.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const [command, id, ...words] = process.argv.slice(2);
try {
  let result;
  if (command === "list") result = listFeedback(root);
  else if (command === "next") result = nextFeedback(root);
  else if (command === "outcome") result = stopOutcome(root);
  else if (command === "start") result = transitionFeedback(root, required(id), "in_progress");
  else if (command === "wait") result = transitionFeedback(root, required(id), "waiting", { waitReason: required(words.join(" ")) });
  else if (command === "resolve") result = transitionFeedback(root, required(id), "resolved", { resolution: required(words.join(" ")) });
  else if (command === "dismiss") result = transitionFeedback(root, required(id), "dismissed", { reason: required(words.join(" ")) });
  else if (command === "reopen") result = transitionFeedback(root, required(id), "open", { reason: required(words.join(" ")) });
  else throw new Error("Usage: feedback.mjs <list|next|outcome|start|wait|resolve|dismiss|reopen> [id] [evidence]");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
function required(value) { if (!value) throw new Error("The command is missing a required value."); return value; }
