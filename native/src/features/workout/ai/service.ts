import type { Repository } from '../../../data/repository';
import { WorkoutStore } from '../../../data/workout/store';
import { t } from '../../../i18n/en';
import { aiState } from '../../food/ai/service';
import { buildWorkoutFacts, type WorkoutFacts, type SummaryLength } from './guard';
import type { WorkoutAiClient } from './client';
import { isSummaryLength } from '../../../../../supabase/functions/_shared/workout-payload';
export interface SavedWorkoutSummary {
    summary: string;
    facts: WorkoutFacts;
    length: SummaryLength;
    feedback: 'up' | 'down' | null;
}
const savedKey = (id: string) => `workoutAi:${id}`;
const active = new WeakMap<Repository, AbortController>();
export function summaryLength(repo: Repository): SummaryLength {
    const length = repo.localGet('workoutAiLength');
    return isSummaryLength(length) ? length : 'coach';
}
export function setSummaryLength(repo: Repository, length: SummaryLength) {
    if (!isSummaryLength(length))
        throw Error(t('workoutAiFailure'));
    repo.localSave('workoutAiLength', length);
}
export function savedWorkoutSummary(repo: Repository, id: string) {
    return repo.localGet<SavedWorkoutSummary>(savedKey(id));
}
/** Feedback is local metadata; no model or quota operation exists in this path. */
export function rateWorkoutSummary(repo: Repository, id: string, feedback: 'up' | 'down') {
    const saved = savedWorkoutSummary(repo, id);
    if (saved)
        repo.localSave(savedKey(id), { ...saved, feedback });
}
export class WorkoutSummaryService {
    private controller: AbortController | null = null;
    constructor(private repo: Repository, private client: WorkoutAiClient | null) { }
    cancel() { this.controller?.abort(); }
    async generate(id: string, signal?: AbortSignal) {
        if (active.has(this.repo))
            throw Error(t('foodAiBusy'));
        const permission = aiState(this.repo);
        if (!permission.consent || signal?.aborted)
            throw Error(t('foodAiConsentRequired'));
        if (!this.client)
            throw Error(t('foodAiUnavailable'));
        const store = new WorkoutStore(this.repo);
        const session = this.repo.get('sessions', id);
        if (!session || session.deleted_at !== null || session.data.finished_at == null)
            throw Error(t('workoutAiFailure'));
        const facts = buildWorkoutFacts(store, id), fingerprint = JSON.stringify(facts), length = summaryLength(this.repo);
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort);
        const currentPermission = () => {
            const current = aiState(this.repo);
            return current.consent && current.generation === permission.generation;
        };
        const unsubscribe = this.repo.subscribe(() => { if (!currentPermission())
            controller.abort(); });
        this.controller = controller;
        active.set(this.repo, controller);
        try {
            if (!currentPermission() || controller.signal.aborted)
                throw Error(t('foodAiConsentRequired'));
            const result = await this.client(facts, length, controller.signal);
            if (!currentPermission() || controller.signal.aborted)
                throw Error(t('foodAiConsentRequired'));
            const currentSession = this.repo.get('sessions', id);
            if (!currentSession || currentSession.deleted_at !== null || JSON.stringify(buildWorkoutFacts(store, id)) !== fingerprint)
                throw Error(t('workoutAiChanged'));
            if (typeof result.summary !== 'string' || !result.summary.trim() || result.summary.length > 2000)
                throw Error(t('workoutAiFailure'));
            this.repo.localSave(savedKey(id), { summary: result.summary, facts, length, feedback: null } satisfies SavedWorkoutSummary);
            return result;
        }
        finally {
            this.controller = null;
            unsubscribe();
            signal?.removeEventListener('abort', abort);
            if (active.get(this.repo) === controller)
                active.delete(this.repo);
        }
    }
}
