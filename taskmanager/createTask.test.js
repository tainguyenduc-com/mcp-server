import { runTest, assert, createRPCClient, setupServer } from "./test-setup.js";

export async function testCreateTask() {
  const proc = await setupServer();
  const client = createRPCClient(proc);
  let createdTaskId = null;

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

  proc.kill();
  return createdTaskId; // Return for subsequent tests
}
