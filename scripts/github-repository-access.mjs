import { spawnSync } from "node:child_process";

const writablePermissions = new Set(["ADMIN", "MAINTAIN", "WRITE"]);

export function inspectGitHubRepositoryAccess({ cwd, run = spawnSync } = {}) {
  const result = run("gh", ["repo", "view", "--json", "nameWithOwner,viewerPermission"], {
    cwd,
    encoding: "utf8",
    shell: false,
  });
  const output = String(
    result.stdout || result.stderr || "GitHub repository access is unavailable.",
  )
    .trim()
    .slice(0, 500);
  if (result.status !== 0) {
    return {
      name: "GitHub repository write access",
      ok: false,
      detail: output,
    };
  }
  try {
    const repository = JSON.parse(result.stdout);
    const permission = String(repository.viewerPermission || "UNKNOWN").toUpperCase();
    const name = String(repository.nameWithOwner || "current repository");
    const ok = writablePermissions.has(permission);
    return {
      name: "GitHub repository write access",
      ok,
      detail: ok
        ? `${name} — ${permission}`
        : `${name} — ${permission}. Create your own repository from the Origin template, clone it, and authenticate an account with write and merge permission.`,
    };
  } catch {
    return {
      name: "GitHub repository write access",
      ok: false,
      detail: "GitHub returned malformed repository-permission data.",
    };
  }
}
