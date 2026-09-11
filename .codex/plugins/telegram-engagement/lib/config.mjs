import fs from "node:fs";
import path from "node:path";
import { directory, readJSON, atomicJSON } from "./storage.mjs";

export function loadConfig(root) {
  const dir = directory(root);
  const config = readJSON(path.join(dir, "config.json"));
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
  for (const key of ["botId", "chatId", "userId"])
    if (!/^-?\d+$/.test(config[key] || ""))
      throw new Error(`Missing or invalid ${key}; run Telegram setup.`);
  return { ...config, token };
}
export function validateToken(value) {
  if (typeof value !== "string" || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(value))
    throw new Error("Invalid Telegram bot token format.");
}
export function saveConfig(root, config) {
  const { token: _secret, ...publicConfig } = config;
  atomicJSON(path.join(directory(root), "config.json"), publicConfig);
}
export function defaults() {
  return {
    version: 1,
    language: "Auto",
    sttModel: "base",
    qwenModel: "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
    device: "cpu",
    maxMediaBytes: 20 * 1024 * 1024,
    voiceRequired: true,
  };
}
