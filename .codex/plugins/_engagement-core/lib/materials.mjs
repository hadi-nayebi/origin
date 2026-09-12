import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { channelDirectory } from "./scope.mjs";
import { bounded } from "./contracts.mjs";
import { addFeedbackMessageMutation, getFeedback, recordVersion } from "./service.mjs";

export const MAX_MATERIAL_BYTES = 20 * 1024 * 1024;
function location(scope, id) {
  if (!/^material-[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid material ID.");
  return path.join(channelDirectory(scope), "materials", id);
}
function assertDirectory(dir) {
  for (let p = path.resolve(dir); p !== path.dirname(p); p = path.dirname(p)) {
    if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink())
      throw new Error("Invalid symbolic material directory.");
  }
}
function privateDirectory(dir) {
  assertDirectory(dir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
}
function readRegular(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Invalid material file.");
  return fs.readFileSync(file);
}
export function attachMaterial(scope, threadId, name, bytes, options = {}) {
  getFeedback(scope, threadId);
  const safeName = bounded(name, "Material name", 1, 200);
  if (/[\\/\r\n]/.test(safeName)) throw new Error("Invalid material name.");
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_MATERIAL_BYTES)
    throw new Error("Material exceeds the 20 MiB limit.");
  const id = `material-${crypto.randomUUID()}`;
  const dir = location(scope, id);
  privateDirectory(dir);
  const metadata = {
    id,
    name: safeName,
    size: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
  // Complete immutable private files before the journal makes the material visible.
  for (const [name, data] of [
    ["content", bytes],
    ["metadata.json", JSON.stringify(metadata)],
  ]) {
    const fd = fs.openSync(path.join(dir, name), "wx", 0o600);
    try {
      fs.writeFileSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
  const result = addFeedbackMessageMutation(
    scope,
    threadId,
    { body: options.body || `Material: ${safeName}`, role: options.role || "user" },
    { role: options.role || "user", messageId: id },
  );
  return { ...result, material: metadata };
}
export function materialForThread(scope, threadId, id, { metadataOnly = false } = {}) {
  const record = getFeedback(scope, threadId);
  if (!record.messages.some((m) => m.id === id))
    throw new Error("Material not found in this thread.");
  const dir = location(scope, id);
  assertDirectory(dir);
  const metadata = JSON.parse(readRegular(path.join(dir, "metadata.json")));
  bounded(metadata.name, "Material name", 1, 200);
  const content = path.join(dir, "content");
  const info = fs.lstatSync(content);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size !== metadata.size ||
    info.size > MAX_MATERIAL_BYTES ||
    metadata.id !== id
  )
    throw new Error("Material integrity check failed.");
  if (metadataOnly) return { ...metadata, localPath: content };
  const bytes = readRegular(content);
  if (
    metadata.id !== id ||
    metadata.size !== bytes.length ||
    metadata.sha256 !== crypto.createHash("sha256").update(bytes).digest("hex")
  )
    throw new Error("Material integrity check failed.");
  return { ...metadata, bytes, localPath: path.join(dir, "content") };
}
export function threadView(scope, record, { localPaths = false } = {}) {
  return {
    ...record,
    version: recordVersion(record),
    messages: record.messages.map((message) => {
      if (!message.id.startsWith("material-")) return message;
      try {
        const {
          bytes: _bytes,
          localPath,
          ...material
        } = materialForThread(scope, record.id, message.id, { metadataOnly: true });
        return { ...message, material: { ...material, ...(localPaths ? { localPath } : {}) } };
      } catch {
        return {
          ...message,
          material: {
            id: message.id,
            error: "Material is missing or corrupt; restore the private file before review.",
          },
        };
      }
    }),
  };
}
