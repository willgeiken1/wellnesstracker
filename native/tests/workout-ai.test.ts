import type { WorkoutAiClient } from '../src/features/workout/ai/client';
import vectors from '../fixtures/workout-ai-guard.json';
import { WorkoutStore } from '../src/data/workout/store';
import { memoryRepository } from './workout-repository';
import { aiState, FOOD_AI_CONSENT_VERSION, setConsent } from '../src/features/food/ai/service';
import { assertWorkoutPayload, buildWorkoutFacts } from '../src/features/workout/ai/guard';
import { WorkoutSummaryService, savedWorkoutSummary, summaryLength, setSummaryLength, rateWorkoutSummary } from '../src/features/workout/ai/service';
import { createWorkoutEndpointClient } from '../src/features/workout/ai/client';
const response = { summary: 'You completed your sets. Keep building consistency.', remaining: 4, limit: 5 };
function fixture() {
    const repo = memoryRepository(), store = new WorkoutStore(repo), session = store.start(undefined, Date.now() - 60000);
    const entry = store.addExercise(session.id, 'Bench Press', 1);
    store.editDraft(entry.id, 0, { weight: '100', reps: '8' });
    store.toggleDone(entry.id, 0);
    store.finish(session.id, { startedAt: Number(session.data.started_at), finishedAt: Date.now(), notes: '' });
    return { repo, store, session, entry };
}
test('explicit phone projection ignores sentinel fields on workout, entry, set and profile at the actual endpoint boundary', async () => {
    const { repo, store, session, entry } = fixture();
    // Deliberately contaminate fixture rows beyond the production scalar schema.
    Object.assign(session.data, vectors.sentinels);
    Object.assign(entry.data, vectors.sentinels);
    const set = store.sets(entry.id)[0];
    Object.assign(set.data, vectors.sentinels);
    const profile = repo.save('profile', {});
    Object.assign(profile.data, vectors.sentinels);
    setConsent(repo, true);
    const request = jest.fn(async () => response);
    const client = createWorkoutEndpointClient(request, () => aiState(repo), () => '2026-10-29', () => 'UTC');
    await new WorkoutSummaryService(repo, client).generate(session.id);
    const wire = request.mock.calls as unknown[][];
    expect(wire).toHaveLength(1);
    expect(wire[0][0]).toBe('workout-summary');
    const body = wire[0][1] as {
        workout: {
            exercises: unknown[];
        };
    };
    expect(Object.keys(body).sort()).toEqual(['length', 'localDate', 'timeZone', 'workout']);
    expect(body.workout.exercises).toEqual([{ name: 'Bench Press', sets: 1, reps: 8, volume: expect.any(Number) }]);
    for (const sentinel of JSON.stringify(vectors.sentinels).match(/917\d+/g) ?? [])
        expect(JSON.stringify(wire)).not.toContain(sentinel);
    expect(savedWorkoutSummary(repo, session.id)?.summary).toBe(response.summary);
});
test.each(vectors.allowed)('shared phone vector accepts %s', name => {
    expect(() => assertWorkoutPayload({ exercises: [{ name, sets: 1, reps: 8, volume: 100 }] })).not.toThrow();
});
test.each(vectors.blocked)('shared phone vector blocks %s before endpoint', async (name) => {
    const request = jest.fn(async () => response), client = createWorkoutEndpointClient(request, () => ({ consent: true, generation: 1 }));
    await expect(client({ exercises: [{ name, sets: 1, reps: 8, volume: 100 }] }, 'coach', new AbortController().signal)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
});
test('endpoint rejects unknown fields, nested sentinel data, invalid length, missing consent and aborted calls', async () => {
    const request = jest.fn(async () => response);
    let consent = true;
    const client = createWorkoutEndpointClient(request, () => ({ consent, generation: 1 }));
    const facts = { exercises: [{ name: 'Cable Row', sets: 1, reps: 8, volume: 100 }] };
    for (const [key, value] of Object.entries(vectors.sentinels)) {
        await expect(client({ ...facts, [key]: value }, 'coach', new AbortController().signal)).rejects.toThrow();
        await expect(client({ exercises: [{ ...facts.exercises[0], [key]: value }] }, 'coach', new AbortController().signal)).rejects.toThrow();
    }
    await expect(client(facts, 'other' as 'coach', new AbortController().signal)).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(client(facts, 'coach', controller.signal)).rejects.toThrow();
    consent = false;
    await expect(client(facts, 'coach', new AbortController().signal)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
});
test('old consent is renewed once and revoking mid-request discards the summary', async () => {
    const { repo, session } = fixture();
    setConsent(repo, true);
    repo.localSave('foodAi', { ...aiState(repo), consentVersion: FOOD_AI_CONSENT_VERSION - 1 });
    const model = jest.fn(async () => response), service = new WorkoutSummaryService(repo, model);
    await expect(service.generate(session.id)).rejects.toThrow();
    expect(model).not.toHaveBeenCalled();
    setConsent(repo, true);
    expect(aiState(repo).consent).toBe(true);
    expect(aiState(repo).consentVersion).toBe(FOOD_AI_CONSENT_VERSION);
    const revoke = jest.fn(async () => { setConsent(repo, false); return response; });
    await expect(new WorkoutSummaryService(repo, revoke).generate(session.id)).rejects.toThrow();
    expect(savedWorkoutSummary(repo, session.id)).toBeUndefined();
});
test('length defaults to coach; feedback is local and free; regenerate makes another endpoint call and resets feedback', async () => {
    const { repo, session } = fixture();
    setConsent(repo, true);
    expect(summaryLength(repo)).toBe('coach');
    setSummaryLength(repo, 'short');
    const client = jest.fn<ReturnType<WorkoutAiClient>, Parameters<WorkoutAiClient>>(async () => response), service = new WorkoutSummaryService(repo, client);
    await service.generate(session.id);
    rateWorkoutSummary(repo, session.id, 'up');
    expect(savedWorkoutSummary(repo, session.id)?.feedback).toBe('up');
    rateWorkoutSummary(repo, session.id, 'down');
    expect(client).toHaveBeenCalledTimes(1);
    await service.generate(session.id);
    expect(client).toHaveBeenCalledTimes(2);
    expect(client.mock.calls[0][1]).toBe('short');
    expect(savedWorkoutSummary(repo, session.id)?.feedback).toBeNull();
});
test('duplicate generation is blocked across service instances; edited/deleted workout and consent cycles discard late responses', async () => {
    for (const change of ['edit', 'delete', 'consent'] as const) {
        const { repo, store, session, entry } = fixture();
        setConsent(repo, true);
        let finish!: (value: typeof response) => void;
        const client = jest.fn(() => new Promise<typeof response>(resolve => { finish = resolve; }));
        const first = new WorkoutSummaryService(repo, client).generate(session.id);
        await expect(new WorkoutSummaryService(repo, client).generate(session.id)).rejects.toThrow();
        if (change === 'edit')
            store.editDraft(entry.id, 0, { reps: '9' });
        if (change === 'delete')
            repo.remove('sessions', session.id);
        if (change === 'consent') {
            setConsent(repo, false);
            setConsent(repo, true);
        }
        finish(response);
        await expect(first).rejects.toThrow();
        expect(savedWorkoutSummary(repo, session.id)).toBeUndefined();
    }
});
test('failed regeneration preserves the previous summary, feedback and sent facts', async () => {
    const { repo, session } = fixture();
    setConsent(repo, true);
    await new WorkoutSummaryService(repo, async () => response).generate(session.id);
    rateWorkoutSummary(repo, session.id, 'up');
    const saved = savedWorkoutSummary(repo, session.id);
    await expect(new WorkoutSummaryService(repo, async () => { throw Error('synthetic failure'); }).generate(session.id)).rejects.toThrow();
    expect(savedWorkoutSummary(repo, session.id)).toEqual(saved);
});
test('phone snapshot contains only completed, non-skipped exercises, not draft reps', () => {
    const { store, session, entry } = fixture();
    store.editDraft(entry.id, 1, { weight: '999', reps: '999' });
    const pending = store.addExercise(session.id, 'Cable Row', 1);
    store.editDraft(pending.id, 0, { weight: '100', reps: '8' });
    expect(buildWorkoutFacts(store, session.id).exercises).toHaveLength(1);
    expect(buildWorkoutFacts(store, session.id).exercises[0].reps).toBe(8);
});

test('quota response is classified without saving output or making an automatic retry', async () => {
    const {repo,session}=fixture();setConsent(repo,true);
    const request=jest.fn(async () => ({code:'limit',remaining:0,limit:5}));
    const client=createWorkoutEndpointClient(request,() => aiState(repo));
    await expect(new WorkoutSummaryService(repo,client).generate(session.id)).rejects.toThrow('all 5');
    expect(request).toHaveBeenCalledTimes(1);
    expect(savedWorkoutSummary(repo,session.id)).toBeUndefined();
});
test('endpoint response after a revoke/reallow cycle is rejected at the transport boundary', async () => {
    let generation=1;
    const request=jest.fn(async () => {generation+=2;return response;});
    const client=createWorkoutEndpointClient(request,()=>({consent:true,generation}));
    await expect(client({exercises:[{name:'Cable Row',sets:1,reps:8,volume:100}]},'coach',new AbortController().signal)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
});
test('unmounting an idle service does not abort a different service request', async () => {
    const {repo,session}=fixture();setConsent(repo,true);
    let finish!:(value:typeof response)=>void;
    const client:WorkoutAiClient=async (_workout,_length,signal)=>{
        const result=await new Promise<typeof response>(resolve=>{finish=resolve;});
        expect(signal.aborted).toBe(false);
        return result;
    };
    const activeService=new WorkoutSummaryService(repo,client);
    const pending=activeService.generate(session.id);
    new WorkoutSummaryService(repo,client).cancel();
    finish(response);await pending;
    expect(savedWorkoutSummary(repo,session.id)?.summary).toBe(response.summary);
});
