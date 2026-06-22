import { loadTasks, saveTasks } from "./storage.js";
import { isValidTransition, VALID_TRANSITIONS } from "./taskValidation.js";

export function updateTask(taskId, updates) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (updates.status && updates.status !== task.status) {
    if (!isValidTransition(task.status, updates.status)) {
      throw new Error(
        `Invalid status transition: "${task.status}" → "${updates.status}". ` +
        `Allowed: [${VALID_TRANSITIONS[task.status].join(", ") || "none"}]`
      );
    }
    if (updates.status === "in_progress" && task.status === "pending") {
      task.startedAt = new Date().toISOString();
    }
    if (updates.status === "completed") {
      task.completedAt = new Date().toISOString();
    }
  }
  if (updates.status) task.status = updates.status;
  if (updates.progress !== undefined) task.progress = updates.progress;
  if (updates.result !== undefined) task.result = updates.result;
  if (updates.error !== undefined) task.error = updates.error;
  if (updates.assignedTo) task.assignedTo = updates.assignedTo;
  if (updates.priority) task.priority = updates.priority;
  if (updates.tags) task.tags = updates.tags;
  if (updates.context) task.context = { ...task.context, ...updates.context };
  if (updates.metadata) task.metadata = { ...task.metadata, ...updates.metadata };
  task.updatedAt = new Date().toISOString();
  saveTasks(tasks);
  return task;
}
