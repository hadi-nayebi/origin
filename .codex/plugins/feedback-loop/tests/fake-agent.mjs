import { nextFeedback, transitionFeedback } from "../lib/service.mjs";

const record = nextFeedback(process.cwd());
if (!record) process.exit(0);
if (record.status === "open") transitionFeedback(process.cwd(), record.id, "in_progress");
transitionFeedback(process.cwd(), record.id, "resolved", {
  resolution: "Fake agent completed the request and verified the delivery subprocess.",
});
