#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureAgentState,
  pauseAgent,
  readAgentState,
  resumeAgent,
  setAgentState,
  stopOutcome,
} from "../lib/state.mjs";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(
  process.env.ORIGIN_REPOSITORY_ROOT || path.resolve(pluginRoot, "../../.."),
);
const [command, ...words] = process.argv.slice(2);

try {
  let result;
  if (command === "init") result = ensureAgentState(root);
  else if (command === "get") result = readAgentState(root);
  else if (command === "stop-outcome") result = stopOutcome(root);
  else if (command === "pause") result = pauseAgent(root, required(words.join(" ")));
  else if (command === "resume") result = resumeAgent(root);
  else if (command === "set") {
    if (!process.argv.includes("--private"))
      throw new Error("State mutation is a private integration command.");
    const source = process.env.ORIGIN_AGENT_STATE_JSON;
    if (!source) throw new Error("ORIGIN_AGENT_STATE_JSON is required.");
    result = setAgentState(root, JSON.parse(source), { overridePause: false });
  } else {
    throw new Error(
      "Usage: state.mjs <init|get|stop-outcome|pause|resume|set> [reason] [--private]",
    );
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}

function required(value) {
  if (!value) throw new Error("The command is missing a required value.");
  return value;
}
