#!/usr/bin/env node
import path from "node:path";
import { runFeedbackLoop } from "../lib/delivery.mjs";

const root = path.resolve(process.env.ORIGIN_REPOSITORY_ROOT || process.cwd());
runFeedbackLoop(root)
  .then((result) => {
    if (result.state === "active") process.exitCode = 1;
  })
  .catch((error) => {
    process.stderr.write(`Origin feedback runner failed: ${error.message}\n`);
    process.exitCode = 1;
  });
