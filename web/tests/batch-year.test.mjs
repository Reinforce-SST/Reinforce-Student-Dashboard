import { test } from "node:test";
import assert from "node:assert/strict";
import { graduationBatchYear } from "../.test-build/lib/batchYear.js";

test("profile shows only the stored four-digit graduation batch", () => {
  assert.equal(graduationBatchYear(2029), 2029);
  assert.equal(graduationBatchYear(2), null);
  assert.equal(graduationBatchYear(null), null);
});
