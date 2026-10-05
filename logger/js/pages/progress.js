import { app } from "../runtime.js";

/* Progress photos. */
/* ================= Progress photos ================= */
const POSES = ["Front", "Side", "Back", "Other"];
app.POSES = POSES;

const PH = { list: [], urls: {}, ready: false, month: null, compare: null, pick: [] };
app.PH = PH;

/* ---- local storage (IndexedDB holds the images; localStorage is far too small) ---- */
function idb() {
  if (app.idb.p) return app.idb.p;
  app.idb.p = new Promise((res, rej) => {
    const r = indexedDB.open("insight-photos", 1);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return app.idb.p;
}
app.idb = idb;

async function idbAll() {
  const db = await app.idb();
  return new Promise((res, rej) => { const q = db.transaction("photos").objectStore("photos").getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
app.idbAll = idbAll;

async function idbPut(p) { const db = await app.idb(); return new Promise((res, rej) => { const t = db.transaction("photos", "readwrite"); t.objectStore("photos").put(p); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
app.idbPut = idbPut;

async function idbDel(id) { const db = await app.idb(); return new Promise((res, rej) => { const t = db.transaction("photos", "readwrite"); t.objectStore("photos").delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
app.idbDel = idbDel;

const photoOwner = () => app.state.ownerId || "local";
app.photoOwner = photoOwner;

function myPhotos() { return app.PH.list.filter((p) => (p.owner || "local") === app.photoOwner()).sort((a, b) => a.date.localeCompare(b.date) || (a.at || "").localeCompare(b.at || "")); }
app.myPhotos = myPhotos;

function photoURL(p, thumb) {
  const k = p.id + (thumb ? ":t" : "");
  if (!app.PH.urls[k]) app.PH.urls[k] = URL.createObjectURL(thumb ? p.thumb : p.blob);
  return app.PH.urls[k];
}
app.photoURL = photoURL;

async function loadPhotos() {
  try { app.PH.list = await app.idbAll(); } catch (e) { app.PH.list = []; }
  // photos saved before signing in belong to the first account that signs in on this phone
  if (app.state.ownerId) {
    for (const p of app.PH.list) if (!p.owner) { p.owner = app.state.ownerId; await app.idbPut(p); }
  }
  app.PH.ready = true;
}
app.loadPhotos = loadPhotos;

/* ---- compression: long side ≤ 1280px, JPEG ~0.82; plus a 240px thumbnail ---- */
function fileToBitmap(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Couldn't read that image")); };
    img.src = url;
  });
}
app.fileToBitmap = fileToBitmap;

function drawTo(img, max, q) {
  const s = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const c = document.createElement("canvas");
  c.width = Math.round((img.naturalWidth || img.width) * s); c.height = Math.round((img.naturalHeight || img.height) * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", q));
}
app.drawTo = drawTo;

async function addPhoto(file, date, pose) {
  const img = await app.fileToBitmap(file);
  const [blob, thumb] = await Promise.all([app.drawTo(img, 1280, 0.82), app.drawTo(img, 240, 0.7)]);
  const p = { id: "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), owner: app.state.ownerId || null, date, pose, blob, thumb, at: new Date().toISOString(), synced: false };
  await app.idbPut(p);
  app.PH.list.push(p);
  app.uploadPhoto(p);
  return p;
}
app.addPhoto = addPhoto;

async function deletePhoto(id) {
  const p = app.PH.list.find((x) => x.id === id);
  await app.idbDel(id);
  app.PH.list = app.PH.list.filter((x) => x.id !== id);
  Object.keys(app.PH.urls).forEach((k) => { if (k.startsWith(id)) { URL.revokeObjectURL(app.PH.urls[k]); delete app.PH.urls[k]; } });
  if (p && app.sb && app.session) {
    try {
      await app.sb.storage.from("progress").remove([`${app.session.user.id}/${id}.jpg`]);
      await app.sb.from("progress_photos").delete().eq("id", id);
    } catch (e) { /* offline: it's gone locally; the cloud copy is cleaned up on the next sync */ }
  }
}
app.deletePhoto = deletePhoto;

/* ---- cloud: private bucket "progress", one folder per account ---- */
async function uploadPhoto(p) {
  if (!app.sb || !app.session || p.synced) return;
  try {
    const path = `${app.session.user.id}/${p.id}.jpg`;
    const { error } = await app.sb.storage.from("progress").upload(path, p.blob, { contentType: "image/jpeg", upsert: true });
    if (error) return;
    const { error: e2 } = await app.sb.from("progress_photos").upsert({ id: p.id, user_id: app.session.user.id, day: p.date, pose: p.pose, path, taken_at: p.at });
    if (e2) return;
    p.synced = true; p.owner = app.session.user.id;
    await app.idbPut(p);
  } catch (e) { /* retry next time */ }
}
app.uploadPhoto = uploadPhoto;

async function syncPhotos() {
  if (!app.sb || !app.session || !app.PH.ready) return;
  try {
    for (const p of app.myPhotos()) if (!p.synced) await app.uploadPhoto(p);
    const { data: rows } = await app.sb.from("progress_photos").select("id, day, pose, path, taken_at").eq("user_id", app.session.user.id);
    if (!rows) return;
    const have = new Set(app.PH.list.map((p) => p.id));
    const remoteIds = new Set(rows.map((r) => r.id));
    // photos deleted from another phone disappear here too
    for (const p of app.myPhotos()) if (p.synced && !remoteIds.has(p.id)) { await app.idbDel(p.id); app.PH.list = app.PH.list.filter((x) => x !== p); }
    for (const r of rows) {
      if (have.has(r.id)) continue;
      const { data: blob, error } = await app.sb.storage.from("progress").download(r.path);
      if (error || !blob) continue;
      const img = await app.fileToBitmap(blob);
      const thumb = await app.drawTo(img, 240, 0.7);
      const p = { id: r.id, owner: app.session.user.id, date: r.day, pose: r.pose || "Front", blob, thumb, at: r.taken_at, synced: true };
      await app.idbPut(p); app.PH.list.push(p);
    }
    if (app.ui.tab === "photos") app.render();
  } catch (e) { /* offline */ }
}
app.syncPhotos = syncPhotos;

/* ---- screens ---- */
function photosHTML() {
  const ph = app.myPhotos();
  const byDay = {};
  ph.forEach((p) => (byDay[p.date] = byDay[p.date] || []).push(p));
  const month = app.PH.month || app.today().slice(0, 7);
  const first = month + "-01", fd = app.parseDay(first);
  const daysIn = new Date(fd.getFullYear(), fd.getMonth() + 1, 0).getDate();
  const lead = (fd.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(`<span class="cal-pad"></span>`);
  for (let d = 1; d <= daysIn; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`, list = byDay[date];
    const future = date > app.today(), picked = app.PH.pick.includes(date);
    cells.push(`<button class="cal-day${list ? " has" : ""}${date === app.today() ? " today" : ""}${picked ? " picked" : ""}" data-action="ph-day" data-date="${date}" ${future ? "disabled" : ""} aria-label="${app.fmtDate(date, { month: "long", day: "numeric" })}${list ? ", " + app.pl(list.length, "photo") : ""}">
      ${list ? `<img src="${app.photoURL(list[0], true)}" alt="">` : ""}<span>${d}</span>${list && list.length > 1 ? `<i>${list.length}</i>` : ""}</button>`);
  }
  const months = {};
  ph.forEach((p) => { const m = p.date.slice(0, 7); if (!months[m] || (p.pose === "Front" && months[m].pose !== "Front")) months[m] = p; });
  const strip = Object.keys(months).sort().map((m) => `<button class="tl-item" data-action="ph-open" data-id="${months[m].id}"><img src="${app.photoURL(months[m], true)}" alt=""><span>${app.fmtDate(m + "-01", { month: "short", year: "numeric" })}</span></button>`).join("");
  const cmp = app.PH.compare ? app.compareHTML() : "";
  const bw = app.bodyweightCardHTML();
  return `${app.pageHead("Progress", "Bodyweight and progress photos")}
    ${bw || `<div class="sec-h"><h3>Bodyweight</h3></div><div class="card"><p class="sub">Log weigh-ins to see your trend and weekly rate.</p><button class="btn primary block" data-action="weigh-open" style="margin-top:12px">Log weigh-in</button></div>`}
    ${app.measurementsHTML()}
    <div class="sec-h" style="margin-top:22px"><h3>Photos</h3>
      ${ph.length ? `<div style="display:flex;gap:8px"><button class="btn small ${app.PH.compare ? "primary" : ""}" data-action="ph-compare">${app.PH.compare ? "Done" : "Compare"}</button>
      <button class="btn small primary" data-action="ph-add-today">Add</button></div>` : ""}</div>
    <p class="sub" style="margin:-6px 0 12px">${ph.length ? app.pl(ph.length, "photo") + " since " + app.fmtDate(ph[0].date, { month: "short", year: "numeric" }) + ". Private to you." : "Private to you."}</p>
    ${ph.length && app.PH.compare ? `<p class="sub" style="margin:-8px 0 12px">${app.PH.pick.length === 0 ? "Tap a day with a photo to pick the first one." : app.PH.pick.length === 1 ? "Now tap a second day." : "Tap a day to swap it out."}</p>` : ""}
    ${ph.length ? cmp : ""}
    ${ph.length ? `<div class="sec-h"><h3 class="cal-month">${app.fmtDate(first, { month: "long", year: "numeric" })}</h3>
      <div class="week-nav"><button class="icon-btn" data-action="ph-month" data-d="-1" aria-label="Previous month">${app.I.chevL}</button>
      <button class="icon-btn" data-action="ph-month" data-d="1" aria-label="Next month" ${month >= app.today().slice(0, 7) ? "disabled" : ""}><span style="transform:scaleX(-1);display:grid">${app.I.chevL}</span></button></div></div>
    <div class="cal-head">${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<span>${d}</span>`).join("")}</div>
    <div class="cal">${cells.join("")}</div>` : ""}
    ${strip ? `<div class="sec-h" style="margin-top:22px"><h3>Over time</h3><span class="sec-sub">One photo per month</span></div><div class="timeline">${strip}</div>` : `<div class="card" style="margin-top:22px"><h4>Start your timeline</h4><p class="sub">Take a photo every week or two in the same spot, same lighting, same pose. Small changes are hard to see day to day and obvious over months.</p><button class="btn primary block" data-action="ph-add-today" style="margin-top:12px">Add today's photo</button></div>`}
    <input type="file" id="ph-file" accept="image/*" capture="environment" hidden>`;
}
app.photosHTML = photosHTML;

function compareHTML() {
  const [a, b] = app.PH.pick.map((d) => app.myPhotos().filter((p) => p.date === d));
  if (!a || !b) return "";
  const pose = ["Front", "Side", "Back", "Other"].find((ps) => a.some((p) => p.pose === ps) && b.some((p) => p.pose === ps));
  const pa = (pose && a.find((p) => p.pose === pose)) || a[0], pb = (pose && b.find((p) => p.pose === pose)) || b[0];
  const days = Math.round((app.parseDay(pb.date) - app.parseDay(pa.date)) / 86400000);
  const wa = app.bodyweightOn(pa.date), wb = app.bodyweightOn(pb.date);
  const side = (p, w) => `<figure><img src="${app.photoURL(p)}" alt="${p.pose} photo from ${app.fmtDate(p.date)}"><figcaption><b>${app.fmtDate(p.date, { month: "short", day: "numeric", year: "numeric" })}</b><span>${p.pose}${w ? " · " + app.fmtW(w) : ""}</span></figcaption></figure>`;
  return `<div class="card cmp-card"><div class="cmp-grid">${side(pa, wa)}${side(pb, wb)}</div>
    <p class="sub small" style="text-align:center">${days ? `${Math.abs(days)} days apart` : "Same day"}${wa && wb ? ` · ${app.signed(wb - wa, 1)} ${app.wUnit()}` : ""}</p></div>`;
}
app.compareHTML = compareHTML;

function daySheetHTML() {
  const d = app.ui.sd.date, list = app.myPhotos().filter((p) => p.date === d);
  const w = app.bodyweightOn(d);
  return `<h3>${app.fmtDate(d, { weekday: "long", month: "long", day: "numeric" })}</h3>
    ${w ? `<p class="sub" style="margin:-6px 0 12px">Bodyweight ${app.fmtW(w)}</p>` : ""}
    ${list.length ? `<div class="ph-list">${list.map((p) => `<figure class="ph-fig" data-id="${p.id}"><img src="${app.photoURL(p)}" alt="${p.pose} photo">
      <figcaption><span class="chip-s flat">${p.pose}</span><button class="link-btn danger" data-action="ph-del" data-id="${p.id}">Delete</button></figcaption></figure>`).join("")}</div>` : `<p class="sub">No photos on this day yet.</p>`}
    <span class="field-label" style="margin-top:14px">Pose for the next photo</span>
    <div class="seg2 pf-seg">${app.POSES.map((ps) => `<button data-action="ph-pose" data-p="${ps}" aria-pressed="${(app.ui.sd.pose || "Front") === ps}">${ps}</button>`).join("")}</div>
    <button class="btn primary block" data-action="ph-add" data-date="${d}">Add photo</button>
    <p class="sub small">Photos are compressed to about 200 KB and kept private to your account.</p>`;
}
app.daySheetHTML = daySheetHTML;

async function onPhotoFile(file) {
  if (!file) return;
  const date = app.ui.phDate || app.today(), pose = (app.ui.sd && app.ui.sd.pose) || "Front";
  try {
    const p = await app.addPhoto(file, date, pose);
    app.PH.month = date.slice(0, 7);
    if (app.ui.sheet === "phday") app.renderSheet(); else { app.ui.sheet = "phday"; app.ui.sd = { date, pose }; app.renderSheet(); }
    app.render();
    app.toast(`Photo saved to ${app.fmtDate(p.date, { month: "short", day: "numeric" })}.`);
  } catch (e) { app.toast("Couldn't read that image. Try another one."); }
}
app.onPhotoFile = onPhotoFile;
