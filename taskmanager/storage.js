import fs from "node:fs";
import { TASK_STORE_DIR, TASKS_FILE, BACKUP_DIR } from "./constants.js";

export function ensureDirectories() {
  if (!fs.existsSync(TASK_STORE_DIR)) {
    fs.mkdirSync(TASK_STORE_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

export function loadTasks() {
  ensureDirectories();
  try {
    if (fs.existsSync(TASKS_FILE)) {
      const raw = fs.readFileSync(TASKS_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`[taskmanager] Error loading tasks: ${err.message}`);
  }
  return [];
}

export function saveTasks(tasks) {
  ensureDirectories();
  const tmpFile = TASKS_FILE + ".tmp";
  try {
    const data = JSON.stringify(tasks, null, 2);
    fs.writeFileSync(tmpFile, data, "utf-8");
    console.log(`[taskmanager] Saved ${tasks.length} tasks`);
    fs.renameSync(tmpFile, TASKS_FILE);
    return true;
  } catch (err) {
    console.error(`[taskmanager] Error saving tasks: ${err.message}`);
    return false;
  }
}

export function backupTasks(tasks) {
  ensureDirectories();
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = `${BACKUP_DIR}/tasks-${timestamp}.json`;
    fs.writeFileSync(backupFile, JSON.stringify(tasks, null, 2), "utf-8");
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith("tasks-"))
      .sort()
      .reverse();
    if (backups.length > 50) {
      for (const old of backups.slice(50)) {
        fs.unlinkSync(`${BACKUP_DIR}/${old}`);
      }
    }
  } catch (err) {
    console.error(`[taskmanager] Backup error: ${err.message}`);
  }
}
