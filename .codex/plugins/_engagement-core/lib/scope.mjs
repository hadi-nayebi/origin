import fs from "node:fs";
import path from "node:path";

export const CHANNELS = Object.freeze(["contextual-feedback", "telegram-engagement"]);
export function channelContext(value) {
  const { root, channel = "contextual-feedback" } =
    typeof value === "string" ? { root: value } : value;
  if (!CHANNELS.includes(channel)) throw new Error("Unknown engagement channel.");
  return Object.freeze({ root: path.resolve(root), channel });
}
export function channelDirectory(value) {
  const { root, channel } = channelContext(value);
  return path.join(root, ".origin", channel);
}
export function ledgerDirectory(value) {
  const { root, channel } = channelContext(value);
  // Preserve the existing dashboard ledger in place. No destructive migration.
  return channel === "contextual-feedback" ? path.join(root, ".origin") : channelDirectory(value);
}
export function pluginPresent(value) {
  const { root, channel } = channelContext(value);
  return fs.existsSync(
    path.join(root, ".codex", "plugins", channel, ".codex-plugin", "plugin.json"),
  );
}
