#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachMaterial } from "../.codex/plugins/_engagement-core/lib/materials.mjs";
import { chromium } from "playwright";
import { startOriginServer } from "../server/index.mjs";
import {
  askFeedbackQuestion,
  listFeedback,
  transitionFeedback,
} from "../.codex/plugins/contextual-feedback/lib/service.mjs";

// Real browser coverage of the normal Vite path and built dashboard. Runtime
// data stays in an isolated clone-local fixture; no Codex wake is delivered.
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
fs.mkdirSync(path.join(sourceRoot, ".origin"), { recursive: true });
const root = fs.mkdtempSync(path.join(sourceRoot, ".origin", "browser-smoke-"));
let browser;
let server;
try {
  for (const name of ["index.html", "src", "docs", "vite.config.ts", "tsconfig.json", "dist"]) {
    fs.cpSync(path.join(sourceRoot, name), path.join(root, name), { recursive: true });
  }
  fs.symlinkSync(
    path.join(sourceRoot, "node_modules"),
    path.join(root, "node_modules"),
    "junction",
  );
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  });
  for (const dev of [true, false]) {
    server = await startOriginServer({ root, dev, port: 0, deliverWakes: false });
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /content security policy|refused|preamble/i.test(message.text())
      ) {
        errors.push(message.text());
      }
    });
    await page.goto(base);
    await page.getByRole("heading", { name: "Ready to become yours." }).waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.getByRole("button", { name: "Open Origin wiki" }).click();
    await page.locator(".chapter-link").first().click();
    await page.locator(".wiki-article h1").waitFor();
    const pagePath = new URL(page.url()).pathname;
    await page.getByRole("button", { name: /^Give feedback/ }).click();
    await page
      .getByLabel("What should change?")
      .fill(`Verify ${dev ? "development" : "production"} feedback flow`);
    await page.getByRole("button", { name: "Save feedback", exact: true }).click();
    await page.getByText(/Saved.*tmux wake.*pending/).waitFor();
    await page.getByRole("button", { name: "Pause dashboard channel", exact: true }).click();
    await page.getByRole("button", { name: "Resume dashboard channel", exact: true }).waitFor();
    await page.getByRole("button", { name: "Resume dashboard channel", exact: true }).click();
    await page.getByRole("button", { name: "Pause dashboard channel", exact: true }).waitFor();
    const record = listFeedback(root).at(-1);
    assert.equal(record.pagePath, pagePath);
    transitionFeedback(root, record.id, "in_progress");
    askFeedbackQuestion(root, record.id, "Which bounded result should be verified?");
    await page.getByLabel("Your answer").fill("The current feedback lifecycle.");
    await page.getByRole("button", { name: "Send answer" }).click();
    await page.getByText("Answer saved and wake queued.").waitFor();
    assert.equal(listFeedback(root).at(-1).status, "open");
    const card = page.locator(".feedback-record").filter({ hasText: record.body }).first();
    await card.getByLabel("Attach a file to this thread (up to 20 MiB)").setInputFiles({
      name: "owner-notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Owner file evidence"),
    });
    await card.getByText("File saved and wake queued.").waitFor();
    attachMaterial(root, record.id, "agent-result.txt", Buffer.from("Verified result material"), {
      role: "agent",
    });
    await card.getByRole("link", { name: /agent-result.txt/ }).waitFor();
    transitionFeedback(root, record.id, "in_progress");
    transitionFeedback(root, record.id, "ready_for_review", {
      verification: "The isolated browser test verified page context, answer and lifecycle state.",
    });
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await page.getByText("Acceptance saved and wake queued.").waitFor();
    assert.equal(listFeedback(root).at(-1).status, "resolved");
    assert.deepEqual(errors, []);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.close();
    await new Promise((resolve) => server.close(resolve));
    server = null;
    console.log(
      `PASS ${dev ? "Development" : "Production"}: render, Wiki, page-aware feedback, answer, bidirectional materials, acceptance and mobile width`,
    );
  }
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
}
