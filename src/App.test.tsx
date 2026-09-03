import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import App from "./App";

const chapter = {
  slug: "01-welcome",
  title: "Welcome to Origin",
  summary: "Start here.",
  status: "included",
};

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/wiki") return response({ chapters: [chapter] });
      if (url === "/api/wiki/01-welcome")
        return response({
          ...chapter,
          content:
            "# Welcome\n\n| Layer | Owner |\n| --- | --- |\n| State | Plugin |\n\n[Origin](https://example.com) [Unsafe](javascript:alert(1))",
        });
      if (url === "/api/feedback" && init?.method === "POST")
        return response(
          {
            record: {
              id: "test-record-0001",
              kind: "feature",
              body: "Create the first useful page",
              pagePath: "/",
              pageLabel: "Origin canvas",
              status: "open",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            delivery: { state: "starting" },
          },
          201,
        );
      if (url === "/api/feedback")
        return response({
          records: [],
          outcome: { mode: "idle", block: false, reference: null, voiceId: null },
          delivery: { state: "idle" },
        });
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
      results.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact || ""),
      ),
    ).toEqual([]);
  });

  test("primary palette pairs meet WCAG AA contrast", () => {
    expect(contrast("#e8e8e5", "#111311")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#9a9f97", "#111311")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#41463f", "#f4f0e5")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#151714", "#c9f27b")).toBeGreaterThanOrEqual(4.5);
  });

  test("renders repository Markdown with GFM tables and safe links", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Open Origin wiki" }));
    await user.click((await screen.findAllByRole("button", { name: /Welcome to Origin/ }))[0]);
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Origin" }).getAttribute("href")).toBe(
      "https://example.com",
    );
    expect(screen.getByText("Unsafe").getAttribute("href")).not.toMatch(/^javascript:/);
    expect(window.location.pathname).toBe("/wiki/01-welcome");
  });

  test("captures page-aware feedback and restores focus after Escape", async () => {
    const user = userEvent.setup();
    render(<App />);
    const trigger = screen.getByRole("button", { name: "Give feedback" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Shape what comes next." });
    expect(dialog).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close feedback" }));
    await user.click(screen.getByLabelText("Feature request"));
    await user.type(screen.getByLabelText("What should change?"), "Create the first useful page");
    await user.click(screen.getByRole("button", { name: "Save feedback" }));
    await screen.findByText("Saved to the local queue. The agent runner is active.");
    const call = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      kind: "feature",
      pagePath: "/",
      pageLabel: "Origin canvas",
    });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  test("traps keyboard focus inside the feedback dialog", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Give feedback" }));
    const close = screen.getByRole("button", { name: "Close feedback" });
    expect(document.activeElement).toBe(close);
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save feedback" }));
    await user.tab();
    expect(document.activeElement).toBe(close);
  });

  test("manages a record through focused work and evidence-backed resolution", async () => {
    const user = userEvent.setup();
    const now = new Date().toISOString();
    let record = {
      id: "managed-record-0001",
      kind: "bug" as const,
      body: "Repair the first generated page",
      pagePath: "/",
      pageLabel: "Origin canvas",
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/feedback" && !init?.method)
          return response({
            records: [record],
            outcome: { mode: "active", block: true, reference: record.id, voiceId: "stop.active" },
            delivery: { state: "running", reference: record.id },
          });
        if (url === `/api/feedback/${record.id}` && init?.method === "PATCH") {
          const input = JSON.parse(String(init.body));
          record = { ...record, status: input.status, updatedAt: new Date().toISOString() };
          return response({ record, delivery: { state: "running", reference: record.id } });
        }
        if (url === "/api/wiki") return response({ chapters: [chapter] });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Give feedback" }));
    expect(await screen.findByText(record.body)).toBeTruthy();
    await user.click(screen.getByText("Manage"));
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText("in progress")).toBeTruthy();
    const evidence = "Repaired the page and verified its rendered controls.";
    await user.type(screen.getByLabelText("Reason or verification evidence"), evidence);
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    expect(await screen.findByText("resolved")).toBeTruthy();
    const patchCalls = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => init?.method === "PATCH")
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(patchCalls).toEqual([{ status: "in_progress" }, { status: "resolved", evidence }]);
  });
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function contrast(foreground: string, background: string) {
  const values = [foreground, background].map((color) => {
    const channels = color
      .match(/[a-f0-9]{2}/gi)!
      .map((hex) => Number.parseInt(hex, 16) / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  });
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}
