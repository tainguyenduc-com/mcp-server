import { strict as assert } from "node:assert";
import { isValidTransition, VALID_STATUSES, VALID_PRIORITIES, VALID_TRANSITIONS } from "../src/taskValidation.js";

describe("taskValidation", () => {
  describe("isValidTransition", () => {
    it("should allow pending -> in_progress", () => {
      assert.ok(isValidTransition("pending", "in_progress"));
    });

    it("should allow pending -> cancelled", () => {
      assert.ok(isValidTransition("pending", "cancelled"));
    });

    it("should allow in_progress -> completed", () => {
      assert.ok(isValidTransition("in_progress", "completed"));
    });

    it("should allow in_progress -> failed", () => {
      assert.ok(isValidTransition("in_progress", "failed"));
    });

    it("should allow in_progress -> paused", () => {
      assert.ok(isValidTransition("in_progress", "paused"));
    });

    it("should allow paused -> in_progress", () => {
      assert.ok(isValidTransition("paused", "in_progress"));
    });

    it("should allow failed -> in_progress", () => {
      assert.ok(isValidTransition("failed", "in_progress"));
    });

    it("should reject pending -> completed", () => {
      assert.ok(!isValidTransition("pending", "completed"));
    });

    it("should reject completed -> in_progress", () => {
      assert.ok(!isValidTransition("completed", "in_progress"));
    });

    it("should reject cancelled -> pending", () => {
      assert.ok(!isValidTransition("cancelled", "pending"));
    });

    it("should return false for unknown status", () => {
      assert.ok(!isValidTransition("unknown", "pending"));
    });
  });

  describe("re-exports", () => {
    it("should re-export VALID_STATUSES", () => {
      assert.ok(Array.isArray(VALID_STATUSES));
    });

    it("should re-export VALID_PRIORITIES", () => {
      assert.ok(Array.isArray(VALID_PRIORITIES));
    });

    it("should re-export VALID_TRANSITIONS", () => {
      assert.ok(typeof VALID_TRANSITIONS === "object");
    });
  });
});
