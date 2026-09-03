import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readAgentState } from "../../agent-stop-state/lib/state.mjs";
import {
  addFeedbackMessage,
  askFeedbackQuestion,
  createFeedback,
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

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixture = () => fs.mkdtempSync(path.join(os.tmpdir(), "origin-feedback-"));
const input = (body = "Create the first useful page") => ({
  kind: "feature",
  body,
  pagePath: "/",
  pageLabel: "Origin canvas",
});

test("new feedback preserves raw context and activates global state", () => {
  const root = fixture();
  const record = createFeedback(root, input(), new Date("2026-09-03T12:00:00Z"));
  assert.equal(record.messages[0].body, record.body);
  assert.equal(record.messages[0].role, "user");
  assert.equal(nextFeedback(root).id, record.id);
  assert.equal(feedbackMode(root).mode, "active");
  assert.equal(readAgentState(root).mode, "active");
});

test("feedback route bounds match the wake voice insert contract", () => {
  const root = fixture();
  assert.throws(
    () => createFeedback(root, { ...input(), pagePath: `/${"a".repeat(160)}` }),
    /Page path must be between 1 and 160/,
  );
});

test("agent interpretation and linked work remain separate from raw input", () => {
  const root = fixture();
  const record = createFeedback(root, input("Please make the page easier to understand"));
  interpretFeedback(root, record.id, {
    classification: "actionable request",
    interpretation: "Improve the page hierarchy without changing the user's words.",
  });
  linkFeedbackWork(root, record.id, "job:page-hierarchy-001");
  const updated = getFeedback(root, record.id);
  assert.equal(updated.body, "Please make the page easier to understand");
  assert.match(updated.interpretation, /hierarchy/);
  assert.deepEqual(updated.linkedWork, ["job:page-hierarchy-001"]);
});

test("one waiting thread cannot hide another runnable responsibility", () => {
  const root = fixture();
  const first = createFeedback(root, input("Choose a page name"));
  createFeedback(root, input("Add the requested summary"));
  askFeedbackQuestion(root, first.id, "Which page name do you want to use?");
  assert.equal(getFeedback(root, first.id).status, "waiting");
  assert.equal(feedbackMode(root).mode, "active");
  assert.equal(readAgentState(root).mode, "active");
});

test("a user answer reopens a waiting thread and wakes active state", () => {
  const root = fixture();
  const record = createFeedback(root, input("Choose a page name"));
  askFeedbackQuestion(root, record.id, "Which page name should Origin use?");
  assert.equal(readAgentState(root).mode, "waiting");
  const answered = addFeedbackMessage(
    root,
    record.id,
    { role: "user", type: "answer", body: "Use Projects." },
    { role: "user" },
  );
  assert.equal(answered.status, "open");
  assert.equal(answered.messages.at(-1).type, "answer");
  assert.equal(readAgentState(root).mode, "active");
});

test("multiline questions stay in the thread while global Stop state remains injection-safe", () => {
  const root = fixture();
  const record = createFeedback(root, input("Choose a page structure"));
  const waiting = askFeedbackQuestion(
    root,
    record.id,
    "Which structure should I use?\n- Projects\n- Programs",
  );
  assert.match(waiting.messages.at(-1).body, /\n- Projects/);
  assert.doesNotMatch(readAgentState(root).reason, /[\r\n]/);
  assert.equal(readAgentState(root).mode, "waiting");
});

test("agent verification requires user acceptance before resolution", () => {
  const root = fixture();
  const record = createFeedback(root, input("Add a projects page"));
  transitionFeedback(root, record.id, "in_progress");
  assert.throws(
    () => transitionFeedback(root, record.id, "ready_for_review", { verification: "too short" }),
    /Verification evidence/,
  );
  const review = transitionFeedback(root, record.id, "ready_for_review", {
    verification: "Built the projects page and verified its route and accessible controls.",
  });
  assert.equal(review.status, "ready_for_review");
  assert.equal(readAgentState(root).mode, "waiting");
  const accepted = transitionFeedback(root, record.id, "resolved", {
    acceptance: "Accepted by user.",
  });
  assert.equal(accepted.status, "resolved");
  assert.equal(readAgentState(root).mode, "idle");
});

test("rejection and reopening preserve verification and complete history", () => {
  const root = fixture();
  const record = createFeedback(root, input("Add a projects page"));
  transitionFeedback(root, record.id, "in_progress");
  transitionFeedback(root, record.id, "ready_for_review", {
    verification: "Built the route and verified the page through the browser integration test.",
  });
  const reopened = transitionFeedback(root, record.id, "open", {
    reason: "The user requested a clearer page title.",
  });
  assert.equal(reopened.verification.includes("browser"), true);
  assert.equal(reopened.status, "open");
});

test("only one feedback thread may be in progress", () => {
  const root = fixture();
  const first = createFeedback(root, input("First request"));
  const second = createFeedback(root, input("Second request"));
  transitionFeedback(root, first.id, "in_progress");
  assert.throws(
    () => transitionFeedback(root, second.id, "in_progress"),
    /Only one feedback thread/,
  );
});

test("heartbeats preserve focus and stale work reopens", () => {
  const root = fixture();
  const record = createFeedback(
    root,
    input("Perform a longer change"),
    new Date("2026-09-03T10:00:00Z"),
  );
  transitionFeedback(root, record.id, "in_progress", {}, new Date("2026-09-03T10:01:00Z"));
  heartbeatFeedback(root, record.id, new Date("2026-09-03T11:00:00Z"));
  assert.equal(
    recoverStaleFeedback(root, { maximumAgeMs: 7_200_000 }, new Date("2026-09-03T12:00:00Z")),
    null,
  );
  assert.equal(
    recoverStaleFeedback(root, { maximumAgeMs: 7_200_000 }, new Date("2026-09-03T13:01:00Z"))
      .status,
    "open",
  );
});

test("hash tampering fails closed and backups restore prior state", () => {
  const root = fixture();
  createFeedback(root, input("First durable request"));
  createFeedback(root, input("Second durable request"));
  const backup = feedbackBackups(root)[0];
  restoreFeedback(root, backup);
  assert.deepEqual(
    listFeedback(root).map((record) => record.body),
    ["First durable request"],
  );
  const file = path.join(root, ".origin", "feedback.jsonl");
  fs.writeFileSync(
    file,
    fs.readFileSync(file, "utf8").replace("First durable request", "Changed silently"),
  );
  assert.throws(() => verifyFeedback(root), /integrity check failed/);
});

test("every emitted event matches the tracked v3 JSON Schema", () => {
  const root = fixture();
  const record = createFeedback(root, input("Validate the complete lifecycle"));
  interpretFeedback(root, record.id, {
    classification: "actionable request",
    interpretation: "Run the complete schema lifecycle.",
  });
  transitionFeedback(root, record.id, "in_progress");
  heartbeatFeedback(root, record.id);
  transitionFeedback(root, record.id, "ready_for_review", {
    verification: "Validated the emitted event history with the repository JSON Schema.",
  });
  transitionFeedback(root, record.id, "resolved", { acceptance: "Accepted by user." });
  const schema = JSON.parse(
    fs.readFileSync(path.resolve(testDirectory, "../data.schema.json"), "utf8"),
  );
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const events = fs
    .readFileSync(path.join(root, ".origin", "feedback.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
  for (const event of events) assert.equal(validate(event), true, JSON.stringify(validate.errors));
});
