import { runTest, assert, createRPCClient, setupServer } from "./test-setup.js";
import { testCreateTask } from "./createTask.test.js";

export async function testClaimTask() {
  const proc = await setupServer();
  const client = createRPCClient(proc);
  const createdTaskId = await testCreateTask();

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

  proc.kill();
  return createdTaskId;
}
