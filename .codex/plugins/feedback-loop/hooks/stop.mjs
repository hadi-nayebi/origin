#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stopOutcome } from "../lib/service.mjs";
import { renderVoice } from "../lib/voice.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const root = path.resolve(process.env.ORIGIN_REPOSITORY_ROOT || sourceRoot);
let input = {};
try {
  const source = fs.readFileSync(0, "utf8");
  input = source.trim() ? JSON.parse(source) : {};
} catch {}

if (input.hook_event_name !== "Stop") process.exit(0);
try {
  const outcome = stopOutcome(root);
  if (outcome.mode === "idle") process.exit(0);
  const message = renderVoice(
    path.join(sourceRoot, ".codex/plugins/feedback-loop/voice.xml"),
    outcome.voiceId,
    { reference: outcome.reference },
  );
  if (outcome.block) {
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
  } else {
    process.stdout.write(`${JSON.stringify({ continue: true, systemMessage: message })}\n`);
  }
} catch (error) {
  process.stderr.write(`Origin feedback state cannot be trusted: ${error.message}\n`);
  process.exitCode = 2;
}
