import { v4 as uuidv4 } from "uuid";
import { VALID_PRIORITIES } from "./taskValidation.js";
import { loadTasks, saveTasks, backupTasks } from "./storage.js";
import { getTasksFile, getBackupDir } from "./constants.js";
import fs from "node:fs";
import path from "node:path";

function collectDescendantIds(tasks, parentId) {
  const ids = [];
  for (const t of tasks) {
    if (t.parentTaskId === parentId) {
      ids.push(t.id);
      ids.push(...collectDescendantIds(tasks, t.id));
    }
  }
  return ids;
}

export function createTask(input) {
  if (!input.title || input.title.trim() === "") {
    throw new Error("Task title cannot be empty");
  }
  if (input.priority && !VALID_PRIORITIES.includes(input.priority)) {
    throw new Error(`Invalid priority: ${input.priority}`);
  }
  if (input.id && !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(input.id)) {
    throw new Error(`Invalid UUID format for task ID: ${input.id}`);
  }
  const tasks = loadTasks();
  const task = {
    id: input.id || uuidv4(),
    title: input.title,
    description: input.description || "",
    status: "pending",
    priority: input.priority || "medium",
    assignedTo: input.assignedTo || null,
    createdBy: input.createdBy || "unknown",
    parentTaskId: input.parentTaskId || null,
    tags: input.tags || [],
    context: input.context || {},
    progress: input.progress !== undefined ? input.progress : 0,
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    reportTo: input.reportTo || null,
    metadata: input.metadata || {},
  };
  tasks.push(task);
  saveTasks(tasks);
  backupTasks(tasks);
  return task;
}

export function deleteTask(taskId) {
  const tasks = loadTasks();
  const index = tasks.findIndex(t => t.id === taskId);
  if (index === -1) throw new Error(`Task not found: ${taskId}`);
  const deleted = tasks[index];
  backupTasks(tasks);
  const descendantIds = collectDescendantIds(tasks, taskId);
  const all = [taskId, ...descendantIds];
  const remaining = tasks.filter(t => !all.includes(t.id));
  saveTasks(remaining);
  return { deleted, subtaskCount: descendantIds.length, subtaskIds: descendantIds };
}
