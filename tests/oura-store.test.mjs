import assert from "node:assert/strict";
import test from "node:test";
import { connectionMark, saveDays } from "../supabase/functions/_shared/oura-store.js";

// A made-up in-memory database with just the query shapes oura-store uses. No real Oura data.
function fakeDb(state, hooks = {}) {
  const query = (table) => {
    const filters = [];
    const rows = () => (state[table] ?? []).filter((r) => filters.every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v)));
    const chain = {
      select() { return chain; },
      eq(k, v) { filters.push([k, v]); return chain; },
      in(k, v) { filters.push([k, v]); return chain; },
      async maybeSingle() { return { data: rows()[0] ?? null, error: null }; },
      delete() {
        return { eq(k, v) { filters.push([k, v]); return this; }, in(k, v) { filters.push([k, v]); return this; },
          then(ok) { const gone = new Set(rows()); state[table] = (state[table] ?? []).filter((r) => !gone.has(r)); return Promise.resolve({ error: null }).then(ok); } };
      },
      async upsert(list) {
        await hooks.duringUpsert?.();
        for (const row of list) {
          const at = (state[table] ??= []).findIndex((r) => r.user_id === row.user_id && r.day === row.day);
          if (at >= 0) state[table][at] = row; else state[table].push(row);
        }
        return { error: null };
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
