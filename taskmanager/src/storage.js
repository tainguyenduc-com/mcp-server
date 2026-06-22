import fs from "node:fs";
import { getTaskStoreDir, getTasksFile, getBackupDir } from "./constants.js";

export function ensureDirectories() {
  const dir = getTaskStoreDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
}

export function loadTasks() {
  ensureDirectories();
  try {
    const file = getTasksFile();
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`[taskmanager] Error loading tasks: ${err.message}`);
  }
  return [];
}

export function saveTasks(tasks) {
  ensureDirectories();
  const file = getTasksFile();
  const tmpFile = file + ".tmp";
  try {
    const data = JSON.stringify(tasks, null, 2);
    fs.writeFileSync(tmpFile, data, "utf-8");
    console.log(`[taskmanager] Saved ${tasks.length} tasks`);
    fs.renameSync(tmpFile, file);
    return true;
  } catch (err) {
    console.error(`[taskmanager] Error saving tasks: ${err.message}`);
    return false;
  }
}

export function backupTasks(tasks) {
  ensureDirectories();
  try {
    const backupDir = getBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = `${backupDir}/tasks-${timestamp}.json`;
    fs.writeFileSync(backupFile, JSON.stringify(tasks, null, 2), "utf-8");
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith("tasks-"))
      .sort()
      .reverse();
    if (backups.length > 50) {
      for (const old of backups.slice(50)) {
        fs.unlinkSync(`${backupDir}/${old}`);
      }
    }
  } catch (err) {
    console.error(`[taskmanager] Backup error: ${err.message}`);
  }
}
