import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import App from "./App";
import type { FeedbackRecord } from "./types";

const chapter = {
  slug: "01-welcome",
  title: "Welcome to Origin",
  summary: "Start here.",
  status: "included",
};
const idleView = {
  records: [],
  outcome: {
    mode: "idle",
    block: false,
    reference: null,
    voiceId: "stop.idle",
    reason: "No work.",
    nextAction: null,
    revision: 0,
  },
  delivery: { state: "idle", transport: "tmux", pending: 0, last: null },
};

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/feedback" && !init?.method) return response(idleView);
      if (url === "/api/wiki") return response({ chapters: [chapter] });
      if (url === "/api/wiki/01-welcome")
        return response({
          ...chapter,
          content:
            "# Welcome\n\n| Layer | Owner |\n| --- | --- |\n| State | Plugin |\n\n[Origin](https://example.com)",
        });
      if (url === "/api/feedback" && init?.method === "POST")
        return response(
          {
            record: record(),
            delivery: { state: "pending", transport: "tmux", pending: 1, last: null },
          },
          201,
        );
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Origin dashboard", () => {
  test("preserves the empty canvas and accessible floating controls", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Ready to become yours." })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Origin wiki" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Give feedback" })).toBeTruthy();
    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      results.violations.filter((item) => ["serious", "critical"].includes(item.impact || "")),
    ).toEqual([]);
  });

  test("renders repository Markdown and Academy framing", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Open Origin wiki" }));
    expect(
      await screen.findByText(/public Hadosh Academy dashboard-plus-harness substrate/),
    ).toBeTruthy();
    await user.click((await screen.findAllByRole("button", { name: /Welcome to Origin/ }))[0]);
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(window.location.pathname).toBe("/wiki/01-welcome");
  });

  test("captures page-aware feedback for the interactive tmux session", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/projects/roadmap");
    render(<App />);
    const trigger = screen.getByRole("button", { name: "Give feedback" });
    await user.click(trigger);
    expect(screen.getByText(/same interactive Codex session/)).toBeTruthy();
    await user.click(screen.getByLabelText("Feature request"));
    await user.type(screen.getByLabelText("What should change?"), "Create the first useful page");
    await user.click(screen.getByRole("button", { name: "Save feedback" }));
    expect(await screen.findByText(/1 tmux wake is pending/)).toBeTruthy();
    const call = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      kind: "feature",
      pagePath: "/projects/roadmap",
      pageLabel: "Projects / Roadmap",
    });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  test("shows attention and sends a waiting-thread answer", async () => {
    const user = userEvent.setup();
    let current = record({
      status: "waiting",
      waitReason: "Which name?",
      messages: [
        message("user", "comment", "Name this page"),
        message("agent", "question", "Which name?"),
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/feedback" && !init?.method) return response(view([current], "waiting"));
        if (url.endsWith("/messages") && init?.method === "POST") {
          current = {
            ...current,
            status: "open",
            messages: [
              ...current.messages,
              message("user", "answer", JSON.parse(String(init.body)).body),
            ],
          };
          return response(
            {
              record: current,
              delivery: { state: "pending", transport: "tmux", pending: 1, last: null },
            },
            201,
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    render(<App />);
    expect(await screen.findByRole("button", { name: /1 items need your attention/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /items need your attention/ }));
    await user.type(await screen.findByLabelText("Your answer"), "Use Projects.");
    await user.click(screen.getByRole("button", { name: "Send answer" }));
    expect(await screen.findByText("Answer saved and wake queued.")).toBeTruthy();
  });

  test("user accepts verified work and cannot silently edit verification", async () => {
    const user = userEvent.setup();
    let current = record({
      status: "ready_for_review",
      verification: "Built the page and verified its route and browser controls.",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/feedback" && !init?.method) return response(view([current], "waiting"));
        if (url.includes(current.id) && init?.method === "PATCH") {
          const body = JSON.parse(String(init.body));
          current = { ...current, status: body.status, acceptance: body.acceptance };
          return response({
            record: current,
            delivery: { state: "pending", transport: "tmux", pending: 1, last: null },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /items need your attention/ }));
    expect(await screen.findByText(/Built the page and verified/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Acceptance saved and wake queued.")).toBeTruthy();
  });
});

function record(overrides: Partial<FeedbackRecord> = {}): FeedbackRecord {
  const now = new Date().toISOString();
  return {
    id: "test-record-0001",
    kind: "feature",
    body: "Create the first useful page",
    pagePath: "/",
    pageLabel: "Origin canvas",
    status: "open",
    createdAt: now,
    updatedAt: now,
    messages: [message("user", "comment", "Create the first useful page")],
    classification: null,
    interpretation: null,
    linkedWork: [],
    verification: null,
    acceptance: null,
    ...overrides,
  };
}
function message(role: "user" | "agent", type: "comment" | "question" | "answer", body: string) {
  return {
    id: `msg-${role}-${type}-${body.length}`,
    role,
    type,
    body,
    at: new Date().toISOString(),
  };
}
function view(records: FeedbackRecord[], mode: "active" | "waiting" | "idle") {
  return {
    records,
    outcome: {
      mode,
      block: mode === "active",
      reference: records[0] ? { plugin: "contextual-feedback", id: records[0].id } : null,
      voiceId: `stop.${mode}`,
      reason: "State reason",
      nextAction: null,
      revision: 1,
    },
    delivery: { state: "connected", transport: "tmux", pending: 0, last: null },
  };
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
