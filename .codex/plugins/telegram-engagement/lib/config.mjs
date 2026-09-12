import fs from "node:fs";
import path from "node:path";
import { directory, readJSON, atomicJSON } from "./storage.mjs";

export function loadConfig(root) {
  const dir = directory(root);
  const stored = readJSON(path.join(dir, "config.json"));
  const config = {
    ...defaults(),
    ...stored,
    // Preserve the behavior of clones paired before text-first Telegram shipped.
    transcriptionEnabled: stored.transcriptionEnabled ?? stored.voiceRequired === true,
    voiceRepliesEnabled: stored.voiceRepliesEnabled ?? stored.voiceRequired === true,
  };
  delete config.voiceRequired;
  const tokenFile = path.join(dir, "bot-token");
  const stat = fs.lstatSync(tokenFile);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    (process.platform !== "win32" && stat.mode & 0o077)
  )
    throw new Error("Bot token must be a private regular file (0600).");
  const token = fs.readFileSync(tokenFile, "utf8").trim();
  validateToken(token);
  for (const key of ["botId", "chatId", "userId"]) {
    if (!/^-?\d+$/.test(config[key] || ""))
      throw new Error(`Missing or invalid ${key}; run Telegram setup.`);
    config[key] = String(config[key]);
  }
  if (
    !Number.isSafeInteger(config.maxMediaBytes) ||
    config.maxMediaBytes < 1 ||
    config.maxMediaBytes > 20 * 1024 * 1024
  )
    throw new Error(
      "maxMediaBytes must be between 1 and the cloud Bot API download cap of 20 MiB.",
    );
  if (!/^(cpu|cuda(?::\d+)?)$/.test(config.device))
    throw new Error("Speech device must be cpu or cuda[:index].");
  for (const key of ["transcriptionEnabled", "voiceRepliesEnabled"])
    if (typeof config[key] !== "boolean") throw new Error(`${key} must be true or false.`);
  if (config.voiceRepliesEnabled && !config.transcriptionEnabled)
    throw new Error("Cloned-voice replies require the optional speech capability.");
  if (
    config.pronunciation &&
    (typeof config.pronunciation !== "object" ||
      Array.isArray(config.pronunciation) ||
      Object.entries(config.pronunciation).some(
        ([key, value]) => !key || typeof value !== "string" || !value,
      ))
  )
    throw new Error("Pronunciation overrides must map nonempty text to nonempty spoken text.");
  if (
    config.speechChunkChars !== undefined &&
    (!Number.isInteger(config.speechChunkChars) ||
      config.speechChunkChars < 48 ||
      config.speechChunkChars > 900)
  )
    throw new Error("speechChunkChars must be between 48 and 900.");
  return { ...config, token };
}
export function validateToken(value) {
  if (typeof value !== "string" || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(value))
    throw new Error("Invalid Telegram bot token format.");
}
export function saveConfig(root, config) {
  const { token: _secret, ...publicConfig } = config;
  delete publicConfig.voiceRequired;
  atomicJSON(path.join(directory(root), "config.json"), { ...publicConfig, version: 2 });
}
export function defaults() {
  return {
    version: 2,
    language: "Auto",
    sttModel: "base",
    qwenModel: "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
    device: "cpu",
    maxMediaBytes: 20 * 1024 * 1024,
    transcriptionEnabled: false,
    voiceRepliesEnabled: false,
    speechChunkChars: 300,
  };
}
