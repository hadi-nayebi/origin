import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureAgentState } from "../../agent-stop-state/lib/state.mjs";
import { pauseAgent } from "../../agent-stop-state/lib/state.mjs";
import {
  createFeedback,
  reviewFeedback,
  transitionFeedback,
} from "../../contextual-feedback/lib/service.mjs";
import { readFeedbackEvents } from "../../contextual-feedback/lib/store.mjs";
import {
  deliverCodexWake,
  codexEditorHasInput,
  editorPending,
  resolveCodexPane,
  submissionAccepted,
} from "../lib/codex-wake-v1.mjs";
import { deliverAsyncWake } from "../lib/async-wake.mjs";
import { inspectMachine } from "../lib/machine.mjs";
import { ensureDashboardRuntime, runtimeInstanceId } from "../lib/runtime-control.mjs";
import {
  deliverPendingWakes,
  enqueueFeedbackWake,
  hasFeedbackWakeForEvent,
  retryWakeDelivery,
  scheduleWakeDelivery,
  wakeStatus,
} from "../lib/wake-outbox.mjs";
import { sessionName, startHarness } from "../scripts/start-harness.mjs";

const fixture = () => fs.mkdtempSync(path.join(os.tmpdir(), "origin-runtime-"));

test("pane resolution is repository-scoped and requires exactly one Codex pane", () => {
  const root = fixture();
  const run = fakeRun(root, { capture: ["idle"] });
  assert.equal(resolveCodexPane(root, { run }).id, "%1");
  assert.throws(
    () => resolveCodexPane(root, { run: fakeRun(root, { paneRoot: path.join(root, "other") }) }),
    /could not find/,
  );
  const duplicate = (command, args) => {
    if (command === "tmux" && args[0] === "list-panes")
      return {
        status: 0,
        stdout: `%1\t${root}\t101\tcodex\tone\n%2\t${root}\t102\tcodex\ttwo\n`,
        stderr: "",
      };
    return { status: 0, stdout: "101 1 codex\n102 1 codex\n", stderr: "" };
  };
  assert.throws(() => resolveCodexPane(root, { run: duplicate }), /found 2 Codex panes/);
});

test("idle Codex receives a verified prompt through a tmux buffer", () => {
  const root = fixture();
  const marker = "[ORIGIN DASHBOARD — NEW FEEDBACK]";
  const run = fakeRun(root, { capture: ["Codex ready\n› ", marker, `${marker}\nWorking (1)`] });
  const result = deliverCodexWake(
    root,
    { marker, prompt: `${marker}\nRead feedback-001.` },
    { run, wait: () => {} },
  );
  assert.equal(result.state, "submitted");
  assert.equal(result.transport, "tmux");
  assert.equal(
    run.calls.some((call) => call.command === "tmux" && call.args[0] === "set-buffer"),
    true,
  );
});

test("an expired wake lease owned by the live server process is recovered", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, ".origin"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".origin", "wake.lock"),
    JSON.stringify({
      token: "interrupted-worker",
      pid: process.pid,
      host: os.hostname(),
      at: "2000-01-01T00:00:00.000Z",
    }),
  );
  const marker = "[ORIGIN WAKE recovered-lease]";
  const run = fakeRun(root, { capture: ["idle\n› ", marker, `${marker}\nWorking (1)`] });
  assert.equal(
    deliverCodexWake(root, { marker, prompt: marker }, { run, wait: () => {} }).state,
    "submitted",
  );
  assert.equal(fs.existsSync(path.join(root, ".origin", "wake.lock")), false);
});

test("async wake worker returns durable status without blocking the caller", async () => {
  const root = fixture();
  const status = await deliverAsyncWake({ root });
  assert.equal(status.state, "idle");
  assert.equal(status.pending, 0);
});

test("busy Codex queues a message without interruption", () => {
  const root = fixture();
  const marker = "[ORIGIN DASHBOARD — ANSWER RECEIVED]";
  const run = fakeRun(root, {
    capture: [
      "Working (42) · esc to interrupt\n› ",
      marker,
      `${marker}\nMessages to be submitted after next tool call`,
    ],
  });
  const result = deliverCodexWake(
    root,
    { marker, prompt: `${marker}\nRead feedback-002.` },
    { run, wait: () => {} },
  );
  assert.equal(result.state, "queued-without-interruption");
  assert.equal(
    run.calls.some((call) => call.args.includes("C-c")),
    false,
  );
});

test("Codex editor and submission evidence distinguish editor text from transcript text", () => {
  const marker = "[ORIGIN DASHBOARD — NEW FEEDBACK]";
  assert.equal(editorPending(`[Pasted Content 1042 chars]`, marker), true);
  assert.equal(editorPending(`${marker}\nRead feedback-001.`, marker), true);
  assert.equal(editorPending(`${marker}\nRead feedback-001.\n› `, marker), false);
  assert.equal(
    submissionAccepted({
      value: `${marker}\nWorking (12) · esc to interrupt`,
      marker,
      wasBusy: false,
    }),
    true,
  );
  assert.equal(
    submissionAccepted({
      value: `${marker}\nMessages to be submitted after next tool call`,
      marker,
      wasBusy: true,
    }),
    true,
  );
});

test("wake outbox persists before delivery and records success", async () => {
  const root = fixture();
  ensureAgentState(root);
  const record = createFeedback(root, {
    kind: "feature",
    body: "Create a first page",
    pagePath: "/",
    pageLabel: "Origin canvas",
  });
  enqueueWake(root, { kind: "feedback.new", reference: record.id, route: "/" });
  assert.equal(wakeStatus(root).pending, 1);
  await deliverPendingWakes(root, {
    deliver: async () => ({
      state: "submitted",
      transport: "tmux",
      pane: "%1",
      session: "origin-test",
    }),
  });
  assert.equal(wakeStatus(root).state, "connected");
  assert.equal(wakeStatus(root).last.status, "delivered");
});

test("an existing queue banner cannot acknowledge a newly pending wake", () => {
  const root = fixture();
  const marker = "[ORIGIN WAKE new-event]";
  const before =
    "Working (42) · esc to interrupt\nMessages to be submitted after next tool call\n› ";
  const pending = `${before}${marker}`;
  assert.equal(editorPending(pending, marker, { before }), true);
  assert.equal(submissionAccepted({ value: pending, marker, wasBusy: true, before }), false);
  const run = fakeRun(root, { capture: [before, pending, pending, `${pending}\n› `] });
  const result = deliverCodexWake(root, { marker, prompt: marker }, { run, wait: () => {} });
  assert.equal(result.state, "queued-without-interruption");
  assert.equal(run.calls.filter((call) => call.args[0] === "send-keys").length, 1);
  assert.equal(
    run.calls.some((call) => call.args.includes("C-c")),
    false,
  );
});

test("a pending paste behind an existing queue becomes indeterminate in the outbox", async () => {
  const root = fixture();
  const record = createFeedback(root, {
    kind: "bug",
    body: "Preserve delivery responsibility",
    pagePath: "/",
    pageLabel: "Origin canvas",
  });
  const wake = enqueueWake(root, { kind: "feedback.new", reference: record.id, route: "/" });
  const before =
    "Working (42) · esc to interrupt\nMessages to be submitted after next tool call\n› ";
  const pending = `${before}[Pasted Content ${wake.prompt.length} chars]`;
  await deliverPendingWakes(root, {
    run: fakeRun(root, { capture: [before], captureFallback: pending }),
    wait: () => {},
  });
  assert.equal(wakeStatus(root).last.status, "indeterminate");
  assert.equal(wakeStatus(root).pending, 1);
  assert.match(wakeStatus(root).last.error, /could not verify its submission/);
});

test("every feedback wake voice renders a bounded pointer without the raw body", () => {
  const root = fixture();
  const rawBody = "A private-looking user sentence that must stay in the ledger";
  const record = createFeedback(root, {
    kind: "feature",
    body: rawBody,
    pagePath: "/projects/example",
    pageLabel: "Example",
  });
  for (const kind of [
    "feedback.new",
    "feedback.during-active",
    "feedback.answer",
    "feedback.reopened",
    "feedback.accepted",
    "feedback.dismissed",
    "feedback.resume",
  ]) {
    const wake = enqueueWake(root, {
      kind,
      reference: record.id,
      route: record.pagePath,
      activeReference: record.id,
    });
    assert.match(wake.prompt, new RegExp(record.id));
    assert.doesNotMatch(wake.prompt, new RegExp(rawBody));
    assert.equal(wake.prompt.length <= 1800, true);
  }
});

test("wake coverage is journal-event-specific for crash recovery", () => {
  const root = fixture();
  const record = createFeedback(root, {
    kind: "feature",
    body: "Recover a mutation-to-wake crash window",
    pagePath: "/",
    pageLabel: "Origin canvas",
  });
  const source = sourceFor(root);
  assert.equal(hasFeedbackWakeForEvent(root, source.sourceEventHash), false);
  enqueueWake(root, {
    kind: "feedback.new",
    reference: record.id,
    route: record.pagePath,
  });
  assert.equal(hasFeedbackWakeForEvent(root, source.sourceEventHash), true);
  assert.equal(hasFeedbackWakeForEvent(root, "f".repeat(64)), false);
});

test("failed delivery is durable and retryable", async () => {
  const root = fixture();
  const record = createFeedback(root, {
    kind: "bug",
    body: "Repair a control",
    pagePath: "/",
    pageLabel: "Origin canvas",
  });
  enqueueWake(
    root,
    { kind: "feedback.new", reference: record.id, route: "/" },
    new Date("2026-09-03T12:00:00Z"),
  );
  await deliverPendingWakes(root, {
    now: new Date("2026-09-03T12:00:00Z"),
    deliver: async () => {
      throw new Error("tmux unavailable");
    },
  });
  assert.equal(wakeStatus(root).last.status, "retrying");
  await deliverPendingWakes(root, {
    now: new Date("2026-09-03T12:00:02Z"),
    deliver: async () => ({ state: "submitted", transport: "tmux" }),
  });
  assert.equal(wakeStatus(root).last.status, "delivered");
  assert.equal(wakeStatus(root).last.attempts, 2);
});

test("validation failures preserve wake delivery responsibility", async () => {
  for (const corruptFile of ["feedback.jsonl", "contextual-feedback/data.json"]) {
    const root = fixture();
    const record = createFeedback(root, {
      kind: "bug",
      body: "Preserve this wake until durable state can be recovered",
      pagePath: "/",
      pageLabel: "Origin canvas",
    });
    enqueueWake(root, { kind: "feedback.new", reference: record.id, route: "/" });
    const authoritativeFile = path.join(root, ".origin", corruptFile);
    const authoritativeSource = fs.readFileSync(authoritativeFile, "utf8");
    fs.writeFileSync(authoritativeFile, "{corrupt}\n");
    let called = false;
    await deliverPendingWakes(root, {
      now: new Date("2030-01-01T00:00:00Z"),
      deliver: async () => {
        called = true;
      },
    });
    const status = wakeStatus(root);
    assert.equal(called, false);
    assert.equal(status.pending, 1);
    assert.equal(status.last.status, "retrying");
    assert.equal(status.last.attempts, 1);
    assert.match(status.last.error, /Wake validation deferred: .*corrupt/i);

    fs.writeFileSync(authoritativeFile, authoritativeSource);
    await deliverPendingWakes(root, {
      now: new Date("2030-01-01T00:01:00Z"),
      deliver: async () => {
        called = true;
        return { state: "submitted", transport: "tmux" };
      },
    });
    assert.equal(called, true);
    assert.equal(wakeStatus(root).last.status, "delivered");
  }
});

test("outbox never evicts nonterminal wakes when terminal history is bounded", () => {
  const root = fixture();
  const record = createFeedback(root, {
    kind: "feature",
    body: "Retain every pending wake",
    pagePath: "/projects",
    pageLabel: "Projects",
  });
  for (let index = 0; index < 201; index += 1)
    enqueueWake(root, {
      kind: "feedback.new",
      reference: record.id,
      route: record.pagePath,
    });
  assert.equal(wakeStatus(root).pending, 201);
  const events = JSON.parse(
    fs.readFileSync(path.join(root, ".origin", "wake-outbox.json"), "utf8"),
  );
  assert.equal(events.length, 201);
  assert.equal(
    events.every((event) => event.status === "pending"),
    true,
  );
});

test("outbox bounds only terminal history after successful delivery", async () => {
  const root = fixture();
  const record = createFeedback(root, {
    kind: "feature",
    body: "Bound completed delivery history without losing work",
    pagePath: "/projects",
    pageLabel: "Projects",
  });
  for (let index = 0; index < 205; index += 1)
    enqueueWake(root, {
      kind: "feedback.new",
      reference: record.id,
      route: record.pagePath,
    });
  await deliverPendingWakes(root, {
    maxDeliveries: 205,
    deliver: async () => ({ state: "submitted", transport: "tmux" }),
  });
  const events = JSON.parse(
    fs.readFileSync(path.join(root, ".origin", "wake-outbox.json"), "utf8"),
  );
  assert.equal(events.length, 200);
  assert.equal(
    events.every((event) => event.status === "delivered"),
    true,
  );
});

test("manual retry cancels scheduled backoff and attempts delivery immediately", async () => {
  const root = fixture();
  const record = createFeedback(root, {
    kind: "bug",
    body: "Retry this wake now",
    pagePath: "/",
    pageLabel: "Origin canvas",
  });
  enqueueWake(root, { kind: "feedback.new", reference: record.id, route: "/" });
  let calls = 0;
  const now = new Date("2030-01-01T00:00:00Z");
  await deliverPendingWakes(root, {
    now,
    deliver: async () => {
      calls += 1;
      throw new Error("tmux is temporarily unavailable");
    },
  });
  assert.equal(wakeStatus(root).last.status, "retrying");
  scheduleWakeDelivery(root, {
    delayMs: 60_000,
    deliver: async () => {
      calls += 1;
      return { state: "submitted", transport: "tmux" };
    },
  });
  const result = await retryWakeDelivery(root, {
    now,
    deliver: async () => {
      calls += 1;
      return { state: "submitted", transport: "tmux" };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.pending, 0);
  assert.equal(result.last.status, "delivered");
});

test("wake markers are unique for separate delivery events", () => {
  const root = fixture();
  const record = createFeedback(root, {
    kind: "update",
    body: "Give each wake unique evidence",
    pagePath: "/",
    pageLabel: "Origin canvas",
  });
  const first = enqueueWake(root, { kind: "feedback.new", reference: record.id, route: "/" });
  const second = enqueueWake(root, { kind: "feedback.new", reference: record.id, route: "/" });
  assert.notEqual(first.marker, second.marker);
  assert.match(first.prompt, new RegExp(first.id));
  assert.match(second.prompt, new RegExp(second.id));
});

test("the startup scheduler retries a durable wake after the Codex pane appears", async () => {
  const root = fixture();
  const record = createFeedback(root, {
    kind: "feature",
    body: "Recover this feedback after startup",
    pagePath: "/",
    pageLabel: "Origin canvas",
  });
  enqueueWake(root, { kind: "feedback.new", reference: record.id, route: "/" });
  scheduleWakeDelivery(root, {
    delayMs: 0,
    deliver: async () => ({ state: "submitted", transport: "tmux" }),
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(wakeStatus(root).last.status, "delivered");
});

test("paused state retains a pending wake without delivering it", async () => {
  const root = fixture();
  const record = createFeedback(root, {
    kind: "update",
    body: "Keep this request pending",
    pagePath: "/",
    pageLabel: "Origin canvas",
  });
  enqueueWake(root, { kind: "feedback.new", reference: record.id, route: "/" });
  pauseAgent(root, "User paused delivery for this test.");
  let called = false;
  await deliverPendingWakes(root, {
    deliver: async () => {
      called = true;
    },
  });
  assert.equal(called, false);
  assert.equal(wakeStatus(root).pending, 1);
});

test("an interrupted outbox claim is recovered and delivered", async () => {
  const root = fixture();
  const record = createFeedback(root, {
    kind: "feature",
    body: "Recover this delivery claim",
    pagePath: "/",
    pageLabel: "Origin canvas",
  });
  enqueueWake(root, { kind: "feedback.new", reference: record.id, route: "/" });
  const file = path.join(root, ".origin", "wake-outbox.json");
  const events = JSON.parse(fs.readFileSync(file, "utf8"));
  events[0].status = "delivering";
  events[0].claimedAt = "2026-09-03T10:00:00.000Z";
  events[0].claimedBy = `${os.hostname()}:2147483647`;
  fs.writeFileSync(file, `${JSON.stringify(events)}\n`);
  await deliverPendingWakes(root, {
    now: new Date("2026-09-03T10:01:00.000Z"),
    deliver: async () => ({ state: "submitted", transport: "tmux" }),
  });
  assert.equal(wakeStatus(root).last.status, "delivered");
  assert.equal(wakeStatus(root).last.attempts, 1);
});

test("an expired live-process claim and outbox lease recover after worker termination", async () => {
  const root = fixture();
  const record = createFeedback(root, {
    kind: "feature",
    body: "Recover a worker claim without restarting the server",
    pagePath: "/",
    pageLabel: "Origin canvas",
  });
  enqueueWake(root, { kind: "feedback.new", reference: record.id, route: "/" });
  const directory = path.join(root, ".origin");
  const file = path.join(directory, "wake-outbox.json");
  const events = JSON.parse(fs.readFileSync(file, "utf8"));
  events[0].status = "delivering";
  events[0].claimedAt = "2026-09-03T10:00:00.000Z";
  events[0].claimedBy = `${os.hostname()}:${process.pid}`;
  fs.writeFileSync(file, `${JSON.stringify(events)}\n`);
  fs.writeFileSync(
    path.join(directory, "wake-outbox.lock"),
    JSON.stringify({
      token: "interrupted-worker",
      pid: process.pid,
      host: os.hostname(),
      at: "2000-01-01T00:00:00.000Z",
    }),
  );
  await deliverPendingWakes(root, {
    now: new Date("2026-09-03T10:01:01.000Z"),
    deliver: async () => ({ state: "submitted", transport: "tmux" }),
  });
  assert.equal(wakeStatus(root).last.status, "delivered");
  assert.equal(fs.existsSync(path.join(directory, "wake-outbox.lock")), false);
});

test("stale wake is cancelled after user acceptance", async () => {
  const root = fixture();
  const record = createFeedback(root, {
    kind: "update",
    body: "Update the title",
    pagePath: "/",
    pageLabel: "Origin canvas",
  });
  enqueueWake(root, { kind: "feedback.new", reference: record.id, route: "/" });
  transitionFeedback(root, record.id, "in_progress");
  transitionFeedback(root, record.id, "ready_for_review", {
    verification: "Updated the title and verified the rendered heading in the UI test.",
  });
  reviewFeedback(root, record.id, "resolved", { acceptance: "Accepted by user." });
  let called = false;
  await deliverPendingWakes(root, {
    deliver: async () => {
      called = true;
    },
  });
  assert.equal(called, false);
  assert.equal(wakeStatus(root).last.status, "cancelled");
});

test("machine inspection requires tmux, Codex, auth, and WSL2 on Windows", () => {
  const good = inspectMachine({
    run: () => ({ status: 0, stdout: "ready" }),
    platform: "linux",
    release: { name: "node" },
  });
  assert.equal(good.ok, true);
  const nativeWindows = inspectMachine({
    run: () => ({ status: 0, stdout: "ready" }),
    platform: "win32",
    release: { name: "node" },
  });
  assert.equal(nativeWindows.ok, false);
  assert.equal(nativeWindows.checks.find((item) => item.name === "Interactive platform").ok, false);
  const missingTmux = inspectMachine({
    run: (command) => ({ status: command === "tmux" ? 1 : 0, stdout: "", stderr: "missing" }),
    platform: "linux",
  });
  assert.equal(missingTmux.ok, false);
  const missingCodex = inspectMachine({
    run: (command) => ({
      status: command === "codex" ? 1 : 0,
      stdout: "",
      stderr: "missing",
    }),
    platform: "linux",
  });
  assert.equal(
    missingCodex.checks.find((item) => item.name === "Codex authentication").detail,
    "Codex CLI is unavailable.",
  );
});

test("dashboard runtime reuses a healthy server without spawning", async () => {
  const root = fixture();
  let spawned = false;
  const runtime = await ensureDashboardRuntime(root, {
    openBrowser: false,
    fetch: async () => ({
      ok: true,
      json: async () => ({ name: "origin", instanceId: runtimeInstanceId(root) }),
    }),
    spawnProcess: () => {
      spawned = true;
    },
  });
  assert.equal(runtime.state, "reused");
  assert.equal(spawned, false);
});

test("browser launch registers a non-fatal process error handler", async () => {
  const root = fixture();
  let registered = null;
  await ensureDashboardRuntime(root, {
    fetch: async () => ({
      ok: true,
      json: async () => ({ name: "origin", instanceId: runtimeInstanceId(root) }),
    }),
    spawnProcess: () => ({
      once(event) {
        registered = event;
      },
      unref() {},
    }),
  });
  assert.equal(registered, "error");
});

test("dashboard runtime starts a detached server and waits for health", async () => {
  const root = fixture();
  let requests = 0;
  const child = { pid: 4321, unref() {} };
  const runtime = await ensureDashboardRuntime(root, {
    openBrowser: false,
    fetch: async () => {
      requests += 1;
      if (requests < 3) throw new Error("not ready");
      return {
        ok: true,
        json: async () => ({ name: "origin", instanceId: runtimeInstanceId(root) }),
      };
    },
    spawnProcess: () => child,
    wait: async () => {},
  });
  assert.equal(runtime.state, "started");
  assert.equal(runtime.pid, 4321);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, ".origin", "runtime.json"), "utf8")).pid,
    4321,
  );
});

test("dashboard runtime does not reuse another Origin clone on the same port", async () => {
  const root = fixture();
  let spawned = false;
  const runtime = await ensureDashboardRuntime(root, {
    openBrowser: false,
    fetch: async () => ({ ok: true, json: async () => ({ name: "origin", instanceId: "other" }) }),
    spawnProcess: () => {
      spawned = true;
      return { pid: 5678, unref() {} };
    },
    wait: async () => {},
  }).catch((error) => error);
  assert.equal(spawned, false);
  assert.match(runtime.message, /Port 5173 is already used/);
});

test("combined launcher validates, creates one repo session, starts Codex, and attaches", async () => {
  const root = fixture();
  enableFeedbackPlugin(root);
  const calls = [];
  const run = (command, args) => {
    calls.push({ command, args });
    if (command === "tmux" && args[0] === "has-session")
      return { status: 1, stdout: "", stderr: "missing" };
    if (command === "tmux" && args[0] === "list-panes")
      return { status: 0, stdout: `bash\t${root}\n`, stderr: "" };
    return { status: 0, stdout: "ready", stderr: "" };
  };
  const result = await startHarness({
    root,
    run,
    platform: "linux",
    release: { name: "node" },
    openBrowser: false,
    fetch: async () => ({
      ok: true,
      json: async () => ({ name: "origin", instanceId: runtimeInstanceId(root) }),
    }),
  });
  const session = sessionName(root);
  assert.equal(result.session, session);
  assert.equal(result.attached, true);
  assert.deepEqual(
    calls.find(({ command, args }) => command === "tmux" && args[0] === "new-session")?.args,
    ["new-session", "-d", "-s", session, "-c", root],
  );
  assert.deepEqual(
    calls.find(({ command, args }) => command === "tmux" && args[0] === "send-keys")?.args,
    ["send-keys", "-t", session, "codex resume --last", "C-m"],
  );
  assert.deepEqual(calls.at(-1).args, ["attach-session", "-t", session]);
});

test("combined launcher keeps an explicit fresh-session escape hatch", async () => {
  const root = fixture();
  const calls = [];
  const run = (command, args) => {
    calls.push({ command, args });
    if (command === "tmux" && args[0] === "has-session")
      return { status: 1, stdout: "", stderr: "missing" };
    if (command === "tmux" && args[0] === "list-panes")
      return { status: 0, stdout: `bash\t${root}\n`, stderr: "" };
    return { status: 0, stdout: "ready", stderr: "" };
  };
  await startHarness({
    root,
    run,
    resumeLast: false,
    platform: "linux",
    release: { name: "node" },
    openBrowser: false,
  });
  assert.deepEqual(
    calls.find(({ command, args }) => command === "tmux" && args[0] === "send-keys")?.args,
    ["send-keys", "-t", sessionName(root), "codex", "C-m"],
  );
});

test("combined launcher switches an existing tmux client into the repository session", async () => {
  const root = fixture();
  const calls = [];
  const run = (command, args) => {
    calls.push({ command, args });
    if (command === "tmux" && args[0] === "has-session")
      return { status: 0, stdout: "", stderr: "" };
    if (command === "tmux" && args[0] === "list-panes")
      return { status: 0, stdout: `codex\t${root}\n`, stderr: "" };
    return { status: 0, stdout: "ready", stderr: "" };
  };
  const result = await startHarness({
    root,
    run,
    insideTmux: true,
    platform: "linux",
    release: { name: "node" },
    openBrowser: false,
    fetch: async () => ({
      ok: true,
      json: async () => ({ name: "origin", instanceId: runtimeInstanceId(root) }),
    }),
  });
  assert.equal(result.session, sessionName(root));
  assert.deepEqual(calls.at(-1).args, ["switch-client", "-t", sessionName(root)]);
  assert.equal(
    calls.some(({ args }) => args[0] === "attach-session"),
    false,
  );
});

function fakeRun(root, options = {}) {
  const captures = [...(options.capture || ["idle\n› "])];
  const captureFallback = options.captureFallback || "idle";
  const calls = [];
  const run = (command, args) => {
    calls.push({ command, args });
    if (command === "tmux" && args[0] === "list-panes")
      return {
        status: 0,
        stdout: `%1\t${options.paneRoot || root}\t101\tcodex\torigin-test\n`,
        stderr: "",
      };
    if (command === "ps") return { status: 0, stdout: "101 1 codex\n", stderr: "" };
    if (command === "tmux" && args[0] === "capture-pane")
      return {
        status: 0,
        stdout: captures.length ? captures.shift() : captureFallback,
        stderr: "",
      };
    return { status: 0, stdout: "", stderr: "" };
  };
  run.calls = calls;
  return run;
}

function enableFeedbackPlugin(root) {
  const directory = path.join(root, ".codex", "plugins", "contextual-feedback", ".codex-plugin");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "plugin.json"), "{}\n");
}

function sourceFor(root) {
  const event = readFeedbackEvents(root).at(-1);
  return { sourceEventHash: event.hash, sourceSequence: event.sequence };
}

function enqueueWake(root, input, now) {
  return enqueueFeedbackWake(root, { ...input, ...sourceFor(root) }, now);
}

test("blank screen and unrelated work are not submission evidence", () => {
  const marker = "[ORIGIN WAKE unique-123]";
  assert.equal(submissionAccepted({ value: "", marker, wasBusy: false }), false);
  assert.equal(submissionAccepted({ value: "Working (12)", marker, wasBusy: false }), false);
});

test("real Codex styled placeholder allows a wake while identical owner text is preserved", () => {
  const placeholder =
    "\u001b[1m›\u001b[0m \u001b[2mAsk Codex to do anything\n\n  Context 100% left";
  assert.equal(codexEditorHasInput(placeholder), false);
  assert.equal(codexEditorHasInput("› Ask Codex to do anything\n\n  Context 100% left"), true);
  assert.equal(codexEditorHasInput("› \n"), false);
  assert.equal(codexEditorHasInput("› \n\n  owner multiline draft"), true);
  assert.equal(codexEditorHasInput("Hooks\nPress enter to view hooks; esc to close"), true);
  assert.equal(codexEditorHasInput("› \u001b[2mPlaceholder\u001b[22m actual owner text"), true);
  assert.equal(codexEditorHasInput("› \u001b[38;2;23;42;90mowner text"), true);
  const root = fixture();
  const marker = "[ORIGIN WAKE styled-editor]";
  const run = fakeRun(root, {
    capture: [placeholder, `› ${marker}`, `${marker}\nWorking (1)\n› `],
  });
  assert.equal(
    deliverCodexWake(root, { marker, prompt: marker }, { run, wait: () => {} }).state,
    "submitted",
  );
  const blocked = fakeRun(root, { capture: ["› Ask Codex to do anything"] });
  assert.throws(
    () => deliverCodexWake(root, { marker, prompt: marker }, { run: blocked, wait: () => {} }),
    /pending input/,
  );
  assert.equal(
    blocked.calls.some((call) =>
      ["set-buffer", "paste-buffer", "send-keys"].includes(call.args[0]),
    ),
    false,
  );
});
