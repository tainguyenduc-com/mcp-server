import { strict as assert } from "node:assert";
import { resetStore } from "./helpers.js";
import { claimTask } from "../src/taskClaim.js";
import { createTask } from "../src/taskLifecycle.js";
import { updateTask } from "../src/taskUpdate.js";

describe("taskClaim", () => {
  beforeEach(() => {
    resetStore();
  });

  it("should claim a pending task", () => {
    const task = createTask({ title: "Claimable" });
    const claimed = claimTask(task.id, "agent-1");
    assert.equal(claimed.status, "in_progress");
    assert.equal(claimed.assignedTo, "agent-1");
    assert.ok(claimed.startedAt);
  });

  it("should throw for non-existent task", () => {
    assert.throws(() => claimTask("bad-id", "agent-1"), /Task not found/);
  });

  it("should throw for non-pending task", () => {
    const task = createTask({ title: "Claimed Task" });
    claimTask(task.id, "agent-1");
    assert.throws(() => claimTask(task.id, "agent-2"), /expected "pending"/);
  });

  it("should throw if already assigned to another agent", () => {
    const task = createTask({ title: "Assigned", assignedTo: "agent-2" });
    assert.throws(() => claimTask(task.id, "agent-1"), /already assigned/);
  });

  it("should allow claiming if assigned to same agent", () => {
    const task = createTask({ title: "Mine" });
    const claim = claimTask(task.id, "agent-1");
    assert.equal(claim.assignedTo, "agent-1");
  });
});
