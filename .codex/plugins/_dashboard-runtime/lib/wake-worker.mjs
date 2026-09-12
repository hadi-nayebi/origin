import { parentPort, workerData } from "node:worker_threads";
import { deliverPendingWakes } from "./wake-outbox.mjs";
try {
  parentPort.postMessage({ result: await deliverPendingWakes(workerData, { maxDeliveries: 1 }) });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
