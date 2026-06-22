import { loadTasks, saveTasks } from "./storage.js";

export function claimTask(taskId, agentName) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.status !== "pending") {
    throw new Error(`Task ${taskId} has status "${task.status}", expected "pending"`);
  }
  if (task.assignedTo && task.assignedTo !== agentName) {
    throw new Error(`Task ${taskId} is already assigned to "${task.assignedTo}"`);
  }
  task.status = "in_progress";
  task.assignedTo = agentName;
  task.startedAt = new Date().toISOString();
  task.updatedAt = new Date().toISOString();
  saveTasks(tasks);
  return task;
}
