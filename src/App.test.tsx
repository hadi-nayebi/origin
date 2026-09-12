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
const plugin = {
  id: "contextual-feedback",
  name: "Origin Contextual Feedback",
  version: "1.0.0",
  description: "Turns page-aware feedback into durable user-agent conversation and reviewed work.",
  objective: "Turn page-aware comments into durable reviewed responsibility.",
  capabilities: ["Read", "Write", "Hooks"],
  anatomy: [
    { key: "manifest", label: "Manifest", present: true },
    { key: "state", label: "State schemas", present: true },
    { key: "operations", label: "Public operations", present: true },
    { key: "hooks", label: "Hooks", present: true },
    { key: "voice", label: "Voice", present: true },
    { key: "documentation", label: "Documentation", present: true },
    { key: "tests", label: "Tests", present: true },
  ],
  complete: true,
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
      if (url === "/api/plugins") return response({ plugins: [plugin] });
      if (url === "/api/plugins/contextual-feedback")
        return response({
          ...plugin,
          documents: [
            {
              name: "README.md",
              label: "Plugin contract",
              content: "# Contextual Feedback\n\nThe complete plugin contract.",
            },
          ],
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
    expect(screen.getByRole("button", { name: "Open Origin admin" })).toBeTruthy();
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
    await user.click(screen.getByRole("button", { name: "Open Origin admin" }));
    expect(await screen.findByRole("heading", { name: "Origin Admin" })).toBeTruthy();
    expect(
      await screen.findByText(/public Hadosh Academy dashboard-plus-harness substrate/),
    ).toBeTruthy();
    await user.click((await screen.findAllByRole("button", { name: /Welcome to Origin/ }))[0]);
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/wiki/01-welcome");
  });

  test("shows the two public plugin references inside Admin", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Open Origin admin" }));
    await user.click(await screen.findByRole("tab", { name: "Plugins" }));
    expect(
      await screen.findByRole("heading", { name: "Two plugins show how Origin grows." }),
    ).toBeTruthy();
    expect(screen.getByText("Complete reference anatomy")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Origin Contextual Feedback/ }));
    expect(await screen.findByRole("heading", { name: "Anatomy" })).toBeTruthy();
    expect(await screen.findByText("The complete plugin contract.")).toBeTruthy();
    expect(window.location.pathname).toBe("/admin/plugins/contextual-feedback");
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

  test("does not show a previous chapter under a newly selected route while loading", async () => {
    const user = userEvent.setup();
    const existingFetch = vi.mocked(fetch).getMockImplementation()!;
    let finishChapter!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/wiki")
          return Promise.resolve(
            response({
              chapters: [chapter, { ...chapter, slug: "02-next", title: "Next chapter" }],
            }),
          );
        if (String(input) === "/api/wiki/02-next")
          return new Promise<Response>((resolve) => {
            finishChapter = resolve;
          });
        return existingFetch(input, init);
      }),
    );
    window.history.replaceState({}, "", "/wiki/01-welcome");
    render(<App />);
    expect(await screen.findByRole("table")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Next chapter/ }));
    expect(window.location.pathname).toBe("/admin/wiki/02-next");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Loading chapter…")).toBeTruthy();
    finishChapter(response({ ...chapter, slug: "02-next", content: "# The next chapter" }));
    expect(await screen.findByRole("heading", { name: "The next chapter" })).toBeTruthy();
    expect(screen.queryByText("Loading chapter…")).toBeNull();
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

  test("user merges the linked PR and cannot silently edit verification", async () => {
    const user = userEvent.setup();
    let current = record({
      status: "ready_for_review",
      verification: "Built the page and verified its route and browser controls.",
      linkedWork: ["pull-request:https://github.com/example/origin/pull/42"],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/feedback" && !init?.method) return response(view([current], "waiting"));
        if (url.endsWith(`/${current.id}/merge`) && init?.method === "POST") {
          current = {
            ...current,
            status: "resolved",
            acceptance: "User merged PR #42 at 2026-09-12T20:00:00Z.",
          };
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
    expect(screen.getByRole("link", { name: /pull\/42/ }).getAttribute("href")).toBe(
      "https://github.com/example/origin/pull/42",
    );
    await user.click(screen.getByRole("button", { name: "Merge PR" }));
    expect(
      await screen.findByText("Pull request merged; acceptance saved and wake queued."),
    ).toBeTruthy();
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
