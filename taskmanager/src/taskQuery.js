import { loadTasks } from "./storage.js";

function priorityOrder(priority) {
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  return order[priority] ?? 99;
}

export function listTasks(filter = {}) {
  let tasks = loadTasks();
  if (filter.status) {
    const statuses = filter.status.split(",");
    tasks = tasks.filter(t => statuses.includes(t.status));
  }
  if (filter.assignedTo) tasks = tasks.filter(t => t.assignedTo === filter.assignedTo);
  if (filter.createdBy) tasks = tasks.filter(t => t.createdBy === filter.createdBy);
  if (filter.priority) tasks = tasks.filter(t => t.priority === filter.priority);
  if (filter.tag) tasks = tasks.filter(t => t.tags.includes(filter.tag));
  if (filter.parentTaskId !== undefined) {
    if (filter.parentTaskId === "null" || filter.parentTaskId === "") {
      tasks = tasks.filter(t => !t.parentTaskId);
    } else {
      tasks = tasks.filter(t => t.parentTaskId === filter.parentTaskId);
    }
  }
  if (filter.search) {
    const q = filter.search.toLowerCase();
    tasks = tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.description || "").toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
    );
  }
  tasks.sort((a, b) => {
    const pDiff = priorityOrder(a.priority) - priorityOrder(b.priority);
    if (pDiff !== 0) return pDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const limit = filter.limit ? parseInt(filter.limit, 10) : 50;
  const offset = filter.offset ? parseInt(filter.offset, 10) : 0;
  return tasks.slice(offset, offset + limit);
}

export function getTask(taskId) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  return task;
}

export function findAvailableTasks(agentName, tags = [], parentTaskId = null) {
  let tasks = loadTasks();
  tasks = tasks.filter(t => t.status === "pending" || t.status === "paused");
  if (agentName) tasks = tasks.filter(t => !t.assignedTo || t.assignedTo === agentName);
  if (tags.length > 0) tasks = tasks.filter(t => tags.some(tag => t.tags.includes(tag)));
  if (parentTaskId === "null" || parentTaskId === "") {
    tasks = tasks.filter(t => !t.parentTaskId);
  } else if (parentTaskId) {
    tasks = tasks.filter(t => t.parentTaskId === parentTaskId);
  }
  tasks.sort((a, b) => {
    const pDiff = priorityOrder(a.priority) - priorityOrder(b.priority);
    if (pDiff !== 0) return pDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  return tasks.slice(0, 20);
}

export function getTaskStats() {
  const tasks = loadTasks();
  const byStatus = {};
  const byPriority = {};
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
  }
  return { total: tasks.length, byStatus, byPriority };
}
