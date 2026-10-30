import { getAuthClient } from '../src/auth/client';
import { createLocalWorkoutAiClient, WorkoutSummaryLimitError } from '../src/features/workout/ai/client';
import { setConsent } from '../src/features/food/ai/service';
import { memoryRepository } from './workout-repository';
jest.mock('../src/auth/client', () => ({ getAuthClient: jest.fn() }));
test.each(['limit', 'other', 'invalid-json'])('HTTP 429 parses %s without retrying', async code => {
    const repo = memoryRepository(); setConsent(repo, true);
    const json = jest.fn(async () => { if (code === 'invalid-json') throw Error('synthetic'); return {code}; });
    const invoke = jest.fn(async () => ({data:null,error:{context:{status:429,json}}}));
    (getAuthClient as jest.Mock).mockReturnValue({functions:{invoke}});
    const pending = createLocalWorkoutAiClient(repo)({exercises:[{name:'Bench Press',sets:1,reps:8,volume:100}]}, 'coach', new AbortController().signal);
    await expect(pending).rejects.toThrow(code === 'limit' ? WorkoutSummaryLimitError : 'Could not');
    expect(json).toHaveBeenCalledTimes(1);expect(invoke).toHaveBeenCalledTimes(1);
});
