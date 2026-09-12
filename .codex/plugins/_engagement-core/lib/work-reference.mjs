const REFERENCE_PREFIX = "pull-request:";
const WORKTREE_PREFIX = "worktree:";

export function normalizePullRequestUrl(value) {
  if (typeof value !== "string") throw new Error("Pull request URL is required.");
  const match = value
    .trim()
    .match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)\/?$/);
  if (!match) throw new Error("Use a full public GitHub pull request URL.");
  return `https://github.com/${match[1]}/${match[2]}/pull/${match[3]}`;
}

export function pullRequestReferences(record) {
  return (record?.linkedWork || [])
    .filter((value) => typeof value === "string" && value.startsWith(REFERENCE_PREFIX))
    .map((value) => normalizePullRequestUrl(value.slice(REFERENCE_PREFIX.length)));
}

export function requirePullRequestReference(record) {
  const references = [...new Set(pullRequestReferences(record))];
  if (references.length !== 1)
    throw new Error("Exactly one linked GitHub pull request is required for this work unit.");
  return references[0];
}

export function pullRequestWorkReference(url) {
  return `${REFERENCE_PREFIX}${normalizePullRequestUrl(url)}`;
}

export function worktreeReferences(record) {
  return (record?.linkedWork || [])
    .filter((value) => typeof value === "string" && value.startsWith(WORKTREE_PREFIX))
    .map((value) => value.slice(WORKTREE_PREFIX.length));
}

export function requireWorktreeReference(record) {
  const references = [...new Set(worktreeReferences(record))];
  if (references.length !== 1 || !/^origin\/[a-z0-9-]+\/[a-f0-9]{12}$/.test(references[0]))
    throw new Error("Exactly one Origin-managed worktree branch is required for this work unit.");
  return references[0];
}
