#!/usr/bin/env node
import { spawnSync } from "node:child_process";

if (Number(process.versions.node.split(".")[0]) < 22)
  fail(`Origin requires Node.js 22 or newer; found ${process.version}.`);
run(process.platform === "win32" ? "npm.cmd" : "npm", ["ci"]);
run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "check"]);
run(process.execPath, ["scripts/doctor.mjs"]);
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
