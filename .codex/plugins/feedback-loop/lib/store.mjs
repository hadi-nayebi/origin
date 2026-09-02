import fs from "node:fs";
import path from "node:path";
import { applyEvent } from "./policy.mjs";
const waitArray = new Int32Array(new SharedArrayBuffer(4));

export function readFeedbackState(repositoryRoot) {
  const file = ledgerPath(repositoryRoot); if (!fs.existsSync(file)) return new Map();
  const records = new Map(); const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) { let event; try { event = JSON.parse(lines[index]); } catch { throw new Error(`Feedback ledger is corrupt at line ${index + 1}.`); } try { applyEvent(records, event); } catch (error) { throw new Error(`Feedback ledger is invalid at line ${index + 1}: ${error.message}`); } }
  return records;
}

export function appendFeedbackEvent(repositoryRoot, createEvent) {
  const directory = runtimeDirectory(repositoryRoot); fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return withLock(directory, () => {
    const records = readFeedbackState(repositoryRoot); const event = createEvent(new Map(records)); applyEvent(records, event);
    const file = ledgerPath(repositoryRoot); const prior = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""; const next = path.join(directory, "feedback.next");
    fs.writeFileSync(next, `${prior}${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 }); fs.renameSync(next, file); return { event, records };
  });
}

function withLock(directory, operation) {
  const lock = path.join(directory, "feedback.lock"); let descriptor;
  for (let attempt = 0; attempt < 100; attempt += 1) { try { descriptor = fs.openSync(lock, "wx", 0o600); break; } catch (error) { if (error.code !== "EEXIST") throw error; try { if (Date.now() - fs.statSync(lock).mtimeMs > 30_000) fs.unlinkSync(lock); } catch {} Atomics.wait(waitArray, 0, 0, 10); } }
  if (descriptor === undefined) throw new Error("Feedback ledger is busy.");
  try { return operation(); } finally { fs.closeSync(descriptor); try { fs.unlinkSync(lock); } catch {} }
}
function runtimeDirectory(root) { return path.join(path.resolve(root), ".origin"); }
function ledgerPath(root) { return path.join(runtimeDirectory(root), "feedback.jsonl"); }

