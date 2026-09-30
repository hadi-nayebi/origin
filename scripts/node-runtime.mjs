import path from "node:path";
import { pathToFileURL } from "node:url";

export const nodeRequirement = "Node.js 22.22.2+, 24.15.0+, or 26+ (supported release lines)";

export function supportsNode(version) {
  const match = String(version).match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  return (
    major >= 26 ||
    (major === 24 && minor >= 15) ||
    (major === 22 && (minor > 22 || (minor === 22 && patch >= 2)))
  );
}

export function assertNode(version = process.version) {
  if (!supportsNode(version))
    throw new Error(
      `Origin requires ${nodeRequirement}; found ${version}. Install a supported Node.js LTS from https://nodejs.org and rerun.`,
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    assertNode();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
