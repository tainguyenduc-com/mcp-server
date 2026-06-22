// serverSetup.js
import { Server } from "@modelcontextprotocol/sdk/server";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { createTask, deleteTask } from "./taskLifecycle.js";
import { claimTask } from "./taskClaim.js";
import { updateTask } from "./taskUpdate.js";
import { listTasks, getTask, findAvailableTasks, getTaskStats } from "./taskQuery.js";
import { getTaskTree, getSubtasks, getAncestors, autoUpdateParentProgress } from "./taskTree.js";
import { reportTask } from "./taskReport.js";
import { VALID_STATUSES, VALID_PRIORITIES, VALID_TRANSITIONS, getTasksFile, getTaskStoreDir } from "./constants.js";

export const server = new Server(
  {
    name: "taskmanager-mcp-server",
    version: "1.2.0",
    description: "MCP Server quản lý task cho AI agents - thay thế direct handoff từ orchestrator",
  },
  { capabilities: { tools: {} } }
);

// Minimal tool definitions for tests
const minimalTools = [
  "task_create",
  "task_claim",
  "task_update",
  "task_list",
  "task_get",
  "task_pause",
  "task_fail",
  "task_cancel",
  "task_find_available",
  "task_report",
  "task_delete",
  "task_tree",
  "task_subtasks",
  "task_ancestors",
  "task_server_info",
  "task_stats",
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: minimalTools.map(name => {
    const base = { name, description: `${name} tool`, inputSchema: { type: "object", properties: {} } };
    if (name === "task_empty") {
      base.inputSchema = {
        type: "object",
        properties: {
          confirm: { type: "boolean", description: "Xác nhận thực hiện xóa" }
        },
        required: ["confirm"]
      };
    }
    return base;
  }),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "task_create": {
        if (!args?.title) throw new McpError(ErrorCode.InvalidParams, "title is required");
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
          progress: args.progress !== undefined ? args.progress : undefined,
          id: args.id,
        });
        return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
      }
      case "task_claim": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId required");
        if (!args?.agentName) throw new McpError(ErrorCode.InvalidParams, "agentName required");
        const task = claimTask(args.taskId, args.agentName);
        autoUpdateParentProgress(args.taskId);
        return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
      }
      case "task_update": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId required");
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
        if (args.status) autoUpdateParentProgress(args.taskId);
        return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
      }
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
        return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] };
      }
      case "task_get": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId required");
        const task = getTask(args.taskId);
        return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
      }
      case "task_pause": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId required");
        const task = updateTask(args.taskId, { status: "paused", metadata: args.reason ? { pauseReason: args.reason } : {} });
        return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
      }
      case "task_fail": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId required");
        if (!args?.error) throw new McpError(ErrorCode.InvalidParams, "error required");
        const task = updateTask(args.taskId, { status: "failed", error: args.error, metadata: { recoverable: args.recoverable !== false } });
        autoUpdateParentProgress(args.taskId);
        return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
      }
      case "task_delete": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId required");
        const result = deleteTask(args.taskId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "task_cancel": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId required");
        const task = updateTask(args.taskId, { status: "cancelled", metadata: args.reason ? { cancelReason: args.reason } : {} });
        autoUpdateParentProgress(args.taskId);
        return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
      }
      case "task_find_available": {
        const tasks = findAvailableTasks(args?.agentName, args?.tags || [], args?.parentTaskId || null);
        return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] };
      }
      case "task_tree": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId required");
        const tree = getTaskTree(args.taskId);
        return { content: [{ type: "text", text: JSON.stringify(tree, null, 2) }] };
      }
      case "task_subtasks": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId required");
        const subtasks = getSubtasks(args.taskId);
        return { content: [{ type: "text", text: JSON.stringify(subtasks, null, 2) }] };
      }
      case "task_ancestors": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId required");
        const ancestors = getAncestors(args.taskId);
        return { content: [{ type: "text", text: JSON.stringify(ancestors, null, 2) }] };
      }
      case "task_delete_by_status": {
          if (!args?.status) throw new McpError(ErrorCode.InvalidParams, "status required");
          if (args.confirmation !== true) throw new McpError(ErrorCode.InvalidParams, "confirmation required");
          const result = deleteTasksByStatus(args.status, args.olderThan);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        case "task_report": {
        if (!args?.taskId) throw new McpError(ErrorCode.InvalidParams, "taskId required");
        const result = reportTask(args.taskId, { result: args.result, error: args.error, summary: args.summary });
        autoUpdateParentProgress(args.taskId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "task_server_info": {
        return { content: [{ type: "text", text: JSON.stringify({
          name: "taskmanager-mcp-server",
          version: "1.2.0",
          description: "MCP Server quản lý task",
          capabilities: { tools: {} },
          storePath: getTaskStoreDir(),
          toolsCount: minimalTools.length,
        }, null, 2) }] };
      }
      case "task_stats": {
        const stats = getTaskStats();
        return { content: [{ type: "text", text: JSON.stringify(stats, null, 2) }] };
      }
      case "task_empty": {
         const result = emptyTasks(args?.confirm);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof McpError) throw err;
    return { content: [{ type: "text", text: JSON.stringify({ error: true, message: err.message, taskId: args?.taskId || null }, null, 2) }], isError: true };
  }
});
