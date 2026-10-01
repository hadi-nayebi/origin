import { Worker } from "node:worker_threads";
import { WAKE_OBSERVATION_BUDGET_MS } from "./codex-wake-v1.mjs";

// Paste and submission each get an observation phase. Allow worker startup,
// terminal commands and durable receipt writes beyond both phases.
const WORKER_TIMEOUT_MS = 2 * WAKE_OBSERVATION_BUDGET_MS + 15_000;
// tmux observation is synchronous. Isolate it so Telegram polling, media and
// durable receipts keep progressing while the terminal is being inspected.
export function deliverAsyncWake(scope, options = {}) {
  return new Promise((resolve, reject) => {
    const worker = options.workerFactory
      ? options.workerFactory(scope)
      : new Worker(new URL("./wake-worker.mjs", import.meta.url), { workerData: scope });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("Wake observation timed out; inspect its durable outcome."));
    }, WORKER_TIMEOUT_MS);
    worker.once("message", (value) => {
      clearTimeout(timer);
      if (value.error) reject(new Error(value.error));
      else resolve(value.result);
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.once("exit", (code) => {
      clearTimeout(timer);
      if (code) reject(new Error("Wake worker exited; inspect the durable outcome."));
    });
  });
}
