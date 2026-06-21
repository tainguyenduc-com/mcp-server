import { createTask, emptyTasks, getTask } from "../taskService.js";
import { loadTasks } from "../storage.js";
import { assert } from "../test-setup.js";
import fs from "node:fs";
import path from "node:path";

function resetStore() {
  const dir = path.join(import.meta.dirname, "..", ".task");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "tasks.json"), "[]", "utf-8");
}

export async function testTaskEmpty() {
  resetStore();
  // create a few tasks
  const task1 = await createTask({ title: "T1" });
  const task2 = await createTask({ title: "T2" });
  // happy path: empty with confirmation
  const result = await emptyTasks(true);
  assert(result.message.includes("emptied"), "Empty succeeded");
  const tasks = await loadTasks();
  assert(task1.id && task2.id, "Original tasks existed");
  assert(tasks.length === 0, "All tasks removed");

  // error path: empty without confirmation should throw
  let errorCaught = false;
  try {
    await emptyTasks();
  } catch (e) {
    errorCaught = true;
  }
  assert(errorCaught, "Should error when missing confirmation");
}
