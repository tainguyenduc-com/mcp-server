import { strict as assert } from "node:assert";
import path from "node:path";
import fs from "node:fs";
import { resetStore, TEST_STORE_DIR } from "./helpers.js";
import { ensureDirectories, loadTasks, saveTasks, backupTasks } from "../src/storage.js";

describe("storage", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("ensureDirectories", () => {
    it("should create store and backup directories", () => {
      fs.rmSync(TEST_STORE_DIR, { recursive: true, force: true });
      ensureDirectories();
      assert.ok(fs.existsSync(TEST_STORE_DIR));
      assert.ok(fs.existsSync(path.join(TEST_STORE_DIR, "backups")));
    });
  });

  describe("loadTasks / saveTasks", () => {
    it("should return empty array when no tasks file exists", () => {
      fs.rmSync(TEST_STORE_DIR, { recursive: true, force: true });
      const tasks = loadTasks();
      assert.deepEqual(tasks, []);
    });

    it("should save and reload tasks", () => {
      const tasks = [{ id: "1", title: "Test" }];
      const result = saveTasks(tasks);
      assert.ok(result);
      const loaded = loadTasks();
      assert.deepEqual(loaded, tasks);
    });

    it("should handle empty task array", () => {
      const result = saveTasks([]);
      assert.ok(result);
      const loaded = loadTasks();
      assert.deepEqual(loaded, []);
    });
  });

  describe("backupTasks", () => {
    it("should create a backup file", () => {
      const tasks = [{ id: "1", title: "Test" }];
      backupTasks(tasks);
      const backupDir = path.join(TEST_STORE_DIR, "backups");
      assert.ok(fs.existsSync(backupDir));
      const files = fs.readdirSync(backupDir).filter(f => f.startsWith("tasks-"));
      assert.ok(files.length > 0);
      const content = JSON.parse(fs.readFileSync(path.join(backupDir, files[0]), "utf-8"));
      assert.deepEqual(content, tasks);
    });

    it("should not exceed max 50 backups", () => {
      for (let i = 0; i < 55; i++) {
        backupTasks([{ id: `${i}` }]);
      }
      const backupDir = path.join(TEST_STORE_DIR, "backups");
      const files = fs.readdirSync(backupDir).filter(f => f.startsWith("tasks-"));
      assert.ok(files.length <= 50);
    });

    it("should not throw when called without tasks", () => {
      backupTasks([]);
      const backupDir = path.join(TEST_STORE_DIR, "backups");
      const files = fs.readdirSync(backupDir).filter(f => f.startsWith("tasks-"));
      assert.ok(files.length > 0);
    });
  });
});
