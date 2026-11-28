// About shows which over-the-air update the phone runs, so a person can tell whether the latest change has reached it.
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0', ios: { buildNumber: '3' } } } }));
import { updateLabel } from '../src/features/settings/home';

test('an update names the day and time it was published', () => {
  const at = new Date(2026, 10, 27, 21, 2);
  expect(updateLabel({ isEnabled: true, isEmbeddedLaunch: false, createdAt: at })).toBe(at.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
});
test('the code the build shipped with, updates turned off, or no date shows nothing', () => {
  expect(updateLabel({ isEnabled: true, isEmbeddedLaunch: true, createdAt: new Date() })).toBe('');
  expect(updateLabel({ isEnabled: false, isEmbeddedLaunch: false, createdAt: new Date() })).toBe('');
  expect(updateLabel({ isEnabled: true, isEmbeddedLaunch: false, createdAt: null })).toBe('');
  expect(updateLabel(null)).toBe('');
});
