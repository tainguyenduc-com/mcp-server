// index.js – entry point
import { ensureDirectories } from "./storage.js";
import { server } from "./serverSetup.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getTasksFile, getTaskStoreDir } from "./constants.js";

export async function main() {
  ensureDirectories();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[taskmanager] MCP Server started`);
  console.error(`[taskmanager] Task store: ${getTasksFile()}`);
  console.error(`[taskmanager] Task store dir: ${getTaskStoreDir()}`);
  console.error(`[taskmanager] PID: ${process.pid}`);
  console.error(`[taskmanager] Source: ${process.argv[2] ? "CLI arg" : process.env.TASK_STORE_DIR ? "env var" : "CWD fallback"}`);
  console.error(`[taskmanager] CWD: ${process.cwd()}`);
}

