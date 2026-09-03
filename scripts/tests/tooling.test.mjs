import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("doctor validates repository wiring with an available command", () => {
  const result = spawnSync(process.execPath, ["scripts/doctor.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ORIGIN_AGENT_COMMAND: process.execPath },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS  Codex Stop registration/);
  assert.match(result.stdout, /Origin is ready/);
});

test("doctor distinguishes an optional missing agent from a required failure", () => {
  const environment = {
    ...process.env,
    ORIGIN_AGENT_COMMAND: "origin-agent-command-that-does-not-exist",
  };
  const optional = spawnSync(process.execPath, ["scripts/doctor.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: environment,
  });
  assert.equal(optional.status, 0, optional.stderr);
  assert.match(optional.stdout, /WARN  Agent command/);
  assert.doesNotMatch(optional.stdout, /PASS  Agent command/);
  const required = spawnSync(process.execPath, ["scripts/doctor.mjs", "--require-agent"], {
    cwd: root,
    encoding: "utf8",
    env: environment,
  });
  assert.equal(required.status, 1);
  assert.match(required.stdout, /FAIL  Agent command/);
});

test("the acceptance command runs an isolated configured-agent fixture", () => {
  const fakeAgent = path.join(
    root,
    ".codex",
    "plugins",
    "feedback-loop",
    "tests",
    "fake-agent.mjs",
  );
  const result = spawnSync(process.execPath, ["scripts/acceptance-codex.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      ORIGIN_AGENT_COMMAND: process.execPath,
      ORIGIN_AGENT_ARGS_JSON: JSON.stringify([fakeAgent]),
    },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PASS  Production delivery adapter/);
  assert.match(result.stdout, /PASS  Fixture isolation/);
  assert.match(result.stdout, /not evidence of authenticated Codex execution/);
});

test("platform installers delegate to one tested Node installer", () => {
  assert.match(
    fs.readFileSync(path.join(root, "scripts", "install.sh"), "utf8"),
    /node scripts\/install\.mjs/,
  );
  assert.match(
    fs.readFileSync(path.join(root, "scripts", "install.ps1"), "utf8"),
    /node scripts\/install\.mjs/,
  );
});

test("repository text uses a deterministic cross-platform line ending", () => {
  const attributes = fs.readFileSync(path.join(root, ".gitattributes"), "utf8");
  assert.match(attributes, /^\* text=auto eol=lf$/m);
  assert.match(attributes, /^\*\.png binary$/m);
});

test("lockfile and package versions match", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[""].version, manifest.version);
});
