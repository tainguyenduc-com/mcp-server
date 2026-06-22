import { strict as assert } from "node:assert";
import { resetStore } from "./helpers.js";
import { createTask } from "../src/taskLifecycle.js";
import { updateTask } from "../src/taskUpdate.js";
import { loadTasks, saveTasks } from "../src/storage.js";
import { getTaskTree, getSubtasks, getAncestors, autoUpdateParentProgress } from "../src/taskTree.js";

describe("taskTree", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("getSubtasks", () => {
    it("should return empty array for task with no children", () => {
      const task = createTask({ title: "Leaf" });
      const subtasks = getSubtasks(task.id);
      assert.deepEqual(subtasks, []);
    });

    it("should return direct children", () => {
      const parent = createTask({ title: "Parent" });
      createTask({ title: "Child1", parentTaskId: parent.id });
      createTask({ title: "Child2", parentTaskId: parent.id });
      const subtasks = getSubtasks(parent.id);
      assert.equal(subtasks.length, 2);
    });
  });

  describe("getAncestors", () => {
    it("should return empty array for root task", () => {
      const task = createTask({ title: "Root" });
      const ancestors = getAncestors(task.id);
      assert.deepEqual(ancestors, []);
    });

    it("should return ancestors in order from root to parent", () => {
      const grandparent = createTask({ title: "GP" });
      const parent = createTask({ title: "P", parentTaskId: grandparent.id });
      const child = createTask({ title: "C", parentTaskId: parent.id });
      const ancestors = getAncestors(child.id);
      assert.equal(ancestors.length, 2);
      assert.equal(ancestors[0].id, grandparent.id);
      assert.equal(ancestors[1].id, parent.id);
    });
  });

  describe("getTaskTree", () => {
    it("should throw for non-existent task", () => {
      assert.throws(() => getTaskTree("bad-id"), /Task not found/);
    });

    it("should build tree for leaf task", () => {
      const task = createTask({ title: "Leaf" });
      const tree = getTaskTree(task.id);
      assert.equal(tree.subtaskCount, 0);
    });

    it("should build tree with children", () => {
      const parent = createTask({ title: "Parent" });
      createTask({ title: "Child1", parentTaskId: parent.id });
      createTask({ title: "Child2", parentTaskId: parent.id });
      const tree = getTaskTree(parent.id);
      assert.equal(tree.subtaskCount, 2);
      assert.ok(tree.subtaskSummary);
      assert.equal(tree.subtaskSummary.totalChildren, 2);
    });
  });

  describe("autoUpdateParentProgress", () => {
    it("should do nothing for root task", () => {
      const task = createTask({ title: "Root" });
      autoUpdateParentProgress(task.id);
      assert.equal(task.status, "pending");
    });

    it("should update parent progress when child completes", () => {
      const parent = createTask({ title: "Parent" });
      const child = createTask({ title: "Child", parentTaskId: parent.id });
      updateTask(child.id, { status: "in_progress" });
      updateTask(child.id, { status: "completed" });
      autoUpdateParentProgress(child.id);
      const tasks = loadTasks();
      const updatedParent = tasks.find(t => t.id === parent.id);
      assert.equal(updatedParent.progress, 100);
      assert.equal(updatedParent.status, "completed");
    });

    it("should not infinite loop on circular reference", () => {
      const a = createTask({ title: "A" });
      const b = createTask({ title: "B", parentTaskId: a.id });
      const tasks = loadTasks();
      const taskA = tasks.find(t => t.id === a.id);
      taskA.parentTaskId = b.id;
      saveTasks(tasks);
      autoUpdateParentProgress(b.id);
      assert.ok(true, "Did not infinite loop");
    });
  });
});
