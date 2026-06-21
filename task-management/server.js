#!/usr/bin/env node

/**
 * Task Manager MCP Server
 * 
 * Manages tasks for AI workers.
 * Replaces direct handoff from coordinator → worker.
 * Workers can self-manage their tasks.
 * 
 * Tools:
 *   - task_create: Create a new task
 *   - task_claim: Claim a task for an agent
 *   - task_update: Update status/progress/result
 *   - task_list: List tasks with filters
 *   - task_get: Get task details
 *   - task_pause: Pause a task
 *   - task_fail: Mark task as failed
 *   - task_cancel: Cancel a task
 *   - task_find_available: Find available tasks for agent
 *   - task_report: Report task completion
 *   - task_server_info: Get server version and capabilities
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "node:url";

// ─── Constants ───────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Task store location (priority: CLI arg > env var > CWD fallback):
//   1. CLI argument: node server.js /path/to/.task
//   2. Env var: TASK_STORE_DIR=/path/to/.task
//   3. Fallback: {CWD}/.task
const TASK_STORE_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : process.env.TASK_STORE_DIR 
    ? path.resolve(process.env.TASK_STORE_DIR)
    : path.join(process.cwd(), ".task");
const TASKS_FILE = path.join(TASK_STORE_DIR, "tasks.json");
const BACKUP_DIR = path.join(TASK_STORE_DIR, "backups");

const VALID_STATUSES = ["pending", "in_progress", "paused", "completed", "failed", "cancelled"];
const VALID_PRIORITIES = ["low", "medium", "high", "critical"];
const VALID_TRANSITIONS = {
  "pending":     ["in_progress", "cancelled"],
  "in_progress": ["completed", "failed", "paused", "cancelled"],
  "paused":      ["in_progress", "cancelled"],
  "completed":   [],
  "failed":      ["in_progress"],  // retry
  "cancelled":   [],
};

// ─── Storage Layer ───────────────────────────────────────────────────────────

function ensureDirectories() {
  if (!fs.existsSync(TASK_STORE_DIR)) {
    fs.mkdirSync(TASK_STORE_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function loadTasks() {
  ensureDirectories();
  try {
    if (fs.existsSync(TASKS_FILE)) {
      const raw = fs.readFileSync(TASKS_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`[task-manager] Error loading tasks: ${err.message}`);
  }
  return [];
}

function saveTasks(tasks) {
  ensureDirectories();
  const tmpFile = TASKS_FILE + ".tmp";
  try {
    // Atomic write: write to temp, then rename
    fs.writeFileSync(tmpFile, JSON.stringify(tasks, null, 2), "utf-8");
    fs.renameSync(tmpFile, TASKS_FILE);
    return true;
  } catch (err) {
    console.error(`[task-manager] Error saving tasks: ${err.message}`);
    return false;
  }
}

function backupTasks(tasks) {
  ensureDirectories();
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(BACKUP_DIR, `tasks-${timestamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(tasks, null, 2), "utf-8");
    
    // Clean old backups (keep last 50)
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith("tasks-"))
      .sort()
      .reverse();
    if (backups.length > 50) {
      for (const old of backups.slice(50)) {
        fs.unlinkSync(path.join(BACKUP_DIR, old));
      }
    }
  } catch (err) {
    console.error(`[task-manager] Backup error: ${err.message}`);
  }
}

// ─── Task Operations ────────────────────────────────────────────────────────

function isValidTransition(currentStatus, newStatus) {
  return VALID_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}

function createTask(input) {
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

function claimTask(taskId, agentName) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  
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

function updateTask(taskId, updates) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  
  // Handle status transitions
  if (updates.status && updates.status !== task.status) {
    if (!isValidTransition(task.status, updates.status)) {
      throw new Error(
        `Invalid status transition: "${task.status}" → "${updates.status}". ` +
        `Allowed: [${VALID_TRANSITIONS[task.status].join(", ") || "none"}]`
      );
    }
    
    // Auto-set timestamps on status change
    if (updates.status === "in_progress" && task.status === "pending") {
      task.startedAt = new Date().toISOString();
    }
    if (updates.status === "completed") {
      task.completedAt = new Date().toISOString();
    }
  }
  
  // Apply updates
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

function listTasks(filter = {}) {
  let tasks = loadTasks();
  
  if (filter.status) {
    const statuses = filter.status.split(",");
    tasks = tasks.filter(t => statuses.includes(t.status));
  }
  if (filter.assignedTo) {
    tasks = tasks.filter(t => t.assignedTo === filter.assignedTo);
  }
  if (filter.createdBy) {
    tasks = tasks.filter(t => t.createdBy === filter.createdBy);
  }
  if (filter.priority) {
    tasks = tasks.filter(t => t.priority === filter.priority);
  }
  if (filter.tag) {
    tasks = tasks.filter(t => t.tags.includes(filter.tag));
  }
  if (filter.parentTaskId !== undefined) {
    if (filter.parentTaskId === "null" || filter.parentTaskId === "") {
      // Only top-level tasks (no parent)
      tasks = tasks.filter(t => !t.parentTaskId);
    } else {
      // Only subtasks of a specific parent
      tasks = tasks.filter(t => t.parentTaskId === filter.parentTaskId);
    }
  }
  if (filter.search) {
    const q = filter.search.toLowerCase();
    tasks = tasks.filter(t => 
      t.title.toLowerCase().includes(q) || 
      t.description.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
    );
  }
  
  // Sort by priority then by createdAt (newest first)
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  tasks.sort((a, b) => {
    const pDiff = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
    if (pDiff !== 0) return pDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  
  const limit = filter.limit ? parseInt(filter.limit, 10) : 50;
  return tasks.slice(0, limit);
}

// ─── Parent–Subtask Relationship ───────────────────────────────────────

function getSubtasks(parentTaskId) {
  const tasks = loadTasks();
  return tasks.filter(t => t.parentTaskId === parentTaskId);
}

function getAncestors(taskId) {
  const tasks = loadTasks();
  const ancestors = [];
  let current = tasks.find(t => t.id === taskId);
  while (current?.parentTaskId) {
    const parent = tasks.find(t => t.id === current.parentTaskId);
    if (parent) {
      ancestors.unshift(parent);
      current = parent;
    } else {
      break;
    }
  }
  return ancestors;
}

function getTaskTree(taskId) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  // Build full tree recursively
  function buildNode(node) {
    const children = tasks
      .filter(t => t.parentTaskId === node.id)
      .map(child => buildNode(child));
    
    // Calculate aggregate progress from children
    let agg = null;
    if (children.length > 0) {
      const total = children.length;
      const done = children.filter(c => c.status === "completed").length;
      const failed = children.filter(c => c.status === "failed").length;
      const inProgress = children.filter(c => c.status === "in_progress").length;
      const pending = children.filter(c => c.status === "pending").length;
      const paused = children.filter(c => c.status === "paused").length;
      
      agg = {
        totalChildren: total,
        completed: done,
        failed,
        inProgress,
        pending,
        paused,
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    }
    
    return {
      ...node,
      subtaskCount: children.length,
      subtaskSummary: agg,
      subtasks: children.length > 0 ? children : undefined,
    };
  }
  
  return buildNode(task);
}

function autoUpdateParentProgress(taskId) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task || !task.parentTaskId) return;
  
  const parent = tasks.find(t => t.id === task.parentTaskId);
  if (!parent) return;
  
  // Calculate aggregate progress of all children
  const children = tasks.filter(t => t.parentTaskId === parent.id);
  if (children.length === 0) return;
  
  const total = children.length;
  const done = children.filter(c => c.status === "completed").length;
  const failed = children.filter(c => c.status === "failed").length;
  const inProgress = children.filter(c => c.status === "in_progress").length;
  
  // Auto-update parent progress
  parent.progress = Math.round((done / total) * 100);
  
  // Auto-update parent status based on children
  if (done === total) {
    parent.status = "completed";
    parent.completedAt = parent.completedAt || new Date().toISOString();
  } else if (failed > 0 && done + failed === total) {
    // Some failed, rest done -> mark as completed with note
    parent.status = "completed";
    parent.completedAt = parent.completedAt || new Date().toISOString();
  } else if (inProgress > 0 || done > 0) {
    parent.status = "in_progress";
    parent.startedAt = parent.startedAt || new Date().toISOString();
  }
  
  parent.updatedAt = new Date().toISOString();
  saveTasks(tasks);
  
  // Recursively update grandparent
  autoUpdateParentProgress(parent.id);
}

function getTask(taskId) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  return task;
}

function findAvailableTasks(agentName, tags = [], parentTaskId = null) {
  let tasks = loadTasks();
  
  // Filter: pending or paused tasks
  tasks = tasks.filter(t => t.status === "pending" || t.status === "paused");
  
  // If agent specified, prefer unassigned OR assigned to this agent
  if (agentName) {
    tasks = tasks.filter(t => !t.assignedTo || t.assignedTo === agentName);
  }
  
  // Filter by tags if specified
  if (tags.length > 0) {
    tasks = tasks.filter(t => tags.some(tag => t.tags.includes(tag)));
  }
  
  // Filter by parentTaskId
  if (parentTaskId === "null" || parentTaskId === "") {
    // Only top-level tasks (no parent)
    tasks = tasks.filter(t => !t.parentTaskId);
  } else if (parentTaskId) {
    tasks = tasks.filter(t => t.parentTaskId === parentTaskId);
  }
  
  // Sort: priority first, then oldest first
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  tasks.sort((a, b) => {
    const pDiff = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
    if (pDiff !== 0) return pDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  
  return tasks.slice(0, 20);
}

function reportTask(taskId, reportData) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  
  // Auto-mark completed if status is in_progress
  if (task.status === "in_progress") {
    task.status = "completed";
    task.completedAt = new Date().toISOString();
  }
  
  if (reportData.result !== undefined) task.result = reportData.result;
  if (reportData.error !== undefined) task.error = reportData.error;
  if (reportData.summary !== undefined) task.metadata = task.metadata || {};
  task.metadata.summary = reportData.summary || task.metadata?.summary || "";
  task.updatedAt = new Date().toISOString();
  
  saveTasks(tasks);
  
  return {
    task,
    reportTo: task.reportTo,
    message: `Task ${taskId} completed. Report sent to ${task.reportTo || "orchestrator"}.`
  };
}

// ─── MCP Server ──────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: "task-manager-mcp-server",
    version: "1.0.0",
    description: "MCP Server quản lý task cho AI agents - thay thế direct handoff từ orchestrator",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── List Tools Handler ──────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "task_create",
        description: `Tạo task mới trong hệ thống quản lý task.
Dùng bởi orchestrator để giao việc cho sub-agent, hoặc agent tạo subtask.
Task được tạo với status "pending" và có thể được claim bởi agent phù hợp.

QUAN TRỌNG - Cách dùng đúng khi chia nhỏ task lớn:
  - Tạo 1 subtask -> LÀM NGAY subtask đó -> XONG -> tạo subtask tiếp theo
  - KHÔNG tạo hết tất cả subtask rồi mới bắt đầu làm
  - Dùng parentTaskId để link subtask về task cha
  - Không gán assignedTo để agent tự claim subtask

Output: Task object vừa được tạo.`,
        inputSchema: {
          type: "object",
          properties: {
            title: { 
              type: "string", 
              description: "Tiêu đề ngắn gọn của task (bắt buộc)" 
            },
            description: { 
              type: "string", 
              description: "Mô tả chi tiết task: cần làm gì, context, link file liên quan" 
            },
            priority: {
              type: "string",
              enum: VALID_PRIORITIES,
              description: "Độ ưu tiên: critical (khẩn cấp), high (cao), medium (trung bình), low (thấp)",
              default: "medium",
            },
            assignedTo: {
              type: "string",
              description: "Gán thẳng cho agent cụ thể (VD: backend-developer). Để null nếu để agent tự claim."
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Tags phân loại: module name, skill type, feature name..."
            },
            context: {
              type: "object",
              description: "Context bổ sung: module, sourceFiles, constraints, ...",
            },
            parentTaskId: {
              type: "string",
              description: "ID của task cha (nếu là subtask)"
            },
            reportTo: {
              type: "string",
              description: "Agent sẽ nhận báo cáo khi task hoàn thành (mặc định: orchestrator)",
              default: "orchestrator",
            },
            metadata: {
              type: "object",
              description: "Metadata bổ sung tùy ý",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "task_claim",
        description: `Claim (nhận) một task để xử lý.
Agent gọi tool này để nhận task từ queue.
Chỉ có thể claim task có status "pending".
Sau khi claim, task chuyển sang "in_progress" và assignedTo được set.

SAU KHI CLAIM: Phải làm việc NGAY, không lập kế hoạch dài dòng.
  - Nếu task lớn: tạo 1 subtask -> làm ngay -> tạo subtask tiếp -> làm tiếp
  - Nếu task nhỏ: làm luôn, không tạo subtask

Output: Task object với status đã update.`,
        inputSchema: {
          type: "object",
          properties: {
            taskId: { 
              type: "string", 
              description: "ID của task cần claim" 
            },
            agentName: { 
              type: "string", 
              description: "Tên agent claim (VD: backend-developer, frontend-developer)" 
            },
          },
          required: ["taskId", "agentName"],
        },
      },
      {
        name: "task_update",
        description: `Cập nhật trạng thái, tiến độ, kết quả của task.
Dùng để:
- Update status: pending → in_progress → completed/failed
- Cập nhật progress (%), result, error message
- Thay đổi assignedTo, priority, tags
- Thêm context/metadata

Status transitions hợp lệ:
  pending → in_progress, cancelled
  in_progress → completed, failed, paused, cancelled
  paused → in_progress, cancelled
  failed → in_progress (retry)

Output: Task object đã được cập nhật.`,
        inputSchema: {
          type: "object",
          properties: {
            taskId: { 
              type: "string", 
              description: "ID của task cần update" 
            },
            status: {
              type: "string",
              enum: VALID_STATUSES,
              description: "Status mới (chỉ chấp nhận transition hợp lệ)"
            },
            progress: {
              type: "number",
              description: "Phần trăm hoàn thành (0-100)",
              minimum: 0,
              maximum: 100,
            },
            result: {
              type: "object",
              description: "Kết quả xử lý (JSON object: summary, output, files, ...)"
            },
            error: {
              type: "string",
              description: "Error message nếu task failed"
            },
            assignedTo: {
              type: "string",
              description: "Chuyển task cho agent khác"
            },
            priority: {
              type: "string",
              enum: VALID_PRIORITIES,
              description: "Thay đổi độ ưu tiên"
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Thay đổi tags"
            },
            context: {
              type: "object",
              description: "Bổ sung context (merge với context hiện tại)"
            },
            metadata: {
              type: "object",
              description: "Bổ sung metadata (merge với metadata hiện tại)"
            },
          },
          required: ["taskId"],
        },
      },
      {
        name: "task_list",
        description: `Liệt kê tasks với các bộ lọc.
Dùng để:
- Orchestrator xem tất cả tasks đang chạy
- Agent xem tasks của mình
- Kiểm tra task nào đang pending, in_progress, paused, etc.
- Xem subtask của 1 task cha (filter bằng parentTaskId)
- Xem top-level tasks (filter parentTaskId = "null")

Mặc định trả về 50 tasks gần nhất, sắp xếp theo priority + thời gian tạo.

Output: Array of Task objects.`,
        inputSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description: "Lọc theo status (VD: 'pending' hoặc 'in_progress,completed' cho nhiều status)"
            },
            assignedTo: {
              type: "string",
              description: "Lọc theo agent được gán (VD: 'backend-developer')"
            },
            createdBy: {
              type: "string",
              description: "Lọc theo người tạo (VD: 'orchestrator')"
            },
            priority: {
              type: "string",
              enum: VALID_PRIORITIES,
              description: "Lọc theo priority"
            },
            tag: {
              type: "string",
              description: "Lọc theo tag (VD: 'writer-management')"
            },
            parentTaskId: {
              type: "string",
              description: "Lọc theo task cha. Gõ 'null' để lấy top-level tasks (không có cha). Gõ ID để lấy subtasks của task đó."
            },
            search: {
              type: "string",
              description: "Tìm kiếm trong title, description, id"
            },
            limit: {
              type: "string",
              description: "Số lượng kết quả tối đa (default: 50)",
              default: "50",
            },
          },
        },
      },
      {
        name: "task_get",
        description: `Xem chi tiết một task cụ thể.
Dùng để lấy full thông tin task: mô tả, context, result, error, toàn bộ lịch sử.

Output: Task object đầy đủ.`,
        inputSchema: {
          type: "object",
          properties: {
            taskId: { 
              type: "string", 
              description: "ID của task cần xem" 
            },
          },
          required: ["taskId"],
        },
      },
      {
        name: "task_pause",
        description: `Tạm dừng task đang xử lý.
Dùng khi:
- Agent cần chờ dependency (review, approval, data từ agent khác)
- Cần switch sang task khác ưu tiên hơn
- Blocked bởi yếu tố bên ngoài

Có thể resume bằng task_update với status="in_progress".

Output: Task object đã được pause.`,
        inputSchema: {
          type: "object",
          properties: {
            taskId: { 
              type: "string", 
              description: "ID của task cần pause" 
            },
            reason: {
              type: "string",
              description: "Lý do tạm dừng (sẽ được lưu vào metadata)"
            },
          },
          required: ["taskId"],
        },
      },
      {
        name: "task_fail",
        description: `Đánh dấu task thất bại với lý do cụ thể.
Dùng khi task không thể hoàn thành (lỗi kỹ thuật, thiếu thông tin, không khả thi).
Có thể retry task failed bằng task_update với status="in_progress".

Output: Task object đã được đánh dấu failed.`,
        inputSchema: {
          type: "object",
          properties: {
            taskId: { 
              type: "string", 
              description: "ID của task bị fail" 
            },
            error: { 
              type: "string", 
              description: "Mô tả lỗi / nguyên nhân thất bại (bắt buộc)" 
            },
            recoverable: {
              type: "boolean",
              description: "Có thể retry không? (default: true)",
              default: true,
            },
          },
          required: ["taskId", "error"],
        },
      },
      {
        name: "task_cancel",
        description: `Hủy task (chỉ task đang pending, paused, hoặc in_progress).
Dùng khi task không còn cần thiết nữa.
Không thể cancel task đã completed hoặc failed.

Output: Task object đã được cancelled.`,
        inputSchema: {
          type: "object",
          properties: {
            taskId: { 
              type: "string", 
              description: "ID của task cần hủy" 
            },
            reason: {
              type: "string",
              description: "Lý do hủy task"
            },
          },
          required: ["taskId"],
        },
      },
      {
        name: "task_find_available",
        description: `Tìm tasks có sẵn cho agent xử lý.
Dùng bởi sub-agent khi muốn nhận việc mới từ queue.
Trả về tasks đang pending hoặc paused, ưu tiên critical/high trước,
có thể lọc theo tags (VD: module name).

CÁCH DÙNG ĐÚNG:
  1. Tìm task -> claim -> nếu task lớn (>10 đơn vị) -> tạo subtask và làm ngay
  2. Nếu là task nhỏ -> claim và làm luôn, không tạo subtask
  3. workflow chuẩn: create subtask -> claim -> work -> report -> create next -> ... -> report parent

Output: Array of available Task objects (tối đa 20 tasks).`,
        inputSchema: {
          type: "object",
          properties: {
            agentName: {
              type: "string",
              description: "Tên agent (VD: backend-developer). Trả về tasks unassigned hoặc assignedTo agent này."
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Lọc theo tags (VD: ['writer-management'] -> chỉ tasks về writer-management)"
            },
            parentTaskId: {
              type: "string",
              description: "Lọc theo task cha. Gõ 'null' để lấy top-level tasks (không có parent). Gõ ID để lấy subtasks của task đó."
            },
          },
        },
      },
      {
        name: "task_tree",
        description: `Xem cây phân cấp của task — hiển thị task cha, tất cả subtasks (đệ quy) và tổng hợp tiến độ.
Dùng để:
- Orchestrator theo dõi tiến độ của task lớn đã chia subtask
- Agent xem toàn bộ cấu trúc công việc
- Kiểm tra subtask nào đã done, còn pending để biết việc tiếp theo

Sau khi xem tree, agent nên CLAIM subtask pending đầu tiên và LÀM NGAY.

Output: Task object với subtasks lồng nhau + subtaskSummary (totalChildren, completed, failed, inProgress, pending, paused, progress%).`,
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "ID của task gốc (root) cần xem cây"
            },
          },
          required: ["taskId"],
        },
      },
      {
        name: "task_subtasks",
        description: `Liệt kê tất cả subtasks trực tiếp của một task.
Dùng để kiểm tra tiến độ các subtask đã tạo.

Output: Array of Task objects (chỉ subtasks cấp 1, không đệ quy).`,
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "ID của task cha"
            },
          },
          required: ["taskId"],
        },
      },
      {
        name: "task_ancestors",
        description: `Tìm tất cả task cha (ancestors) của một task — đi ngược lên đến root.
Dùng để biết subtask này thuộc task lớn nào.

Output: Array of Task objects từ root đến parent gần nhất.`,
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "ID của subtask cần tìm ancestors"
            },
          },
          required: ["taskId"],
        },
      },
      {
        name: "task_report",
        description: `Báo cáo kết quả task về orchestrator.
Dùng khi agent đã hoàn thành task.
Tự động set status = "completed" nếu đang "in_progress".

CÁCH DÙNG ĐÚNG:
  - Nếu là subtask: báo cáo xong -> lập tức tạo subtask tiếp theo -> làm ngay
  - Nếu là task cha: chỉ báo cáo khi TẤT CẢ subtask đã hoàn thành

Output: Task đã hoàn thành + thông tin reportTo.`,
        inputSchema: {
          type: "object",
          properties: {
            taskId: { 
              type: "string", 
              description: "ID của task đã hoàn thành" 
            },
            result: {
              type: "object",
              description: "Kết quả chi tiết (output data, files created, endpoints, ...)"
            },
            summary: {
              type: "string",
              description: "Tóm tắt ngắn gọn kết quả cho orchestrator"
            },
            error: {
              type: "string",
              description: "Error message nếu task không hoàn thành được"
            },
          },
          required: ["taskId"],
        },
      },
    ],
  };
});

// ── Call Tool Handler ───────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ── task_create ──────────────────────────────────────────────────
      case "task_create": {
        if (!args?.title) {
          throw new McpError(ErrorCode.InvalidParams, "title is required");
        }
        
        const task = createTask({
          title: args.title,
          description: args.description || "",
          priority: args.priority || "medium",
          assignedTo: args.assignedTo || null,
          tags: args.tags || [],
          context: args.context || {},
          parentTaskId: args.parentTaskId || null,
          reportTo: args.reportTo || "orchestrator",
          metadata: args.metadata || {},
          createdBy: args.createdBy || "unknown",
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify(task, null, 2),
          }],
        };
      }

      // ── task_claim ───────────────────────────────────────────────────
      case "task_claim": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId is required");
        if (!args?.agentName) throw new McpError(ErrorCode.InvalidParams, "agentName is required");
        
        const task = claimTask(args.taskId, args.agentName);
        // Claim task = in_progress -> notify parent
        autoUpdateParentProgress(args.taskId);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(task, null, 2),
          }],
        };
      }

      // ── task_update ──────────────────────────────────────────────────
      case "task_update": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId is required");
        
        const task = updateTask(args.taskId, {
          status: args.status,
          progress: args.progress,
          result: args.result,
          error: args.error,
          assignedTo: args.assignedTo,
          priority: args.priority,
          tags: args.tags,
          context: args.context,
          metadata: args.metadata,
        });
        
        // Auto-update parent when subtask status changes
        if (args.status) {
          autoUpdateParentProgress(args.taskId);
        }
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(task, null, 2),
          }],
        };
      }

      // ── task_list ────────────────────────────────────────────────────
      case "task_list": {
        const tasks = listTasks({
          status: args?.status,
          assignedTo: args?.assignedTo,
          createdBy: args?.createdBy,
          priority: args?.priority,
          tag: args?.tag,
          parentTaskId: args?.parentTaskId,
          search: args?.search,
          limit: args?.limit || "50",
        });
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(tasks, null, 2),
          }],
        };
      }

      // ── task_get ─────────────────────────────────────────────────────
      case "task_get": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId is required");
        
        const task = getTask(args.taskId);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(task, null, 2),
          }],
        };
      }

      // ── task_pause ───────────────────────────────────────────────────
      case "task_pause": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId is required");
        
        const metadata = args.reason ? { pauseReason: args.reason } : {};
        const task = updateTask(args.taskId, { status: "paused", metadata });
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(task, null, 2),
          }],
        };
      }

      // ── task_fail ────────────────────────────────────────────────────
      case "task_fail": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId is required");
        if (!args?.error) throw new McpError(ErrorCode.InvalidParams, "error is required");
        
        const metadata = { recoverable: args.recoverable !== false };
        const task = updateTask(args.taskId, { 
          status: "failed", 
          error: args.error,
          metadata,
        });
        
        // Auto-update parent when subtask fails
        autoUpdateParentProgress(args.taskId);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(task, null, 2),
          }],
        };
      }

      // ── task_cancel ──────────────────────────────────────────────────
      case "task_cancel": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId is required");
        
        const metadata = args.reason ? { cancelReason: args.reason } : {};
        const task = updateTask(args.taskId, { status: "cancelled", metadata });
        
        // Auto-update parent when subtask is cancelled
        autoUpdateParentProgress(args.taskId);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(task, null, 2),
          }],
        };
      }

      // ── task_find_available ──────────────────────────────────────────
      case "task_find_available": {
        const tasks = findAvailableTasks(args?.agentName, args?.tags || [], args?.parentTaskId || null);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(tasks, null, 2),
          }],
        };
      }

      // ── task_tree ────────────────────────────────────────────────────
      case "task_tree": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId is required");
        
        const tree = getTaskTree(args.taskId);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(tree, null, 2),
          }],
        };
      }

      // ── task_subtasks ────────────────────────────────────────────────
      case "task_subtasks": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId is required");
        
        const subtasks = getSubtasks(args.taskId);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(subtasks, null, 2),
          }],
        };
      }

      // ── task_ancestors ────────────────────────────────────────────────
      case "task_ancestors": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId is required");
        
        const ancestors = getAncestors(args.taskId);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(ancestors, null, 2),
          }],
        };
      }

      // ── task_report ──────────────────────────────────────────────────
      case "task_report": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId is required");
        
        const result = reportTask(args.taskId, {
          result: args.result,
          error: args.error,
          summary: args.summary,
        });
        
        // Auto-update parent/ancestors progress
        autoUpdateParentProgress(args.taskId);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2),
          }],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof McpError) throw err;
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ 
          error: true, 
          message: err.message,
          taskId: args?.taskId || null,
        }, null, 2),
      }],
      isError: true,
    };
  }
});

// ─── Start Server ───────────────────────────────────────────────────────────

async function main() {
  ensureDirectories();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error(`[task-manager] MCP Server started`);
  console.error(`[task-manager] Task store: ${TASKS_FILE}`);
  console.error(`[task-manager] Task store dir: ${TASK_STORE_DIR}`);
  console.error(`[task-manager] PID: ${process.pid}`);
  console.error(`[task-manager] Source: ${process.argv[2] ? "CLI arg" : process.env.TASK_STORE_DIR ? "env var" : "CWD fallback"}`);
  console.error(`[task-manager] CWD: ${process.cwd()}`);
}

main().catch((err) => {
  console.error("[task-manager] Fatal error:", err);
  process.exit(1);
});
