import assert from "node:assert/strict";
import test from "node:test";
import { connectionMark, saveDays } from "../supabase/functions/_shared/oura-store.js";

// A made-up in-memory database with just the query shapes oura-store uses. No real Oura data.
// `or` understands only the one filter oura-store sends: rows with no `data.conn`, or one at or before a mark.
function fakeDb(state, hooks = {}) {
  const query = (table) => {
    const filters = [];
    const rows = () => (state[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const eq = (k, v) => filters.push((r) => r[k] === v);
    const within = (k, v) => filters.push((r) => v.includes(r[k]));
    const ours = (expr) => {
      const mark = JSON.parse(expr.match(/data->>conn\.lte\.(".*")$/)[1]);
      filters.push((r) => r.data?.conn == null || r.data.conn <= mark);
    };
    const chain = {
      select() { return chain; },
      eq(k, v) { eq(k, v); return chain; },
      in(k, v) { within(k, v); return chain; },
      async maybeSingle() { return { data: rows()[0] ?? null, error: null }; },
      delete() {
        const del = { eq(k, v) { eq(k, v); return del; }, in(k, v) { within(k, v); return del; },
          then(ok) { const gone = new Set(rows()); state[table] = (state[table] ?? []).filter((r) => !gone.has(r)); return Promise.resolve({ error: null }).then(ok); } };
        return del;
      },
      update(values) {
        const up = { eq(k, v) { eq(k, v); return up; }, or(expr) { ours(expr); return up; },
          then(ok, bad) { return (async () => { await hooks.beforeUpdate?.(); for (const r of rows()) Object.assign(r, structuredClone(values)); return { error: null }; })().then(ok, bad); } };
        return up;
      },
      upsert(list, opts = {}) {
        const run = async () => {
          await hooks.duringUpsert?.();
          const added = [];
          for (const row of list) {
            const at = (state[table] ??= []).findIndex((r) => r.user_id === row.user_id && r.day === row.day);
            if (at < 0) { state[table].push(structuredClone(row)); added.push({ day: row.day }); }
            else if (!opts.ignoreDuplicates) state[table][at] = structuredClone(row);
          }
          await hooks.afterUpsert?.();
          return { data: added, error: null };
        };
        return { select: () => run(), then: (ok, bad) => run().then(ok, bad) };
      },
    };
    return chain;
  };
  return { from: query };
}
const U = "user-a";
const connected = () => ({ oura_tokens: [{ user_id: U }], oura_connections: [{ user_id: U, connected_at: "2026-11-16T10:00:00+00:00" }], oura_days: [] });
const days = [{ user_id: U, day: "2026-11-14" }, { user_id: U, day: "2026-11-15" }];
const disconnect = (state) => { state.oura_tokens = []; state.oura_days = state.oura_days.filter((r) => r.user_id !== U); state.oura_connections = []; };

test("a sync with the same connection keeps its days", async () => {
  const state = connected(), admin = fakeDb(state);
  const mark = await connectionMark(admin, U);
  assert.equal(await saveDays(admin, U, mark, days), 2);
  assert.equal(state.oura_days.length, 2);
});

test("a disconnect that lands while the days are written leaves no days behind", async () => {
  const state = connected();
  const admin = fakeDb(state, { duringUpsert: () => disconnect(state) });
  const mark = await connectionMark(admin, U);
  assert.equal(await saveDays(admin, U, mark, days), 0);
  assert.deepEqual(state.oura_days, []);
});

test("a disconnect between the tokens and the days being deleted still leaves no days", async () => {
  const state = connected();
  // Disconnect has deleted the tokens but not yet the days or the connection.
  const admin = fakeDb(state, { duringUpsert: () => { state.oura_tokens = []; } });
  const mark = await connectionMark(admin, U);
  assert.equal(await saveDays(admin, U, mark, days), 0);
  assert.deepEqual(state.oura_days, []);
});

test("a sync that started before a disconnect and reconnect does not write into the new connection", async () => {
  const state = connected(), admin = fakeDb(state);
  const mark = await connectionMark(admin, U);
  disconnect(state);
  state.oura_tokens = [{ user_id: U }]; state.oura_connections = [{ user_id: U, connected_at: "2026-11-16T10:05:00+00:00" }];
  assert.equal(await saveDays(admin, U, mark, days), 0);
  assert.deepEqual(state.oura_days, []);
});

test("an already disconnected account writes nothing", async () => {
  const state = { oura_tokens: [], oura_connections: [], oura_days: [] }, admin = fakeDb(state);
  assert.equal(await connectionMark(admin, U), null);
  assert.equal(await saveDays(admin, U, null, days), 0);
  assert.deepEqual(state.oura_days, []);
});

test("an old sync's cleanup leaves the days a newer connection's sync already saved", async () => {
  const state = connected();
  const newer = { user_id: U, day: "2026-11-15", data: { from: "new connection", conn: "2026-11-16T11:00:00+00:00" }, updated_at: "2026-11-16T11:00:00.000001Z" };
  // Right after the old sync writes, the person disconnects and reconnects, and the new connection's sync saves Nov 15.
  const admin = fakeDb(state, { afterUpsert: () => {
    disconnect(state);
    state.oura_tokens = [{ user_id: U }];
    state.oura_connections = [{ user_id: U, connected_at: "2026-11-16T11:00:00+00:00" }];
    state.oura_days.push({ ...newer });
  } });
  assert.equal(await saveDays(admin, U, "2026-11-16T10:00:00+00:00", days), 0);
  assert.deepEqual(state.oura_days, [newer]);
});

test("each sync's rows carry their own write stamp", async () => {
  const state = connected(), admin = fakeDb(state);
  await saveDays(admin, U, await connectionMark(admin, U), days);
  const stamps = new Set(state.oura_days.map((r) => r.updated_at));
  assert.equal(stamps.size, 1);
  assert.match([...stamps][0], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
});

// Codex review, Nov 17: the old sync's check passes, then the person disconnects and reconnects and the new
// connection's sync saves its days, all before the old sync's write lands.
const reconnectAndSync = (state, newer) => () => {
  disconnect(state);
  state.oura_tokens = [{ user_id: U }];
  state.oura_connections = [{ user_id: U, connected_at: "2026-11-16T11:00:00+00:00" }];
  state.oura_days.push(structuredClone(newer));
};

test("an old sync whose write lands after a newer connection's sync leaves the newer days in place", async () => {
  const state = connected();
  const newer = { user_id: U, day: "2026-11-15", data: { from: "new connection", conn: "2026-11-16T11:00:00+00:00" }, updated_at: "2026-11-16T11:00:00.000001Z" };
  const admin = fakeDb(state, { duringUpsert: reconnectAndSync(state, newer) });
  const old = [{ user_id: U, day: "2026-11-14", data: { from: "old" } }, { user_id: U, day: "2026-11-15", data: { from: "old" } }];
  assert.equal(await saveDays(admin, U, "2026-11-16T10:00:00+00:00", old), 0);
  assert.deepEqual(state.oura_days, [newer]);
});

test("an old sync never rewrites a stored day a newer connection's sync saved just before", async () => {
  const state = connected();
  const newer = { user_id: U, day: "2026-11-15", data: { from: "new connection", conn: "2026-11-16T11:00:00+00:00" }, updated_at: "2026-11-16T11:00:00.000001Z" };
  state.oura_days.push({ user_id: U, day: "2026-11-15", data: { from: "older still" }, updated_at: "2026-11-16T09:00:00.000001Z" });
  // The newer sync rewrites Nov 15 after the old sync's add, just before the old sync's rewrite.
  let once = false;
  const admin = fakeDb(state, { beforeUpdate: () => { if (once) return; once = true; reconnectAndSync(state, newer)(); } });
  assert.equal(await saveDays(admin, U, "2026-11-16T10:00:00+00:00", [{ user_id: U, day: "2026-11-15", data: { from: "old" } }]), 0);
  assert.deepEqual(state.oura_days, [newer]);
});

test("a sync rewrites its own connection's days and days saved before connections were recorded", async () => {
  const state = connected(), mark = "2026-11-16T10:00:00+00:00";
  state.oura_days.push({ user_id: U, day: "2026-11-14", data: { steps: 1, conn: mark }, updated_at: "x" });
  state.oura_days.push({ user_id: U, day: "2026-11-15", data: { steps: 2 }, updated_at: "x" });
  const admin = fakeDb(state);
  const fresh = [{ user_id: U, day: "2026-11-14", data: { steps: 10 } }, { user_id: U, day: "2026-11-15", data: { steps: 20 } }];
  assert.equal(await saveDays(admin, U, mark, fresh), 2);
  assert.deepEqual(state.oura_days.map((r) => r.data), [{ steps: 10, conn: mark }, { steps: 20, conn: mark }]);
});
