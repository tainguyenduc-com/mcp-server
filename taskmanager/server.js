#!/usr/bin/env node
import { main } from "./index.js";

// CLI args: --cleanup-interval=MS --cleanup-max-age=MS
const args = process.argv.slice(2);
args.forEach(arg => {
  if (arg.startsWith("--cleanup-interval=")) {
    process.env.TASK_CLEANUP_INTERVAL_MS = arg.split("=")[1];
  } else if (arg.startsWith("--cleanup-max-age=")) {
    process.env.TASK_CLEANUP_MAX_AGE_MS = arg.split("=")[1];
  }
});

main().catch(err => {
  console.error("[taskmanager] Fatal error:", err);
  process.exit(1);
});
