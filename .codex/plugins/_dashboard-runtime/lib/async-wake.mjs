import { Worker } from "node:worker_threads";
// tmux observation is synchronous. Isolate it so Telegram polling, media and
// durable receipts keep progressing while the terminal is being inspected.
export function deliverAsyncWake(scope) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./wake-worker.mjs", import.meta.url), { workerData: scope });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("Wake observation timed out; inspect its durable outcome."));
    }, 30000);
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
