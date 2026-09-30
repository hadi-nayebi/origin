#!/usr/bin/env node
import { spawnSync } from "node:child_process";

import { assertNode } from "./node-runtime.mjs";
import { offerTelegramSetup } from "./installation-onboarding.mjs";
try {
  assertNode();
} catch (error) {
  fail(error.message);
}
run(process.platform === "win32" ? "npm.cmd" : "npm", ["ci"]);
run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "check"]);
run(process.execPath, ["scripts/doctor.mjs"]);
try {
  await offerTelegramSetup();
} catch (error) {
  fail(error.message);
}
console.log("Origin setup is complete. Run: npm run origin");

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function fail(message) {
  console.error(message);
  process.exit(1);
}
