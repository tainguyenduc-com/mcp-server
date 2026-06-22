import { strict as assert } from "node:assert";
import { VALID_STATUSES, VALID_PRIORITIES, VALID_TRANSITIONS } from "../src/constants.js";

describe("constants", () => {
  describe("VALID_STATUSES", () => {
    it("should contain all expected statuses", () => {
      assert.deepEqual(VALID_STATUSES, ["pending", "in_progress", "paused", "completed", "failed", "cancelled"]);
    });
  });

  describe("VALID_PRIORITIES", () => {
    it("should contain all expected priorities", () => {
      assert.deepEqual(VALID_PRIORITIES, ["low", "medium", "high", "critical"]);
    });
  });

  describe("VALID_TRANSITIONS", () => {
    it("pending should transition to in_progress or cancelled", () => {
      assert.deepEqual(VALID_TRANSITIONS.pending, ["in_progress", "cancelled"]);
    });

    it("in_progress should transition to completed, failed, paused, cancelled", () => {
      assert.deepEqual(VALID_TRANSITIONS.in_progress, ["completed", "failed", "paused", "cancelled"]);
    });

    it("paused should transition to in_progress or cancelled", () => {
      assert.deepEqual(VALID_TRANSITIONS.paused, ["in_progress", "cancelled"]);
    });

    it("completed should have no transitions", () => {
      assert.deepEqual(VALID_TRANSITIONS.completed, []);
    });

    it("failed should transition to in_progress", () => {
      assert.deepEqual(VALID_TRANSITIONS.failed, ["in_progress"]);
    });

    it("cancelled should have no transitions", () => {
      assert.deepEqual(VALID_TRANSITIONS.cancelled, []);
    });
  });
});
