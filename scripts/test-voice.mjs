import { spawnSync } from "node:child_process";
const result = spawnSync(
  process.env.ORIGIN_PYTHON || (process.platform === "win32" ? "python" : "python3"),
  [".codex/plugins/telegram-engagement/tests/voice_worker_test.py"],
  { stdio: "inherit", shell: false },
);
if (result.error) console.error("Python 3 is required for the speech boundary tests.");
process.exitCode = result.status ?? 1;
