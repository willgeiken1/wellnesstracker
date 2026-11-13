import { render, screen } from '@testing-library/react-native';
import { AI_FEATURES_ENABLED } from '../src/features/ai-launch';
import { LOG_MODES } from '../src/features/food/modes';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrivacySwitches } from '../src/features/settings/privacy-switches';
import { ThemeProvider } from '../src/design/theme-provider';
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn(async () => ({ forOwner: () => ({ localGet: () => null, localSave: jest.fn() }) })) }));
const src = (path: string) => readFileSync(join(__dirname, '../src', path), 'utf8');
test('AI meal estimates and workout summaries are off for the v1 launch (Will, Nov 12 2026)', () => {
  expect(AI_FEATURES_ENABLED).toBe(false);
});
test('the food log offers no Snap or Describe while AI is off', () => {
  expect(LOG_MODES).toEqual(['search', 'scan', 'saved']);
});
test('every AI entry point is behind the launch switch', () => {
  // The background runtime is what sends photos and text to the AI functions; it must not start.
  expect(src('app/_layout.tsx')).toMatch(/AI_FEATURES_ENABLED && <FoodAiRuntime/);
  expect(src('features/workout/summary.tsx')).toMatch(/AI_FEATURES_ENABLED && <WorkoutAiCard/);
  expect(src('features/workout/settings.tsx')).toMatch(/AI_FEATURES_ENABLED && <>/);
  expect(src('features/food/screen.tsx')).toMatch(/AI_FEATURES_ENABLED&&<FoodAiMorningReview/);
  expect(src('features/food/screen.tsx')).toMatch(/AI_FEATURES_ENABLED&&<FoodAiResults/);
  expect(src('features/food/screen.tsx')).toMatch(/AI_FEATURES_ENABLED&&aiMode&&<Card/);
  expect(src('features/food/log-screen.tsx')).toMatch(/AI_FEATURES_ENABLED \? <FoodAiEntry/);
  expect(src('features/food/log-screen.tsx')).toMatch(/AI_FEATURES_ENABLED && \(!!ai\.ready\.length/);
  expect(src('app/settings/[section].tsx')).toMatch(/AI_FEATURES_ENABLED \? <FoodPrivacyScreen \/> : <Screen title=\{title\}><PrivacySwitches \/><\/Screen>/);
});
test('Privacy settings show the crash-report and analytics switches the privacy policy promises', async () => {
  await render(<ThemeProvider><PrivacySwitches /></ThemeProvider>);
  expect(screen.getByLabelText('Send crash reports')).toBeTruthy();
  expect(screen.getByLabelText('Share usage analytics')).toBeTruthy();
});
