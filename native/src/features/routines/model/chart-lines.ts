/* Opt-in "Started X" marks for the sleep, HRV and weight charts.

   A mark is a day and a label. It is drawn on this phone, beside readings
   that never leave their own store. This file reads no reading and sends
   nothing anywhere: no network call, no analytics event, no crash report
   and no model ever sees a name or a start day.

   Ported from the web app's shared/routine-chart-lines.js. */

import { isLive, projectRoutineStore, validDay, type RoutineCompound, type RoutineStore } from "./shape";
import { clean, put, rowStampOf, stampAfter, start, type RoutineClock } from "./write";

export interface StartedMarker { date: string; label: string }
export interface ChartLineChoice { compoundId: string; label: string; startDate: string; on: boolean }

/* The card on the charts screen, word for word. */
export const CHART_LINES_TITLE = "Started lines";
export const CHART_LINES_HINT = "Show a thin line on sleep, HRV, and weight charts. Off until you turn one on. The line is drawn on this phone.";

function displayName(value: unknown): string {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function shiftDay(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

/* A weekly HRV point is the Monday plus the six days after it. A start on
   Tuesday through Sunday of that week belongs on the Monday label, including
   the last week, whose Sunday is after the last label. */
function bucketStart(days: readonly string[], startDate: string, span: number): string | null {
  let bucket: string | null = null;
  for (const day of days) {
    if (day <= startDate && startDate <= shiftDay(day, span - 1) && (bucket == null || day > bucket)) bucket = day;
  }
  return bucket;
}

/* The marks for a chart whose x labels are days. Only a live compound that
   was switched on, with a start day inside the chart, gets one. */
export function startedChartMarkers(store: unknown, labels: unknown, opts?: { bucketDays?: number } | null): StartedMarker[] {
  if (!Array.isArray(labels) || !labels.length) return [];
  const view = projectRoutineStore(store);
  if (!view) return [];
  const days = labels.filter((day): day is string => validDay(day));
  if (!days.length) return [];
  const span = opts && opts.bucketDays === 7 ? 7 : 1;
  const first = days.reduce((a, b) => (a < b ? a : b));
  const last = days.reduce((a, b) => (a > b ? a : b));
  const end = span === 1 ? last : shiftDay(last, span - 1);
  const markers: StartedMarker[] = [];
  for (const compound of view.compounds) {
    if (!compound || compound.chartLine !== true || !validDay(compound.startDate)) continue;
    if (compound.startDate < first || compound.startDate > end) continue;
    const date = span === 1 ? compound.startDate : bucketStart(days, compound.startDate, span);
    if (!date) continue;
    const name = displayName(compound.name);
    if (!name) continue;
    markers.push({ date, label: `Started ${name}` });
  }
  markers.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return markers;
}

/* One switch per compound that has a start day, by name. All start off. */
export function chartLineChoices(store: unknown): ChartLineChoice[] {
  const view = projectRoutineStore(store);
  if (!view) return [];
  const named = view.compounds.filter((row): row is RoutineCompound & { startDate: string } => !!row && validDay(row.startDate) && !!displayName(row.name));
  return named
    .map((row) => ({ compoundId: row.id, label: `Started ${displayName(row.name)}`, startDate: row.startDate, on: row.chartLine === true }))
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : a.compoundId < b.compoundId ? -1 : a.compoundId > b.compoundId ? 1 : 0));
}

/* Turns one line on or off. It needs a start day and a real change. Only
   the compound row is written: no log and no start day is touched. */
export function setCompoundChartLine(input: unknown, compoundId: unknown, on: unknown, clock: RoutineClock): RoutineStore | null {
  const store = start(input, clock, false);
  if (!store || typeof compoundId !== "string" || !compoundId) return null;
  const compound = store.compounds.find((row) => row.id === compoundId);
  if (!compound || !isLive(compound) || !validDay(compound.startDate)) return null;
  const want = on === true;
  if ((compound.chartLine === true) === want) return null;
  return clean(put(store, "compounds", { ...compound, chartLine: want }, stampAfter(clock.now, rowStampOf(compound))));
}
