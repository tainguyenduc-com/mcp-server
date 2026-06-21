import { createTask, deleteTask, getTask } from "../taskService.js";
import { loadTasks } from "../storage.js";
import { assert } from "../test-setup.js";
import fs from "node:fs";
import path from "node:path";

function resetStore() {
  const dir = path.join(import.meta.dirname, "..", ".task");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "tasks.json"), "[]", "utf-8");
}

export async function testTaskDelete() {
  resetStore();
  const task = await createTask({ title: "DelTask", description: "", priority: "low" });
  const id = task.id;
  await deleteTask(id);
  // verify deletion throws
  let errorCaught = false;
  try {
    await getTask(id);
  } catch (e) {
    errorCaught = true;
  }
  assert(errorCaught, "Task should be absent after delete");
}
