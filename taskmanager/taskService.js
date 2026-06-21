import { v4 as uuidv4 } from "uuid";
import { VALID_PRIORITIES, VALID_TRANSITIONS } from "./constants.js";
import { loadTasks, saveTasks, backupTasks, ensureDirectories } from "./storage.js";
import fs from "node:fs";
import { TASK_STORE_DIR, TASKS_FILE, BACKUP_DIR } from "./constants.js";

function isValidTransition(currentStatus, newStatus) {
  return VALID_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}

export function deleteTask(taskId) {
  const tasks = loadTasks();
  const index = tasks.findIndex(t => t.id === taskId);
  if (index === -1) throw new Error(`Task not found: ${taskId}`);
  const deleted = tasks[index];
  backupTasks(tasks);
  function collectDescendantIds(parentId) {
    const ids = [];
    for (const t of tasks) {
      if (t.parentTaskId === parentId) {
        ids.push(t.id);
        ids.push(...collectDescendantIds(t.id));
      }
    }
    return ids;
  }
  const descendantIds = collectDescendantIds(taskId);
  const all = [taskId, ...descendantIds];
  const remaining = tasks.filter(t => !all.includes(t.id));
  saveTasks(remaining);
  console.log(`[taskmanager] Deleted task ID=${taskId} and ${descendantIds.length} subtask(s)`);
  return { deleted, subtaskCount: descendantIds.length, subtaskIds: descendantIds };
}

export function emptyTasks(confirm) {
  if (!confirm) {
    throw new Error('Confirmation required to delete .task folder contents');
  }
  // backup current tasks
  backupTasks(loadTasks());

  let deletedTasksCount = 0;
  let backupsRemoved = 0;

  // delete tasks.json
  if (fs.existsSync(TASKS_FILE)) {
    try {
      fs.unlinkSync(TASKS_FILE);
      deletedTasksCount++;
    } catch (e) {
      console.error(`[taskmanager] Failed to delete tasks file: ${e.message}`);
    }
  }

  // clean backups directory
  if (fs.existsSync(BACKUP_DIR)) {
    try {
      const backupFiles = fs.readdirSync(BACKUP_DIR);
      for (const f of backupFiles) {
        fs.unlinkSync(path.join(BACKUP_DIR, f));
      }
      fs.rmdirSync(BACKUP_DIR);
      backupsRemoved = 1;
    } catch (e) {
      console.error(`[taskmanager] Failed to clean backups: ${e.message}`);
    }
  }

  // ensure backups folder exists
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  } catch (e) {
    console.error(`[taskmanager] Failed to recreate backups dir: ${e.message}`);
  }

  return {
    message: 'Task store emptied',
    deletedTasksCount,
    backupsRemoved,
  };
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
  console.log(`[taskmanager] Created task ID=${task.id}`);
  return task;
}

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
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  tasks.sort((a, b) => {
    const pDiff = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
    if (pDiff !== 0) return pDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const limit = filter.limit ? parseInt(filter.limit, 10) : 50;
  const offset = filter.offset ? parseInt(filter.offset, 10) : 0;
  return tasks.slice(offset, offset + limit);
}

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

export function getTask(taskId) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  console.log(`[taskmanager] Retrieved task ID=${task.id}`);
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
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  tasks.sort((a, b) => {
    const pDiff = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
    if (pDiff !== 0) return pDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  return tasks.slice(0, 20);
}

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

/**
 * Delete tasks by status (and optional age).
 * @param {string} status - task status to match.
 * @param {string|undefined} olderThan - ISO date string; only delete tasks created before this.
 * @returns {{deletedCount:number}} count of deleted tasks.
 */
export function deleteTasksByStatus(status, olderThan) {
  if (!status) throw new Error('Status required');
  const tasks = loadTasks();
  const now = new Date();
  const cutoff = olderThan ? new Date(olderThan) : null;
  if (cutoff && isNaN(cutoff)) throw new Error('Invalid olderThan date');
  // filter tasks to delete
  const toDelete = tasks.filter(t => t.status === status && (!cutoff || new Date(t.createdAt) < cutoff));
  if (toDelete.length === 0) return { deletedCount: 0 };
  // backup before removal
  backupTasks(tasks);
  // delete each task using existing deleteTask logic to cascade sub‑tasks
  let deletedCount = 0;
  for (const t of toDelete) {
    try {
      deleteTask(t.id);
      deletedCount++;
    } catch (e) {
      console.error(`[taskmanager] Failed to delete task ${t.id}: ${e.message}`);
    }
  }
  return { deletedCount };
}

