import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { channelDirectory } from "../../_engagement-core/lib/scope.mjs";

export const scopeFor = (root) => ({ root, channel: "telegram-engagement" });
export const directory = (root) => channelDirectory(scopeFor(root));
export function privateDirectory(dir) {
  for (
    let parent = path.resolve(dir);
    parent !== path.dirname(parent);
    parent = path.dirname(parent)
  ) {
    try {
      if (fs.lstatSync(parent).isSymbolicLink())
        throw new Error("Private directory cannot traverse a symlink.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  if (fs.lstatSync(dir).isSymbolicLink()) throw new Error("Private directory cannot be a symlink.");
}
export function atomicJSON(file, value) {
  privateDirectory(path.dirname(file));
  const temporary = `${file}.${crypto.randomUUID()}.next`;
  const fd = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, file);
}
export function readJSON(file, fallback) {
  try {
    const info = fs.lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error("Private record must be a regular file.");
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return structuredClone(fallback);
    throw error;
  }
}
export function acquireLease(dir, name) {
  privateDirectory(dir);
  const file = path.join(dir, `${name}.lock`);
  const token = crypto.randomUUID();
  for (let n = 0; n < 2; n++) {
    try {
      const fd = fs.openSync(file, "wx", 0o600);
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, host: os.hostname(), token }));
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      return () => {
        if (readJSON(file, {}).token === token) fs.unlinkSync(file);
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const owner = readJSON(file);
      if (owner.host !== os.hostname() || !Number.isInteger(owner.pid))
        throw new Error(`${name} has an unrecognized owner.`);
      try {
        process.kill(owner.pid, 0);
      } catch (probe) {
        if (probe.code === "ESRCH") {
          fs.unlinkSync(file);
          continue;
        }
      }
      throw new Error(`${name} is already running.`);
    }
  }
  throw new Error(`${name} ownership could not be acquired.`);
}
const empty = () => ({
  version: 1,
  offset: 0,
  botId: null,
  inbox: {},
  outbox: {},
  replies: {},
  callbacks: {},
  ownerActions: {},
  enrollment: null,
});
export function readTransport(root) {
  const value = readJSON(path.join(directory(root), "transport.json"), empty());
  if (
    value.version !== 1 ||
    !Number.isSafeInteger(value.offset) ||
    value.offset < 0 ||
    !["inbox", "outbox", "replies", "callbacks"].every(
      (key) => value[key] && typeof value[key] === "object" && !Array.isArray(value[key]),
    )
  )
    throw new Error("Telegram transport state is invalid.");
  value.ownerActions ||= {};
  if (typeof value.ownerActions !== "object" || Array.isArray(value.ownerActions))
    throw new Error("Telegram owner action state is invalid.");
  return value;
}
export function updateTransport(root, operation) {
  const dir = directory(root);
  let release;
  const wait = new Int32Array(new SharedArrayBuffer(4));
  for (let n = 0; n < 100; n++) {
    try {
      release = acquireLease(dir, "transport");
      break;
    } catch (error) {
      if (!error.message.includes("already running")) throw error;
      Atomics.wait(wait, 0, 0, 10);
    }
  }
  if (!release) throw new Error("Telegram transport is busy.");
  try {
    const state = readTransport(root);
    const result = operation(state);
    atomicJSON(path.join(dir, "transport.json"), state);
    return result;
  } finally {
    release();
  }
}
