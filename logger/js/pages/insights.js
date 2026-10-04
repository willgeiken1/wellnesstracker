import { app } from "../runtime.js";
import { DAYS_FOR_A_PATTERN, DISPLAY_LIMIT, SEE_ALL_LIMIT, listFindings, loggedDays } from "../shared/correlate.js";
import "./insight-widgets.js";

/* Insights and Recovery markup. */
/* ---------- Screens ---------- */
function readinessCardHTML() {
  if (app.state.oura && app.state.oura.status === "disconnected") return "";
  const o = app.latestOura(app.src().oura);
  if (!o) return "";
  const lv = app.readinessLevel(o.readiness);
  return `<button class="rcard" data-action="tab" data-tab="recovery">
    <span class="rcard-n ${lv.cls}">${o.readiness}</span>
    <span class="rcard-t"><b>Readiness · ${lv.word}</b><span>${lv.tip}</span><span class="rcard-s">Slept ${app.dash(o.total, app.fmtHM)} · HRV ${app.dash(o.hrv, (v) => v + " ms")}${app.state.demo ? " · sample data" : ""}</span></span></button>`;
}
app.readinessCardHTML = readinessCardHTML;

function recoveryHTML(embedded) {
  const S = app.src(), o = S.oura, keys = Object.keys(o).sort();
  const link = !app.state.demo && app.state.oura && app.state.oura.status;
  if (!app.state.demo && link === "disconnected") {
    return `<div class="card connect"><h4>Reconnect Oura</h4>
      <p class="sub">Oura access was revoked, so the ring data stored in Insight was removed.</p>
      <button class="btn primary block" data-action="oura-connect">${app.session ? "Reconnect Oura" : "Sign in to reconnect Oura"}</button></div>`;
  }
  const status = !app.state.demo && app.state.oura.connected && link !== "membership_inactive"
    ? `<div class="page-sub">${app.ui.ouraSyncing ? "Syncing…" : app.syncedAgo() || "From your Oura Ring"} · <button class="link-inline" data-action="oura-sync">Sync now</button></div>`
    : `<div class="page-sub">From your Oura Ring</div>`;
  const head = `<div style="margin:-4px 0 14px">${status}</div>${app.demoBanner()}`;
  const inactive = !app.state.demo && link === "membership_inactive" ? `<div class="card" data-oura-status="membership_inactive"><h4>Oura membership inactive</h4>
      <p class="sub">Scores already saved in Insight stay here. Syncing is paused, and nothing was deleted. It starts again when the Oura membership is active.</p>
      <button class="btn block" data-action="oura-sync">Check again</button></div>` : "";
  const t = app.latestOura(o);
  if (!t && inactive) return head + inactive;
  if (!t && !app.state.demo && app.state.oura.connected && link !== "membership_inactive") return head + `<div class="card"><h4>${app.ui.ouraSyncing ? "Pulling your Oura data…" : "No Oura data yet"}</h4>
      <p class="sub">${app.ui.ouraSyncing ? "The first sync brings in about four months of history and can take a moment." : app.state.oura.lastError ? "Last sync problem: " + app.esc(app.state.oura.lastError) : "Make sure your ring has synced with the Oura app, then tap Sync now."}</p>
      <button class="btn primary block" data-action="oura-sync">Sync now</button></div>`;
  if (!t) return head + `<div class="card connect"><h4>Connect your Oura Ring</h4>
      <p class="sub">Your sleep, readiness, HRV and resting heart rate will sync here every day and feed your Insights.</p>
      <button class="btn primary block" data-action="oura-connect">${app.session ? "Connect Oura" : "Sign in to connect Oura"}</button>
      <p class="sub small">You'll approve access on Oura's own page. Your Oura login is stored privately on the server, never in the app.</p>
      <button class="btn block" data-action="demo-on">Preview with sample data</button></div>`;
  const lv = app.readinessLevel(t.readiness);
  const base = app.avg(keys.slice(-30).map((k) => o[k].hrv).filter((v) => v != null));
  const range = keys.slice(-(app.ui.range || 14));
  const stage = (k, c) => `<i class="${c}" style="width:${((t[k] || 0) / ((t.total || 1) + (t.awake || 0)) * 100).toFixed(1)}%"></i>`;
  const prevDay = o[app.addDays(t.date, -1)];
  return head + inactive + app.widgetize("recovery", `
    <!--w:ready--><div class="card ready">${app.ringSVG(t.readiness, lv.cls)}
      <div><h4>Readiness · ${lv.word}</h4><p class="sub">${lv.tip}</p>
      <p class="sub small">${t.date === app.today() ? "Today" : app.fmtDate(t.date)}</p></div></div>
    <!--w:stats--><div class="stats">
      <div class="stat"><b>${app.dash(t.sleepScore, (v) => v)}</b><span>Sleep score</span></div>
      <div class="stat"><b>${app.dash(t.total, app.fmtHM)}</b><span>Total sleep</span></div>
      <div class="stat"><b>${app.dash(t.hrv, (v) => v + "<small> ms</small>")}</b><span>HRV${t.hrv != null && base ? " · " + app.signed(t.hrv - base, 0) + " vs 30-day avg" : ""}</span></div>
      <div class="stat"><b>${app.dash(t.rhr, (v) => v + "<small> bpm</small>")}</b><span>Lowest resting HR</span></div>
      <div class="stat"><b>${app.dash(t.temp, (v) => app.signed(v * 1.8, 1) + "°F")}</b><span>Body temperature</span></div>
      <div class="stat"><b>${app.dash(prevDay && prevDay.steps, (v) => (v / 1000).toFixed(1) + "k")}</b><span>Steps yesterday</span></div>
    </div>
    <!--w:hrvage-->${app.state.demo ? "" : app.hrvAgeCardHTML(base)}
    <!--w:night-->${t.total ? `<div class="card"><h4>Last night</h4>
      <div class="stages">${stage("deep", "s-deep")}${stage("rem", "s-rem")}${stage("light", "s-light")}${stage("awake", "s-awake")}</div>
      <div class="legend2"><span><i class="s-deep"></i>Deep ${app.fmtHM(t.deep)}</span><span><i class="s-rem"></i>REM ${app.fmtHM(t.rem)}</span><span><i class="s-light"></i>Light ${app.fmtHM(t.light)}</span><span><i class="s-awake"></i>Awake ${Math.round((t.awake || 0) / 60)}m</span></div></div>` : ""}
    <!--w:charts--><div class="sec-h" style="margin-top:22px"><h3>Trends</h3><div class="range">${[14, 30].map((r) =>
      `<button data-action="range" data-r="${r}" aria-pressed="${(app.ui.range || 14) === r}">${r} days</button>`).join("")}</div></div>
    <div class="card"><h4>Readiness</h4>${app.chartSVG({ labels: range, series: [{ data: range.map((k) => o[k].readiness), cls: "ln" }], yMin: 40, yMax: 100 })}</div>
    <div class="card"><h4>Sleep</h4>${app.chartSVG({ labels: range, series: [{ type: "bar", data: range.map((k) => o[k].total != null ? o[k].total / 3600 : null) }], yMin: 0, yMax: 10, guide: 7.5, fmt: (v) => v.toFixed(0) + "h" })}
      <p class="sub small">Dashed line: 7.5 hours</p></div>
    <div class="card"><h4>HRV</h4>${app.chartSVG({ labels: range, series: [{ data: range.map((k) => o[k].hrv), cls: "ln" }], guide: base })}
      <p class="sub small">Dashed line: your 30-day average (${app.dash(base, Math.round)} ms). Higher generally means better recovered.</p></div>
    <div class="card"><h4>Resting heart rate</h4>${app.chartSVG({ labels: range, series: [{ data: range.map((k) => o[k].rhr), cls: "ln alt" }] })}</div>`);
}
app.recoveryHTML = recoveryHTML;

function insightsWrapHTML() {
  if (app.ui.weekOpen && app.ui.iseg !== "recovery" && app.weekReportHTML) return app.weekReportHTML(app.ui.weekOpen);
  const seg = `<div class="seg2" role="tablist" style="margin-bottom:16px">
    <button data-action="iseg" data-s="trends" aria-pressed="${app.ui.iseg !== "recovery"}">Trends</button>
    <button data-action="iseg" data-s="recovery" aria-pressed="${app.ui.iseg === "recovery"}">Recovery</button></div>`;
  return app.pageHead("Insights", "", { left: app.addButtonHTML(app.ui.iseg === "recovery" ? "recovery" : "trends") }) + seg + (app.ui.iseg === "recovery" ? app.recoveryHTML(true) : app.insightsHTML(true));
}
app.insightsWrapHTML = insightsWrapHTML;

function affectsCard(r) {
  const tone = r.valence === "good" ? "good" : r.valence === "bad" ? "bad" : "neutral";
  const mark = tone === "good" ? "Good for you" : tone === "bad" ? "Working against you" : "Just a pattern";
  const conf = r.confidence === "high" ? "High confidence" : "Medium confidence";
  const hi = r.confidence === "high" ? " hi" : "";
  return `<article class="card aff-card ${tone}">
    <div class="aff-k"><span class="aff-mark">${mark}</span><span class="aff-out">${app.esc(r.outcomeLabel || "")}</span></div>
    <p class="aff-s">${app.esc(r.lead || r.sentence)}</p>
    <div class="aff-chips"><span class="aff-chip${hi}">${conf}</span><span class="aff-chip">${app.pl(r.nWith, "day")}</span></div>
  </article>`;
}

function affectsEmpty(days) {
  if (days <= 0) return "Log sleep, workouts, or meals for about two weeks. A comparison needs at least 7 days on each side.";
  if (days < DAYS_FOR_A_PATTERN) {
    const more = DAYS_FOR_A_PATTERN - days;
    return `You have ${app.pl(days, "day")} logged. About ${app.pl(more, "more day")} of sleep, workouts, or meals and the first patterns can show up.`;
  }
  return "Nothing stands out strongly yet. Keep logging. A pattern needs at least 7 days on each side, and a gap big enough to trust.";
}

/* What affects you. Correlations only, and no health values leave the phone. */
function affectsHTML() {
  let rows = [];
  let days = 0;
  try {
    const src = app.correlationSource();
    days = loggedDays(src);
    rows = listFindings(app.correlations());
  } catch (e) { rows = []; }
  const note = `<p class="sub aff-note">These line up what tends to happen together. They are correlations, not causes.</p>`;
  const head = `<div class="sec-h aff-h"><h3>What affects you</h3></div>${note}`;
  if (!rows.length) {
    const title = days < DAYS_FOR_A_PATTERN ? "A couple more weeks" : "Nothing clear yet";
    return head + `<div class="card aff-empty"><h4>${title}</h4><p class="sub">${affectsEmpty(days)}</p></div>`;
  }
  const open = !!app.ui.affectsAll;
  const capped = rows.slice(0, SEE_ALL_LIMIT);
  const shown = open ? capped : capped.slice(0, DISPLAY_LIMIT);
  const more = capped.length > DISPLAY_LIMIT;
  const toggle = more ? `<button class="btn block aff-more" data-action="affects-more" aria-expanded="${open}">${open ? "Show the top " + DISPLAY_LIMIT : "See all " + capped.length}</button>` : "";
  return head + shown.map(affectsCard).join("") + toggle;
}
app.affectsHTML = affectsHTML;

function insightsHTML(embedded) {
  const S = app.src(), sessions = S.sessions, o = S.oura;
  const nights = Object.keys(o).length;
  const head = `<p class="sub" style="margin:-4px 0 14px">From ${app.pl(sessions.length, "workout")}${nights ? ` and ${app.pl(nights, "night")} of Oura data` : ""}</p>${app.demoBanner()}`;
  const reports = app.weeklyListHTML ? app.weeklyListHTML() : "";
  const affects = app.affectsHTML();
  if (sessions.length < 3) return head + reports + affects + (app.state.demo ? "" : app.goalsSectionHTML(app.liftSeries(sessions))) + `<div class="card"><h4>Keep logging</h4>
    <p class="sub">Insights start appearing after a few workouts and get more reliable every week. Lift trends need 4 sessions of a lift; sleep and readiness comparisons need Oura connected.</p>
    ${app.state.demo ? "" : `<button class="btn primary block" data-action="demo-on" style="margin-top:12px">Preview with sample data</button>`}</div>`;

  // 1. Lift progress
  const bwNow = app.bodyweightOn(app.today());
  const series = app.liftSeries(sessions);
  const order = { down: 0, flat: 1, up: 2, wait: 3 };
  const lifts = Object.entries(series).map(([name, s]) => ({ name, s, st: app.liftStatus(s) }))
    .sort((a, b) => order[a.st.cls] - order[b.st.cls] || b.s.length - a.s.length);
  const counts = { up: 0, flat: 0, down: 0 };
  lifts.forEach((l) => { if (counts[l.st.cls] != null) counts[l.st.cls]++; });
  const liftsHTML = lifts.map((l) => `<button class="lift" data-action="lift" data-name="${app.esc(l.name)}">
      <span><b>${app.esc(l.name)}</b><span class="chip-s ${l.st.cls}">${l.st.label}</span>
      ${l.st.pct != null ? `<span class="lift-p">${app.signed(l.st.pct)}% est. 1RM over ${app.pl(l.st.weeks, "week")}</span>` : ""}
      ${bwNow && !app.state.demo ? `<span class="rel">Best: ${(Math.max(...l.s.map((p) => p.v)) / bwNow).toFixed(2)}× bodyweight</span>` : ""}</span>
      ${app.sparkSVG(l.s.map((p) => p.v), l.st.cls)}</button>`).join("");

  // 2. What affects your lifts
  const perfs = app.sessionPerf(sessions);
  const rd = app.effect(perfs, (d) => o[d] ? o[d].readiness : null, [
    { label: "Readiness < 70", test: (v) => v < 70 }, { label: "70–84", test: (v) => v >= 70 && v < 85 }, { label: "85+", test: (v) => v >= 85 }]);
  const sl = app.effect(perfs, (d) => o[d] && o[d].total != null ? o[d].total / 3600 : null, [
    { label: "Under 6.5h", test: (v) => v < 6.5 }, { label: "6.5–7.5h", test: (v) => v >= 6.5 && v < 7.5 }, { label: "7.5h+", test: (v) => v >= 7.5 }]);
  const wk = app.effect(perfs, (d) => { const p = o[app.addDays(d, -1)]; return p && p.steps != null ? p.steps : null; }, [
    { label: "After 15k+ steps", test: (v) => v >= 15000 }, { label: "After < 15k", test: (v) => v < 15000 }]);
  const need = nights ? "Needs at least 3 sessions in each group to compare." : "Connect Oura to unlock this.";
  const wkSentence = (() => { const a = wk[0], b = wk[1]; if (a.n < 3 || b.n < 3) return null; const d = b.avg - a.avg;
    return Math.abs(d) < 1 ? "Busy days on your feet don't seem to affect the next day's lifts so far."
      : d > 0 ? `After heavy days on your feet (15k+ steps, like a long warehouse shift), your lifts run about ${d.toFixed(1)}% lower the next day.`
              : `Interestingly, you've lifted ${Math.abs(d).toFixed(1)}% better after your busiest days.`; })();

  // 3. Training load vs HRV (last 8 weeks)
  const mon = app.mondayOf(app.today()), weeks = [...Array(8)].map((_, i) => app.addDays(mon, (i - 7) * 7));
  const wSets = weeks.map((w) => sessions.filter((s) => s.date >= w && s.date <= app.addDays(w, 6)).reduce((n, s) => n + app.workSetCount(s), 0));
  const wHrv = weeks.map((w) => app.avg([...Array(7)].map((_, i) => o[app.addDays(w, i)]).filter(Boolean).map((x) => x.hrv).filter((v) => v != null)));
  const hrvBase = app.avg(Object.keys(o).sort().slice(-30).map((k) => o[k].hrv).filter((v) => v != null));
  const lastFull = 6; // last complete week
  let loadMsg = nights ? "Your training volume and recovery look balanced." : "Connect Oura to compare training volume with recovery.";
  if (nights && wHrv[lastFull] != null && hrvBase) {
    const prevSets = app.avg(wSets.slice(2, lastFull).filter((x) => x > 0)) || 0;
    if (wHrv[lastFull] < hrvBase * 0.92 && wSets[lastFull] >= prevSets) loadMsg = `<b class="warn">Possible fatigue building:</b> last week's HRV averaged ${Math.round(wHrv[lastFull])} ms, below your ${Math.round(hrvBase)} ms baseline, while volume stayed high. A lighter week could help.`;
    else if (wHrv[lastFull] > hrvBase * 1.05) loadMsg = "HRV is above your baseline: you're recovering well from your current volume.";
  }

  // 4. Weekly sets per muscle (4-week average)
  const from = app.addDays(app.today(), -27), msets = {};
  sessions.filter((s) => s.date >= from).forEach((s) => s.entries.forEach((e) => e.muscles.forEach((m, i) => msets[m] = (msets[m] || 0) + app.workCount(e) * (i === 0 ? 1 : 0.5) / 4)));
  const mrows = Object.keys(app.MUSCLES).map((k) => ({ k, v: msets[k] || 0 })).sort((a, b) => b.v - a.v);
  const volHTML = mrows.map((r) => `<div class="vol-row"><span>${app.MUSCLES[r.k]}</span>
      <div class="vol-bar"><em></em><i class="${r.v >= 10 && r.v <= 20 ? "in" : r.v > 20 ? "over" : r.v > 0 ? "under" : ""}" style="width:${Math.min(100, r.v / 25 * 100)}%"></i></div>
      <b>${r.v ? r.v.toFixed(r.v < 10 ? 1 : 0) : "–"}</b></div>`).join("");

  // 5. Push / pull balance
  const push = ["chest", "frontDelts", "triceps"].reduce((n, k) => n + (msets[k] || 0), 0);
  const pull = ["lats", "upperBack", "rearDelts", "biceps"].reduce((n, k) => n + (msets[k] || 0), 0);
  const ratio = pull ? push / pull : null;
  const ppMsg = ratio == null ? "Log some pull work to compare." : ratio > 1.25 ? `You're doing ${ratio.toFixed(1)}× more pushing than pulling. Many lifters aim for roughly even to protect the shoulders.`
    : ratio < 0.8 ? "You're doing noticeably more pulling than pushing." : "Pushing and pulling are well balanced.";

  return head + reports + affects + app.widgetize("trends", `<!--w:goals-->${app.state.demo ? "" : app.goalsSectionHTML(series)}
    <!--w:lifts--><div class="sec-h"><h3>Lift progress</h3><span class="sec-sub">${counts.up} up · ${counts.flat} flat · ${counts.down} down</span></div>
    <div class="card lifts">${liftsHTML || `<p class="sub">Log weighted sets to see trends.</p>`}</div>
    <!--w:prs-->${app.prBoardHTML(sessions)}
    <!--w:effects--><div class="sec-h" style="margin-top:22px"><h3>What affects your lifts</h3></div>
    <p class="sub" style="margin:-6px 0 10px">Each bar shows how strong your sessions were compared with your recent average for those lifts.</p>
    ${app.effectCard("Readiness", rd, app.compareSentence(rd, "on 85+ readiness days", "on days under 70"), need)}
    ${app.effectCard("Sleep the night before", sl, app.compareSentence(sl, "after 7.5+ hours of sleep", "after less than 6.5"), need)}
    ${app.effectCard("Work the day before", wk, wkSentence, need)}
    <!--w:load--><div class="sec-h" style="margin-top:22px"><h3>Training load vs recovery</h3></div>
    <div class="card"><p class="sub">${loadMsg}</p>
      <div class="mini-l">Sets per week</div>${app.chartSVG({ labels: weeks, series: [{ type: "bar", data: wSets }], h: 100, yMin: 0 })}
      ${nights ? `<div class="mini-l">Average HRV (ms)</div>${app.chartSVG({ labels: weeks, series: [{ data: wHrv, cls: "ln" }], h: 100, guide: hrvBase })}` : ""}</div>
    <!--w:volume--><div class="sec-h" style="margin-top:22px"><h3>Weekly sets per muscle</h3><span class="sec-sub">4-week average</span></div>
    <div class="card"><p class="sub">The shaded zone is 10–20 sets a week, a range commonly recommended for muscle growth. Muscles an exercise works secondarily count as half a set.</p><div class="vol">${volHTML}</div></div>
    <!--w:balance--><div class="card"><h4>Push / pull balance</h4><p class="sub">${ppMsg}</p>
      <div class="pp"><div class="pp-bar"><i style="width:${push + pull ? push / (push + pull) * 100 : 50}%"></i></div>
      <div class="pp-l"><span>Push ${push.toFixed(0)} sets/wk</span><span>Pull ${pull.toFixed(0)} sets/wk</span></div></div></div>
    ${app.trendWidgetsHTML()}
    <!--w:end--><p class="hint">These patterns show what tends to go together in your data, not proof of what causes what. They get more reliable the more you log.</p>`);
}
app.insightsHTML = insightsHTML;

function liftSheetHTML(name) {
  const S = app.src(), s = app.liftSeries(S.sessions)[name] || [], st = app.liftStatus(s);
  const labels = s.map((p) => p.date);
  const rd = labels.map((d) => S.oura[d] ? S.oura[d].readiness : null);
  return `<h3>${app.esc(name)}</h3><span class="chip-s ${st.cls}">${st.label}</span>
    <div class="mini-l" style="margin-top:14px">Estimated 1-rep max (${app.wUnit()})</div>
    ${app.chartSVG({ labels, series: [{ data: s.map((p) => p.v), cls: "ln" }], h: 150 })}
    ${rd.some((v) => v != null) ? `<div class="mini-l">Readiness that morning</div>${app.chartSVG({ labels, series: [{ type: "bar", data: rd, cls: "bar soft" }], h: 80, yMin: 40, yMax: 100 })}` : ""}
    <div class="stats" style="margin-top:12px">
      <div class="stat"><b>${s.length ? Math.round(st.best || Math.max(...s.map((p) => p.v))) : "–"}</b><span>Best est. 1RM</span></div>
      <div class="stat"><b>${s.length ? app.fmtSet(s[s.length - 1].top) : "–"}</b><span>Last top set</span></div>
      <div class="stat"><b>${s.length && app.bodyweightOn(app.today()) && !app.state.demo ? (Math.max(...s.map((p) => p.v)) / app.bodyweightOn(app.today())).toFixed(2) + "×" : s.length}</b><span>${s.length && app.bodyweightOn(app.today()) && !app.state.demo ? "Best ÷ bodyweight" : "Sessions"}</span></div>
      <div class="stat"><b>${st.sincePR != null ? st.sincePR : "–"}</b><span>Sessions since best</span></div></div>
    ${app.state.demo ? "" : (() => { const g = app.goals().lifts[name]; const best = s.length ? Math.max(...s.map((p) => p.v)) : 0;
      return g ? `<div class="card goal-inline"><div class="goal-top"><b>Goal: ${Math.round(app.kgToDisp(g.kg))} ${app.wUnit()}</b><button class="link-inline" data-action="goal-lift" data-name="${app.esc(name)}">Edit</button></div>
        <div class="goal-bar"><i class="${best >= app.kgToDisp(g.kg) ? "done" : ""}" style="width:${Math.min(100, best / app.kgToDisp(g.kg) * 100)}%"></i></div></div>`
        : `<button class="btn block" data-action="goal-lift" data-name="${app.esc(name)}" style="margin-top:12px">Set a goal for this lift</button>`; })()}
    ${app.repRecordsHTML(name)}
    <p class="sub small" style="margin-top:12px">Estimated 1RM uses your best set each session: weight × (1 + reps ÷ 30). It lets sets with different reps be compared.</p>`;
}
app.liftSheetHTML = liftSheetHTML;
