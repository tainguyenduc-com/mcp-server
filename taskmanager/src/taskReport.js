import { loadTasks, saveTasks } from "./storage.js";

export function reportTask(taskId, reportData) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.status === "in_progress") {
    task.status = "completed";
    task.completedAt = new Date().toISOString();
  }
  if (reportData.result !== undefined) task.result = reportData.result;
  if (reportData.error !== undefined) task.error = reportData.error;
  task.metadata = task.metadata || {};
  task.metadata.summary = reportData.summary || task.metadata.summary || "";
  task.updatedAt = new Date().toISOString();
  saveTasks(tasks);
  return {
    task,
    reportTo: task.reportTo,
    message: `Task ${taskId} completed. Report sent to ${task.reportTo || "orchestrator"}.`
  };
}
