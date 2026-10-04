// Real-time oracle for multi-phone weigh-in sync.
// A delete the deleter knew about, with a stamp after the log, must not come
// back, and a valid re-log must not disappear. Bounds are main at 8ab112d
// (500 runs × 2 phones, seed 1): 602 returned rows, 15 of them seenDel, and
// 21 lost re-logs with no stamp inversion. This branch must stay at or under
// that resurrection total, with seenDel no worse than the measured 22, and
// with zero unexplained losses.
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../logger/js/shared/purge.js";
import * as S from "../supabase/functions/_shared/strip.ts";

const H = 3600_000;
const DAY = 24 * H;
const M = 60_000;
const DATES = ["2026-06-14", "2026-06-15", "2026-06-16", "2026-06-17"];
const T0 = Date.parse("2026-06-18T12:00:00Z");

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function skewPick(r) {
  const opts = [0, 0, 6 * H, -6 * H, DAY, -DAY, 2 * DAY, -2 * DAY, 3 * M, -3 * M];
  if (r() < 0.35) {
    const mins = 1 + 2 * Math.floor(r() * 1440);
    return (r() < 0.5 ? -1 : 1) * mins * M + Math.floor(r() * 59000);
  }
  return opts[Math.floor(r() * opts.length)];
}

function returnedTotal(ret) {
  return Object.values(ret).reduce((sum, n) => sum + n, 0);
}

function simulate({ runs, phones: nph, seed0 }) {
  const realNow = Date.now;
  let sim = 0;
  Date.now = () => sim;
  const cl = (x) => structuredClone(x);
  const seenRet = new Set();
  const stats = {
    ret: {},
    runs: 0,
    returned: 0,
    lostInverted: 0,
    lostUnexplained: 0,
    diverge: 0,
    wrongPick: 0,
    ownVanish: 0,
    errors: 0,
  };
  try {
    for (let run = 0; run < runs; run++) {
      const seed = seed0 + run * 7919;
      const r = rng(seed);
      let real = T0;
      const phones = Array.from({ length: nph }, (_, i) => ({
        i,
        skew: skewPick(r),
        st: { profile: { weighIns: [], wDel: [], wDelAt: {}, updatedAt: 0 }, purges: [] },
        knows: new Set(),
        shownOwn: new Map(),
      }));
      let server = { st: { profile: { weighIns: [], wDel: [], wDelAt: {}, updatedAt: 0 }, purges: [] }, knows: new Set() };
      const events = [];
      let kgSeq = 50;
      const L = (p) => real + p.skew;
      const visible = (st, d) => (st.profile.weighIns || []).filter((w) => w.date === d);
      const push = (p) => { server = { st: cl(p.st), knows: new Set(p.knows) }; };
      const pull = (p) => {
        sim = L(p);
        const rs = cl(server.st);
        p.st.purges = C.unionPurges(p.st.purges, rs.purges, sim);
        if (rs.profile) p.st.profile = C.mergeWeighIns(p.st.profile, rs.profile, p.st.purges, sim);
        C.applyPurges(p.st, sim);
        for (const k of server.knows) p.knows.add(k);
      };
      const sync = (p) => { pull(p); push(p); };
      const act = {
        log(p, d) {
          sim = L(p);
          const pr = p.st.profile;
          const at = C.localStamp(pr, sim);
          const kg = kgSeq++;
          pr.weighIns = (pr.weighIns || []).filter((x) => x.date !== d).concat([{ date: d, kg, at }]);
          if (Array.isArray(pr.wDel)) pr.wDel = pr.wDel.filter((x) => x !== d);
          const frozen = pr.wDelAtRaw && typeof pr.wDelAtRaw[d] === "number" && typeof (pr.wDelAt && pr.wDelAt[d]) === "number" && pr.wDelAt[d] < at;
          if (!frozen) pr.wDelAt = { ...(pr.wDelAt || {}), [d]: at - 1 };
          pr.updatedAt = at;
          const e = { id: events.length, type: "log", d, real, stamp: at, kg, ph: p.i };
          events.push(e);
          p.knows.add(e.id);
        },
        del(p, d) {
          if (!visible(p.st, d).length) return false;
          sim = L(p);
          const pr = p.st.profile;
          const at = C.localStamp(pr, sim);
          pr.weighIns = pr.weighIns.filter((x) => x.date !== d);
          pr.wDel = [...(pr.wDel || []), d];
          pr.wDelAt = { ...(pr.wDelAt || {}), [d]: at };
          if (pr.wDelAtRaw && pr.wDelAtRaw[d] != null) {
            pr.wDelAtRaw = { ...pr.wDelAtRaw };
            delete pr.wDelAtRaw[d];
          }
          pr.updatedAt = at;
          const e = { id: events.length, type: "del", ds: [d], real, stamp: at, ph: p.i, knew: new Set(p.knows) };
          events.push(e);
          p.knows.add(e.id);
          return true;
        },
        purge(p, from, to) {
          sim = L(p);
          C.stripRange(p.st, from, to, { now: sim });
          p.st.purges = C.notePurge(p.st.purges, from, to, false, sim);
          const ds = DATES.filter((x) => x >= from && x <= to);
          const e = { id: events.length, type: "purge", ds, real, stamp: sim, ph: p.i, knew0: new Set(p.knows) };
          events.push(e);
          p.knows.add(e.id);
          push(p);
          if (r() < 0.85) {
            const rec = p.st.purges.find((x) => x.from === from && x.to === to);
            const req = C.purgeCutoff(rec, sim);
            sim = real;
            const cutoff = S.resolveCutoff(server.st, from, to, req, real);
            server.st = S.addPurge(S.stripRange(server.st, from, to, cutoff, real), from, to, cutoff, real);
            sim = L(p);
            p.st.purges = C.notePurge(p.st.purges, from, to, true, sim);
          }
        },
      };
      const cutsOn = (d, knownBy) => events.filter((e) => (e.type === "del" || e.type === "purge") && e.ds.includes(d) && (!knownBy || knownBy.has(e.id)));
      const expectOn = (p, d) => {
        const lastCut = Math.max(-Infinity, ...cutsOn(d, p.knows).map((e) => e.real));
        return events.filter((e) => e.type === "log" && e.d === d && p.knows.has(e.id) && e.real > lastCut);
      };
      const hiddenSince = new Map();
      const checkStep = () => {
        for (const p of phones) {
          for (const d of DATES) {
            const vis = visible(p.st, d);
            for (const w of vis) {
              const ev = events.find((e) => e.type === "log" && e.kg === w.kg);
              const kills = cutsOn(d, p.knows).filter((c) => c.real > ev.real);
              if (!kills.length) continue;
              const kind = kills.some((c) => c.type === "del" && c.knew.has(ev.id))
                ? (kills.some((c) => c.type === "del" && c.knew.has(ev.id) && c.stamp > ev.stamp) ? "seenDel" : "seenDelSlowDeleter")
                : kills.some((c) => c.type === "purge" && c.knew0 && c.knew0.has(ev.id))
                  ? "seenPurge"
                  : kills.some((c) => c.type === "purge")
                    ? "concPurge"
                    : "concDel";
              const key = `${run}|${p.i}|${ev.id}|${kind}`;
              if (!seenRet.has(key)) {
                seenRet.add(key);
                stats.ret[kind] = (stats.ret[kind] || 0) + 1;
                stats.returned++;
              }
            }
            const exp = expectOn(p, d);
            for (const e of exp) {
              if (e.ph !== p.i) continue;
              const key = `${p.i}|${e.id}`;
              const shown = vis.some((w) => w.kg === e.kg);
              const newer = exp.some((x) => x.real > e.real);
              if (shown) {
                hiddenSince.delete(key);
                p.shownOwn.set(e.id, true);
              } else if (!newer && p.shownOwn.get(e.id) && !vis.length) {
                if (!hiddenSince.has(key)) {
                  hiddenSince.set(key, real);
                  stats.ownVanish++;
                }
              }
            }
          }
        }
      };
      try {
        for (const p of phones) sync(p);
        for (let step = 0; step < 40; step++) {
          real += M + Math.floor(r() * 5 * H);
          const p = phones[Math.floor(r() * nph)];
          const d = DATES[Math.floor(r() * DATES.length)];
          const roll = r();
          if (roll < 0.38) {
            act.log(p, d);
            if (r() < 0.5) push(p);
          } else if (roll < 0.62) {
            if (act.del(p, d) && r() < 0.5) push(p);
          } else if (roll < 0.68) {
            const i = Math.floor(r() * 3);
            act.purge(p, DATES[i], DATES[i + Math.floor(r() * 2)]);
          } else sync(p);
          if (r() < 0.25) sync(phones[Math.floor(r() * nph)]);
          checkStep();
        }
        for (let pass = 0; pass < 4; pass++) for (const p of phones) sync(p);
        checkStep();
        real += 5 * DAY;
        for (let pass = 0; pass < 6; pass++) {
          for (const p of phones) {
            sync(p);
            real += M;
          }
        }
        checkStep();
        const sig = (st) => JSON.stringify(DATES.map((d) => visible(st, d).map((w) => w.kg)));
        if (new Set(phones.map((p) => sig(p.st))).size > 1) stats.diverge++;
        for (const d of DATES) {
          const cuts = cutsOn(d);
          const lastCut = Math.max(-Infinity, ...cuts.map((e) => e.real));
          const post = events.filter((e) => e.type === "log" && e.d === d && e.real > lastCut);
          const vis = visible(phones[0].st, d);
          if (post.length && !vis.length) {
            const latest = post.reduce((a, b) => (b.real > a.real ? b : a));
            const prevCuts = cuts.filter((c) => c.real < latest.real);
            const inverted = post.every((lg) => prevCuts.some((c) => c.stamp >= lg.stamp));
            if (inverted) stats.lostInverted++;
            else stats.lostUnexplained++;
          } else if (post.length && vis.length) {
            const latest = post.reduce((a, b) => (b.real > a.real ? b : a));
            if (vis[0].kg !== latest.kg) stats.wrongPick++;
          }
        }
      } catch {
        stats.errors++;
      }
      stats.runs++;
    }
  } finally {
    Date.now = realNow;
  }
  return stats;
}

test("deleted weigh-ins stay deleted and valid re-logs survive skewed phones", () => {
  const two = simulate({ runs: 500, phones: 2, seed0: 1 });
  assert.equal(two.errors, 0, "simulation threw");
  assert.equal(two.diverge, 0, "phones disagreed after clocks caught up");
  assert.equal(two.lostUnexplained, 0, `lost re-logs ${two.lostUnexplained}`);
  assert.ok(returnedTotal(two.ret) <= 602, `resurrections ${JSON.stringify(two.ret)}`);
  assert.ok((two.ret.seenDel || 0) <= 22, `strict resurrections ${two.ret.seenDel}`);

  const three = simulate({ runs: 200, phones: 3, seed0: 1 });
  assert.equal(three.errors, 0, "simulation threw");
  assert.equal(three.diverge, 0, "phones disagreed after clocks caught up");
  assert.equal(three.lostUnexplained, 0, `lost re-logs ${three.lostUnexplained}`);
  assert.ok(returnedTotal(three.ret) <= 467, `resurrections ${JSON.stringify(three.ret)}`);
  assert.ok((three.ret.seenDel || 0) <= 45, `strict resurrections ${three.ret.seenDel}`);
});
