#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  directory,
  scopeFor,
  updateTransport,
  privateDirectory,
  atomicJSON,
  acquireLease,
} from "../lib/storage.mjs";
import { loadConfig, validateToken, saveConfig, defaults } from "../lib/config.mjs";
import { BotAPI } from "../lib/api.mjs";
import { runTelegram } from "../lib/runtime.mjs";
import { channelStatus, getThread, associateInput, queueReply } from "../lib/service.mjs";
import {
  nextFeedback,
  listFeedback,
  transitionFeedback,
  reconcileAgentState,
  verifyFeedback,
} from "../../_engagement-core/lib/service.mjs";
import { pauseAgent, resumeAgent } from "../../_engagement-core/lib/state.mjs";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(process.env.ORIGIN_REPOSITORY_ROOT || path.join(pluginRoot, "../../.."));
const scope = scopeFor(root);
const [command, id, ...args] = process.argv.slice(2);
const print = (value) => process.stdout.write(JSON.stringify(value, null, 2) + "\n");
try {
  if (command === "setup") await setup();
  else if (command === "install-voice") installVoice();
  else if (command === "run") await runTelegram(root);
  else if (command === "status") print(channelStatus(root));
  else if (command === "get") print(getThread(root, id));
  else if (command === "list") print(listFeedback(scope));
  else if (command === "next") print(nextFeedback(scope));
  else if (command === "start") print(transitionFeedback(scope, id, "in_progress"));
  else if (["reply", "ask", "review", "material"].includes(command)) {
    const materials = [];
    let text = args.join(" ");
    if (command === "material") {
      const source = fs.realpathSync(args[0]);
      if (!fs.statSync(source).isFile()) throw new Error("Material must be a file.");
      const targetDir = path.join(directory(root), "materials", crypto.randomUUID());
      privateDirectory(targetDir);
      const target = path.join(targetDir, path.basename(source));
      fs.copyFileSync(source, target);
      fs.chmodSync(target, 0o600);
      materials.push({ path: target, status: "prepared" });
      text = args.slice(1).join(" ");
    }
    print(
      queueReply(
        root,
        id,
        text,
        command === "ask" ? "question" : command === "review" ? "review" : "progress",
        materials,
      ),
    );
  } else if (command === "associate") print(associateInput(root, Number(id), args[0]));
  else if (command === "pause") print(pauseAgent(scope, id || "User paused Telegram engagement."));
  else if (command === "resume") {
    reconcileAgentState(scope);
    print(resumeAgent(scope));
  } else if (command === "verify") print(verifyFeedback(scope));
  else if (command === "enable") {
    loadConfig(root);
    reconcileAgentState(scope);
    atomicJSON(path.join(directory(root), "enabled.json"), { enabled: true });
    print({ enabled: true });
  } else if (command === "disable") {
    fs.rmSync(path.join(directory(root), "enabled.json"), { force: true });
    print({
      enabled: false,
      historyPreserved: true,
      next: "Stop the Telegram listener with Ctrl-C; an enabled combined launcher will no longer start it.",
    });
  } else if (command === "retry-input") {
    updateTransport(root, (s) => {
      const item = s.inbox[id];
      if (!item || !["retrying", "failed"].includes(item.status))
        throw new Error("Input is not retryable.");
      item.status = "received";
      item.nextAttemptAt = 0;
    });
    print({ retry: id });
  } else if (command === "doctor") {
    const config = loadConfig(root);
    const dir = directory(root);
    print({
      paired: true,
      enabled: fs.existsSync(path.join(dir, "enabled.json")),
      voiceModel: config.qwenModel,
      device: config.device,
      modelsPresent: ["models/qwen/config.json", "models/stt/config.json"].every((p) =>
        fs.existsSync(path.join(dir, p)),
      ),
      voiceSamplePresent: ["voice/reference.wav", "voice/reference.txt"].every((p) =>
        fs.existsSync(path.join(dir, p)),
      ),
      ffmpeg: spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0,
      lifecycle: verifyFeedback(scope),
      transport: channelStatus(root),
      liveAcceptance:
        "Run the documented paired-bot, cloned-voice and trusted-hook acceptance sequence.",
    });
  } else
    throw new Error(
      "Usage: telegram <setup|install-voice|run|doctor|enable|disable|status|list|next|get|start|reply|ask|review|material|associate|pause|resume|verify|retry-input> [id] [text or file]",
    );
} catch (error) {
  process.stderr.write(error.message + "\n");
  process.exitCode = 1;
}

async function hiddenToken() {
  if (!process.stdin.isTTY)
    throw new Error("Run setup in an interactive terminal; token input is hidden.");
  process.stdout.write("BotFather token (hidden): ");
  return new Promise((resolve, reject) => {
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const end = () => {
      process.stdin.setRawMode(false);
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (data) => {
      for (const char of data) {
        if (char === "\u0003") {
          end();
          reject(new Error("Setup cancelled."));
          return;
        }
        if (char === "\r" || char === "\n") {
          end();
          resolve(value.trim());
          return;
        }
        if (char === "\u007f") value = value.slice(0, -1);
        else value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}
async function setup() {
  const dir = directory(root);
  privateDirectory(dir);
  if (fs.existsSync(path.join(dir, "config.json")))
    throw new Error(
      "This clone is already paired. Preserve its history; use a separate clone for another bot.",
    );
  const release = acquireLease(dir, "listener");
  try {
    const token = await hiddenToken();
    validateToken(token);
    const api = new BotAPI(token);
    const me = await api.call("getMe");
    const webhook = await api.call("getWebhookInfo");
    if (webhook.url) throw new Error("Bot already has a webhook; create a dedicated bot.");
    const challenge = crypto.randomBytes(20).toString("hex");
    process.stdout.write(
      `Open @${me.username} in a private Telegram chat and send:\n/pair ${challenge}\nThis challenge expires in five minutes.\n`,
    );
    let offset = 0;
    let paired;
    const until = Date.now() + 300000;
    while (!paired && Date.now() < until) {
      for (const update of await api.updates(offset)) {
        offset = update.update_id + 1;
        const m = update.message;
        if (
          m?.chat?.type === "private" &&
          m.from?.is_bot !== true &&
          m.text === `/pair ${challenge}`
        ) {
          paired = m;
          break;
        }
      }
    }
    if (!paired) throw new Error("Pairing expired. No bot binding was saved.");
    fs.writeFileSync(path.join(dir, "bot-token"), token + "\n", { mode: 0o600, flag: "wx" });
    saveConfig(root, {
      ...defaults(),
      botId: String(me.id),
      chatId: String(paired.chat.id),
      userId: String(paired.from.id),
    });
    updateTransport(root, (s) => {
      s.botId = String(me.id);
      s.offset = offset;
    });
    reconcileAgentState(scope);
    atomicJSON(path.join(dir, "enabled.json"), { enabled: true });
    process.stdout.write(
      "Paired. Next: npm run telegram -- install-voice\nThen run npm run telegram -- run; send /voice-sample followed by a clear voice note in Telegram. Your sample stays local. Read this plugin's README for the preview and acceptance checks.\n",
    );
  } finally {
    release();
  }
}
function installVoice() {
  loadConfig(root);
  const dir = directory(root);
  const venv = path.join(dir, "venv");
  const python = path.join(
    venv,
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  const steps = [];
  if (!fs.existsSync(python))
    steps.push([process.env.ORIGIN_PYTHON || "python3", ["-m", "venv", venv]]);
  steps.push([
    python,
    ["-m", "pip", "install", "-r", path.join(pluginRoot, "voice/requirements.txt")],
  ]);
  steps.push([python, [path.join(pluginRoot, "voice/worker.py"), "download", "--root", dir]]);
  for (const [binary, args] of steps) {
    const result = spawnSync(binary, args, { stdio: "inherit", shell: false });
    if (result.status !== 0)
      throw new Error(
        "Local voice installation failed; inspect the reported dependency or download error.",
      );
  }
  process.stdout.write(
    "Local models installed. Install FFmpeg if missing, then capture your sample using /voice-sample in the paired Telegram chat.\n",
  );
}
