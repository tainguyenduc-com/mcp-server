import { strict as assert } from "node:assert";
import { resetStore } from "./helpers.js";
import { createTask, deleteTask } from "../src/taskLifecycle.js";
import { loadTasks } from "../src/storage.js";

describe("taskLifecycle", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("createTask", () => {
    it("should create a task with required fields", () => {
      const task = createTask({ title: "My Task" });
      assert.ok(task.id);
      assert.equal(task.title, "My Task");
      assert.equal(task.status, "pending");
      assert.equal(task.priority, "medium");
    });

    it("should accept optional fields", () => {
      const task = createTask({
        title: "High Priority",
        description: "Desc",
        priority: "high",
        assignedTo: "agent-1",
        tags: ["urgent"],
        parentTaskId: "parent-id",
        reportTo: "orchestrator",
        context: { env: "prod" },
        metadata: { source: "test" },
      });
      assert.equal(task.priority, "high");
      assert.equal(task.assignedTo, "agent-1");
      assert.deepEqual(task.tags, ["urgent"]);
      assert.equal(task.parentTaskId, "parent-id");
      assert.equal(task.reportTo, "orchestrator");
    });

    it("should reject empty title", () => {
      assert.throws(() => createTask({ title: "" }), /Task title cannot be empty/);
    });

    it("should reject whitespace-only title", () => {
      assert.throws(() => createTask({ title: "   " }), /Task title cannot be empty/);
    });

    it("should reject invalid priority", () => {
      assert.throws(() => createTask({ title: "Test", priority: "urgent" }), /Invalid priority/);
    });

    it("should reject invalid UUID format", () => {
      assert.throws(() => createTask({ title: "Test", id: "not-a-uuid" }), /Invalid UUID format/);
    });

    it("should accept a valid custom UUID", () => {
      const task = createTask({ title: "Test", id: "1c69963b-cb65-4929-a7c8-1d1bc098776a" });
      assert.equal(task.id, "1c69963b-cb65-4929-a7c8-1d1bc098776a");
    });

    it("should persist task to storage", () => {
      createTask({ title: "Persisted" });
      const tasks = loadTasks();
      assert.ok(tasks.some(t => t.title === "Persisted"));
    });
  });

  describe("deleteTask", () => {
    it("should delete an existing task", () => {
      const task = createTask({ title: "To Delete" });
      deleteTask(task.id);
      const remaining = loadTasks();
      assert.equal(remaining.some(t => t.id === task.id), false);
    });

    it("should throw for non-existent task", () => {
      assert.throws(() => deleteTask("nonexistent-id"), /Task not found/);
    });

    it("should delete task and its descendants", () => {
      const parent = createTask({ title: "Parent" });
      const child = createTask({ title: "Child", parentTaskId: parent.id });
      const grandchild = createTask({ title: "Grandchild", parentTaskId: child.id });
      const result = deleteTask(parent.id);
      assert.equal(result.subtaskCount, 2);
      assert.deepEqual(result.subtaskIds, [child.id, grandchild.id]);
      const remaining = loadTasks();
      assert.equal(remaining.some(t => t.id === parent.id), false);
      assert.equal(remaining.some(t => t.id === child.id), false);
      assert.equal(remaining.some(t => t.id === grandchild.id), false);
    });
  });
});
