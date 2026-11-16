import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const app = require('../app.json').expo;
const manifest = app.ios.privacyManifests;
const policy = readFileSync(join(__dirname, '../../insight-daily-privacy.md'), 'utf8');
// Each declared type and the published policy section that discloses it.
const disclosed: Record<string, string> = {
  NSPrivacyCollectedDataTypeEmailAddress: 'We collect your email address',
  NSPrivacyCollectedDataTypeName: 'your profile (name',
  NSPrivacyCollectedDataTypeUserID: 'with your account ID',
  NSPrivacyCollectedDataTypeHealth: 'your daily Oura data is stored with your account',
  NSPrivacyCollectedDataTypeFitness: 'workouts, sets, routines, cardio',
  NSPrivacyCollectedDataTypeOtherUserContent: 'notes, food logs, saved foods',
  NSPrivacyCollectedDataTypeCrashData: 'crash details and basic device information are sent to Sentry',
  NSPrivacyCollectedDataTypePerformanceData: 'crash details and basic device information are sent to Sentry',
  NSPrivacyCollectedDataTypeOtherDiagnosticData: 'basic device information',
  NSPrivacyCollectedDataTypeProductInteraction: 'feature-use events',
};
test('the app declares no tracking and no tracking domains (policy: no ads, no cross-app tracking)', () => {
  expect(manifest.NSPrivacyTracking).toBe(false);
  expect(manifest.NSPrivacyTrackingDomains).toEqual([]);
  expect(policy).toContain("track you across other apps and websites");
});
test('every collected data type is disclosed in the published policy, linked and never used for tracking', () => {
  const types = manifest.NSPrivacyCollectedDataTypes;
  expect(types.map((t: { NSPrivacyCollectedDataType: string }) => t.NSPrivacyCollectedDataType).sort()).toEqual(Object.keys(disclosed).sort());
  for (const type of types) {
    expect(policy).toContain(disclosed[type.NSPrivacyCollectedDataType]);
    expect(type.NSPrivacyCollectedDataTypeLinked).toBe(true);
    expect(type.NSPrivacyCollectedDataTypeTracking).toBe(false);
    expect(type.NSPrivacyCollectedDataTypePurposes.length).toBeGreaterThan(0);
    // No advertising purposes: the policy says data is never used for advertising.
    expect(type.NSPrivacyCollectedDataTypePurposes.join()).not.toMatch(/Advertising/);
  }
});
test('only usage analytics and the account ID are used for analytics', () => {
  const analytics = manifest.NSPrivacyCollectedDataTypes
    .filter((t: { NSPrivacyCollectedDataTypePurposes: string[] }) => t.NSPrivacyCollectedDataTypePurposes.includes('NSPrivacyCollectedDataTypePurposeAnalytics'))
    .map((t: { NSPrivacyCollectedDataType: string }) => t.NSPrivacyCollectedDataType).sort();
  expect(analytics).toEqual(['NSPrivacyCollectedDataTypeProductInteraction', 'NSPrivacyCollectedDataTypeUserID']);
});
test('required-reason APIs carry an approved reason code', () => {
  const reasons = Object.fromEntries(manifest.NSPrivacyAccessedAPITypes.map((t: { NSPrivacyAccessedAPIType: string; NSPrivacyAccessedAPITypeReasons: string[] }) => [t.NSPrivacyAccessedAPIType, t.NSPrivacyAccessedAPITypeReasons]));
  expect(reasons).toEqual({
    NSPrivacyAccessedAPICategoryUserDefaults: ['CA92.1'],
    NSPrivacyAccessedAPICategoryFileTimestamp: ['C617.1'],
    NSPrivacyAccessedAPICategorySystemBootTime: ['35F9.1'],
    NSPrivacyAccessedAPICategoryDiskSpace: ['E174.1'],
  });
});
