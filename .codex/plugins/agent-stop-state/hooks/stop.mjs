#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stopOutcome } from "../lib/state.mjs";
import { renderVoice } from "../lib/voice.mjs";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(pluginRoot, "../../..");
const root = path.resolve(process.env.ORIGIN_REPOSITORY_ROOT || repositoryRoot);
let input = {};
try {
  const source = fs.readFileSync(0, "utf8");
  input = source.trim() ? JSON.parse(source) : {};
} catch {}

if (input.hook_event_name !== "Stop") process.exit(0);
try {
  const outcome = stopOutcome(root);
  if (outcome.mode === "idle") process.exit(0);
  const message = renderVoice(path.join(pluginRoot, "voice.xml"), outcome.voiceId, {
    reason: outcome.reason,
    nextAction: outcome.nextAction || "none",
    reference: outcome.reference ? `${outcome.reference.plugin}:${outcome.reference.id}` : "none",
  });
  if (outcome.block) {
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
  } else {
    process.stdout.write(`${JSON.stringify({ continue: true, systemMessage: message })}\n`);
  }
} catch (error) {
  process.stderr.write(`Origin agent state cannot be trusted: ${error.message}\n`);
  process.exitCode = 2;
}
