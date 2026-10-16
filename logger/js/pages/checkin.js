import { app } from "../runtime.js";
import {
  CHECKIN_FIELDS,
  CHECKIN_LABELS,
  CHECKIN_TITLES,
  NOT_ADVICE,
  RESOURCE_LINES,
  checkinRecord,
  listCheckins,
  needsResource,
  upsertCheckin,
} from "../shared/checkin.js";

function todayRow() {
  const day = app.today();
  return listCheckins(app.state && app.state.checkins).find((row) => row && (row.date === day || row.day === day)) || null;
}

function draft() {
  const sd = app.ui.sd || {};
  return {
    mood: sd.mood,
    energy: sd.energy,
    stress: sd.stress,
    note: sd.note || "",
  };
}

function checkinStripHTML() {
  const saved = todayRow();
  const title = saved ? "Checked in" : "Check in";
  const sub = saved
    ? "Update today's check-in"
    : (app.session ? "Syncs to your account, including the note" : "Stays on this phone until you sign in");
  return `<button type="button" class="checkin-open" data-action="checkin"><span><b>${title}</b><span>${sub}</span></span></button>`;
}
app.checkinStripHTML = checkinStripHTML;

function scaleRow(key) {
  const current = app.ui.sd && app.ui.sd[key];
  const buttons = CHECKIN_LABELS[key].map((label, index) => {
    const value = index + 1;
    const pressed = current === value;
    return `<button type="button" data-action="checkin-pick" data-k="${key}" data-v="${value}" aria-pressed="${pressed ? "true" : "false"}">${label}</button>`;
  }).join("");
  return `<fieldset class="checkin-field"><legend>${CHECKIN_TITLES[key]}</legend><div class="checkin-scale" role="group" aria-label="${CHECKIN_TITLES[key]}">${buttons}</div></fieldset>`;
}

function checkinSheetHTML() {
  const note = app.ui.sd && app.ui.sd.note || "";
  const show = needsResource(draft());
  return `<h3 class="checkin-title">Check in</h3>
    <p class="sub checkin-advice">${NOT_ADVICE}</p>
    ${CHECKIN_FIELDS.map(scaleRow).join("")}
    <label class="field-label" for="checkin-note">Note, optional</label>
    <textarea class="text-in checkin-note" id="checkin-note" maxlength="500" rows="3" aria-label="Check-in note">${app.esc(note)}</textarea>
    <section class="checkin-card" id="checkin-card" aria-live="polite"${show ? "" : " hidden"}>
      <p>${RESOURCE_LINES[0]}</p>
      <p>${RESOURCE_LINES[1]}</p>
      <p class="checkin-links"><a href="tel:988">Call 988</a><a href="sms:988">Text 988</a></p>
    </section>
    <button class="btn primary block" data-action="checkin-save">Save check-in</button>`;
}
app.checkinSheetHTML = checkinSheetHTML;

function openCheckin() {
  const saved = todayRow();
  app.ui.sheet = "checkin";
  app.ui.sd = {
    mood: saved && saved.mood,
    energy: saved && saved.energy,
    stress: saved && saved.stress,
    note: saved && saved.note || "",
  };
  app.renderSheet();
  setTimeout(() => {
    const first = app.$(".checkin-scale button");
    if (first) first.focus();
  }, 60);
}
app.openCheckin = openCheckin;

function syncCheckinCard() {
  const card = app.$("#checkin-card");
  if (!card) return;
  card.hidden = !needsResource(draft());
}
app.syncCheckinCard = syncCheckinCard;

function saveCheckin() {
  const noteEl = app.$("#checkin-note");
  if (noteEl) app.ui.sd.note = noteEl.value;
  const rec = checkinRecord({
    id: "c_" + Date.now().toString(36),
    date: app.today(),
    at: new Date().toISOString(),
    mood: app.ui.sd.mood,
    energy: app.ui.sd.energy,
    stress: app.ui.sd.stress,
    note: app.ui.sd.note,
  });
  if (!rec) {
    app.toast("Pick a mood, energy, or stress, or write a note.");
    return;
  }
  const merged = upsertCheckin(app.state, rec);
  app.state.checkins = merged.checkins;
  app.state.checkinDeleted = merged.checkinDeleted;
  app.save();
  app.ui.sheet = null;
  app.render();
  app.toast("Check-in saved.");
}
app.saveCheckin = saveCheckin;
