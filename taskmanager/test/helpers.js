import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TEST_STORE_DIR = path.join(__dirname, "..", ".task-test");

export function resetStore() {
  process.env.TASK_STORE_DIR = TEST_STORE_DIR;
  if (fs.existsSync(TEST_STORE_DIR)) {
    fs.rmSync(TEST_STORE_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_STORE_DIR, { recursive: true });
  fs.writeFileSync(path.join(TEST_STORE_DIR, "tasks.json"), "[]", "utf-8");
}
