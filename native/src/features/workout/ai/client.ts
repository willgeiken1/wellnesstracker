import { getAuthClient } from '../../../auth/client';
import { t } from '../../../i18n/en';
import { today } from '../../onboarding/model';
import { aiState } from '../../food/ai/service';
import type { Repository } from '../../../data/repository';
import { assertWorkoutPayload, type WorkoutFacts, type SummaryLength } from './guard';
import { isSummaryLength, projectWorkoutFacts } from '../../../../../supabase/functions/_shared/workout-payload';
export interface SummaryReply {
    summary: string;
    remaining: number;
    limit: number;
}
export type WorkoutAiClient = (workout: WorkoutFacts, length: SummaryLength, signal: AbortSignal) => Promise<SummaryReply>;
export type WorkoutEndpointRequest = (name: 'workout-summary', body: {
    workout: WorkoutFacts;
    length: SummaryLength;
    localDate: string;
    timeZone: string;
}, signal: AbortSignal) => Promise<unknown>;
export class WorkoutSummaryLimitError extends Error {
    constructor() { super(t('workoutAiLimit')); }
}
export function createWorkoutEndpointClient(request: WorkoutEndpointRequest, consent: () => {
    consent: boolean;
    generation: number;
}, day: () => string = today, zone: () => string = () => Intl.DateTimeFormat().resolvedOptions().timeZone): WorkoutAiClient {
    return async (workout, length, signal) => {
        const permission = consent();
        const check = () => {
            const current = consent();
            if (signal.aborted || !permission.consent || !current.consent || permission.generation !== current.generation)
                throw Error(t('foodAiConsentRequired'));
        };
        check();
        const facts = projectWorkoutFacts(workout);
        assertWorkoutPayload(facts);
        if (!isSummaryLength(length))
            throw Error(t('workoutAiFailure'));
        const body = { workout: facts, length, localDate: day(), timeZone: zone() };
        check();
        const response = await request('workout-summary', body, signal);
        check();
        if (!response || typeof response !== 'object')
            throw Error(t('workoutAiFailure'));
        const result = response as Partial<SummaryReply> & {
            code?: unknown;
        };
        if (result.code === 'limit')
            throw new WorkoutSummaryLimitError();
        if (typeof result.summary !== 'string' || !result.summary.trim() || result.summary.length > 2000
            || result.limit !== 5 || !Number.isInteger(result.remaining) || Number(result.remaining) < 0 || Number(result.remaining) > 4)
            throw Error(t('workoutAiFailure'));
        return { summary: result.summary.trim(), remaining: result.remaining!, limit: 5 };
    };
}
/** Same loopback-only auth config as M2-16. No auth read until a consented call. */
export function createLocalWorkoutAiClient(repo: Repository): WorkoutAiClient {
    return createWorkoutEndpointClient(async (name, body, signal) => {
        const client = getAuthClient();
        if (!client)
            throw Error(t('foodAiUnavailable'));
        const { data, error } = await client.functions.invoke(name, { body, signal });
        if (error) {
            if (error.context?.status === 429) {
                const result = await error.context.json().catch(() => null);
                if (result?.code === 'limit')
                    throw new WorkoutSummaryLimitError();
            }
            throw Error(t('workoutAiFailure'));
        }
        return data;
    }, () => aiState(repo));
}
