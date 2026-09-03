import { createFeedback } from "../lib/service.mjs";

const [root, index] = process.argv.slice(2);
createFeedback(root, {
  kind: "update",
  body: `Concurrent request ${index}`,
  pagePath: "/",
  pageLabel: "Canvas",
});
