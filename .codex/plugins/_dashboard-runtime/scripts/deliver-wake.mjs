#!/usr/bin/env node
import path from "node:path";
import { retryWakeDelivery, reconcileWake } from "../lib/wake-outbox.mjs";

const root = path.resolve(process.env.ORIGIN_REPOSITORY_ROOT || process.cwd());
(process.argv[2] === "reconcile"
  ? Promise.resolve(
      reconcileWake(
        process.argv[3] === "telegram-engagement" ? { root, channel: "telegram-engagement" } : root,
        process.argv[4],
        process.argv[5] === "submitted",
        process.argv.slice(6).join(" "),
      ),
    )
  : retryWakeDelivery(root)
)
  .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
