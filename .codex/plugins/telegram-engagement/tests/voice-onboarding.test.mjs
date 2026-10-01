import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  pairingGuide,
  sampleGuide,
  deliverPairingGuide,
  VOICE_PASSAGE,
} from "../lib/voice-onboarding.mjs";
import { directory, readJSON } from "../lib/storage.mjs";

function fixture(t) {
  const base = path.resolve(".origin/onboarding-fixtures");
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, "guide-"));
  fs.mkdirSync(directory(root), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("pairing gives text default, explicit voice activation and a guided sample", () => {
  const guide = pairingGuide();
  assert.match(guide, /continue with text.*replies in text/);
  assert.match(guide, /npm run telegram -- install-voice/);
  assert.ok(guide.includes(VOICE_PASSAGE));
  assert.match(sampleGuide(), /after you enable voice/);
  assert.match(sampleGuide(), /not a translation/);
  assert.match(sampleGuide(), /listen to the generated preview/);
});

test("pairing guide confirms exact message receipt and cannot duplicate on repeat", async (t) => {
  const root = fixture(t);
  let calls = 0;
  const config = { chatId: "100" };
  const api = {
    sendText: async (text, target) => {
      calls++;
      assert.equal(text, pairingGuide());
      assert.equal(target, config);
      return { message_id: 123 };
    },
  };
  assert.equal((await deliverPairingGuide(root, api, config)).messageId, 123);
  await deliverPairingGuide(root, api, config);
  assert.equal(calls, 1);
});

test("uncertain onboarding send retains evidence and is never blindly retried", async (t) => {
  const root = fixture(t);
  let calls = 0;
  const api = {
    sendText: async () => {
      calls++;
      throw { uncertain: true };
    },
  };
  assert.equal((await deliverPairingGuide(root, api, {})).status, "indeterminate");
  await deliverPairingGuide(root, api, {});
  assert.equal(calls, 1);
  assert.equal(
    readJSON(path.join(directory(root), "onboarding-message.json")).status,
    "indeterminate",
  );
});
