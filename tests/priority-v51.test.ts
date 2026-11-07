// Unit tests of the waiting-list priority (proposal v5.1, section 3.5). No database.
// Run: node --test tests/priority-v51.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEADLINES, compareV51, deadlineFor, priorityV4, priorityV51, type RankedRequest } from "../src/lib/priority.ts";

test("deadlines 30 / 90 / 180 / 360 days; no category counts as P3", () => {
  assert.deepEqual(DEADLINES, { P1: 30, P2: 90, P3: 180, P4: 360 });
  assert.equal(deadlineFor(null), 180);
});

test("seed cast (requisitos_v4 §1): Ana 62/90 → 0.69, Julio 40/90 → 0.44, Luis 30/180 → 0.17", () => {
  assert.equal(priorityV51(62, 90)!.toFixed(2), "0.69");
  assert.equal(priorityV51(40, 90)!.toFixed(2), "0.44");
  assert.equal(priorityV51(30, 180)!.toFixed(2), "0.17");
  assert.equal(priorityV51(62, 90), 0.6889); // 4 decimals, as numeric round(…, 4)
});

test("the v4 formula still gives 0.77 / 0.48 / 0.28 (what production shows)", () => {
  assert.equal(priorityV4(62, 90, true, true).toFixed(2), "0.77");
  assert.equal(priorityV4(40, 90, true, false).toFixed(2), "0.48");
  assert.equal(priorityV4(30, 180, true, false).toFixed(2), "0.28");
});

test("R is capped at 1 and never negative; an invalid deadline gives null", () => {
  assert.equal(priorityV51(400, 90), 1);
  assert.equal(priorityV51(90, 90), 1);
  assert.equal(priorityV51(-5, 90), 0);
  assert.equal(priorityV51(0, 30), 0);
  assert.equal(priorityV51(10, 0), null);
  assert.equal(priorityV51(10, Number.NaN), null);
});

test("no bonuses: first visit and preferential care do not change the v5.1 index", () => {
  // the v4 bonuses made a P2 with fewer days outrank one with more days
  assert.ok(priorityV4(30, 90, true, true) > priorityV4(50, 90, false, false));
  assert.ok(priorityV51(30, 90)! < priorityV51(50, 90)!);
  // the function takes only days and deadline: there is no argument for insurance, sex or no-show history
  assert.equal(priorityV51.length, 2);
});

const req = (id: number, category: RankedRequest["category"], daysWaited: number, firstAttemptAt = "2023-01-01"): RankedRequest => ({
  id, category, daysWaited, firstAttemptAt,
});

test("order: category first, then deadline fraction, then earliest first attempt, then id", () => {
  const list = [
    req(1, "P3", 179), // 0.99 but P3
    req(2, "P2", 40), // 0.44
    req(3, "P2", 62), // 0.69
    req(4, "P1", 3), // 0.10 but P1
    req(5, "P4", 360), // 1.00 but P4
    req(6, "P2", 200, "2023-03-01"), // capped at 1
    req(7, "P2", 300, "2022-12-01"), // capped at 1, waited longer
    req(8, null, 30), // provisional P3: 0.17
  ];
  const order = [...list].sort(compareV51).map((r) => r.id);
  assert.deepEqual(order, [4, 7, 6, 3, 2, 1, 8, 5]);
});

test("a higher category always goes first, whatever the fraction", () => {
  assert.ok(compareV51(req(1, "P1", 0), req(2, "P2", 1000)) < 0);
  assert.ok(compareV51(req(1, "P4", 1000), req(2, "P3", 0)) > 0);
});
