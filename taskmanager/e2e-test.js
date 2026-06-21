#!/usr/bin/env node

/**
 * End-to-end test using direct taskService calls (no RPC server).
 */

import * as taskService from "./taskService.js";
import { assert } from "./test-setup.js";

async function main() {
  console.log("E2E direct test start");
  // Reset store
  const { emptyTasks } = taskService;
  emptyTasks(true);

  // Create task
  const task = taskService.createTask({ title: "Direct E2E", assignedTo: "backend-developer", priority: "high" });
  assert(task.status === "pending", "Task should be pending");

  // Claim
  const claimed = taskService.claimTask(task.id, "backend-developer");
  assert(claimed.status === "in_progress", "Claimed status");

  // Update progress
  const updated = taskService.updateTask(task.id, { progress: 70 });
  assert(updated.progress === 70, "Progress updated");

  // Report
  const reported = taskService.reportTask(task.id, { result: { done: true }, summary: "finished" });
  assert(reported.task.status === "completed", "Reported completed");

  console.log("E2E direct test passed");
}

main();

/**
 * End-to-end test: simulates full orchestrator → sub-agent flow
 * 
 * Flow:
 * 1. Orchestrator creates a task
 * 2. Sub-agent finds and claims the task
 * 3. Sub-agent updates progress
 * 4. Sub-agent completes and reports
 * 5. Orchestrator checks completed task
 */

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = path.join(__dirname, "server.js");
const tasksFile = path.join(__dirname, ".task", "tasks.json");

// Reset task store
fs.writeFileSync(tasksFile, "[]", "utf-8");

// Create RPC client
function createRPCClient(proc) {
  let buffer = "";
  const pending = new Map();
  let id = 0;

  proc.stdout.on("data", (data) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        const resp = JSON.parse(t);
        if (resp.id !== undefined && pending.has(resp.id)) {
          pending.get(resp.id)(resp);
          pending.delete(resp.id);
        }
      } catch {}
    }
  });

  return {
    call(method, params = {}) {
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (pending.has(requestId)) {
            pending.delete(requestId);
            reject(new Error(`Timeout: ${method}`));
          }
        }, 5000);
        pending.set(requestId, resolve);
        proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) + "\n");
      });
    },
  };
}

async function main() {
  console.log("=".repeat(60));
  console.log("🏁  E2E Test: Orchestrator → Task Manager → Sub-agent → Report");
  console.log("=".repeat(60));

  // Start server
  const proc = spawn("node", [SERVER_SCRIPT], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: __dirname,
  });
  proc.stderr.on("data", () => {});
  await new Promise(r => setTimeout(r, 500));

  const client = createRPCClient(proc);
  let passed = 0;
  let total = 0;

  function step(name, fn) {
    total++;
    process.stdout.write(`\n  STEP ${total}: ${name}... `);
    return fn()
      .then(() => { passed++; process.stdout.write("✅"); })
      .catch(err => { process.stdout.write(`❌ ${err.message}`); });
  }

  function check(condition, msg) {
    if (!condition) throw new Error(msg);
  }

  try {
    // ── Step 1: Orchestrator creates task ───────────────────────────
    await step("Orchestrator creates a backend API task", async () => {
      const resp = await client.call("tools/call", {
        name: "task_create",
        arguments: {
          title: "Implement GET /api/v1/writer/jobs endpoint",
          description: "Tạo endpoint mới với CQRS pattern, pagination, sorting. Module: writer-management.",
          priority: "high",
          assignedTo: "backend-developer",
          tags: ["writer-management", "backend", "api"],
          context: {
            module: "writer-management",
            constraints: [
              "Dùng IObjectMapper (KHÔNG AutoMapper)",
              "Dùng CQRSDispatcher (KHÔNG MediatR)",
              "Clean Architecture layers",
            ],
          },
          reportTo: "orchestrator",
        },
      });

      const task = JSON.parse(resp.result.content[0].text);
      check(task.status === "pending", `Expected pending, got ${task.status}`);
      check(task.assignedTo === "backend-developer", "Wrong assignee");
      check(task.priority === "high", "Wrong priority");
      global.backendTaskId = task.id;
    });

    // ── Step 2: Orchestrator creates frontend task ──────────────────
    await step("Orchestrator creates a frontend task", async () => {
      const resp = await client.call("tools/call", {
        name: "task_create",
        arguments: {
          title: "Build JobsListPage with filters",
          description: "React component showing jobs list with search, filter by status, pagination.",
          priority: "medium",
          assignedTo: "frontend-developer",
          tags: ["writer-management", "frontend"],
          reportTo: "orchestrator",
        },
      });
      const task = JSON.parse(resp.result.content[0].text);
      global.frontendTaskId = task.id;
    });

    // ── Step 3: Orchestrator creates review task ────────────────────
    await step("Orchestrator creates a review task", async () => {
      const resp = await client.call("tools/call", {
        name: "task_create",
        arguments: {
          title: "Code review: writer-management API changes",
          description: "Review tất cả changes trong writer-management module.",
          priority: "medium",
          assignedTo: "code-reviewer",
          tags: ["writer-management", "review"],
          reportTo: "orchestrator",
        },
      });
      const task = JSON.parse(resp.result.content[0].text);
      global.reviewTaskId = task.id;
    });

    // ── Step 4: Orchestrator checks status ──────────────────────────
    await step("Orchestrator lists all tasks", async () => {
      const resp = await client.call("tools/call", {
        name: "task_list",
        arguments: {},
      });
      const tasks = JSON.parse(resp.result.content[0].text);
      check(tasks.length === 3, `Expected 3 tasks, got ${tasks.length}`);
      check(tasks.filter(t => t.status === "pending").length === 3, "All should be pending");
    });

    // ── Step 5: Sub-agent finds and claims task ─────────────────────
    await step("Backend developer finds and claims task", async () => {
      const availResp = await client.call("tools/call", {
        name: "task_find_available",
        arguments: { agentName: "backend-developer", tags: [] },
      });
      const available = JSON.parse(availResp.result.content[0].text);
      check(available.length > 0, "No available tasks");
      
      const claimResp = await client.call("tools/call", {
        name: "task_claim",
        arguments: { taskId: global.backendTaskId, agentName: "backend-developer" },
      });
      const task = JSON.parse(claimResp.result.content[0].text);
      check(task.status === "in_progress", `Expected in_progress, got ${task.status}`);
      check(task.startedAt !== null, "startedAt not set");
    });

    // ── Step 6: Sub-agent updates progress ─────────────────────────
    await step("Backend developer updates progress (50%)", async () => {
      const resp = await client.call("tools/call", {
        name: "task_update",
        arguments: {
          taskId: global.backendTaskId,
          progress: 50,
          context: { currentFile: "GetJobsEndpoint.cs" },
        },
      });
      const task = JSON.parse(resp.result.content[0].text);
      check(task.progress === 50, "Progress not 50");
    });

    // ── Step 7: Sub-agent pauses task ──────────────────────────────
    await step("Backend developer pauses task (waiting for DB review)", async () => {
      const resp = await client.call("tools/call", {
        name: "task_pause",
        arguments: {
          taskId: global.backendTaskId,
          reason: "Waiting for DB schema review",
        },
      });
      const task = JSON.parse(resp.result.content[0].text);
      check(task.status === "paused", `Expected paused, got ${task.status}`);
    });

    // ── Step 8: Orchestrator sees paused task ───────────────────────
    await step("Orchestrator sees the task is paused", async () => {
      const resp = await client.call("tools/call", {
        name: "task_get",
        arguments: { taskId: global.backendTaskId },
      });
      const task = JSON.parse(resp.result.content[0].text);
      check(task.status === "paused", "Task should be paused");
      check(task.metadata.pauseReason === "Waiting for DB schema review", "Wrong pause reason");
    });

    // ── Step 9: Sub-agent resumes task ─────────────────────────────
    await step("Backend developer resumes task", async () => {
      const resp = await client.call("tools/call", {
        name: "task_update",
        arguments: {
          taskId: global.backendTaskId,
          status: "in_progress",
        },
      });
      const task = JSON.parse(resp.result.content[0].text);
      check(task.status === "in_progress", "Task should be in_progress");
    });

    // ── Step 10: Sub-agent reports completion ──────────────────────
    await step("Backend developer reports task completion", async () => {
      const resp = await client.call("tools/call", {
        name: "task_report",
        arguments: {
          taskId: global.backendTaskId,
          result: {
            endpoints: ["GET /api/v1/writer/jobs"],
            files: [
              "WriterManagement.HttpApi/Endpoints/GetJobsEndpoint.cs",
              "WriterManagement.Application/Jobs/Queries/GetJobsQuery.cs",
              "WriterManagement.Application/Jobs/Handlers/GetJobsHandler.cs",
              "WriterManagement.Application.Contracts/Jobs/JobListResponse.cs",
            ],
            implementation: "CQRS with pagination (page, pageSize), sorting by createdAt, status filter",
          },
          summary: "Hoàn thành GetJobs endpoint với CQRS pattern. Hỗ trợ pagination, filter by status, sort by date.",
        },
      });
      const data = JSON.parse(resp.result.content[0].text);
      check(data.task.status === "completed", `Expected completed, got ${data.task.status}`);
      check(data.task.completedAt !== null, "completedAt not set");
      check(data.reportTo === "orchestrator", "Wrong reportTo");
      check(data.task.result.endpoints.length === 1, "Missing endpoint info");
    });

    // ── Step 11: Frontend developer claims and completes ────────────
    await step("Frontend developer claims and completes task", async () => {
      await client.call("tools/call", {
        name: "task_claim",
        arguments: { taskId: global.frontendTaskId, agentName: "frontend-developer" },
      });
      await client.call("tools/call", {
        name: "task_report",
        arguments: {
          taskId: global.frontendTaskId,
          result: {
            components: ["JobsListPage", "JobCard", "JobFilter"],
          },
          summary: "Built JobsListPage with React + Tailwind CSS. Supports search, filter, pagination.",
        },
      });
    });

    // ── Step 12: Code reviewer claims and completes ─────────────────
    await step("Code reviewer claims and completes task", async () => {
      await client.call("tools/call", {
        name: "task_claim",
        arguments: { taskId: global.reviewTaskId, agentName: "code-reviewer" },
      });
      await client.call("tools/call", {
        name: "task_report",
        arguments: {
          taskId: global.reviewTaskId,
          result: {
            findings: [
              { severity: "minor", file: "GetJobsHandler.cs", message: "Missing null check on input" },
            ],
            approved: true,
          },
          summary: "Reviewed writer-management changes. 1 minor finding, approved with fix.",
        },
      });
    });

    // ── Step 13: Orchestrator checks all completed ─────────────────
    await step("Orchestrator verifies all tasks completed", async () => {
      const resp = await client.call("tools/call", {
        name: "task_list",
        arguments: { status: "completed" },
      });
      const tasks = JSON.parse(resp.result.content[0].text);
      check(tasks.length === 3, `Expected 3 completed, got ${tasks.length}`);
      
      for (const task of tasks) {
        check(task.status === "completed", `Task ${task.id} not completed`);
        check(task.completedAt !== null, `Task ${task.id} missing completedAt`);
        check(task.result !== null, `Task ${task.id} missing result`);
        check(task.metadata.summary, `Task ${task.id} missing summary`);
      }
    });

    // ── Step 14: Orchestrator reads results ─────────────────────────
    await step("Orchestrator reads backend task result", async () => {
      const resp = await client.call("tools/call", {
        name: "task_get",
        arguments: { taskId: global.backendTaskId },
      });
      const task = JSON.parse(resp.result.content[0].text);
      
      console.log("\n    📋 Result:", JSON.stringify(task.result, null, 4).replace(/\n/g, "\n    "));
      console.log("    📝 Summary:", task.metadata.summary);
      
      check(task.result.endpoints.length === 1, "Missing endpoint");
      check(task.result.files.length === 4, `Expected 4 files, got ${task.result.files.length}`);
    });

    // ── Summary ──────────────────────────────────────────────────────
    console.log("\n\n" + "=".repeat(60));
    if (passed === total) {
      console.log(`🎉  ALL ${passed}/${total} E2E STEPS PASSED!`);
    } else {
      console.log(`📊  ${passed}/${total} passed, ${total - passed} failed`);
    }
    console.log("=".repeat(60));

    // Show the final state
    const resp = await client.call("tools/call", {
      name: "task_list",
      arguments: {},
    });
    const allTasks = JSON.parse(resp.result.content[0].text);
    console.log("\n📊 Final task states:");
    for (const task of allTasks) {
      const age = Math.round((new Date() - new Date(task.createdAt)) / 1000);
      console.log(`  [${task.status.padEnd(12)}] ${task.title} (${task.assignedTo}) - ${age}s ago`);
    }

  } finally {
    proc.kill();
  }

  process.exit(passed === total ? 0 : 1);
}

main();
