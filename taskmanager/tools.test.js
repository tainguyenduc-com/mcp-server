import { runTest, assert } from "./test-setup.js";
import * as taskService from "./taskService.js";

export async function testTools() {
  // Directly use imported taskService
  await runTest("Task service exports all expected functions", async () => {
    const expectedFns = [
      "createTask", "claimTask", "updateTask", "listTasks", "getTask",
      "findAvailableTasks", "reportTask", "deleteTask", "getTaskStats",
      "getTaskTree", "getSubtasks", "getAncestors", "autoUpdateParentProgress",
      "emptyTasks", "deleteTasksByStatus",
    ];
    for (const fn of expectedFns) {
      assert(typeof taskService[fn] === "function", `Should include ${fn}`);
    }
  });
}
