#!/usr/bin/env node

/**
 * Integration test for Task Manager MCP Server.
 * Sends JSON-RPC requests via stdin, reads responses from stdout.
 */

import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = path.join(__dirname, "server.js");

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
  } else {
    testsFailed++;
    process.stdout.write(`    ✘ ${message}\n`);
  }
}

async function runTest(name, fn) {
  process.stdout.write(`\n  ▶ ${name}... `);
  try {
    await fn();
    process.stdout.write(`✔\n`);
  } catch (err) {
    testsFailed++;
    process.stdout.write(`✘ ${err.message}\n`);
  }
}

// Buffer-based JSON-RPC communication
function createRPCClient(proc) {
  let buffer = "";
  let pendingResolves = new Map();
  let idCounter = 0;

  proc.stdout.on("data", (data) => {
    buffer += data.toString();
    processBuffer();
  });

  function processBuffer() {
    const lines = buffer.split("\n");
    // Keep the last (potentially incomplete) line in buffer
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const response = JSON.parse(trimmed);
        if (response.id !== undefined && pendingResolves.has(response.id)) {
          pendingResolves.get(response.id)(response);
          pendingResolves.delete(response.id);
        }
      } catch (e) {
        // Not JSON, might be partial - put it back
        buffer = line + "\n" + buffer;
      }
    }
  }

  return {
    async call(method, params = {}) {
      const id = ++idCounter;
      const request = JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      });

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingResolves.delete(id);
          reject(new Error(`Response timeout for ${method} (id=${id})`));
        }, 5000);

        pendingResolves.set(id, (response) => {
          clearTimeout(timeout);
          resolve(response);
        });

        proc.stdin.write(request + "\n");
      });
    },
  };
}

async function main() {
  console.log("🚀 Task Manager MCP Server - Integration Test");
  console.log("=".repeat(50));

  // Reset task store for test
  const tasksFile = path.join(__dirname, ".task", "tasks.json");
  const fs = await import("node:fs");
  if (fs.existsSync(tasksFile)) {
    fs.writeFileSync(tasksFile, "[]", "utf-8");
  }

  // Start server
  const proc = spawn("node", [SERVER_SCRIPT], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
    cwd: __dirname,
  });

  // Collect stderr (server logs) for debugging
  proc.stderr.on("data", (data) => {
    // Server diagnostic output - ignore in test
  });

  // Handle unexpected exit
  proc.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n⚠️  Server exited with code ${code}`);
    }
  });

  // Wait for server to initialize
  await new Promise((r) => setTimeout(r, 500));

  const client = createRPCClient(proc);
  let createdTaskId = null;

  try {
    // ── Test 1: List Tools ──────────────────────────────────────────────
    await runTest("List available tools", async () => {
      const response = await client.call("tools/list");
      
      assert(response?.result?.tools?.length > 0, "Should return tools list");
      const toolNames = response.result.tools.map(t => t.name);
      assert(toolNames.includes("task_create"), "Should include task_create");
      assert(toolNames.includes("task_claim"), "Should include task_claim");
      assert(toolNames.includes("task_update"), "Should include task_update");
      assert(toolNames.includes("task_list"), "Should include task_list");
      assert(toolNames.includes("task_get"), "Should include task_get");
      assert(toolNames.includes("task_pause"), "Should include task_pause");
      assert(toolNames.includes("task_fail"), "Should include task_fail");
      assert(toolNames.includes("task_cancel"), "Should include task_cancel");
      assert(toolNames.includes("task_find_available"), "Should include task_find_available");
      assert(toolNames.includes("task_report"), "Should include task_report");
    });

    // ── Test 2: Create Task ─────────────────────────────────────────────
    await runTest("Create a new task", async () => {
      const response = await client.call("tools/call", {
        name: "task_create",
        arguments: {
          title: "Implement GET /api/v1/writer/jobs endpoint",
          description: "Tạo endpoint mới để lấy danh sách jobs. Dùng CQRS pattern.",
          priority: "high",
          assignedTo: "backend-developer",
          tags: ["writer-management", "backend", "api"],
          context: {
            module: "writer-management",
            constraints: ["Dùng IObjectMapper (KHÔNG AutoMapper)"],
          },
          reportTo: "orchestrator",
        },
      });

      assert(!response.result?.isError, "Should not return error");
      const task = JSON.parse(response.result.content[0].text);
      createdTaskId = task.id;

      assert(task.title.includes("GET /api/v1/writer/jobs"), "Title should match");
      assert(task.status === "pending", "Status should be 'pending'");
      assert(task.assignedTo === "backend-developer", "Assigned to backend-developer");
      assert(task.priority === "high", "Priority should be 'high'");
      assert(task.reportTo === "orchestrator", "ReportTo should be orchestrator");
      assert(task.tags.length === 3, "Should have 3 tags");
      assert(task.id.length > 0, "Should have an ID");
    });

    // ── Test 3: Create Frontend Task ────────────────────────────────────
    let frontendTaskId = null;

    await runTest("Create frontend task", async () => {
      const response = await client.call("tools/call", {
        name: "task_create",
        arguments: {
          title: "Build JobsListPage component",
          description: "React component với Tailwind CSS",
          priority: "medium",
          assignedTo: "frontend-developer",
          tags: ["writer-management", "frontend"],
          reportTo: "orchestrator",
        },
      });

      const task = JSON.parse(response.result.content[0].text);
      frontendTaskId = task.id;
      assert(task.status === "pending", "Status should be 'pending'");
      assert(task.assignedTo === "frontend-developer", "Assigned to frontend-developer");
    });

    // ── Test 4: Claim Task ──────────────────────────────────────────────
    await runTest("Claim a task", async () => {
      const response = await client.call("tools/call", {
        name: "task_claim",
        arguments: {
          taskId: createdTaskId,
          agentName: "backend-developer",
        },
      });

      const task = JSON.parse(response.result.content[0].text);
      assert(task.status === "in_progress", "Status should become 'in_progress'");
      assert(task.assignedTo === "backend-developer", "Assigned to backend-developer");
      assert(task.startedAt !== null, "startedAt should be set");
    });

    // ── Test 5: Update Progress ─────────────────────────────────────────
    await runTest("Update task progress", async () => {
      const response = await client.call("tools/call", {
        name: "task_update",
        arguments: {
          taskId: createdTaskId,
          progress: 50,
          context: { currentFile: "GetJobsEndpoint.cs" },
        },
      });

      const task = JSON.parse(response.result.content[0].text);
      assert(task.progress === 50, "Progress should be 50%");
      assert(task.context.currentFile === "GetJobsEndpoint.cs", "Context updated");
    });

    // ── Test 6: Pause Task ──────────────────────────────────────────────
    await runTest("Pause a task", async () => {
      const response = await client.call("tools/call", {
        name: "task_pause",
        arguments: {
          taskId: createdTaskId,
          reason: "Waiting for DB schema review",
        },
      });

      const task = JSON.parse(response.result.content[0].text);
      assert(task.status === "paused", "Status should become 'paused'");
      assert(task.metadata.pauseReason === "Waiting for DB schema review", "Pause reason saved");
    });

    // ── Test 7: Resume Task ─────────────────────────────────────────────
    await runTest("Resume a paused task", async () => {
      const response = await client.call("tools/call", {
        name: "task_update",
        arguments: {
          taskId: createdTaskId,
          status: "in_progress",
        },
      });

      const task = JSON.parse(response.result.content[0].text);
      assert(task.status === "in_progress", "Status should be 'in_progress'");
    });

    // ── Test 8: Report Task ─────────────────────────────────────────────
    await runTest("Report task completion", async () => {
      const response = await client.call("tools/call", {
        name: "task_report",
        arguments: {
          taskId: createdTaskId,
          result: {
            endpoints: ["GET /api/v1/writer/jobs"],
            files: ["GetJobsEndpoint.cs", "GetJobsQuery.cs", "GetJobsHandler.cs"],
          },
          summary: "Created GetJobs endpoint with CQRS. Includes pagination.",
        },
      });

      const data = JSON.parse(response.result.content[0].text);
      assert(data.task.status === "completed", "Status should be 'completed'");
      assert(data.task.completedAt !== null, "completedAt should be set");
      assert(data.reportTo === "orchestrator", "Should report to orchestrator");
      assert(data.task.result.endpoints.length === 1, "Should have endpoint info");
    });

    // ── Test 9: Find Available Tasks ────────────────────────────────────
    await runTest("Find available tasks", async () => {
      const response = await client.call("tools/call", {
        name: "task_find_available",
        arguments: {
          agentName: "frontend-developer",
          tags: ["frontend"],
        },
      });

      const tasks = JSON.parse(response.result.content[0].text);
      assert(Array.isArray(tasks), "Should return an array");
      assert(tasks.length > 0, "Should find available tasks");
      assert(tasks.every(t => t.status === "pending" || t.status === "paused"), 
        "All should be pending or paused");
    });

    // ── Test 10: List Tasks ─────────────────────────────────────────────
    await runTest("List tasks with filters", async () => {
      const response = await client.call("tools/call", {
        name: "task_list",
        arguments: {
          assignedTo: "backend-developer",
          status: "completed",
        },
      });

      const tasks = JSON.parse(response.result.content[0].text);
      assert(Array.isArray(tasks), "Should return an array");
      assert(tasks.length > 0, "Should find completed tasks");
      assert(tasks.every(t => t.assignedTo === "backend-developer"), "All backend-developer");
      assert(tasks.every(t => t.status === "completed"), "All completed");
    });

    // ── Test 11: Get Task Detail ───────────────────────────────────────
    await runTest("Get task detail", async () => {
      const response = await client.call("tools/call", {
        name: "task_get",
        arguments: { taskId: createdTaskId },
      });

      const task = JSON.parse(response.result.content[0].text);
      assert(task.id === createdTaskId, "Should return correct task");
      assert(task.result !== null, "Should include result");
      assert(task.metadata.summary !== undefined, "Should include summary in metadata");
    });

    // ── Test 12: Get Non-existent Task ─────────────────────────────────
    await runTest("Get non-existent task", async () => {
      const response = await client.call("tools/call", {
        name: "task_get",
        arguments: { taskId: "non-existent-id" },
      });

      const responseBody = response?.result;
      const isError = responseBody?.isError === true || 
        (responseBody?.content?.[0]?.text && 
         JSON.parse(responseBody.content[0].text).error);
      assert(isError, "Should return error for non-existent task");
    });

    // ── Test 13: Cancel Task ───────────────────────────────────────────
    await runTest("Cancel a pending task", async () => {
      const createResp = await client.call("tools/call", {
        name: "task_create",
        arguments: { title: "Task to cancel" },
      });
      const cancelTask = JSON.parse(createResp.result.content[0].text);

      const response = await client.call("tools/call", {
        name: "task_cancel",
        arguments: {
          taskId: cancelTask.id,
          reason: "No longer needed",
        },
      });

      const task = JSON.parse(response.result.content[0].text);
      assert(task.status === "cancelled", "Status should be 'cancelled'");
      assert(task.metadata.cancelReason === "No longer needed", "Cancel reason saved");
    });

    // ── Test 14: Fail Task ─────────────────────────────────────────────
    await runTest("Fail a task with retry", async () => {
      const createResp = await client.call("tools/call", {
        name: "task_create",
        arguments: { title: "Failing task", assignedTo: "backend-developer" },
      });
      const failTask = JSON.parse(createResp.result.content[0].text);

      // Claim it
      await client.call("tools/call", {
        name: "task_claim",
        arguments: { taskId: failTask.id, agentName: "backend-developer" },
      });

      // Fail it
      const response = await client.call("tools/call", {
        name: "task_fail",
        arguments: {
          taskId: failTask.id,
          error: "Database connection timeout after 3 retries",
          recoverable: true,
        },
      });

      const task = JSON.parse(response.result.content[0].text);
      assert(task.status === "failed", "Status should be 'failed'");
      assert(task.error.includes("Database connection"), "Error should be saved");
      assert(task.metadata.recoverable === true, "Should be marked recoverable");
    });

    // ── Test 15: Retry Failed Task ─────────────────────────────────────
    await runTest("Retry a failed task", async () => {
      // Find a failed task
      const listResp = await client.call("tools/call", {
        name: "task_list",
        arguments: { status: "failed", assignedTo: "backend-developer" },
      });
      const failedTasks = JSON.parse(listResp.result.content[0].text);
      const failedTask = failedTasks[0];

      if (failedTask) {
        const response = await client.call("tools/call", {
          name: "task_update",
          arguments: {
            taskId: failedTask.id,
            status: "in_progress",
          },
        });

        const task = JSON.parse(response.result.content[0].text);
        assert(task.status === "in_progress", "Failed task can be retried");
      } else {
        assert(false, "Should have at least one failed task");
      }
    });

    // ── Test 16: Invalid Status Transition ─────────────────────────────
    await runTest("Reject invalid status transition", async () => {
      // Try to cancel a completed task (invalid)
      const listResp = await client.call("tools/call", {
        name: "task_list",
        arguments: { status: "completed" },
      });
      const completedTasks = JSON.parse(listResp.result.content[0].text);
      const completedTask = completedTasks[0];

      if (completedTask) {
        const response = await client.call("tools/call", {
          name: "task_update",
          arguments: {
            taskId: completedTask.id,
            status: "in_progress",
          },
        });

        const responseBody = response?.result;
        const isError = responseBody?.isError === true || 
          (responseBody?.content?.[0]?.text && 
           JSON.parse(responseBody.content[0].text).error);
        assert(isError, "Should reject invalid transition");
      }
    });

  } finally {
    proc.kill();
  }

  // ── Summary ──────────────────────────────────────────────────────────
  const total = testsPassed + testsFailed;
  console.log("\n" + "=".repeat(50));
  if (testsFailed === 0) {
    console.log(`🎉 All ${testsPassed}/${total} tests PASSED!`);
  } else {
    console.log(`📊 Results: ${testsPassed}/${total} passed, ${testsFailed} failed`);
  }

  process.exit(testsFailed > 0 ? 1 : 0);
}

main();
