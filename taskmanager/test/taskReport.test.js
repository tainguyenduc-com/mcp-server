import { strict as assert } from "node:assert";
import { resetStore } from "./helpers.js";
import { createTask } from "../src/taskLifecycle.js";
import { updateTask } from "../src/taskUpdate.js";
import { reportTask } from "../src/taskReport.js";

describe("taskReport", () => {
  beforeEach(() => {
    resetStore();
  });

  it("should report completed task", () => {
    const task = createTask({ title: "Report" });
    updateTask(task.id, { status: "in_progress" });
    const result = reportTask(task.id, { result: "success", summary: "Done well" });
    assert.equal(result.task.status, "completed");
    assert.equal(result.task.result, "success");
    assert.ok(result.task.completedAt);
  });

  it("should auto-complete in_progress task on report", () => {
    const task = createTask({ title: "AutoComplete" });
    updateTask(task.id, { status: "in_progress" });
    const result = reportTask(task.id, { result: "ok" });
    assert.equal(result.task.status, "completed");
  });

  it("should set error on report", () => {
    const task = createTask({ title: "Error" });
    updateTask(task.id, { status: "in_progress" });
    const result = reportTask(task.id, { error: "Something failed" });
    assert.equal(result.task.error, "Something failed");
  });

  it("should include reportTo in result", () => {
    const task = createTask({ title: "Notify", reportTo: "my-agent" });
    updateTask(task.id, { status: "in_progress" });
    const result = reportTask(task.id, { result: "done" });
    assert.equal(result.reportTo, "my-agent");
  });

  it("should throw for non-existent task", () => {
    assert.throws(() => reportTask("bad-id", {}), /Task not found/);
  });
});
