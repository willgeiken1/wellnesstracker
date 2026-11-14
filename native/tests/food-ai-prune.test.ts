import { aiState, expireFoodAiPhotos, setConsent } from '../src/features/food/ai/service';
import { memoryRepository } from './workout-repository';

const HOUR = 3600000;
/** Made-up meal notes only. */
test('an estimate note and its thumbnail go a day after the food row is deleted, not before', () => {
  const repo = memoryRepository();
  setConsent(repo, true);
  const kept = repo.save('food_entries', { day: '2026-11-10', name: 'Synthetic soup' });
  const gone = repo.save('food_entries', { day: '2026-11-10', name: 'Synthetic toast' });
  const recent = repo.save('food_entries', { day: '2026-11-10', name: 'Synthetic tea' });
  repo.localSave('foodAi', { ...aiState(repo), entries: {
    [kept.id]: { confirmed: true, thumbnail: 'data:image/jpeg;base64,AAAA' },
    [gone.id]: { confirmed: true, thumbnail: 'data:image/jpeg;base64,BBBB' },
    [recent.id]: { confirmed: false },
    'not-here-yet': { confirmed: false },
  } });
  const now = Date.now();
  repo.remove('food_entries', gone.id);
  repo.remove('food_entries', recent.id);
  // Pretend the toast was deleted two days ago and the tea a minute ago.
  (repo.get('food_entries', gone.id) as { deleted_at: number }).deleted_at = now - 48 * HOUR;
  expireFoodAiPhotos(repo, now);
  expect(Object.keys(aiState(repo).entries).sort()).toEqual([kept.id, recent.id, 'not-here-yet'].sort());
  expect(aiState(repo).entries[kept.id].thumbnail).toBe('data:image/jpeg;base64,AAAA');
});
