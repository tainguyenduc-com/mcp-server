import { loadTasks, saveTasks } from "./storage.js";

export function getSubtasks(parentTaskId) {
  const tasks = loadTasks();
  return tasks.filter(t => t.parentTaskId === parentTaskId);
}

export function getAncestors(taskId) {
  const tasks = loadTasks();
  const ancestors = [];
  let current = tasks.find(t => t.id === taskId);
  while (current?.parentTaskId) {
    const parent = tasks.find(t => t.id === current.parentTaskId);
    if (parent) {
      ancestors.unshift(parent);
      current = parent;
    } else break;
  }
  return ancestors;
}

export function getTaskTree(taskId) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  function buildNode(node) {
    const children = tasks.filter(t => t.parentTaskId === node.id).map(child => buildNode(child));
    let agg = null;
    if (children.length > 0) {
      const total = children.length;
      const done = children.filter(c => c.status === "completed").length;
      const failed = children.filter(c => c.status === "failed").length;
      const inProgress = children.filter(c => c.status === "in_progress").length;
      const pending = children.filter(c => c.status === "pending").length;
      const paused = children.filter(c => c.status === "paused").length;
      agg = { totalChildren: total, completed: done, failed, inProgress, pending, paused, progress: total > 0 ? Math.round((done / total) * 100) : 0 };
    }
    return { ...node, subtaskCount: children.length, subtaskSummary: agg, subtasks: children.length > 0 ? children : undefined };
  }
  return buildNode(task);
}

export function autoUpdateParentProgress(taskId, visited = new Set()) {
  if (visited.has(taskId)) return;
  visited.add(taskId);
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task || !task.parentTaskId) return;
  const parent = tasks.find(t => t.id === task.parentTaskId);
  if (!parent) return;
  const children = tasks.filter(t => t.parentTaskId === parent.id);
  if (children.length === 0) return;
  const total = children.length;
  const done = children.filter(c => c.status === "completed").length;
  const failed = children.filter(c => c.status === "failed").length;
  const inProgress = children.filter(c => c.status === "in_progress").length;
  parent.progress = Math.round((done / total) * 100);
  if (done === total) {
    parent.status = "completed";
    parent.completedAt = parent.completedAt || new Date().toISOString();
  } else if (failed > 0 && done + failed === total) {
    parent.status = "completed";
    parent.completedAt = parent.completedAt || new Date().toISOString();
  } else if (inProgress > 0 || done > 0) {
    parent.status = "in_progress";
    parent.startedAt = parent.startedAt || new Date().toISOString();
  }
  parent.updatedAt = new Date().toISOString();
  saveTasks(tasks);
  autoUpdateParentProgress(parent.id, visited);
}
