// Unit tests of the waiting-list priority and the assignment rule (proposal v5.1, section 3.5). No database.
// Run: node --test tests/priority-v51.test.ts   (or npm run test:unit)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEADLINES,
  categoryRank,
  compareV51,
  deadlineFor,
  pickAcceptor,
  priorityV4,
  priorityV51,
  ruleFromParam,
  sortKeyV51,
  type Acceptor,
  type RankedRequest,
} from "../src/lib/priority.ts";

const req = (id: number, category: RankedRequest["category"], daysWaited: number, firstAttemptAt = "2023-01-01"): RankedRequest => ({
  id, category, daysWaited, firstAttemptAt,
});

test("deadlines 30 / 90 / 180 / 360 days; no category counts as P3", () => {
  assert.deepEqual(DEADLINES, { P1: 30, P2: 90, P3: 180, P4: 360 });
  assert.equal(deadlineFor(null), 180);
  assert.deepEqual(["P1", "P2", "P3", "P4", null].map((c) => categoryRank(c as RankedRequest["category"])), [1, 2, 3, 4, 3]);
});

test("seed cast: Ana P2 62/90 → 0.69, Julio P2 40/90 → 0.44, Luis P3 30/180 → 0.17", () => {
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

test("lexicographic: a P3 at 90 % never outranks a P2 at 50 %", () => {
  const p3 = req(1, "P3", 162); // 162/180 = 90 %
  const p2 = req(2, "P2", 45); // 45/90 = 50 %
  assert.equal(priorityV51(162, 180), 0.9);
  assert.equal(priorityV51(45, 90), 0.5);
  assert.ok(compareV51(p2, p3) < 0, "P2 goes first");
  assert.deepEqual([p3, p2].sort(compareV51).map((r) => r.id), [2, 1]);
  assert.ok(sortKeyV51("P2", 45) > sortKeyV51("P3", 162));
  // even at the extremes: P3 at 100 % (21) below P2 at 0 % (30); P4 at 100 % below P3 at 0 %
  assert.equal(sortKeyV51("P3", 1000), 21);
  assert.equal(sortKeyV51("P2", 0), 30);
  assert.ok(compareV51(req(1, "P1", 0), req(2, "P2", 1000)) < 0);
  assert.ok(compareV51(req(1, "P4", 1000), req(2, "P3", 0)) > 0);
});

test("same category: the higher deadline fraction wins", () => {
  assert.ok(compareV51(req(1, "P2", 62), req(2, "P2", 40)) < 0, "Ana 0.69 before Julio 0.44");
  assert.ok(sortKeyV51("P2", 62) > sortKeyV51("P2", 40));
  assert.equal(sortKeyV51("P2", 62), 30.6889);
});

test("no bonuses: first visit and preferential care do not exist in the v5.1 order", () => {
  // the v4 bonuses made a P2 with fewer days outrank one with more days
  assert.ok(priorityV4(30, 90, true, true) > priorityV4(50, 90, false, false));
  assert.ok(compareV51(req(1, "P2", 50), req(2, "P2", 30)) < 0);
  // only days and deadline go in: there is no argument for insurance, sex or no-show history
  assert.equal(priorityV51.length, 2);
  assert.equal(sortKeyV51.length, 2);
});

test("full order: category, then fraction, then earliest first attempt, then id", () => {
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
  assert.deepEqual([...list].sort(compareV51).map((r) => r.id), [4, 7, 6, 3, 2, 1, 8, 5]);
});

const acc = (r: RankedRequest, acceptedAt: string): Acceptor => ({ ...r, acceptedAt });

test("the two variants differ when the first to accept has lower priority", () => {
  const julio = acc(req(2, "P2", 40), "2023-10-16T10:00:00Z"); // accepts first, 0.44
  const ana = acc(req(1, "P2", 62), "2023-10-16T10:05:00Z"); // accepts later, 0.69
  assert.equal(pickAcceptor("ventana_prioridad", [julio, ana])!.id, ana.id);
  assert.equal(pickAcceptor("primero_acepta", [julio, ana])!.id, julio.id);
  // across categories: a P3 at 90 % accepting first loses to a P2 at 50 % only with the priority window
  const p3 = acc(req(3, "P3", 162), "2023-10-16T10:00:00Z");
  const p2 = acc(req(4, "P2", 45), "2023-10-16T10:30:00Z");
  assert.equal(pickAcceptor("ventana_prioridad", [p3, p2])!.id, p2.id);
  assert.equal(pickAcceptor("primero_acepta", [p3, p2])!.id, p3.id);
});

test("the two variants agree when the first to accept also has the highest priority; nobody → null", () => {
  const ana = acc(req(1, "P2", 62), "2023-10-16T10:00:00Z");
  const julio = acc(req(2, "P2", 40), "2023-10-16T10:05:00Z");
  assert.equal(pickAcceptor("ventana_prioridad", [ana, julio])!.id, 1);
  assert.equal(pickAcceptor("primero_acepta", [ana, julio])!.id, 1);
  assert.equal(pickAcceptor("ventana_prioridad", []), null);
});

test("params value → rule: 0 = primero_acepta; 1, missing or other = ventana_prioridad (default)", () => {
  assert.equal(ruleFromParam(0), "primero_acepta");
  assert.equal(ruleFromParam(1), "ventana_prioridad");
  assert.equal(ruleFromParam(undefined), "ventana_prioridad");
  assert.equal(ruleFromParam(null), "ventana_prioridad");
});
