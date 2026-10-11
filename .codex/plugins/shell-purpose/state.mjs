import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  openSync,
  closeSync,
  fsyncSync,
  lstatSync,
  realpathSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";

export const STATE_VERSION = 1;
export const MAX_TRANSACTIONS = 256;
export const MAX_CANDIDATES = 128;
export const MAX_STATE_BYTES = 1_000_000;

const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

export function statePath(environment = process.env, cwd = process.cwd()) {
  return resolve(
    environment.ORIGIN_SHELL_PURPOSE_STATE || resolve(cwd, ".origin/shell-purpose/data.json"),
  );
}

export function emptyState(policy) {
  return {
    version: STATE_VERSION,
    sequence: 0,
    policy: { version: policy.version, revision: policy.revision },
    transactions: [],
    candidates: { families: {}, executables: {}, shapes: {} },
  };
}

export function loadPolicy(path = new URL("./policy.json", import.meta.url)) {
  const policy = JSON.parse(readFileSync(path, "utf8"));
  if (
    policy?.version !== 1 ||
    typeof policy.revision !== "string" ||
    !Array.isArray(policy.promotedShapes) ||
    !Array.isArray(policy.promotedExecutables) ||
    !policy.promotedShapes.every((value) => typeof value === "string") ||
    !policy.promotedExecutables.every((value) => typeof value === "string")
  )
    throw new Error("Invalid shell-purpose policy");
  return policy;
}

export function loadState(path, policy) {
  let parsed;
  try {
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink())
      throw new Error("Shell-purpose state must be a regular, non-symbolic file");
    if (metadata.size > MAX_STATE_BYTES) throw new Error("Shell-purpose state is too large");
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return emptyState(policy);
    throw new Error("Shell-purpose state is unavailable or corrupt", { cause: error });
  }
  if (
    parsed?.version !== STATE_VERSION ||
    !Number.isSafeInteger(parsed.sequence) ||
    parsed.sequence < 0 ||
    !Array.isArray(parsed.transactions) ||
    parsed.transactions.length > MAX_TRANSACTIONS ||
    !parsed.candidates ||
    typeof parsed.candidates !== "object" ||
    Array.isArray(parsed.candidates) ||
    ["families", "executables", "shapes"].some((key) => {
      const values = parsed.candidates[key];
      return (
        values !== undefined &&
        (typeof values !== "object" ||
          Array.isArray(values) ||
          Object.keys(values).length > MAX_CANDIDATES)
      );
    })
  )
    throw new Error("Shell-purpose state is unavailable or corrupt");
  parsed.candidates.families ??= {};
  parsed.candidates.executables ??= {};
  parsed.candidates.shapes ??= {};
  parsed.policy = { version: policy.version, revision: policy.revision };
  return parsed;
}

function privateDirectory(directory) {
  const resolvedDirectory = resolve(directory);
  const temporaryRoot = resolve(tmpdir());
  const canonicalTemporaryRoot = realpathSync.native(temporaryRoot);
  // macOS exposes its trusted temporary root through /var -> /private/var.
  // Canonicalize only that OS-owned prefix; preserve the remaining path so a
  // caller-controlled symbolic ancestor below the temporary root is rejected.
  const inspectionDirectory =
    resolvedDirectory === temporaryRoot || resolvedDirectory.startsWith(`${temporaryRoot}${sep}`)
      ? `${canonicalTemporaryRoot}${resolvedDirectory.slice(temporaryRoot.length)}`
      : resolvedDirectory;
  for (
    let current = inspectionDirectory;
    current !== dirname(current);
    current = dirname(current)
  ) {
    try {
      if (lstatSync(current).isSymbolicLink())
        throw new Error("Shell-purpose state path cannot traverse a symbolic link");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  mkdirSync(resolvedDirectory, { recursive: true, mode: 0o700 });
  chmodSync(resolvedDirectory, 0o700);
}

function boundedCandidates(values) {
  const entries = Object.entries(values)
    .sort((a, b) => b[1].lastSequence - a[1].lastSequence)
    .slice(0, MAX_CANDIDATES);
  return Object.fromEntries(entries);
}

function observeCandidate(values, key, sequence) {
  if (!key) return;
  const current = values[key] ?? { observations: 0, firstSequence: sequence };
  current.observations += 1;
  current.lastSequence = sequence;
  values[key] = current;
}

export function appendTransaction(state, transaction) {
  const sequence = state.sequence + 1;
  const record = { id: sequence, ...transaction };
  state.sequence = sequence;
  state.transactions.push(record);
  state.transactions = state.transactions.slice(-MAX_TRANSACTIONS);
  for (const family of new Set(transaction.classification?.segments?.map((part) => part.family)))
    observeCandidate(state.candidates.families, family, sequence);
  for (const executable of new Set(
    transaction.classification?.segments?.map((part) => part.executable).filter(Boolean),
  ))
    observeCandidate(state.candidates.executables, executable, sequence);
  observeCandidate(state.candidates.shapes, transaction.classification?.shape, sequence);
  state.candidates.families = boundedCandidates(state.candidates.families);
  state.candidates.executables = boundedCandidates(state.candidates.executables);
  state.candidates.shapes = boundedCandidates(state.candidates.shapes);
  return record;
}

function acquireLock(lockPath, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      mkdirSync(lockPath);
      return;
    } catch (error) {
      if (error?.code !== "EEXIST" || Date.now() >= deadline)
        throw new Error("Shell-purpose state lock is unavailable", { cause: error });
      Atomics.wait(sleepBuffer, 0, 0, 15);
    }
  }
}

export function persistTransaction(path, policy, transaction) {
  privateDirectory(dirname(path));
  const lockPath = `${path}.lock`;
  acquireLock(lockPath);
  try {
    const state = loadState(path, policy);
    const record = appendTransaction(state, transaction);
    const temporary = `${path}.${process.pid}.${record.id}.tmp`;
    const descriptor = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(descriptor, `${JSON.stringify(state, null, 2)}\n`, "utf8");
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, path);
    return record;
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

export function commandDigest(command) {
  return typeof command === "string" ? createHash("sha256").update(command).digest("hex") : null;
}
