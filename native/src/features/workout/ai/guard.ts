import type { WorkoutStore } from '../../../data/workout/store';
import { assertFoodAiPayload } from '../../food/ai/guard';
import { assertWorkoutData, projectWorkoutFacts, workoutNameForTextGuard } from '../../../../../supabase/functions/_shared/workout-payload';
import type { WorkoutFacts } from '../../../../../supabase/functions/_shared/workout-payload';
export { type WorkoutFacts, type SummaryLength } from '../../../../../supabase/functions/_shared/workout-payload';
export function assertWorkoutPayload(value: unknown): asserts value is WorkoutFacts {
    assertWorkoutData(value);
    for (const exercise of value.exercises) {
        // Only catalog names or 'Custom exercise' reach this point; keep the food
        // text guard as defense in depth (catalog names are masked as 'Exercise').
        assertFoodAiPayload({ model: 'workout-name-guard', max_tokens: 1500, messages: [{ role: 'user', content: [{ type: 'text', text: workoutNameForTextGuard(exercise.name) }] }] });
    }
}
/** Project from completed exercise/set records. Never pass a session or profile
 * object to an AI client. Volume is external kg × reps; no body mass is read. */
export function buildWorkoutFacts(store: WorkoutStore, id: string): WorkoutFacts {
    const facts = projectWorkoutFacts({ exercises: store.entries(id).filter(entry => !store.skipped(entry.id)).flatMap(entry => {
            const sets = store.sets(entry.id);
            if (!sets.length)
                return [];
            return [{ name: String(entry.data.exercise), sets: sets.length,
                    reps: sets.reduce((n, set) => n + Number(set.data.reps), 0),
                    // Use recorded external kg × reps even for one-sided sets; unlike the
                    // summary screen, do not double dumbbell load or include body mass.
                    volume: sets.reduce((n, set) => n + Number(set.data.weight_kg) * Number(set.data.reps), 0) }];
        }) });
    assertWorkoutPayload(facts);
    return facts;
}
