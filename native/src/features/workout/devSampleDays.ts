import { localDay } from "@/core/workout/rules";
import { syncedTables } from "@/data/rows";
import type { WorkoutStore } from "@/data/workout/store";
import { saveWeighIn } from "@/features/body/model";
import { meals, saveFood, setTargets } from "@/features/food/model";
import type { FixtureContext } from "./devFixture";
import { DEMO_ROUTINE_ID, DEMO_SESSION_ID } from "../../../fixtures/demo";

const DAY = 86_400_000, KJ = 4.184;
export const SAMPLE_DAYS = 14;
const food = (name: string, kcal: number, protein: number, carbs: number, fat: number) => ({
  name, energy_kj: kcal * KJ, protein_g: protein, carbs_g: carbs, fat_g: fat, fiber_g: null, sugar_g: null, sodium_mg: null, amount_g: null,
});
// Made-up meals. Three rotating days so the charts move without looking random.
const MENUS = [
  [food("Oats with berries", 420, 18, 62, 10), food("Chicken rice bowl", 680, 52, 74, 16), food("Salmon, potatoes and greens", 760, 48, 58, 34), food("Greek yogurt", 180, 20, 12, 5)],
  [food("Eggs on toast", 460, 28, 34, 22), food("Turkey sandwich", 590, 40, 58, 18), food("Beef stir-fry with noodles", 820, 50, 82, 28), food("Protein shake", 210, 32, 10, 4)],
  [food("Yogurt, granola and banana", 480, 24, 70, 11), food("Lentil soup and bread", 540, 28, 78, 10), food("Chicken pasta", 780, 54, 86, 20), food("Apple and peanut butter", 260, 7, 28, 14)],
] as const;
const ROUTINES = [
  { name: "Push day", lifts: [["Bench Press", 185, 8], ["Overhead Press", 105, 10], ["Incline Dumbbell Press", 60, 10]] },
  { name: "Pull day", lifts: [["Barbell Row", 155, 8], ["Lat Pulldown", 130, 10], ["Dumbbell Curl", 30, 12]] },
  { name: "Leg day", lifts: [["Squat", 225, 6], ["Romanian Deadlift", 185, 8], ["Leg Press", 320, 10]] },
] as const;
// Days ago with a workout: four a week, today included.
const TRAINED = new Set([13, 11, 10, 8, 6, 4, 3, 1, 0]);

/** Development only: fills the example account with two made-up weeks of food, workouts and weigh-ins, so
 * screens can be looked at with data in them. Every row is recorded as a sample, so none can ever be carried
 * into a real account. Runs once; a second call does nothing. */
export function createSampleDays(store: WorkoutStore, context: FixtureContext, now = Date.now()): boolean {
  if (!__DEV__ || !context.isDev || !context.demo || context.signedIn || store.repo.owner !== "demo") return false;
  const repo = store.repo;
  if (repo.localGet("demoSampleDays")) return true;
  return repo.atomic(() => {
    // The example account's two placeholders (an empty "Demo full body" routine and a "Demo workout" dated 1 Jan
    // with nothing in it) would sit beside the real-looking weeks as "Up next" and a blank History row. They go,
    // but only while still empty, so anything someone built on them stays.
    const live = (table: "routines" | "sessions", id: string) => { const row = repo.get(table, id); return !!row && !row.deleted_at; };
    if (live("routines", DEMO_ROUTINE_ID) && !store.templateExercises(DEMO_ROUTINE_ID).length) store.deleteTemplate(DEMO_ROUTINE_ID);
    if (live("sessions", DEMO_SESSION_ID) && !store.entries(DEMO_SESSION_ID).length) repo.remove("sessions", DEMO_SESSION_ID);
    const before = new Set(syncedTables.flatMap(table => repo.list(table, true)).map(row => row.id));
    const at = (daysAgo: number, hour: number) => { const d = new Date(now - daysAgo * DAY); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour).getTime(); };
    const today = localDay(new Date(now)), slots = meals(repo);
    setTargets(repo, localDay(new Date(now - (SAMPLE_DAYS - 1) * DAY)), { energy_kj: 2300 * KJ, protein_g: 160, carbs_g: 250, fat_g: 75 }, today);
    const routines = ROUTINES.map(r => store.saveTemplate(r.name, r.lifts.map(([exercise]) => ({ exercise, target_sets: 3, target_reps: 8 }))));
    let turn = 0;
    for (let ago = SAMPLE_DAYS - 1; ago >= 0; ago--) {
      const day = localDay(new Date(now - ago * DAY)), menu = MENUS[ago % MENUS.length];
      // Today is still in progress: breakfast and lunch only.
      menu.slice(0, ago === 0 ? 2 : menu.length).forEach((item, i) => saveFood(repo, day, slots[Math.min(i, slots.length - 1)].id, item, ago % 5 === 2 ? 0.85 : 1, undefined, today));
      saveWeighIn(repo, Math.round((181.8 - (SAMPLE_DAYS - 1 - ago) * 0.14 + (ago % 3 === 0 ? 0.3 : ago % 3 === 1 ? -0.2 : 0)) * 10) / 10, "lb", day);
      if (!TRAINED.has(ago)) continue;
      const pick = turn++ % ROUTINES.length, start = Math.min(at(ago, 7), now - 3_600_000), session = store.start(routines[pick].id, start);
      // Logged as a live workout and finished once: editing a finished workout set by set recomputes all history each time.
      for (const entry of store.entries(session.id)) {
        const lift = ROUTINES[pick].lifts.find(([name]) => name === entry.data.exercise);
        if (!lift) continue;
        // A little heavier each week.
        const weight = lift[1] + (ago < 7 ? 5 : 0);
        store.drafts(entry.id).forEach((_, i) => { store.editDraft(entry.id, i, { weight: String(weight), reps: String(lift[2] - (i === 2 ? 1 : 0)) }); store.toggleDone(entry.id, i, start + (i + 1) * 180_000); });
      }
      store.skipTimer();
      store.finish(session.id, { startedAt: start, finishedAt: start + 3_300_000, notes: "" }, start + 3_300_000);
    }
    // Sample identity must survive later edits and never be promoted to an account.
    const generated = syncedTables.flatMap(table => repo.list(table, true)).filter(row => !before.has(row.id)).map(row => row.id);
    repo.localSave("demoSamples", [...new Set([...(repo.localGet<string[]>("demoSamples") ?? []), ...generated])]);
    repo.localSave("demoSampleDays", true);
    return true;
  });
}
