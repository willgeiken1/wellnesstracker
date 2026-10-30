import { projectWorkoutFacts, sanitizeWorkoutName } from '../../supabase/functions/_shared/workout-payload';
import { exerciseLibrary } from '../src/core/workout/library';
import exerciseNames from '../../supabase/functions/_shared/workout-exercise-names.json';
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
test('projection, phone guard and endpoint redact only the payload without mutating caller-owned names', async () => {
    const workout = { exercises: [
        { name: 'My Garage Sled Push', sets: 1, reps: 8, volume: 100 },
        { name: 'Bench Press', sets: 2, reps: 16, volume: 200 },
    ] };
    const before = JSON.parse(JSON.stringify(workout));
    const expected = { exercises: [
        { name: 'Custom exercise', sets: 1, reps: 8, volume: 100 },
        { name: 'Bench Press', sets: 2, reps: 16, volume: 200 },
    ] };
    const facts = projectWorkoutFacts(workout);
    assertWorkoutPayload(facts);
    expect(facts).toEqual(expected);
    expect(workout).toEqual(before);
    const request = jest.fn(async () => response);
    const client = createWorkoutEndpointClient(request, () => ({ consent: true, generation: 1 }));
    await client(workout, 'coach', new AbortController().signal);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('workout-summary', expect.objectContaining({ workout: expected }), expect.any(AbortSignal));
    expect(JSON.stringify(request.mock.calls)).not.toContain('My Garage Sled Push');
    expect(workout).toEqual(before);
    expect(workout.exercises[0].name).toBe('My Garage Sled Push');
});
test('summary generation leaves the stored workout, entries and sets unchanged while redacting the request', async () => {
    const { repo, store, session, entry } = fixture();
    const custom = store.addExercise(session.id, 'My Garage Sled Push', 1);
    store.editDraft(custom.id, 0, { weight: '100', reps: '8' });
    store.toggleDone(custom.id, 0);
    const source = { session, entries: store.entries(session.id), sets: [store.sets(entry.id), store.sets(custom.id)] };
    const before = JSON.parse(JSON.stringify(source));
    setConsent(repo, true);
    const request = jest.fn(async () => response);
    const client = createWorkoutEndpointClient(request, () => aiState(repo));
    await new WorkoutSummaryService(repo, client).generate(session.id);
    expect(request).toHaveBeenCalledTimes(1);
    const body = (request.mock.calls as unknown[][])[0][1] as { workout: { exercises: { name: string }[] } };
    expect(body.workout.exercises.map(exercise => exercise.name)).toEqual(['Bench Press', 'Custom exercise']);
    expect(JSON.stringify(body)).not.toContain('My Garage Sled Push');
    expect(savedWorkoutSummary(repo, session.id)?.summary).toBe(response.summary);
    expect(source).toEqual(before);
    expect({ session: repo.get('sessions', session.id), entries: store.entries(session.id), sets: [store.sets(entry.id), store.sets(custom.id)] }).toEqual(before);
    expect(repo.get('entries', custom.id)?.data.exercise).toBe('My Garage Sled Push');
});
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
test.each([...vectors.sanitized, ...vectors.blocked.map(input => ({ input, expected: 'Custom exercise' }))])('phone sanitizes $input at the endpoint boundary', async ({input, expected}) => {
    const {repo, store, session, entry} = fixture();
    repo.save('entries', {...entry.data, exercise: input}, entry.id);
    expect(buildWorkoutFacts(store, session.id).exercises[0].name).toBe(expected);
    expect(sanitizeWorkoutName(input)).toBe(expected);
    expect(sanitizeWorkoutName(sanitizeWorkoutName(input))).toBe(expected);
    setConsent(repo, true);
    const request = jest.fn(async () => response);
    const client = createWorkoutEndpointClient(request, () => aiState(repo));
    await new WorkoutSummaryService(repo, client).generate(session.id);
    // Exercise both the service projection and direct callers of the client.
    await client({exercises:[{name:input,sets:1,reps:8,volume:100}]}, 'coach', new AbortController().signal);
    expect(request).toHaveBeenCalledTimes(2);
    for (const call of request.mock.calls as unknown[][]) {
        const body = call[1] as {workout: {exercises: {name: string}[]}};
        expect(body.workout.exercises[0].name).toBe(expected);
        expect(JSON.stringify(body)).not.toContain(input);
    }
});
test.each(['Bench Press', 'Bodyweight Curl'])('phone preserves bundled name %s in the serialized payload', async name => {
    const request = jest.fn(async () => response);
    const client = createWorkoutEndpointClient(request, () => ({consent: true, generation: 1}));
    await client({exercises:[{name,sets:1,reps:8,volume:100}]}, 'coach', new AbortController().signal);
    expect(JSON.stringify(request.mock.calls)).toContain(name);
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

test('shared AI name allowlist matches the entire bundled exercise catalog exactly', () => {
    expect(exerciseNames).toEqual(exerciseLibrary.map(exercise => exercise.name));
    for (const name of exerciseNames) {
        expect(() => assertWorkoutPayload({exercises:[{name,sets:1,reps:8,volume:100}]})).not.toThrow();
        for (const input of [name, name.toLowerCase(), `  ${name}  `]) {
            expect(sanitizeWorkoutName(input)).toBe(name);
            expect(sanitizeWorkoutName(sanitizeWorkoutName(input))).toBe(name);
        }
    }
});

test.each(vectors.allowed.flatMap(canonical => [canonical, canonical.toLowerCase(), `  ${canonical}  `].map(input => ({input, canonical}))))('phone canonicalizes $input at both payload boundaries', async ({input, canonical}) => {
    const {repo, store, session, entry} = fixture();
    repo.save('entries', {...entry.data, exercise: input}, entry.id);
    expect(buildWorkoutFacts(store, session.id).exercises[0].name).toBe(canonical);
    const request = jest.fn(async () => response);
    const client = createWorkoutEndpointClient(request, () => ({consent: true, generation: 1}));
    await client({exercises:[{name:input,sets:1,reps:8,volume:100}]}, 'coach', new AbortController().signal);
    const body = (request.mock.calls as unknown[][])[0][1] as {workout: {exercises: {name: string}[]}};
    expect(body.workout.exercises[0].name).toBe(canonical);
    expect(sanitizeWorkoutName(sanitizeWorkoutName(input))).toBe(canonical);
});
test('fallback name is idempotent and accepted by the phone guard', () => {
    expect(sanitizeWorkoutName('Custom exercise')).toBe('Custom exercise');
    expect(() => assertWorkoutPayload({exercises:[{name:'Custom exercise',sets:1,reps:8,volume:100}]})).not.toThrow();
});
