import { strict as assert } from "node:assert";
import { resetStore } from "./helpers.js";
import { createTask } from "../src/taskLifecycle.js";
import { updateTask } from "../src/taskUpdate.js";
import { loadTasks } from "../src/storage.js";

describe("taskUpdate", () => {
  beforeEach(() => {
    resetStore();
  });

  it("should update task title via metadata", () => {
    const task = createTask({ title: "Original" });
    const updated = updateTask(task.id, { metadata: { newTitle: "Updated" } });
    assert.equal(updated.metadata.newTitle, "Updated");
  });

  it("should update progress", () => {
    const task = createTask({ title: "Progress" });
    const updated = updateTask(task.id, { progress: 50 });
    assert.equal(updated.progress, 50);
  });

  it("should transition pending -> in_progress and set startedAt", () => {
    const task = createTask({ title: "Start" });
    const updated = updateTask(task.id, { status: "in_progress" });
    assert.equal(updated.status, "in_progress");
    assert.ok(updated.startedAt);
  });

  it("should transition in_progress -> completed and set completedAt", () => {
    const task = createTask({ title: "Complete" });
    updateTask(task.id, { status: "in_progress" });
    const updated = updateTask(task.id, { status: "completed" });
    assert.equal(updated.status, "completed");
    assert.ok(updated.completedAt);
  });

  it("should reject invalid transition", () => {
    const task = createTask({ title: "Invalid" });
    assert.throws(() => updateTask(task.id, { status: "completed" }), /Invalid status transition/);
  });

  it("should throw for non-existent task", () => {
    assert.throws(() => updateTask("bad-id", { progress: 50 }), /Task not found/);
  });

  it("should update assignedTo and priority", () => {
    const task = createTask({ title: "Reassign" });
    const updated = updateTask(task.id, { assignedTo: "agent-2", priority: "high" });
    assert.equal(updated.assignedTo, "agent-2");
    assert.equal(updated.priority, "high");
  });

  it("should merge context and metadata", () => {
    const task = createTask({ title: "Merge", context: { a: 1 }, metadata: { b: 2 } });
    const updated = updateTask(task.id, { context: { c: 3 }, metadata: { d: 4 } });
    assert.deepEqual(updated.context, { a: 1, c: 3 });
    assert.deepEqual(updated.metadata, { b: 2, d: 4 });
  });

  it("should update updatedAt timestamp", () => {
    const task = createTask({ title: "Time" });
    const old = task.updatedAt;
    const updated = updateTask(task.id, { progress: 10 });
    assert.ok(new Date(updated.updatedAt) >= new Date(old));
  });
});
