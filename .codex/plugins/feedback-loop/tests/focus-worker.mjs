import { transitionFeedback } from "../lib/service.mjs";

const [root, id] = process.argv.slice(2);
try {
  transitionFeedback(root, id, "in_progress");
} catch {
  process.exitCode = 1;
}
