# Task Manager MCP Server

MCP Server quản lý task cho AI agents, thay thế cơ chế direct handoff (manager gọi trực tiếp worker) bằng cơ chế **task queue** tập trung.

*An MCP server that manages tasks for AI agents, replacing direct handoff with a centralized **task queue** mechanism.*

## Tính năng / Features

- **Task queue** — Manager tạo task, worker tự động claim và xử lý / *Manager creates tasks, workers auto-claim and process*
- **Subtask & Parent relationship** — Chia nhỏ task lớn, auto-update parent progress / *Break down large tasks, auto-update parent progress*
- **13 MCP tools** — Đầy đủ lifecycle: create, claim, update, report, pause, fail, cancel
- **File-based storage** — JSON file duy nhất cho tất cả agents, atomic writes, auto-backup
- **Portable** — Tool descriptions chứa hướng dẫn workflow, không cần cấu hình agent riêng

## Architecture

```
┌──────────────┐     task_create()     ┌──────────────┐
│  Manager /   │ ────────────────────► │              │
│  Coordinator │                       │  Task Store  │
│  (tạo task)  │                       │  (.task/)    │
└──────┬───────┘                       │              │
       │                               │              │
       │ task_list() / task_tree()     │              │
       │ ◄─────────────────────────────│              │
       │                               │              │
       │       ┌───────────────────────┤              │
       │       │ task_find_available() │              │
       │       │ task_claim()          │              │
       │       │ task_update()         │              │
       │       │ task_report()         │              │
       ▼       ▼                       └──────────────┘
┌──────────────┐
│   Workers    │
│ (xử lý task) │
└──────────────┘
```

## Tools

### Task Lifecycle

| Tool | Description | Used By |
|------|-------------|---------|
| `task_create` | Create a new task or subtask (use `parentTaskId`) | Manager, workers |
| `task_claim` | Claim a task from queue (pending → in_progress) | Workers |
| `task_update` | Update status, progress, context, result | Workers |
| `task_report` | Report completion (auto-updates parent progress) | Workers |
| `task_pause` | Pause task with reason | Workers |
| `task_fail` | Mark task as failed (recoverable or not) | Workers |
| `task_cancel` | Cancel a task | Manager |

### Query & Monitoring

| Tool | Description | Used By |
|------|-------------|---------|
| `task_list` | List tasks with filters (status, tag, parentTaskId, ...) | Manager, lead |
| `task_get` | Get task detail by ID | All |
| `task_find_available` | Find available tasks for an agent | Workers |
| `task_tree` | View full task tree with nested subtasks + summary | All |
| `task_subtasks` | List direct subtasks of a task | All |
| `task_ancestors` | Find all ancestors from a subtask up to root | All |

## Task Lifecycle

```
        ┌──────────────────────────────────────┐
        │                                      │
   ┌────▼─────┐    claim     ┌────────────┐   pause    ┌────────┐
   │  PENDING ├─────────────►│IN_PROGRESS ├───────────►│ PAUSED │
   └────┬─────┘              └──────┬──────┘            └────────┘
        │                           │                       │
        │ cancel                    │ report/fail          resume
        ▼                           ▼                       │
   ┌─────────┐               ┌──────────┐                  │
   │CANCELLED│               │COMPLETED │                  │
   └─────────┘               └──────────┘                  │
        │                           │                       │
        └── retry ──► IN_PROGRESS ◄── fail ────────────────┘
                            │
                       ┌────▼────┐
                       │  FAILED │
                       └─────────┘
```

## Usage

### 1. Manager/Lead: Create a task

```javascript
const task = await task_create({
  title: "Implement GET /api/v1/jobs endpoint",
  description: "Create endpoint with CQRS pattern",
  priority: "high",
  assignedTo: "backend-worker",      // optional
  tags: ["jobs-module", "backend"],
  context: { module: "jobs" },
  reportTo: "lead"
});
```

### 2. Worker: Find, claim, and work

```javascript
// Find available tasks
const tasks = await task_find_available({
  agentName: "backend-worker",
  tags: ["jobs-module"]
});

// Claim the task
const task = await task_claim({
  taskId: tasks[0].id,
  agentName: "backend-worker"
});

// For large tasks: create subtasks and work immediately
// IMPORTANT: Create 1 subtask → work → report → create next → work → report → ...
// DO NOT create all subtasks first then start working.

const sub = await task_create({
  title: "Jobs - Endpoints (5 endpoints)",
  parentTaskId: task.id,
  tags: task.tags
});
await task_claim({ taskId: sub.id, agentName: "backend-worker" });
// ... work ...
await task_report({ taskId: sub.id, summary: "Endpoints done" });

// ... create next subtask, work, report, repeat ...

// Report parent when all subtasks are done
await task_report({
  taskId: task.id,
  summary: "Jobs module completed",
  result: { endpoints: ["GET /api/v1/jobs"] }
});
```

### 3. Monitor progress

```javascript
// View all tasks
const all = await task_list();

// View task tree with subtasks
const tree = await task_tree({ taskId: parentTaskId });
// tree.subtaskSummary = { totalChildren, completed, inProgress, pending, progress% }

// View only subtasks of a parent
const subs = await task_list({ parentTaskId: parentTaskId });
```

## Subtask Pattern

**Rule: Create → Work → Report → Repeat (never create all at once)**

```
Parent task: "Large task (~100 units)"
  → claim parent
  → create subtask 1 → claim → work → report ✅
  → create subtask 2 → claim → work → report ✅
  → create subtask 3 → claim → work → report ✅
  → ...
  → report parent: "All done!"
```

Benefits:
- Each subtask is a checkpoint
- Resume is easy: check which subtasks are done/pending
- Parent progress auto-updates when subtasks change status

## Configuration

The task store location is determined by (in priority order):

1. **CLI argument**: `node server.js /path/to/.task`
2. **Environment variable**: `TASK_STORE_DIR=/path/to/.task`
3. **Default**: `{CWD}/.task`

**Important**: Use an absolute path so all agents share the same store.

### Configuration for different AI CLIs

#### OpenCode

```json
{
  "mcp": {
    "task-manager": {
      "type": "local",
      "command": [
        "node",
        "C:/path/to/mcp-server/server.js",
        "C:/path/to/project/.task"
      ],
      "enabled": true,
      "description": "Task Manager - agent task queue"
    }
  }
}
```

#### Claude Code

```json
{
  "mcpServers": {
    "task-manager": {
      "type": "stdio",
      "command": "node",
      "args": [
        "C:/path/to/mcp-server/server.js",
        "C:/path/to/project/.task"
      ]
    }
  }
}
```

#### GitHub Copilot

```json
{
  "github.copilot.chat.mcpServers": {
    "task-manager": {
      "command": "node",
      "args": [
        "C:/path/to/mcp-server/server.js",
        "C:/path/to/project/.task"
      ]
    }
  }
}
```

#### Gemini (via VS Code Settings)

```json
{
  "mcp": {
    "servers": {
      "task-manager": {
        "type": "stdio",
        "command": "node",
        "args": [
          "C:/path/to/mcp-server/server.js",
          "C:/path/to/project/.task"
        ]
      }
    }
  }
}
```

## Data Model

```typescript
interface Task {
  id: string;                    // UUID
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'paused' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo: string | null;
  createdBy: string;
  parentTaskId: string | null;   // Link to parent task
  tags: string[];
  context: object;
  progress: number;              // 0-100
  result: object | null;
  error: string | null;
  metadata: object;
  reportTo: string | null;
  createdAt: string;             // ISO timestamp
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}
```

## Storage

- **Single JSON file**: `{task-store-dir}/tasks.json`
- **Atomic writes**: Write to `.tmp` then rename
- **Auto-backup**: Last 50 versions in `{task-store-dir}/backups/`
- **All agents share** the same file via absolute path

## Development

```bash
# Install
npm install

# Run tests
npm test

# Start server (stdio)
node server.js [task-store-path]
```
