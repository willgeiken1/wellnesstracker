import { resolveQuotaDay } from '../_shared/quota-day.js';
import { assertWorkoutModelPayload, callWorkoutModel } from '../_shared/strip.ts';
import { exactKeys, isSummaryLength, projectWorkoutFacts, workoutModelPayload, WORKOUT_SUMMARY_KIND } from '../_shared/workout-payload.ts';
import type { WorkoutFacts } from '../_shared/workout-payload.ts';
interface Dependencies {
    requireUser: (req: Request) => Promise<{
        id: string;
    } | null>;
    consumeQuota: (user: string, day: string, kind: string) => Promise<{
        allowed: boolean;
        remaining: number;
        limit: number;
    }>;
    releaseQuota: (user: string, day: string, kind: string) => Promise<void>;
    model: (payload: unknown) => Promise<{
        ok: boolean;
        json: () => Promise<{
            stop_reason?: string;
            content?: {
                type?: string;
                text?: string;
            }[];
        }>;
    }>;
    json: (body: unknown, status?: number) => Response;
    now?: () => Date;
}
/** Dependency injection keeps tests on the actual handler without auth/AI/network. */
export function createWorkoutSummaryHandler(deps: Dependencies) {
    return async (req: Request): Promise<Response> => {
        if (req.method !== 'POST')
            return deps.json({ error: 'Use POST.' }, 405);
        let userId = '', day = '', counted = false;
        try {
            const user = await deps.requireUser(req);
            if (!user)
                return deps.json({ error: 'Sign in to summarize a workout.' }, 401);
            userId = user.id;
            let facts: WorkoutFacts, length: 'short' | 'coach' | 'detailed';
            try {
                const wire = await req.text();
                if (wire.length > 30000)
                    throw Error('Too large.');
                const body: unknown = JSON.parse(wire);
                if (!exactKeys(body, ['workout', 'length', 'localDate', 'timeZone']) || !isSummaryLength(body.length))
                    throw Error('Invalid request.');
                facts = projectWorkoutFacts(body.workout as WorkoutFacts);
                length = body.length;
                const when = resolveQuotaDay(body.localDate, body.timeZone, deps.now?.());
                if ('error' in when)
                    throw Error('Invalid date.');
                day = when.day;
                // Validate names and the complete model envelope before reserving quota.
                assertWorkoutModelPayload(workoutModelPayload(facts, length));
            }
            catch {
                return deps.json({ error: 'Send only exercise names, sets, reps and volume with a valid date and time zone.' }, 400);
            }
            const quota = await deps.consumeQuota(userId, day, WORKOUT_SUMMARY_KIND);
            if (!quota.allowed)
                return deps.json({ code: 'limit', error: 'All 5 workout summaries for today have been used.', remaining: 0, limit: quota.limit }, 429);
            counted = true;
            const result = await callWorkoutModel(workoutModelPayload(facts, length), payload => deps.model(payload));
            if (!result.ok)
                throw Error('Model unavailable.');
            const output = await result.json();
            if (output.stop_reason !== 'end_turn' || !Array.isArray(output.content) || output.content.length !== 1
                || output.content[0].type !== 'text')
                throw Error('Invalid output.');
            const summary = output.content[0].text?.trim();
            if (!summary || summary.length > 2000)
                throw Error('Invalid output.');
            return deps.json({ summary, remaining: quota.remaining, limit: quota.limit });
        }
        catch {
            if (counted) {
                try {
                    await deps.releaseQuota(userId, day, WORKOUT_SUMMARY_KIND);
                }
                catch { /* No provider/input details enter logs or responses. */ }
            }
            return deps.json({ error: 'Could not create the workout summary. Try again.' }, 502);
        }
    };
}
