import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { directory } from "./storage.mjs";

export function captionChunks(text, limit = 900) {
  const chunks = [];
  let part = "";
  for (const word of text.split(/(\s+)/u)) {
    if (Array.from(part + word).length > limit && part.trim()) {
      chunks.push(part.trim());
      part = "";
    }
    const chars = Array.from(word);
    while (chars.length > limit) chunks.push(chars.splice(0, limit).join(""));
    part += chars.join("");
  }
  if (part.trim()) chunks.push(part.trim());
  if (!chunks.length) throw new Error("Speech text is empty.");
  return chunks;
}
export class LocalVoice {
  constructor(root, config) {
    this.root = root;
    this.config = config;
    this.sequence = 0;
    this.pending = new Map();
  }
  start() {
    if (this.child) return;
    const dir = directory(this.root);
    const python =
      this.config.python ||
      path.join(dir, "venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    if (!fs.existsSync(python))
      throw new Error("Local speech environment missing. Run npm run telegram -- install-voice.");
    const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../voice/worker.py");
    const child = (this.child = spawn(python, ["-u", script, "serve", "--root", dir], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    }));
    this.child.stderr.on("data", () => {}); // provider diagnostics can contain private transcript/sample paths
    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => {
      let value;
      try {
        value = JSON.parse(line);
      } catch {
        return;
      }
      const item = this.pending.get(value.id);
      if (!item) return;
      clearTimeout(item.timer);
      this.pending.delete(value.id);
      if (value.ok) item.resolve(value.result);
      else
        item.reject(
          Object.assign(
            new Error(`Local voice processing failed: ${value.error}`),
            value.error?.startsWith("GPU_BUSY:") ? { retryAfter: 30 } : {},
          ),
        );
    });
    const fail = () => {
      if (this.child !== child) return;
      this.child = null;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("Local speech worker stopped; retry the durable item."));
      }
      this.pending.clear();
    };
    this.fail = fail;
    this.child.stdin.on("error", fail);
    this.child.once("error", fail);
    this.child.once("exit", fail);
  }
  request(operation, detail) {
    this.start();
    if (this.pending.size >= 8)
      return Promise.reject(new Error("Local speech worker queue is full; retry later."));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.close();
      }, 15 * 60000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, operation, ...detail }) + "\n");
    });
  }
  transcribe(file) {
    return this.request("transcribe", { file });
  }
  render(text, output) {
    return this.request("render", { text, output });
  }
  close() {
    const child = this.child;
    if (!child) return;
    this.fail();
    child.kill("SIGTERM");
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 2000);
    timer.unref();
    child.once("exit", () => clearTimeout(timer));
  }
}
