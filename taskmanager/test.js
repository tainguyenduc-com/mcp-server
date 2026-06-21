import { summarizeTests, testsPassed, testsFailed } from "./test-setup.js";

// Import all test modules
import { testCreateTask } from "./createTask.test.js";
import { testClaimTask } from "./claimTask.test.js";
import { testListTasks } from "./test/listTasks.test.js"; // path may differ
import { testTools } from "./tools.test.js";
import { testGetTask } from "./test/getTask.test.js";
import { testTaskDelete } from "./test/taskDelete.test.js";
import { testTaskEmpty } from "./test/taskEmpty.test.js";

async function runAll() {
  await testCreateTask();
  await testClaimTask();
  await testListTasks();
  await testTools();
  await testGetTask();
  await testTaskDelete();
  await testTaskEmpty();
  summarizeTests();
}

runAll();
