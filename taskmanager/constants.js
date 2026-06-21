// constants.js
import path from "node:path";
import { fileURLToPath } from "node:url";

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);

export const TASK_STORE_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : process.env.TASK_STORE_DIR 
    ? path.resolve(process.env.TASK_STORE_DIR)
    : path.join(process.cwd(), ".task");
export const TASKS_FILE = path.join(TASK_STORE_DIR, "tasks.json");
export const BACKUP_DIR = path.join(TASK_STORE_DIR, "backups");

export const VALID_STATUSES = ["pending", "in_progress", "paused", "completed", "failed", "cancelled"];
export const VALID_PRIORITIES = ["low", "medium", "high", "critical"];
export const VALID_TRANSITIONS = {
  "pending":     ["in_progress", "cancelled"],
  "in_progress": ["completed", "failed", "paused", "cancelled"],
  "paused":      ["in_progress", "cancelled"],
  "completed":   [],
  "failed":      ["in_progress"],
  "cancelled":   [],
};
