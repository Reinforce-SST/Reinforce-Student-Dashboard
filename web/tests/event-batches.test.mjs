import { test } from "node:test";
import assert from "node:assert/strict";
import { getEventGraduationBatches } from "../.test-build/lib/eventsData.js";

test("event graduation batches roll at July 1 in India", () => {
  assert.deepEqual(getEventGraduationBatches(new Date("2027-06-30T18:29:59Z")), [2027, 2028, 2029, 2030]);
  assert.deepEqual(getEventGraduationBatches(new Date("2027-06-30T18:30:00Z")), [2028, 2029, 2030, 2031]);
});
