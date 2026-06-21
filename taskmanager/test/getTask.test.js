import { runTest, assert } from "../test-setup.js";
import { createTask, getTask } from "../taskService.js";

export async function testGetTask() {
  // create a task
  const created = createTask({ title: "GetTask Test", description: "", priority: "low" });
  const id = created.id;

  await runTest("Get task detail", async () => {
    const task = getTask(id);
    assert(task.id === id, "Returned correct task");
    assert(task.title === "GetTask Test", "Title matches");
  });
}
