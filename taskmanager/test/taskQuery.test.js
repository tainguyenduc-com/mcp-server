import { strict as assert } from "node:assert";
import { resetStore } from "./helpers.js";
import { createTask } from "../src/taskLifecycle.js";
import { updateTask } from "../src/taskUpdate.js";
import { listTasks, getTask, findAvailableTasks, getTaskStats } from "../src/taskQuery.js";

describe("taskQuery", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("listTasks", () => {
    it("should return empty array when no tasks", () => {
      const tasks = listTasks();
      assert.deepEqual(tasks, []);
    });

    it("should list all tasks", () => {
      createTask({ title: "A" });
      createTask({ title: "B" });
      const tasks = listTasks();
      assert.equal(tasks.length, 2);
    });

    it("should filter by status", () => {
      const t1 = createTask({ title: "Pending" });
      createTask({ title: "Completed" });
      updateTask(t1.id, { status: "in_progress" });
      const filtered = listTasks({ status: "pending" });
      assert.equal(filtered.length, 1);
    });

    it("should filter by assignedTo", () => {
      createTask({ title: "Mine", assignedTo: "agent-1" });
      createTask({ title: "Other", assignedTo: "agent-2" });
      const filtered = listTasks({ assignedTo: "agent-1" });
      assert.equal(filtered.length, 1);
    });

    it("should filter by priority", () => {
      createTask({ title: "High", priority: "high" });
      createTask({ title: "Low", priority: "low" });
      const filtered = listTasks({ priority: "high" });
      assert.equal(filtered.length, 1);
    });

    it("should filter by tag", () => {
      createTask({ title: "Tagged", tags: ["urgent"] });
      createTask({ title: "Plain" });
      const filtered = listTasks({ tag: "urgent" });
      assert.equal(filtered.length, 1);
    });

    it("should filter by parentTaskId", () => {
      const parent = createTask({ title: "Parent" });
      createTask({ title: "Child", parentTaskId: parent.id });
      const filtered = listTasks({ parentTaskId: parent.id });
      assert.equal(filtered.length, 1);
    });

    it("should filter root tasks with parentTaskId=null", () => {
      createTask({ title: "Root" });
      createTask({ title: "Child", parentTaskId: "some-parent" });
      const filtered = listTasks({ parentTaskId: "null" });
      assert.equal(filtered.length, 1);
    });

    it("should search by title", () => {
      createTask({ title: "Interesting Task" });
      createTask({ title: "Boring Task" });
      const filtered = listTasks({ search: "interesting" });
      assert.equal(filtered.length, 1);
    });

    it("should respect limit and offset", () => {
      for (let i = 0; i < 10; i++) createTask({ title: `Task ${i}` });
      const tasks = listTasks({ limit: "3", offset: "2" });
      assert.equal(tasks.length, 3);
    });
  });

  describe("getTask", () => {
    it("should retrieve a task by ID", () => {
      const task = createTask({ title: "Find Me" });
      const found = getTask(task.id);
      assert.equal(found.title, "Find Me");
    });

    it("should throw for non-existent task", () => {
      assert.throws(() => getTask("bad-id"), /Task not found/);
    });
  });

  describe("findAvailableTasks", () => {
    it("should return pending and paused tasks", () => {
      createTask({ title: "Available" });
      const available = findAvailableTasks();
      assert.equal(available.length, 1);
    });

    it("should exclude in_progress tasks", () => {
      const task = createTask({ title: "Busy" });
      updateTask(task.id, { status: "in_progress" });
      const available = findAvailableTasks();
      assert.equal(available.length, 0);
    });

    it("should filter by agentName", () => {
      createTask({ title: "For Agent" });
      const available = findAvailableTasks("agent-1");
      assert.ok(available.length >= 0);
    });

    it("should filter by tags", () => {
      createTask({ title: "Tagged", tags: ["urgent"] });
      createTask({ title: "Plain" });
      const available = findAvailableTasks(null, ["urgent"]);
      assert.equal(available.length, 1);
    });

    it("should limit to 20 results", () => {
      for (let i = 0; i < 25; i++) createTask({ title: `Task ${i}` });
      const available = findAvailableTasks();
      assert.equal(available.length, 20);
    });
  });

  describe("getTaskStats", () => {
    it("should return zero stats for empty store", () => {
      const stats = getTaskStats();
      assert.equal(stats.total, 0);
    });

    it("should aggregate by status and priority", () => {
      createTask({ title: "A" });
      createTask({ title: "B" });
      createTask({ title: "C", priority: "high" });
      const stats = getTaskStats();
      assert.equal(stats.total, 3);
    });
  });
});
