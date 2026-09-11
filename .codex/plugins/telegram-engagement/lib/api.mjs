import fs from "node:fs";
import path from "node:path";
import { privateDirectory } from "./storage.mjs";

export class TelegramError extends Error {
  constructor(message, { retryAfter = 0, uncertain = false, code = 0 } = {}) {
    super(message);
    Object.assign(this, { retryAfter, uncertain, code });
  }
}
export class BotAPI {
  constructor(token, fetcher = fetch) {
    this.token = token;
    this.fetch = fetcher;
  }
  async call(method, payload = {}, { signal, timeout = 45000, multipart = false } = {}) {
    let response;
    try {
      response = await this.fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: "POST",
        body: multipart ? payload : JSON.stringify(payload),
        headers: multipart ? undefined : { "content-type": "application/json" },
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
          : AbortSignal.timeout(timeout),
      });
      const value = await response.json();
      if (!value.ok)
        throw new TelegramError(
          `Telegram ${method} rejected the request (${value.error_code || response.status}).`,
          {
            code: value.error_code || response.status,
            retryAfter: value.parameters?.retry_after || 0,
          },
        );
      return value.result;
    } catch (error) {
      if (error instanceof TelegramError) throw error;
      // Fetch errors may contain the token-bearing request URL. Never forward them.
      throw new TelegramError(`Telegram ${method} delivery outcome is unknown.`, {
        uncertain: true,
      });
    }
  }
  async verify(config) {
    const me = await this.call("getMe");
    if (String(me.id) !== config.botId)
      throw new Error("Bot identity does not match this clone's binding.");
    const hook = await this.call("getWebhookInfo");
    if (hook.url)
      throw new Error(
        "This bot has a webhook. Use a dedicated bot; setup will not delete another consumer.",
      );
    return me;
  }
  updates(offset, signal) {
    return this.call(
      "getUpdates",
      { offset, timeout: 25, allowed_updates: ["message", "edited_message", "callback_query"] },
      { signal },
    );
  }
  async download(fileId, destination, limit, signal) {
    const file = await this.call("getFile", { file_id: fileId }, { signal });
    if (!file.file_path || !/^[\w./-]+$/.test(file.file_path) || file.file_path.includes(".."))
      throw new Error("Telegram returned an invalid file path.");
    if (file.file_size > limit)
      throw new Error(
        "Attachment exceeds configured download capacity; original Telegram metadata is preserved.",
      );
    privateDirectory(path.dirname(destination));
    const temporary = destination + ".partial";
    let fd;
    try {
      const response = await this.fetch(
        `https://api.telegram.org/file/bot${this.token}/${file.file_path}`,
        {
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(120000)])
            : AbortSignal.timeout(120000),
        },
      );
      if (!response.ok || !response.body) throw new Error("download rejected");
      fd = fs.openSync(temporary, "w", 0o600);
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > limit) throw new Error("download capacity exceeded");
        fs.writeSync(fd, chunk);
      }
      if (!bytes || (file.file_size && bytes !== file.file_size))
        throw new Error("incomplete download");
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(temporary, destination);
      return destination;
    } catch {
      throw new Error("Attachment download failed; the durable item remains retryable.");
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  }
  async sendFile(method, field, file, config, extra = {}, options = {}) {
    const form = new FormData();
    form.set("chat_id", config.chatId);
    for (const [key, value] of Object.entries(extra))
      if (value !== undefined)
        form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    form.set(field, new Blob([fs.readFileSync(file)]), path.basename(file));
    return this.call(method, form, { multipart: true, timeout: 180000, signal: options.signal });
  }
}
