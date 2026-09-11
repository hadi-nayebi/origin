#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  channelContext,
  channelDirectory,
  pluginPresent,
} from "../.codex/plugins/_engagement-core/lib/scope.mjs";

const root = path.resolve(
  process.env.ORIGIN_REPOSITORY_ROOT ||
    path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
);
try {
  const input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  if (input.hook_event_name !== "Stop") process.exit(0);
  const scope = channelContext({ root, channel: process.argv[2] });
  if (!pluginPresent(scope)) process.exit(0);
  if (
    scope.channel === "telegram-engagement" &&
    !fs.existsSync(path.join(channelDirectory(scope), "enabled.json"))
  )
    process.exit(0);
  const plugin = await import(
    pathToFileURL(path.join(root, ".codex/plugins", scope.channel, "hooks/stop.mjs"))
  );
  const outcome = plugin.inspectStop(scope);
  if (outcome.block) {
    process.stderr.write(`${outcome.reason}\n`);
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`Engagement state needs repair: ${error.message}\n`);
  process.exitCode = 2;
}
