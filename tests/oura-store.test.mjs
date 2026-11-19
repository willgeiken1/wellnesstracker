import assert from "node:assert/strict";
import test from "node:test";
import { accessToken, connectionMark, DELETING, forgetRevoked, isRevokedGrant, NEWER_LOGIN, OuraUnauthorized, readWithAccess, recordSyncError, REFUSAL_GAP_MS, refused, REVOKED, saveDays, saveLogin } from "../supabase/functions/_shared/oura-store.js";

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
      async maybeSingle() { if (hooks.failRead?.(table)) return { data: null, error: { message: "made-up failure" } }; return { data: rows()[0] ?? null, error: null }; },
      delete() {
        const del = { eq(k, v) { eq(k, v); return del; }, in(k, v) { within(k, v); return del; }, or(expr) { ours(expr); return del; },
          then(ok) { if (hooks.failDelete?.(table)) return Promise.resolve({ error: { message: "made-up failure" } }).then(ok); const gone = new Set(rows()); state[table] = (state[table] ?? []).filter((r) => !gone.has(r)); return Promise.resolve({ error: null }).then(ok); } };
        return del;
      },
      update(values) {
        const up = { eq(k, v) { eq(k, v); return up; }, or(expr) { ours(expr); return up; }, select() { return up; },
          then(ok, bad) { return (async () => { await hooks.beforeUpdate?.(); const hit = rows(); for (const r of hit) Object.assign(r, structuredClone(values)); return { data: hit.map((r) => ({ day: r.day })), error: null }; })().then(ok, bad); } };
        return up;
      },
      upsert(list, opts = {}) {
        const run = async () => {
          if (hooks.failUpsert?.(table)) return { data: null, error: { message: "made-up failure" } };
          await hooks.duringUpsert?.();
          const added = [];
          for (const row of [].concat(list)) {
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
// No real waiting in tests; `waits` is how many times the stored login is read again before giving up.
const fast = { now: SOON, wait: async () => {}, waits: 3 };
const LATER = { ...fast, now: Date.parse("2026-11-17T10:00:00Z") };
// A later sync, far enough after a first refusal that a repeat is not the same refresh race.
const NEXT = { ...fast, now: SOON + REFUSAL_GAP_MS };
const LATER_NEXT = { ...LATER, now: LATER.now + REFUSAL_GAP_MS };

test("only an OAuth invalid_grant counts as Oura refusing the login", () => {
  assert.equal(isRevokedGrant(400, { error: "invalid_grant" }), true);
  assert.equal(isRevokedGrant(401, { error: "invalid_grant" }), true);
  // A wrong app key, a rate limit, an outage or an unreadable answer never deletes anyone's days.
  assert.equal(isRevokedGrant(401, { error: "invalid_client" }), false);
  assert.equal(isRevokedGrant(429, { error: "invalid_grant" }), false);
  assert.equal(isRevokedGrant(500, null), false);
  assert.equal(isRevokedGrant(400, "invalid_grant"), false);
});

test("a first refusal deletes nothing and marks the connection; the same refusal on a later sync deletes the login and days", async () => {
  const state = linked(stored()), admin = fakeDb(state);
  await assert.rejects(accessToken(admin, U, MARK, async () => revoked(), fast), /^Error: Oura login expired\. Reconnect Oura in the app\. \(check [0-9a-f]{8} at 2026-11-17T12:00Z\)$/);
  assert.equal(state.oura_tokens.length, 1);
  assert.equal(state.oura_days.length, 2);
  assert.match(state.oura_connections[0].last_error, /check [0-9a-f]{8}/);
  // The tag is one-way: the refresh token itself is never written into the message.
  assert.doesNotMatch(state.oura_connections[0].last_error, /made-up/);

  await assert.rejects(accessToken(admin, U, MARK, async () => revoked(), NEXT), (e) => e.message === REVOKED);
  assert.deepEqual(state.oura_tokens, []);
  assert.deepEqual(state.oura_days, []);
  assert.equal(state.oura_connections.length, 1);
  assert.equal(state.oura_connections[0].last_error, REVOKED);
  // The app and the web logger read both messages as "reconnect needed".
  assert.match(REVOKED, /login expired/i);
});

test("Codex review, Nov 18: a failed delete of the days is finished by the next sync, which has no login", async () => {
  const state = linked(stored());
  let failing = true;
  const admin = fakeDb(state, { failDelete: (table) => failing && table === "oura_days" });
  await assert.rejects(accessToken(admin, U, MARK, async () => revoked(), fast), /check [0-9a-f]{8}/);
  await assert.rejects(accessToken(admin, U, MARK, async () => revoked(), NEXT), (e) => e.message === DELETING);
  assert.deepEqual(state.oura_tokens, []);
  assert.equal(state.oura_days.length, 2);
  assert.equal(state.oura_connections[0].last_error, DELETING);
  assert.match(DELETING, /login expired/i);
  // Still failing: nothing changes and the next sync tries again.
  await assert.rejects(accessToken(admin, U, MARK, async () => revoked(), fast), (e) => e.message === DELETING);
  // Codex review, Nov 18: another sync's error handler writes over DELETING; the cleanup still finishes.
  state.oura_connections[0].last_error = "Oura login expired. Reconnect Oura in the app. (400)";
  failing = false;
  await assert.rejects(accessToken(admin, U, MARK, async () => { throw new Error("no login, so Oura is never asked"); }, fast), (e) => e.message === REVOKED);
  assert.deepEqual(state.oura_days, []);
  assert.equal(state.oura_connections[0].last_error, REVOKED);
  // Later syncs keep saying so, until a reconnect or Disconnect.
  await assert.rejects(accessToken(admin, U, MARK, async () => revoked(), fast), (e) => e.message === REVOKED);
  assert.deepEqual(state.oura_days, []);
});

test("Codex review, Nov 18: a sync still writing days while the cleanup runs keeps none of them", async () => {
  const fresh = [{ user_id: U, day: "2026-11-16", data: { steps: 3 } }];
  for (const hook of ["duringUpsert", "afterUpsert"]) {
    const state = linked(stored());
    let once = true;
    const admin = fakeDb(state, { [hook]: async () => { if (once) { once = false; await forgetRevoked(admin, U, MARK, "made-up-refresh"); } } });
    assert.equal(await saveDays(admin, U, MARK, fresh), 0, hook);
    assert.deepEqual(state.oura_days, [], hook);
    assert.deepEqual(state.oura_tokens, [], hook);
    assert.equal(state.oura_connections[0].last_error, REVOKED, hook);
  }
});

test("a login that can't be read, or a newer connection, never deletes days", async () => {
  const unreadable = linked(stored());
  await assert.rejects(accessToken(fakeDb(unreadable, { failRead: (table) => table === "oura_tokens" }), U, MARK, async () => revoked(), fast), /Couldn't read the Oura login/);
  assert.equal(unreadable.oura_days.length, 2);
  assert.equal(unreadable.oura_tokens.length, 1);

  // A sync that started from an older connection finds the newer one: it is not that sync's to clean up.
  const newer = linked(stored());
  newer.oura_tokens = [];
  newer.oura_connections[0].connected_at = "2026-11-17T09:00:00+00:00";
  await assert.rejects(accessToken(fakeDb(newer), U, MARK, async () => revoked(), fast), /^Error: Oura isn't connected$/);
  assert.equal(newer.oura_days.length, 2);
});

test("any other refresh failure keeps the login and the stored days, however often it happens", async () => {
  for (const res of [answer(401, { error: "invalid_client" }), answer(500, null), answer(429, { error: "slow down" })]) {
    const state = linked(stored()), admin = fakeDb(state);
    for (let round = 0; round < 3; round++) await assert.rejects(accessToken(admin, U, MARK, async () => res, fast), /login expired/);
    assert.equal(state.oura_tokens.length, 1);
    assert.equal(state.oura_days.length, 2);
    assert.equal(state.oura_connections[0].last_error, null);
  }
});

test("a refresh token another sync just spent is not a refusal: its new login is used and nothing is deleted", async () => {
  const state = linked(stored()), admin = fakeDb(state);
  const exchange = async () => { state.oura_tokens = [login({ access_token: "made-up-new", refresh_token: "made-up-new-refresh", expires_at: "2026-11-18T12:00:00Z" })]; return revoked(); };
  assert.equal(await accessToken(admin, U, MARK, exchange, fast), "made-up-new");
  assert.equal(state.oura_days.length, 2);
  assert.equal(state.oura_connections[0].last_error, null);
});

test("the winning refresh saving a moment after the losing one hears invalid_grant is waited for", async () => {
  const state = linked(stored()), admin = fakeDb(state);
  let waited = 0;
  const wait = async () => { if (++waited === 2) state.oura_tokens = [login({ access_token: "made-up-winner", refresh_token: "made-up-winner-refresh", expires_at: "2026-11-18T12:00:00Z" })]; };
  assert.equal(await accessToken(admin, U, MARK, async () => revoked(), { ...fast, wait }), "made-up-winner");
  assert.equal(state.oura_days.length, 2);
});

test("Codex review, Nov 18: the winning refresh saving after the loser stops waiting never deletes a good connection", async () => {
  const state = linked(stored()), admin = fakeDb(state);
  // The loser hears invalid_grant and finds no new login in its window: only a mark, nothing deleted.
  await assert.rejects(accessToken(admin, U, MARK, async () => revoked(), fast), /check [0-9a-f]{8}/);
  // Then the winner, which Oura had accepted, saves its new login.
  state.oura_tokens = [login({ access_token: "made-up-winner", refresh_token: "made-up-winner-refresh", expires_at: "2026-11-18T12:00:00Z" })];
  assert.equal(state.oura_tokens.length, 1);
  assert.equal(state.oura_days.length, 2);
  // The next sync uses the winner's login without asking Oura for a new one, so it is never refused again.
  let asked = 0;
  assert.equal(await accessToken(admin, U, MARK, async () => { asked++; return revoked(); }, fast), "made-up-winner");
  assert.equal(asked, 0);
  // Even if that login later expires and is refused once, the earlier mark was for a different login: still no delete.
  state.oura_tokens[0].expires_at = "2026-11-17T11:00:00Z";
  await assert.rejects(accessToken(admin, U, MARK, async () => revoked(), fast), /check [0-9a-f]{8}/);
  assert.equal(state.oura_days.length, 2);
  assert.equal(state.oura_tokens.length, 1);
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
  await accessToken(admin, U, MARK, exchange, fast);
  assert.deepEqual(state.oura_tokens.map((t) => t.refresh_token), ["made-up-reconnect"]);
  assert.equal(state.oura_days.length, 3);
  assert.equal(state.oura_connections[0].last_error, null);
});

test("a refusal for an older connection never marks or deletes a newer one", async () => {
  const state = linked(stored()), admin = fakeDb(state);
  state.oura_connections = [{ user_id: U, connected_at: "2026-11-17T09:00:00+00:00", last_error: null }];
  for (let round = 0; round < 2; round++) await assert.rejects(refused(admin, U, MARK, "made-up-refresh"), /isn't connected/);
  assert.equal(state.oura_tokens.length, 1);
  assert.equal(state.oura_days.length, 2);
  assert.equal(state.oura_connections[0].last_error, null);
});

test("forgetting a revoked login leaves a newer connection's days alone", async () => {
  const newer = { user_id: U, day: "2026-11-16", data: { conn: "2026-11-17T09:00:00+00:00" }, updated_at: "y" };
  const state = linked([...stored(), { ...newer }]), admin = fakeDb(state);
  await forgetRevoked(admin, U, MARK, "made-up-refresh");
  assert.deepEqual(state.oura_days, [newer]);
});

test("a token turned down even after a new login is marked once, and deleted only when it happens again on a later sync", async () => {
  const state = linked(stored()), admin = fakeDb(state);
  let exchanges = 0, reads = 0;
  // Every forced refresh gets a different new login, so the repeat is matched by connection, not by token.
  const exchange = async () => { exchanges++; return answer(200, { access_token: `made-up-${exchanges}`, refresh_token: `made-up-refresh-${exchanges}`, expires_in: 86400 }); };
  const read = async () => { reads++; throw new OuraUnauthorized("401"); };
  await assert.rejects(readWithAccess(admin, U, MARK, exchange, read, LATER), /check [0-9a-f]{8}/);
  assert.equal(exchanges, 1);
  assert.equal(reads, 2);
  assert.equal(state.oura_tokens.length, 1);
  assert.equal(state.oura_days.length, 2);
  await assert.rejects(readWithAccess(admin, U, MARK, exchange, read, LATER_NEXT), (e) => e.message === REVOKED);
  assert.deepEqual(state.oura_tokens, []);
  assert.deepEqual(state.oura_days, []);
  assert.equal(state.oura_connections[0].last_error, REVOKED);
});

test("a token Oura turns down once is replaced and the read goes on, keeping everything", async () => {
  const state = linked(stored()), admin = fakeDb(state);
  const seen = [];
  const exchange = async () => answer(200, { access_token: "made-up-second", refresh_token: "made-up-second-refresh", expires_in: 86400 });
  const read = async (token) => { seen.push(token); if (seen.length === 1) throw new OuraUnauthorized("401"); return ["ok"]; };
  assert.deepEqual(await readWithAccess(admin, U, MARK, exchange, read, LATER), ["ok"]);
  assert.deepEqual(seen, ["made-up-access", "made-up-second"]);
  assert.equal(state.oura_tokens[0].refresh_token, "made-up-second-refresh");
  assert.equal(state.oura_days.length, 2);
});

test("other read failures never delete anything", async () => {
  const state = linked(stored()), admin = fakeDb(state);
  const read = async () => { throw new Error("Oura sleep request failed (500)"); };
  for (let round = 0; round < 3; round++) await assert.rejects(readWithAccess(admin, U, MARK, async () => revoked(), read, LATER), /500/);
  assert.equal(state.oura_tokens.length, 1);
  assert.equal(state.oura_days.length, 2);
});

test("an old sync's failed cleanup that ends after a reconnect never makes the new connection delete on one refusal", async () => {
  // The old connection's cleanup could not delete its login, so its sync fails with DELETING. A reconnect lands first.
  const NEWER = "2026-11-17T09:00:00+00:00";
  const state = { oura_tokens: [login({ refresh_token: "made-up-new-refresh" })], oura_connections: [{ user_id: U, connected_at: NEWER, last_error: null }], oura_days: [{ user_id: U, day: "2026-11-16", data: { steps: 3, conn: NEWER }, updated_at: "x" }] };
  const admin = fakeDb(state);
  await recordSyncError(admin, U, MARK, DELETING);
  assert.equal(state.oura_connections[0].last_error, null);
  // The new connection's first refusal (perhaps only a race between two syncs) still deletes nothing.
  await assert.rejects(accessToken(admin, U, NEWER, async () => revoked(), fast), /check [0-9a-f]{8}/);
  assert.equal(state.oura_tokens.length, 1);
  assert.equal(state.oura_days.length, 1);
});

test("a failed sync's message goes on its own connection, or on any connection when none was read", async () => {
  const state = linked(), admin = fakeDb(state);
  await recordSyncError(admin, U, MARK, "made-up failure");
  assert.equal(state.oura_connections[0].last_error, "made-up failure");
  await recordSyncError(admin, U, null, "made-up read failure");
  assert.equal(state.oura_connections[0].last_error, "made-up read failure");
});

test("the same refusal again within the gap (parallel syncs in one refresh race) deletes nothing and keeps the first mark", async () => {
  const state = linked(stored()), admin = fakeDb(state);
  await assert.rejects(accessToken(admin, U, MARK, async () => revoked(), fast), /check [0-9a-f]{8}/);
  const first = state.oura_connections[0].last_error;
  // A second loser of the same race, a moment later.
  await assert.rejects(accessToken(admin, U, MARK, async () => revoked(), { ...fast, now: SOON + REFUSAL_GAP_MS - 1000 }), (e) => e.message === first);
  assert.equal(state.oura_connections[0].last_error, first);
  assert.equal(state.oura_tokens.length, 1);
  assert.equal(state.oura_days.length, 2);
  // Two parallel syncs that both see a 401 after a new login are one event too.
  const both = linked(stored()), admin2 = fakeDb(both);
  let n = 0;
  const exchange = async () => { n++; return answer(200, { access_token: `made-up-${n}`, refresh_token: `made-up-refresh-${n}`, expires_in: 86400 }); };
  const read = async () => { throw new OuraUnauthorized("401"); };
  await Promise.allSettled([readWithAccess(admin2, U, MARK, exchange, read, LATER), readWithAccess(admin2, U, MARK, exchange, read, LATER)]);
  assert.equal(both.oura_tokens.length, 1);
  assert.equal(both.oura_days.length, 2);
});

test("a cleanup that finds a newer login than the refused one deletes no days and clears its own mark", async () => {
  const state = linked(stored());
  // The winner of a refresh race saves its new login just before the refused login's delete.
  let once = true;
  const admin = fakeDb(state);
  const from = admin.from;
  admin.from = (table) => {
    const q = from(table);
    if (table !== "oura_tokens" || !once) return q;
    const del = q.delete;
    q.delete = () => { once = false; state.oura_tokens = [login({ refresh_token: "made-up-winner-refresh" })]; return del(); };
    return q;
  };
  await assert.rejects(forgetRevoked(admin, U, MARK, "made-up-refresh"), (e) => e.message === NEWER_LOGIN);
  assert.equal(state.oura_tokens.length, 1);
  assert.equal(state.oura_days.length, 2);
  assert.equal(state.oura_connections[0].last_error, null);
});

// Saving a new login from Oura's callback (oura-callback). Made-up logins only.
const NOW = "2026-11-19T15:00:00.000Z";
const fresh = { access_token: "made-up-new-access", refresh_token: "made-up-new-refresh", expires_at: "2026-11-20T15:00:00.000Z" };
const quiet = async (run) => { const log = console.error; console.error = () => {}; try { return await run(); } finally { console.error = log; } };

test("a reconnect saves the new login and starts a new connection", async () => {
  const state = linked(stored());
  assert.equal(await saveLogin(fakeDb(state), U, fresh, NOW), "connected");
  assert.deepEqual(state.oura_tokens, [{ user_id: U, ...fresh, updated_at: NOW }]);
  assert.deepEqual(state.oura_connections, [{ user_id: U, connected_at: NOW, last_sync: null, last_error: null }]);
  assert.equal(state.oura_days.length, 2);
});

test("a reconnect whose connection save fails keeps the new login, and the next sync keeps the days", async () => {
  const state = linked(stored());
  state.oura_connections[0].last_error = DELETING;
  const admin = fakeDb(state, { failUpsert: (table) => table === "oura_connections" });
  assert.equal(await quiet(() => saveLogin(admin, U, fresh, NOW)), "error");
  assert.equal(state.oura_tokens.length, 1);
  assert.equal(state.oura_tokens[0].refresh_token, fresh.refresh_token);
  assert.deepEqual(state.oura_connections, [{ user_id: U, connected_at: MARK, last_error: null }]);
  // The next sync still finds the old connection, now with the new login: it uses it and deletes nothing.
  const sync = fakeDb(state);
  assert.equal(await accessToken(sync, U, await connectionMark(sync, U), async () => { throw new Error("no refresh needed"); }, { ...fast, now: Date.parse(NOW) }), fresh.access_token);
  assert.equal(state.oura_days.length, 2);
});

test("a first connect whose connection save fails leaves no login behind", async () => {
  const state = { oura_tokens: [], oura_connections: [], oura_days: [] };
  const admin = fakeDb(state, { failUpsert: (table) => table === "oura_connections" });
  assert.equal(await quiet(() => saveLogin(admin, U, fresh, NOW)), "error");
  assert.deepEqual(state.oura_tokens, []);
  assert.deepEqual(state.oura_connections, []);
});

test("a login whose connection can't be read, or whose token save fails, changes nothing", async () => {
  for (const hooks of [{ failRead: (table) => table === "oura_connections" }, { failUpsert: (table) => table === "oura_tokens" }]) {
    const state = linked(stored());
    const before = structuredClone(state);
    assert.equal(await quiet(() => saveLogin(fakeDb(state, hooks), U, fresh, NOW)), "error");
    assert.deepEqual(state, before);
  }
});
