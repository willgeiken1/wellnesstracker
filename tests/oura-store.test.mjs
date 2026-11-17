import assert from "node:assert/strict";
import test from "node:test";
import { accessToken, connectionMark, forgetRevoked, isRevokedGrant, OuraUnauthorized, readWithAccess, REVOKED, saveDays } from "../supabase/functions/_shared/oura-store.js";

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
        const del = { eq(k, v) { eq(k, v); return del; }, in(k, v) { within(k, v); return del; }, or(expr) { ours(expr); return del; },
          then(ok) { const gone = new Set(rows()); state[table] = (state[table] ?? []).filter((r) => !gone.has(r)); return Promise.resolve({ error: null }).then(ok); } };
        return del;
      },
      update(values) {
        const up = { eq(k, v) { eq(k, v); return up; }, or(expr) { ours(expr); return up; }, select() { return up; },
          then(ok, bad) { return (async () => { await hooks.beforeUpdate?.(); const hit = rows(); for (const r of hit) Object.assign(r, structuredClone(values)); return { data: hit.map((r) => ({ day: r.day })), error: null }; })().then(ok, bad); } };
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

test("a newer sync whose day an older sync takes back before the rewrite adds that day again", async () => {
  // Codex review, Nov 17: the old sync added Nov 15 after the reconnect; the new sync's add skips it, then the old
  // sync's cleanup removes it before the new sync's rewrite runs.
  const oldMark = "2026-11-16T10:00:00+00:00", newMark = "2026-11-16T11:00:00+00:00";
  const state = { oura_tokens: [{ user_id: U }], oura_connections: [{ user_id: U, connected_at: newMark }],
    oura_days: [{ user_id: U, day: "2026-11-15", data: { from: "old", conn: oldMark }, updated_at: "old-stamp" }] };
  let once = false;
  const admin = fakeDb(state, { beforeUpdate: () => { if (once) return; once = true; state.oura_days = state.oura_days.filter((r) => r.updated_at !== "old-stamp"); } });
  assert.equal(await saveDays(admin, U, newMark, [{ user_id: U, day: "2026-11-15", data: { from: "new" } }]), 1);
  assert.equal(state.oura_days.length, 1);
  assert.deepEqual(state.oura_days[0].data, { from: "new", conn: newMark });
});

test("a sync whose days keep vanishing reports an error instead of success", async () => {
  const mark = "2026-11-16T10:00:00+00:00";
  const state = connected();
  // Each round an older row is there when the add runs and gone before the rewrite.
  const admin = fakeDb(state, { duringUpsert: () => { state.oura_days.push({ user_id: U, day: "2026-11-15", data: { conn: mark }, updated_at: "x" }); },
    beforeUpdate: () => { state.oura_days = state.oura_days.filter((r) => r.updated_at !== "x"); } });
  await assert.rejects(saveDays(admin, U, mark, [{ user_id: U, day: "2026-11-15", data: { steps: 1 } }]), /couldn't be saved/);
});

// Oura taking back Insight's access (LT-10, from old PR #19). Made-up tokens and days only.
const MARK = "2026-11-16T10:00:00+00:00";
const SOON = Date.parse("2026-11-17T12:00:00Z");
const login = (over = {}) => ({ user_id: U, access_token: "made-up-access", refresh_token: "made-up-refresh", expires_at: "2026-11-17T11:00:00Z", ...over });
const linked = (days = []) => ({ oura_tokens: [login()], oura_connections: [{ user_id: U, connected_at: MARK, last_error: null }], oura_days: days });
const answer = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const revoked = () => answer(400, { error: "invalid_grant" });
const stored = () => [{ user_id: U, day: "2026-11-15", data: { steps: 1, conn: MARK }, updated_at: "x" }, { user_id: U, day: "2026-11-14", data: { steps: 2 }, updated_at: "x" }];

test("only an OAuth invalid_grant counts as Oura revoking access", () => {
  assert.equal(isRevokedGrant(400, { error: "invalid_grant" }), true);
  assert.equal(isRevokedGrant(401, { error: "invalid_grant" }), true);
  // A wrong app key, a rate limit, an outage or an unreadable answer never deletes anyone's days.
  assert.equal(isRevokedGrant(401, { error: "invalid_client" }), false);
  assert.equal(isRevokedGrant(429, { error: "invalid_grant" }), false);
  assert.equal(isRevokedGrant(500, null), false);
  assert.equal(isRevokedGrant(400, "invalid_grant"), false);
});

test("a revoked login deletes the login and the stored days, and the app is told to reconnect", async () => {
  const state = linked(stored()), admin = fakeDb(state);
  await assert.rejects(accessToken(admin, U, MARK, async () => revoked(), { now: SOON }), (e) => e.message === REVOKED);
  assert.deepEqual(state.oura_tokens, []);
  assert.deepEqual(state.oura_days, []);
  assert.equal(state.oura_connections.length, 1);
  assert.equal(state.oura_connections[0].last_error, REVOKED);
  // The app and the web logger read this message as "reconnect needed".
  assert.match(REVOKED, /login expired/i);
});

test("any other refresh failure keeps the login and the stored days", async () => {
  for (const res of [answer(401, { error: "invalid_client" }), answer(500, null), answer(429, { error: "slow down" })]) {
    const state = linked(stored()), admin = fakeDb(state);
    await assert.rejects(accessToken(admin, U, MARK, async () => res, { now: SOON }), /login expired/);
    assert.equal(state.oura_tokens.length, 1);
    assert.equal(state.oura_days.length, 2);
    assert.equal(state.oura_connections[0].last_error, null);
  }
});

test("a refresh token another sync just used is not a revoke: its new login is used and nothing is deleted", async () => {
  const state = linked(stored());
  // The other sync saves its new login while this one is still asking Oura with the old, now spent token.
  const admin = fakeDb(state);
  const exchange = async () => { state.oura_tokens = [login({ access_token: "made-up-new", refresh_token: "made-up-new-refresh", expires_at: "2026-11-18T12:00:00Z" })]; return revoked(); };
  assert.equal(await accessToken(admin, U, MARK, exchange, { now: SOON }), "made-up-new");
  assert.equal(state.oura_days.length, 2);
  assert.equal(state.oura_tokens[0].refresh_token, "made-up-new-refresh");
});

test("a reconnect that lands during the refresh keeps its new login and days", async () => {
  const newer = "2026-11-17T11:59:00+00:00";
  const state = linked(stored()), admin = fakeDb(state);
  const exchange = async () => {
    state.oura_tokens = [login({ refresh_token: "made-up-reconnect", expires_at: "2026-11-17T12:01:00Z" })];
    state.oura_connections = [{ user_id: U, connected_at: newer, last_error: null }];
    state.oura_days.push({ user_id: U, day: "2026-11-16", data: { steps: 3, conn: newer }, updated_at: "y" });
    return revoked();
  };
  await assert.rejects(accessToken(admin, U, MARK, exchange, { now: SOON }), (e) => e.message === REVOKED);
  assert.deepEqual(state.oura_tokens.map((t) => t.refresh_token), ["made-up-reconnect"]);
  assert.equal(state.oura_days.length, 3);
  assert.equal(state.oura_connections[0].last_error, null);
});

test("forgetting a revoked login leaves a newer connection's days alone", async () => {
  const newer = { user_id: U, day: "2026-11-16", data: { conn: "2026-11-17T09:00:00+00:00" }, updated_at: "y" };
  const state = linked([...stored(), { ...newer }]), admin = fakeDb(state);
  await forgetRevoked(admin, U, MARK, "made-up-refresh");
  assert.deepEqual(state.oura_days, [newer]);
});

test("a token Oura turns down gets one new login; turned down again, the stored data is deleted", async () => {
  const state = linked(stored()), admin = fakeDb(state);
  let exchanges = 0, reads = 0;
  const exchange = async () => { exchanges++; return answer(200, { access_token: "made-up-second", refresh_token: "made-up-second-refresh", expires_in: 86400 }); };
  const read = async () => { reads++; throw new OuraUnauthorized("401"); };
  await assert.rejects(readWithAccess(admin, U, MARK, exchange, read, { now: Date.parse("2026-11-17T10:00:00Z") }), (e) => e.message === REVOKED);
  assert.equal(exchanges, 1);
  assert.equal(reads, 2);
  assert.deepEqual(state.oura_tokens, []);
  assert.deepEqual(state.oura_days, []);
  assert.equal(state.oura_connections[0].last_error, REVOKED);
});

test("a token Oura turns down once is replaced and the read goes on, keeping everything", async () => {
  const state = linked(stored()), admin = fakeDb(state);
  const seen = [];
  const exchange = async () => answer(200, { access_token: "made-up-second", refresh_token: "made-up-second-refresh", expires_in: 86400 });
  const read = async (token) => { seen.push(token); if (seen.length === 1) throw new OuraUnauthorized("401"); return ["ok"]; };
  assert.deepEqual(await readWithAccess(admin, U, MARK, exchange, read, { now: Date.parse("2026-11-17T10:00:00Z") }), ["ok"]);
  assert.deepEqual(seen, ["made-up-access", "made-up-second"]);
  assert.equal(state.oura_tokens[0].refresh_token, "made-up-second-refresh");
  assert.equal(state.oura_days.length, 2);
});

test("other read failures never delete anything", async () => {
  const state = linked(stored()), admin = fakeDb(state);
  const read = async () => { throw new Error("Oura sleep request failed (500)"); };
  await assert.rejects(readWithAccess(admin, U, MARK, async () => revoked(), read, { now: Date.parse("2026-11-17T10:00:00Z") }), /500/);
  assert.equal(state.oura_tokens.length, 1);
  assert.equal(state.oura_days.length, 2);
});
