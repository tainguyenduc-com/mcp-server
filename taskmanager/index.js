// index.js – entry point
import { ensureDirectories } from "./storage.js";
import { server } from "./serverSetup.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TASKS_FILE, TASK_STORE_DIR } from "./constants.js";
import { deleteTasksByStatus } from "./taskService.js";

export async function main() {
  ensureDirectories();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[taskmanager] MCP Server started`);
  console.error(`[taskmanager] Task store: ${TASKS_FILE}`);
  console.error(`[taskmanager] Task store dir: ${TASK_STORE_DIR}`);
  console.error(`[taskmanager] PID: ${process.pid}`);
  console.error(`[taskmanager] Source: ${process.argv[2] ? "CLI arg" : process.env.TASK_STORE_DIR ? "env var" : "CWD fallback"}`);
  console.error(`[taskmanager] CWD: ${process.cwd()}`);

  // Cleanup job — run once on start if --cleanup-on-start=true
  const parseArg = (name, def) => {
    const idx = process.argv.indexOf(name);
    return idx !== -1 ? process.argv[idx + 1] : def;
  };
  const cleanupOnStart =
    process.argv.includes('--cleanup-on-start=true') ||
    (process.argv.includes('--cleanup-on-start') && parseArg('--cleanup-on-start') === 'true');
  const maxAgeMs = parseInt(
    parseArg('--cleanup-max-age', process.env.TASK_CLEANUP_MAX_AGE_MS || '86400000'),
    10
  );
  if (cleanupOnStart) {
    const olderThan = new Date(Date.now() - maxAgeMs).toISOString();
    try {
      const result = deleteTasksByStatus('completed', olderThan);
      console.error(`[Cleanup] Deleted ${result.deletedCount} completed tasks older than ${olderThan}`);
    } catch (err) {
      console.error(`[Cleanup] Error: ${err.message}`);
    }
  }
}

