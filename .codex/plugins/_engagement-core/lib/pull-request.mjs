import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { channelContext } from "./scope.mjs";
import {
  getFeedback,
  linkFeedbackWork,
  listFeedback,
  recordVersion,
  reviewFeedbackMutation,
} from "./service.mjs";
import {
  normalizePullRequestUrl,
  pullRequestReferences,
  pullRequestWorkReference,
  requirePullRequestReference,
  requireWorktreeReference,
} from "./work-reference.mjs";
export {
  normalizePullRequestUrl,
  pullRequestReferences,
  requirePullRequestReference,
} from "./work-reference.mjs";

export function findFeedbackByPullRequest(root, number) {
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error("Pull request number must be a positive integer.");
  const suffix = `/pull/${number}`;
  const matches = listFeedback(root).filter(
    (record) =>
      !record.mergedInto && pullRequestReferences(record).some((url) => url.endsWith(suffix)),
  );
  if (matches.length !== 1)
    throw new Error("The PR number must identify exactly one active Origin work unit.");
  return matches[0];
}

export function inspectPullRequest(repositoryRoot, url, options = {}) {
  const normalized = normalizePullRequestUrl(url);
  const expectedRepository = repositoryIdentity(repositoryRoot, options);
  const actualRepository = repositoryFromUrl(normalized);
  if (actualRepository.toLowerCase() !== expectedRepository.toLowerCase())
    throw new Error("The linked pull request must belong to this Origin repository.");
  const result = execute(
    repositoryRoot,
    "gh",
    [
      "pr",
      "view",
      normalized,
      "--json",
      "number,url,state,isDraft,headRefName,baseRefName,mergeable,mergedAt",
    ],
    options,
  );
  if (result.status !== 0)
    throw new Error("GitHub could not verify the linked pull request; run gh auth status.");
  let detail;
  try {
    detail = JSON.parse(result.stdout);
  } catch {
    throw new Error("GitHub returned an invalid pull request record.");
  }
  if (normalizePullRequestUrl(detail.url) !== normalized || detail.number < 1)
    throw new Error("GitHub returned a different pull request than requested.");
  return Object.freeze({ ...detail, url: normalized, repository: actualRepository });
}

export function linkPullRequest(root, id, url, options = {}) {
  const { root: repositoryRoot } = channelContext(root);
  const record = getFeedback(root, id);
  const branch = requireWorktreeReference(record);
  const detail = inspectPullRequest(repositoryRoot, url, options);
  if (detail.state !== "OPEN") throw new Error("Only an open pull request can be linked.");
  if (detail.headRefName !== branch)
    throw new Error("The pull request head must match this work unit's isolated branch.");
  return linkFeedbackWork(root, id, pullRequestWorkReference(detail.url));
}

export function prepareWorktree(root, id, options = {}) {
  const context = channelContext(root);
  const record = getFeedback(root, id);
  const suffix = crypto
    .createHash("sha256")
    .update(`${context.channel}:${record.id}`)
    .digest("hex")
    .slice(0, 12);
  const branch = `origin/${context.channel}/${suffix}`;
  const parent = path.join(context.root, ".origin", "worktrees", context.channel);
  const target = path.join(parent, suffix);
  assertPrivatePath(context.root, parent);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(target)) {
    let result = execute(
      context.root,
      "git",
      ["worktree", "add", "-b", branch, target, "HEAD"],
      options,
    );
    if (result.status !== 0)
      result = execute(context.root, "git", ["worktree", "add", target, branch], options);
    if (result.status !== 0)
      throw new Error("Git could not create the isolated worktree; inspect existing worktrees.");
  }
  const updated = linkFeedbackWork(root, record.id, `worktree:${branch}`);
  return Object.freeze({
    threadId: record.id,
    branch,
    path: target,
    repositoryRoot: context.root,
    record: updated,
  });
}

export function mergePullRequest(repositoryRoot, feedbackRoot, id, expectedVersion, options = {}) {
  const record = getFeedback(feedbackRoot, id);
  if (!/^[a-f0-9]{64}$/.test(expectedVersion || "") || recordVersion(record) !== expectedVersion)
    throw new Error("Thread changed since this merge was offered; review the current work unit.");
  if (record.status !== "ready_for_review")
    throw new Error("Only verified work that is ready for review can be merged.");
  const url = requirePullRequestReference(record);
  let detail = inspectPullRequest(repositoryRoot, url, options);
  if (detail.isDraft) throw new Error("Mark the pull request ready for review before merging it.");
  if (detail.state !== "MERGED") {
    if (detail.state !== "OPEN") throw new Error("The linked pull request is not open.");
    if (detail.mergeable === "CONFLICTING")
      throw new Error("The linked pull request has merge conflicts that must be repaired.");
    execute(repositoryRoot, "gh", ["pr", "merge", url, "--merge"], options);
    // The merge command may lose its terminal result after GitHub accepted it. The observed
    // remote state is authoritative and makes a user retry safe.
    detail = inspectPullRequest(repositoryRoot, url, options);
  }
  if (detail.state !== "MERGED" || !detail.mergedAt)
    throw new Error("GitHub did not confirm the pull request merge; the work unit remains open.");
  const acceptance = `User merged PR #${detail.number} at ${detail.mergedAt}.`;
  return reviewFeedbackMutation(feedbackRoot, id, "resolved", {
    expectedVersion,
    acceptance,
  });
}

function repositoryIdentity(root, options) {
  const result = execute(root, "git", ["remote", "get-url", "origin"], options);
  if (result.status !== 0) throw new Error("This clone does not have a readable origin remote.");
  const value = result.stdout.trim();
  const https = value.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
  const ssh = value.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/);
  const identity = (https || ssh)?.[1];
  if (!identity) throw new Error("Origin's pull-request workflow currently requires GitHub.");
  return identity;
}

function repositoryFromUrl(url) {
  const match = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\//);
  return match[1];
}

function execute(root, binary, args, options) {
  const runner = options.run || defaultRun;
  const result = runner(binary, args, { cwd: root });
  return {
    status: Number.isInteger(result?.status) ? result.status : 1,
    stdout: String(result?.stdout || ""),
    stderr: String(result?.stderr || ""),
  };
}

function defaultRun(binary, args, options) {
  return spawnSync(binary, args, {
    ...options,
    encoding: "utf8",
    shell: false,
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  });
}

function assertPrivatePath(root, target) {
  const boundary = path.resolve(root);
  const resolved = path.resolve(target);
  if (!resolved.startsWith(`${boundary}${path.sep}`))
    throw new Error("Worktree path must stay inside this clone's private runtime directory.");
  for (
    let current = path.dirname(resolved);
    current !== boundary;
    current = path.dirname(current)
  ) {
    try {
      if (fs.lstatSync(current).isSymbolicLink())
        throw new Error("Worktree path cannot traverse a symbolic link.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
