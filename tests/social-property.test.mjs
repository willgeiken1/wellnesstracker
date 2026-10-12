import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";

const MIGRATION = new URL("../supabase/migrations/20261012120000_social_schema.sql", import.meta.url);
const SEED = Number(process.env.SOCIAL_RLS_SEED ?? 20261012);
const N = 8;
const M = 5;

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uuid(prefix, n) {
  return `${prefix}-${n.toString(16).padStart(12, "0")}`;
}

function pgBin(name) {
  const candidates = [
    process.env.PG_BIN && join(process.env.PG_BIN, name),
    "/usr/lib/postgresql/16/bin/" + name,
    "/usr/lib/postgresql/17/bin/" + name,
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path)) || null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function run(bin, args, opts = {}) {
  const result = spawnSync(bin, args, { encoding: "utf8", ...opts });
  if (result.error) throw result.error;
  return result;
}

function pairKey(a, b) {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

test("seeded accounts match the social visibility oracle", { timeout: 180_000 }, async () => {
  const initdb = pgBin("initdb");
  const pgCtl = pgBin("pg_ctl");
  const psql = pgBin("psql");
  assert.ok(initdb && pgCtl && psql, "PostgreSQL binaries are required");

  const dir = mkdtempSync(join(tmpdir(), "insight-social-prop-"));
  const port = await freePort();
  const user = process.env.USER || "ubuntu";
  const base = ["-h", dir, "-p", String(port), "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
  const started = { ok: false };
  const rng = mulberry32(SEED);

  function sql(text, extra = []) {
    return run(psql, [...base, ...extra, "-c", text], { env: { ...process.env, PGUSER: user } });
  }
  function lines(text) {
    const result = sql(text, ["-t", "-A"]);
    assert.equal(result.status, 0, result.stderr + "\n" + text);
    return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  }
  function attempt(uid, statement) {
    const result = sql(`
      begin;
      select set_config('request.jwt.claim.sub', '${uid}', false);
      set role authenticated;
      ${statement}
      rollback;
    `);
    return result.status === 0;
  }

  try {
    const init = run(initdb, ["-D", dir, "--auth=trust", "--username", user, "--no-sync"]);
    assert.equal(init.status, 0, init.stderr);
    const start = run(pgCtl, ["-D", dir, "-l", join(dir, "server.log"), "-w", "start", "-o", `-p ${port} -k ${dir}`]);
    assert.equal(start.status, 0, start.stderr);
    started.ok = true;

    const setup = sql(`
      create schema if not exists auth;
      create table auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
      language sql stable
      as $fn$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $fn$;
      do $roles$
      begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
      end
      $roles$;
      grant usage on schema public to anon, authenticated, service_role;
    `);
    assert.equal(setup.status, 0, setup.stderr);
    const applied = run(psql, [...base, "-f", MIGRATION.pathname], { env: { ...process.env, PGUSER: user } });
    assert.equal(applied.status, 0, applied.stderr);

    const ids = Array.from({ length: N }, (_, index) => uuid("99999999-9999-4999-8999", index));
    const enabled = ids.map(() => rng() < 0.75);
    if (enabled.filter(Boolean).length < 2) {
      enabled[0] = true;
      enabled[1] = true;
    }
    const friends = new Set();
    const blocks = new Set();
    const shares = ids.map((owner, index) => ({
      id: uuid("aaaaaaaa-aaaa-4aaa-8aaa", index),
      owner,
      unshared: false,
    }));
    shares[shares.length - 1].unshared = true;
    const comments = [];
    const reactions = [];
    const reports = [];
    const reportCount = new Map(ids.map((id) => [id, 0]));

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (rng() < 0.45) friends.add(pairKey(i, j));
      }
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i === j || rng() >= 0.15) continue;
        if (blocks.has(`${i},${j}`) || blocks.has(`${j},${i}`)) continue;
        blocks.add(`${i},${j}`);
      }
    }

    function isFriend(a, b) {
      return friends.has(pairKey(ids.indexOf(a), ids.indexOf(b)));
    }
    function isBlocked(a, b) {
      const i = ids.indexOf(a);
      const j = ids.indexOf(b);
      return blocks.has(`${i},${j}`) || blocks.has(`${j},${i}`);
    }
    function reportedItem(viewer, item) {
      return reports.some((row) => row.reporter === viewer && row.item === item && !row.comment);
    }
    function canSeeShare(viewer, share) {
      if (share.owner === viewer) return true;
      if (share.unshared || !enabled[ids.indexOf(share.owner)]) return false;
      if (!isFriend(viewer, share.owner) || isBlocked(viewer, share.owner)) return false;
      return !reportedItem(viewer, share.id);
    }
    function canComment(viewer, share) {
      if (share.owner === viewer || share.unshared) return false;
      if (!enabled[ids.indexOf(share.owner)]) return false;
      if (!isFriend(viewer, share.owner) || isBlocked(viewer, share.owner)) return false;
      return !reportedItem(viewer, share.id);
    }
    function canReact(viewer, share) {
      if (share.unshared || !enabled[ids.indexOf(share.owner)]) return false;
      if (share.owner === viewer) return true;
      return isFriend(viewer, share.owner) && !isBlocked(viewer, share.owner);
    }
    function canReport(viewer, share) {
      if (share.owner === viewer || reportedItem(viewer, share.id)) return false;
      if ((reportCount.get(viewer) || 0) >= 5) return false;
      return canSeeShare(viewer, share);
    }
    function canRequest(viewer, other) {
      if (viewer === other) return false;
      if (!enabled[ids.indexOf(viewer)] || !enabled[ids.indexOf(other)]) return false;
      if (isBlocked(viewer, other) || isFriend(viewer, other)) return false;
      return true;
    }

    let commentSerial = 0;
    let reactionSerial = 0;
    for (const share of shares) {
      if (share.unshared) {
        const author = ids.find((id) => id !== share.owner);
        comments.push({
          id: uuid("bbbbbbbb-bbbb-4bbb-8bbb", commentSerial++),
          item: share.id,
          author,
          owner: share.owner,
        });
        continue;
      }
      for (const viewer of ids) {
        if (viewer === share.owner || !isFriend(viewer, share.owner) || isBlocked(viewer, share.owner)) continue;
        if (rng() < 0.55) {
          comments.push({
            id: uuid("bbbbbbbb-bbbb-4bbb-8bbb", commentSerial++),
            item: share.id,
            author: viewer,
            owner: share.owner,
          });
        }
        if (rng() < 0.4 && !reactions.some((row) => row.item === share.id && row.user === viewer)) {
          reactions.push({
            id: uuid("cccccccc-cccc-4ccc-8ccc", reactionSerial++),
            item: share.id,
            user: viewer,
          });
        }
      }
    }
    for (const share of shares) {
      for (const viewer of ids) {
        if ((reportCount.get(viewer) || 0) >= 3) continue;
        if (rng() >= 0.3 || !canReport(viewer, share)) continue;
        reports.push({ reporter: viewer, item: share.id, comment: null });
        reportCount.set(viewer, (reportCount.get(viewer) || 0) + 1);
      }
    }

    const seedSql = [
      `insert into auth.users (id) values ${ids.map((id) => `('${id}')`).join(", ")};`,
      `insert into public.social_settings (user_id, enabled, username) values ${ids.map((id, index) => `('${id}', ${enabled[index]}, 'user${index}')`).join(", ")};`,
      friends.size
        ? `insert into public.friendships (requester_id, addressee_id, status) values ${[...friends].map((key) => {
          const [i, j] = key.split(",").map(Number);
          return `('${ids[i]}', '${ids[j]}', 'accepted')`;
        }).join(", ")};`
        : "select 1;",
      blocks.size
        ? `insert into public.blocks (blocker_id, blocked_id) values ${[...blocks].map((key) => {
          const [i, j] = key.split(",").map(Number);
          return `('${ids[i]}', '${ids[j]}')`;
        }).join(", ")};`
        : "select 1;",
      `insert into public.shared_items (id, owner_id, kind, workout_duration_seconds) values ${shares.map((share) => `('${share.id}', '${share.owner}', 'workout_duration', 120)`).join(", ")};`,
      `update public.shared_items set unshared_at = clock_timestamp() where id = '${shares[shares.length - 1].id}';`,
      comments.length
        ? `insert into public.comments (id, shared_item_id, author_id, body) values ${comments.map((row) => `('${row.id}', '${row.item}', '${row.author}', 'note')`).join(", ")};`
        : "select 1;",
      reactions.length
        ? `insert into public.reactions (id, shared_item_id, user_id, kind) values ${reactions.map((row) => `('${row.id}', '${row.item}', '${row.user}', 'like')`).join(", ")};`
        : "select 1;",
      reports.length
        ? `insert into public.reports (reporter_id, shared_item_id, reason) values ${reports.map((row) => `('${row.reporter}', '${row.item}', 'spam')`).join(", ")};`
        : "select 1;",
    ].join("\n");
    const seeded = sql(seedSql);
    assert.equal(seeded.status, 0, seeded.stderr);

    let checks = 0;
    function expectVisible(viewer, fromWhere, visible, label) {
      const count = lines(`
        select set_config('request.jwt.claim.sub', '${viewer}', false);
        set role authenticated;
        select count(*)::text from ${fromWhere};
      `).at(-1);
      assert.equal(count, visible ? "1" : "0", `seed ${SEED} ${label}`);
      checks += 1;
    }
    function expectWrite(viewer, statement, allowed, label) {
      assert.equal(attempt(viewer, statement), allowed, `seed ${SEED} ${label}`);
      checks += 1;
    }

    for (const viewer of ids) {
      for (const share of shares) {
        expectVisible(viewer, `public.shared_items where id = '${share.id}'`, canSeeShare(viewer, share), `share ${viewer} ${share.id}`);
      }
      for (const row of comments) {
        const share = shares.find((item) => item.id === row.item);
        const visible = canSeeShare(viewer, share) && !isBlocked(viewer, row.author);
        expectVisible(viewer, `public.comments where id = '${row.id}'`, visible, `comment ${viewer} ${row.id}`);
      }
      for (const row of reactions) {
        const share = shares.find((item) => item.id === row.item);
        const visible = canSeeShare(viewer, share) && !isBlocked(viewer, row.user);
        expectVisible(viewer, `public.reactions where id = '${row.id}'`, visible, `reaction ${viewer} ${row.id}`);
      }
      for (const owner of ids) {
        expectVisible(viewer, `public.social_settings where user_id = '${owner}'`, viewer === owner, `settings ${viewer} ${owner}`);
      }
      expectWrite(
        viewer,
        `insert into public.shared_items (owner_id, kind, workout_duration_seconds) values ('${viewer}', 'workout_duration', 45);`,
        enabled[ids.indexOf(viewer)],
        `insert own share ${viewer}`
      );
      const other = ids[(ids.indexOf(viewer) + 1) % N];
      expectWrite(
        viewer,
        `insert into public.shared_items (owner_id, kind, workout_duration_seconds) values ('${other}', 'workout_duration', 45);`,
        false,
        `forged share ${viewer}`
      );
      for (const share of shares) {
        expectWrite(
          viewer,
          `insert into public.comments (shared_item_id, author_id, body) values ('${share.id}', '${viewer}', 'hi');`,
          canComment(viewer, share),
          `comment insert ${viewer} ${share.id}`
        );
        expectWrite(
          viewer,
          `insert into public.reactions (shared_item_id, user_id, kind) values ('${share.id}', '${viewer}', 'cheer');`,
          canReact(viewer, share) && !reactions.some((row) => row.item === share.id && row.user === viewer),
          `reaction insert ${viewer} ${share.id}`
        );
        expectWrite(
          viewer,
          `insert into public.reports (reporter_id, shared_item_id, reason) values ('${viewer}', '${share.id}', 'spam');`,
          canReport(viewer, share),
          `report insert ${viewer} ${share.id}`
        );
      }
      expectWrite(
        viewer,
        `insert into public.friendships (requester_id, addressee_id, status) values ('${viewer}', '${viewer}', 'pending');`,
        false,
        `self request ${viewer}`
      );
      for (const target of ids) {
        if (target === viewer) continue;
        expectWrite(
          viewer,
          `insert into public.friendships (requester_id, addressee_id, status) values ('${viewer}', '${target}', 'pending');`,
          canRequest(viewer, target),
          `friend request ${viewer} ${target}`
        );
      }
    }
    assert.ok(checks > 100, `seed ${SEED} ran ${checks} checks`);

    const purgeIds = Array.from({ length: M }, (_, index) => uuid("77777777-7777-4777-8777", index));
    const victim = purgeIds[Math.floor(rng() * M)];
    const rest = purgeIds.filter((id) => id !== victim);
    const keepFriends = new Set([pairKey(rest[0], rest[1])]);
    const dropFriends = new Set([pairKey(victim, rest[0])]);
    for (let i = 0; i < M; i++) {
      for (let j = i + 1; j < M; j++) {
        if (rng() < 0.5) {
          const key = pairKey(purgeIds[i], purgeIds[j]);
          if (key.includes(victim)) dropFriends.add(key);
          else keepFriends.add(key);
        }
      }
    }
    const purgeShares = purgeIds.map((owner, index) => ({
      id: uuid("dddddddd-dddd-4ddd-8ddd", index),
      owner,
    }));
    const shareByOwner = new Map(purgeShares.map((share) => [share.owner, share.id]));
    const purgeComments = [
      { id: uuid("eeeeeeee-eeee-4eee-8eee", 1), author: rest[1], item: shareByOwner.get(rest[0]), owner: rest[0] },
      { id: uuid("eeeeeeee-eeee-4eee-8eee", 2), author: victim, item: shareByOwner.get(rest[0]), owner: rest[0] },
      { id: uuid("eeeeeeee-eeee-4eee-8eee", 3), author: rest[1], item: shareByOwner.get(victim), owner: victim },
    ];
    const purgeReactions = [
      { id: uuid("ffffffff-ffff-4fff-8fff", 1), user: rest[1], item: shareByOwner.get(rest[0]), owner: rest[0] },
      { id: uuid("ffffffff-ffff-4fff-8fff", 2), user: victim, item: shareByOwner.get(rest[1]), owner: rest[1] },
    ];
    const seenReactions = new Set(purgeReactions.map((row) => row.item + row.user));
    const purgeReports = [
      { id: uuid("12121212-1212-4212-8212", 1), reporter: rest[0], item: shareByOwner.get(rest[1]), owner: rest[1] },
      { id: uuid("12121212-1212-4212-8212", 2), reporter: victim, item: shareByOwner.get(rest[1]), owner: rest[1] },
      { id: uuid("12121212-1212-4212-8212", 3), reporter: rest[0], item: shareByOwner.get(victim), owner: victim },
    ];
    let commentExtra = 10;
    let reactionExtra = 10;
    for (let i = 0; i < M; i++) {
      for (let j = 0; j < M; j++) {
        if (i === j || rng() >= 0.35) continue;
        const author = purgeIds[i];
        const owner = purgeIds[j];
        purgeComments.push({
          id: uuid("eeeeeeee-eeee-4eee-8eee", commentExtra++),
          author,
          item: shareByOwner.get(owner),
          owner,
        });
        if (rng() < 0.5 && !seenReactions.has(shareByOwner.get(owner) + author)) {
          seenReactions.add(shareByOwner.get(owner) + author);
          purgeReactions.push({
            id: uuid("ffffffff-ffff-4fff-8fff", reactionExtra++),
            user: author,
            item: shareByOwner.get(owner),
            owner,
          });
        }
      }
    }

    function survivesParty(rowOwner, author) {
      return rowOwner !== victim && author !== victim;
    }
    const expected = {
      settings: purgeIds.filter((id) => id !== victim).sort(),
      shares: purgeShares.filter((row) => row.owner !== victim).map((row) => row.id).sort(),
      comments: purgeComments.filter((row) => survivesParty(row.owner, row.author)).map((row) => row.id).sort(),
      reactions: purgeReactions.filter((row) => survivesParty(row.owner, row.user)).map((row) => row.id).sort(),
      reports: purgeReports.filter((row) => survivesParty(row.owner, row.reporter)).map((row) => row.id).sort(),
      friends: [...keepFriends].sort(),
      blocks: [`${rest[0]}|${rest[1]}`],
      invites: rest.map((id) => id.replace(/-/g, "")).sort(),
      health: rest.slice().sort(),
    };

    const purgeSql = `
      insert into auth.users (id) values ${purgeIds.map((id) => `('${id}')`).join(", ")};
      insert into public.social_settings (user_id, enabled, username) values ${purgeIds.map((id, index) => `('${id}', true, 'purge${index}')`).join(", ")};
      insert into public.friendships (requester_id, addressee_id, status) values ${[...keepFriends, ...dropFriends].map((key) => {
        const [left, right] = key.split(",");
        return `('${left}', '${right}', 'accepted')`;
      }).join(", ")};
      insert into public.blocks (blocker_id, blocked_id) values
        ('${rest[0]}', '${rest[1]}'),
        ('${victim}', '${rest[0]}');
      insert into public.shared_items (id, owner_id, kind, workout_duration_seconds) values ${purgeShares.map((row) => `('${row.id}', '${row.owner}', 'workout_duration', 90)`).join(", ")};
      insert into public.comments (id, shared_item_id, author_id, body) values ${purgeComments.map((row) => `('${row.id}', '${row.item}', '${row.author}', 'kept')`).join(", ")};
      insert into public.reactions (id, shared_item_id, user_id, kind) values ${purgeReactions.map((row) => `('${row.id}', '${row.item}', '${row.user}', 'fire')`).join(", ")};
      insert into public.reports (id, reporter_id, shared_item_id, reason) values ${purgeReports.map((row) => `('${row.id}', '${row.reporter}', '${row.item}', 'spam')`).join(", ")};
      insert into public.friend_invites (token, owner_id, expires_at) values ${purgeIds.map((id) => `('${id.replace(/-/g, "")}', '${id}', now() + interval '7 days')`).join(", ")};
      create table if not exists public.user_data (user_id uuid primary key, data jsonb not null default '{}'::jsonb);
      create table if not exists public.oura_days (user_id uuid not null, day date not null, data jsonb not null, primary key (user_id, day));
      insert into public.user_data (user_id, data) values ${purgeIds.map((id) => `('${id}', '{"marker":1}'::jsonb)`).join(", ")};
      insert into public.oura_days (user_id, day, data) values ${purgeIds.map((id) => `('${id}', '2026-10-03', '{"readiness":1}'::jsonb)`).join(", ")};
    `;
    const purgedSeed = sql(purgeSql);
    assert.equal(purgedSeed.status, 0, purgedSeed.stderr);
    const removed = sql(`select public.delete_user_rows('${victim}');`);
    assert.equal(removed.status, 0, removed.stderr);

    function sameSet(actual, wanted, label) {
      assert.deepEqual(actual, wanted, `seed ${SEED} victim ${victim} ${label}`);
    }
    sameSet(lines(`select user_id::text from public.social_settings where user_id in (${purgeIds.map((id) => `'${id}'`).join(", ")}) order by 1`), expected.settings, "settings");
    sameSet(lines(`select id::text from public.shared_items where owner_id in (${purgeIds.map((id) => `'${id}'`).join(", ")}) order by 1`), expected.shares, "shares");
    sameSet(lines(`select id::text from public.comments where id in (${purgeComments.map((row) => `'${row.id}'`).join(", ")}) order by 1`), expected.comments, "comments");
    sameSet(lines(`select id::text from public.reactions where id in (${purgeReactions.map((row) => `'${row.id}'`).join(", ")}) order by 1`), expected.reactions, "reactions");
    sameSet(lines(`select id::text from public.reports where id in (${purgeReports.map((row) => `'${row.id}'`).join(", ")}) order by 1`), expected.reports, "reports");
    sameSet(
      lines(`select least(requester_id, addressee_id)::text || ',' || greatest(requester_id, addressee_id)::text from public.friendships where requester_id in (${purgeIds.map((id) => `'${id}'`).join(", ")}) or addressee_id in (${purgeIds.map((id) => `'${id}'`).join(", ")}) order by 1`),
      [...keepFriends].map((key) => {
        const [left, right] = key.split(",");
        return left < right ? `${left},${right}` : `${right},${left}`;
      }).sort(),
      "friendships"
    );
    sameSet(
      lines(`select blocker_id::text || '|' || blocked_id::text from public.blocks where blocker_id in (${purgeIds.map((id) => `'${id}'`).join(", ")}) or blocked_id in (${purgeIds.map((id) => `'${id}'`).join(", ")}) order by 1`),
      expected.blocks,
      "blocks"
    );
    sameSet(lines(`select token from public.friend_invites where owner_id in (${purgeIds.map((id) => `'${id}'`).join(", ")}) order by 1`), expected.invites, "invites");
    sameSet(lines(`select user_id::text from public.user_data where user_id in (${purgeIds.map((id) => `'${id}'`).join(", ")}) order by 1`), expected.health, "user_data");
    sameSet(lines(`select user_id::text from public.oura_days where user_id in (${purgeIds.map((id) => `'${id}'`).join(", ")}) order by 1`), expected.health, "oura_days");
    assert.equal(lines(`select count(*)::text from public.shared_items where owner_id = '${victim}'`)[0], "0");
    assert.equal(lines(`select count(*)::text from public.social_settings where user_id = '${ids[0]}'`)[0], "1");
    assert.equal(lines(`select workout_duration_seconds::text from public.shared_items where id = '${shareByOwner.get(rest[0])}'`)[0], "90");
  } finally {
    if (started.ok) run(pgCtl, ["-D", dir, "-w", "-m", "immediate", "stop"]);
    rmSync(dir, { recursive: true, force: true });
  }
});
