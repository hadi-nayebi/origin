import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

export async function offerTelegramSetup({
  root = process.cwd(),
  interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  exists = fs.existsSync,
  ask = askInTerminal,
  write = (text) => console.log(text),
  run = (command, args) => spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false }),
} = {}) {
  const script = path.join(root, ".codex/plugins/telegram-engagement/scripts/telegram.mjs");
  if (!exists(script)) {
    write("The optional Telegram plugin is not installed. Continue using the dashboard.");
    return "unavailable";
  }
  if (exists(path.join(root, ".origin/telegram-engagement/config.json"))) {
    write(
      "Existing Telegram configuration was preserved. Check it with: npm run telegram -- doctor",
    );
    return "existing";
  }
  write("Optional: use Telegram to talk to your dashboard agent away from this computer.");
  write(
    "You need a dedicated bot created through @BotFather in Telegram. Do not reuse a bot already connected to another project.",
  );
  write(
    "Setup hides the bot token, then gives you a command to send in the bot's private chat to connect your account. No speech downloads are required for text.",
  );
  if (!interactive) {
    write(
      "No interactive terminal is available. Telegram was not enabled. Set it up later in a terminal: npm run telegram -- setup",
    );
    return "skipped";
  }
  let answer;
  do {
    answer = (await ask("Connect a dedicated Telegram bot now? [y/N] ")).trim().toLowerCase();
    if (!["", "n", "no", "y", "yes"].includes(answer))
      write("Enter yes to connect, or no to continue without Telegram.");
  } while (!["", "n", "no", "y", "yes"].includes(answer));
  if (!["y", "yes"].includes(answer)) {
    write("Telegram was not enabled. You can connect later: npm run telegram -- setup");
    return "skipped";
  }
  const result = run(process.execPath, [script, "setup"]);
  if (result.error || result.status !== 0) {
    throw new Error(
      "Telegram setup did not finish. Installation checks passed, but channel setup needs attention. Read the error above and retry: npm run telegram -- setup",
    );
  }
  return "connected";
}

async function askInTerminal(question) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const abort = new AbortController();
  terminal.once("SIGINT", () => abort.abort());
  terminal.once("close", () => abort.abort());
  try {
    return await terminal.question(question, { signal: abort.signal });
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error(
        "Onboarding cancelled. Telegram was not enabled. Retry later: npm run telegram -- setup",
      );
    throw error;
  } finally {
    terminal.close();
  }
}
