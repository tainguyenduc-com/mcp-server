import { runTest, assert } from "../test-setup.js";
import { createTask, listTasks } from "../taskService.js";

export async function testListTasks() {
  await runTest("Create task for list test", async () => {
    const task = createTask({ title: "ListTest", assignedTo: "backend-developer", priority: "high" });
    assert(task && task.id, "Task created with ID");
  });

  await runTest("List tasks with filters", async () => {
    const tasks = listTasks({ assignedTo: "backend-developer" });
    assert(Array.isArray(tasks), "Should return array");
    assert(tasks.length > 0, "Should find tasks");
    assert(tasks.every(t => t.assignedTo === "backend-developer"), "All backend-developer");
  });
}
