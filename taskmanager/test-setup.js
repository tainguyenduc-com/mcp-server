import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_SCRIPT = path.join(__dirname, "server.js");
export const TASKS_FILE = path.join(__dirname, ".task", "tasks.json");

export let testsPassed = 0;
export let testsFailed = 0;

export function assert(condition, message) {
  if (condition) {
    testsPassed++;
  } else {
    testsFailed++;
    process.stdout.write(`    ✘ ${message}\n`);
  }
}

export async function runTest(name, fn) {
  process.stdout.write(`\n  ▶ ${name}... `);
  try {
    await fn();
    process.stdout.write(`✔\n`);
  } catch (err) {
    testsFailed++;
    process.stdout.write(`✘ ${err.message}\n`);
  }
}

export function createRPCClient(proc) {
  let buffer = "";
  let pendingResolves = new Map();
  let idCounter = 0;

  proc.stdout.on("data", (data) => {
    buffer += data.toString();
    processBuffer();
  });

  function processBuffer() {
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const response = JSON.parse(trimmed);
        if (response.id !== undefined && pendingResolves.has(response.id)) {
          pendingResolves.get(response.id)(response);
          pendingResolves.delete(response.id);
        }
      } catch (e) {
        buffer = line + "\n" + buffer;
      }
    }
  }

  return {
    async call(method, params = {}) {
      const id = ++idCounter;
      const request = JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      });

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingResolves.delete(id);
          reject(new Error(`Response timeout for ${method} (id=${id})`));
        }, 5000);

        pendingResolves.set(id, (response) => {
          clearTimeout(timeout);
          resolve(response);
        });

        proc.stdin.write(request + "\n");
      });
    },
  };
}

export async function setupServer() {
  // Reset task store for test
  if (fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, "[]", "utf-8");
  }

  // Start server
  const proc = spawn("node", [SERVER_SCRIPT], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
    cwd: __dirname,
  });

  // Collect stderr (server logs) for debugging
  proc.stderr.on("data", (data) => {
    // Server diagnostic output - ignore in test
  });

  // Handle unexpected exit
  proc.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n⚠️  Server exited with code ${code}`);
    }
  });

  // Wait for server to initialize
  await new Promise((r) => setTimeout(r, 500));

  return proc;
}

export function summarizeTests() {
  const total = testsPassed + testsFailed;
  console.log("\n" + "=".repeat(50));
  if (testsFailed === 0) {
    console.log(`🎉 All ${testsPassed}/${total} tests PASSED!`);
  } else {
    console.log(`📊 Results: ${testsPassed}/${total} passed, ${testsFailed} failed`);
  }
  process.exit(testsFailed > 0 ? 1 : 0);
}

