import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { offerTelegramSetup } from "../installation-onboarding.mjs";

function fixture(overrides = {}) {
  const messages = [];
  const calls = [];
  return {
    messages,
    calls,
    options: {
      root: "/example/project",
      interactive: true,
      exists: (file) => file.endsWith("telegram.mjs"),
      write: (text) => messages.push(text),
      ask: async () => "",
      run: (command, args) => {
        calls.push({ command, args });
        return { status: 0 };
      },
      ...overrides,
    },
  };
}

test("declining Telegram leaves the channel off and gives a recovery command", async () => {
  for (const answer of ["", "n", "no"]) {
    const f = fixture({ ask: async () => answer });
    assert.equal(await offerTelegramSetup(f.options), "skipped");
    assert.equal(f.calls.length, 0);
    assert.match(f.messages.join("\n"), /not enabled.*npm run telegram -- setup/);
  }
});

test("invalid answers are explained and only explicit consent starts hidden-token setup", async () => {
  const answers = ["maybe", "YES"];
  const f = fixture({ ask: async () => answers.shift() });
  assert.equal(await offerTelegramSetup(f.options), "connected");
  assert.match(f.messages.join("\n"), /Enter yes/);
  assert.deepEqual(f.calls, [
    {
      command: process.execPath,
      args: [
        path.join("/example/project", ".codex/plugins/telegram-engagement/scripts/telegram.mjs"),
        "setup",
      ],
    },
  ]);
});

test("noninteractive installs never wait for input or enable Telegram", async () => {
  const f = fixture({ interactive: false, ask: async () => assert.fail("must not prompt") });
  assert.equal(await offerTelegramSetup(f.options), "skipped");
  assert.equal(f.calls.length, 0);
  assert.match(f.messages.join("\n"), /No interactive terminal/);
});

test("removed plugin and existing configuration are preserved without setup", async () => {
  for (const [exists, expected] of [
    [() => false, "unavailable"],
    [() => true, "existing"],
  ]) {
    const f = fixture({ exists, ask: async () => assert.fail("must not prompt") });
    assert.equal(await offerTelegramSetup(f.options), expected);
    assert.equal(f.calls.length, 0);
  }
});

test("cancelled or failed pairing cannot report connected", async () => {
  for (const result of [
    { status: 1 },
    { status: null, signal: "SIGINT" },
    { error: new Error("spawn failed") },
  ]) {
    const f = fixture({ ask: async () => "yes", run: () => result });
    await assert.rejects(offerTelegramSetup(f.options), /did not finish.*retry/);
  }
  const f = fixture({
    ask: async () => {
      throw new Error("cancelled");
    },
  });
  await assert.rejects(offerTelegramSetup(f.options), /cancelled/);
  assert.equal(f.calls.length, 0);
});
