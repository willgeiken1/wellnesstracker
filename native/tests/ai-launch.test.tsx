import { render, screen } from '@testing-library/react-native';
import { AI_FEATURES_ENABLED } from '../src/features/ai-launch';
import { LOG_MODES } from '../src/features/food/modes';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrivacySwitches } from '../src/features/settings/privacy-switches';
import { DiagnosticsList } from '../src/features/settings/pages';
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
  // Settings redesign: Privacy is one page; the meal estimate controls join it only while AI is on.
  expect(src('app/settings/[section].tsx')).toMatch(/<PrivacyPage crash=\{<DiagnosticsList \/>\} ai=\{AI_FEATURES_ENABLED \? <AiPrivacy \/> : null\} \/>/);
  expect(src('app/settings/[section].tsx')).toMatch(/function AiPrivacy\(\) \{[\s\S]*?<FoodAiPrivacy repo=\{repository\} \/>/);
});
test('Privacy settings show the crash-report and analytics switches the privacy policy promises', async () => {
  await render(<ThemeProvider><PrivacySwitches /></ThemeProvider>);
  expect(screen.getByLabelText('Send crash reports')).toBeTruthy();
  expect(screen.getByLabelText('Share usage analytics')).toBeTruthy();
  // The redesigned Privacy page shows the same two switches under Diagnostics.
  screen.unmount();
  await render(<ThemeProvider><DiagnosticsList /></ThemeProvider>);
  expect(screen.getByLabelText('Send crash reports')).toBeTruthy();
  expect(screen.getByLabelText('Share usage analytics')).toBeTruthy();
});
