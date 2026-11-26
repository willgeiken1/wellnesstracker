import type { IconName } from '@/components/kit';

/** One Settings section: its page, its title, its icon and colour, the settings it holds (Search finds each), and extra words. */
export interface SettingsSection { id: SectionId; title: string; navTitle?: string; icon: IconName; color: string; items: readonly string[]; keywords: string }
export const SECTION_IDS = ['goals', 'connections', 'account', 'reminders', 'privacy', 'appearance', 'units', 'workout', 'data', 'about'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** The Settings home (pages/settings.js SECT): copy word for word. */
export const SECTIONS: Record<SectionId, SettingsSection> = {
  goals: { id: 'goals', title: 'Goals and targets', icon: 'score', color: 'food', items: ['Calories', 'Protein', 'Training', 'Sleep', 'Goal weight', 'Weekly pace', 'Current weight'], keywords: 'targets kcal macros rings daily weight loss' },
  connections: { id: 'connections', title: 'Connections', icon: 'link', color: 'recovery', items: ['Apple Health', 'Oura', 'Sync Oura now', 'Reconnect Oura', 'Disconnect Oura', 'Fitbit', 'WHOOP', 'Garmin'], keywords: 'health ring watch sources connect hrv steps' },
  account: { id: 'account', title: 'Account and sync', icon: 'cloud', color: 'accent', items: ['Name', 'Sign-in', 'Sync across devices', 'Sync now', 'This iPhone', 'iPad', 'Sign out'], keywords: 'apple email profile photo devices log out' },
  reminders: { id: 'reminders', title: 'Reminders and notifications', navTitle: 'Reminders', icon: 'bell', color: 'danger', items: ['At most 2 a day', 'Workout reminder', 'Rest timer alert', 'Weekly report', 'Food reminders', 'Reconnect Oura alert', 'iOS notifications'], keywords: 'notifications alerts push monday nudges' },
  privacy: { id: 'privacy', title: 'Privacy and security', icon: 'faceid', color: 'success', items: ['Face ID lock', 'Require Face ID', 'Blur in app switcher', 'Hide numbers', 'Send crash reports', 'Share usage analytics', 'Privacy center', 'Delete a date range'], keywords: 'lock passcode security private analytics what we store' },
  appearance: { id: 'appearance', title: 'Appearance', icon: 'moon', color: 'accent2', items: ['Theme', 'True black', 'Palette', 'App icon', 'Tab bar', 'Density', 'Reduce Transparency'], keywords: 'dark light mode system oled colour color palette accent look app icon lit peaks dusk glow clear night moon' },
  units: { id: 'units', title: 'Units and formats', icon: 'ruler', color: 'water', items: ['Weight', 'Height', 'Energy', 'Water', 'Distance', 'Time', 'Week starts on'], keywords: 'lb kg kcal kj metric imperial 24 hour clock' },
  workout: { id: 'workout', title: 'Workout settings', icon: 'workouts', color: 'training', items: ['Default rest', 'Start automatically', 'Plates', 'Bar', 'Suggest warm-up sets', 'Warm-up sets', 'Keep screen on', 'Haptics'], keywords: 'rest timer plate barbell warmup gym' },
  data: { id: 'data', title: 'Your data', icon: 'layers', color: 'warning', items: ['Export as CSV', 'Save a backup file', 'Restore from a backup', 'Delete a date range', 'Delete account'], keywords: 'export csv backup restore delete erase download' },
  about: { id: 'about', title: 'About', icon: 'info', color: 'muted', items: ['What’s New', 'Rate Insight', 'Send feedback', 'Privacy policy', 'Terms of use', 'Acknowledgements', 'Version'], keywords: 'version help support rate review contact' },
};
/** The four groups on the Settings home, in order. */
export const GROUPS: readonly (readonly SectionId[])[] = [['goals', 'connections'], ['account', 'reminders', 'privacy'], ['appearance', 'units', 'workout'], ['data', 'about']];

export interface SearchHit { section: SectionId; title: string; sub: string; focus?: string }
/** Search: a section matches on its title and words, a setting on its own name. At most 14 results. */
export function searchSettings(query: string, extraWords: (id: SectionId) => string = () => ''): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: SearchHit[] = [];
  for (const id of SECTION_IDS) {
    const s = SECTIONS[id];
    if (`${s.title} ${s.keywords} ${extraWords(id)}`.toLowerCase().includes(q)) out.push({ section: id, title: s.title, sub: 'Section' });
    for (const item of s.items) if (item.toLowerCase().includes(q)) out.push({ section: id, title: item, sub: s.title, focus: item });
  }
  return out.slice(0, 14);
}
