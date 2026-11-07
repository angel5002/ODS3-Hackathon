// /pedir-cita must never enter a reload/expired loop (incident 7/11 08:42 UTC). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_RECOVERIES, MAX_RELOADS, RELOAD_WINDOW_MS, mayReload, recentReloads, shouldRecover, type KeyValueStore } from "../src/lib/chat/recovery.ts";

const memory = (): KeyValueStore & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

test("at most MAX_RELOADS reloads per window: the third one is refused (no reload loop)", () => {
  const s = memory();
  const t = 1_000_000;
  assert.equal(mayReload(s, t), true);
  assert.equal(mayReload(s, t + 3_000), true);
  assert.equal(mayReload(s, t + 6_000), false, "a third reload within a minute is refused");
  assert.equal(mayReload(s, t + 9_000), false);
  assert.equal(recentReloads(s.data["asistia.recargas"], t + 9_000).length, MAX_RELOADS);
});

test("after the window passes, a reload is allowed again", () => {
  const s = memory();
  mayReload(s, 0);
  mayReload(s, 1_000);
  assert.equal(mayReload(s, 1_000 + RELOAD_WINDOW_MS + 1), true);
});

test("a simulated loop (reload every 3 s for 2 minutes) only reloads MAX_RELOADS times per minute", () => {
  const s = memory();
  let reloads = 0;
  for (let t = 0; t < 120_000; t += 3_000) if (mayReload(s, t)) reloads++;
  assert.ok(reloads <= MAX_RELOADS * 2 + 1, `reloads in 2 min: ${reloads}`);
});

test("corrupt or missing storage never throws and never loops", () => {
  assert.deepEqual(recentReloads("not json", 0), []);
  assert.deepEqual(recentReloads(null, 0), []);
  assert.deepEqual(recentReloads(JSON.stringify(["x", 5, -1]), 10), [5, -1].filter((n) => 10 - n < RELOAD_WINDOW_MS && n <= 10));
  const broken: KeyValueStore = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(mayReload(broken, 0), true);
  assert.equal(mayReload(null, 0), true);
});

test("a failed load recreates the session at most MAX_RECOVERIES times, then shows 'expired'", () => {
  let recoveries = 0;
  let expired = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (shouldRecover(recoveries)) recoveries++;
    else {
      expired = true;
      break;
    }
  }
  assert.equal(recoveries, MAX_RECOVERIES);
  assert.equal(expired, true);
});
