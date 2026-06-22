import path from "node:path";

export function getTaskStoreDir() {
  const storeArg = process.argv[2];
  if (storeArg && !storeArg.includes('*') && !storeArg.startsWith('-')) {
    return path.resolve(storeArg);
  }
  if (process.env.TASK_STORE_DIR) {
    return path.resolve(process.env.TASK_STORE_DIR);
  }
  return path.join(process.cwd(), ".task");
}

export function getTasksFile() {
  return path.join(getTaskStoreDir(), "tasks.json");
}

export function getBackupDir() {
  return path.join(getTaskStoreDir(), "backups");
}

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
