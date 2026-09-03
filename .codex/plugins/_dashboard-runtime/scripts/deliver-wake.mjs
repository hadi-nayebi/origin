#!/usr/bin/env node
import path from "node:path";
import { deliverPendingWakes } from "../lib/wake-outbox.mjs";

const root = path.resolve(process.env.ORIGIN_REPOSITORY_ROOT || process.cwd());
deliverPendingWakes(root)
  .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
