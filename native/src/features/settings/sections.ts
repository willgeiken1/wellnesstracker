/** Settings home: the groups, their rows, and the extra words Search matches besides the label. */
export const settingsGroups = [
  { title: 'settingsGroupYou', rows: [
    { route: 'account', label: 'account', icon: 'account', keywords: 'sign in out email sync backup export' },
    { route: 'profile', label: 'profile', icon: 'profile', keywords: 'name lb kg weight height birthday' },
  ] },
  { title: 'settingsGroupApp', rows: [
    { route: 'appearance', label: 'appearance', icon: 'appearance', keywords: 'theme dark light mode colour color ring motion glass' },
    { route: 'workout', label: 'workoutSettings', icon: 'workout', keywords: 'rest timer plates bar haptics summary' },
    { route: 'score', label: 'scoreSetting', icon: 'score', keywords: 'insight ring weights pillars training food recovery hide' },
    { route: 'health', label: 'health', icon: 'health', keywords: 'apple oura fitbit whoop watch connect' },
    { route: 'notifications', label: 'notifications', icon: 'notifications', keywords: 'reminders alerts' },
  ] },
  { title: 'settingsGroupData', rows: [
    { route: 'privacy', label: 'privacy', icon: 'privacy', keywords: 'ai photos thumbnails permission' },
    { route: 'data', label: 'data', icon: 'data', keywords: 'import backup file restore' },
  ] },
  { title: 'settingsGroupAbout', rows: [
    { route: 'about', label: 'about', icon: 'about', keywords: 'version licenses' },
  ] },
] as const;
export type SettingsRow = (typeof settingsGroups)[number]['rows'][number];
export const settingsSections: readonly SettingsRow[] = settingsGroups.flatMap(group => [...group.rows]);

/** The groups with only the rows whose label or extra words contain what was typed. An empty search keeps everything. */
export function searchSettings(query: string, label: (row: SettingsRow) => string) {
  const q = query.trim().toLowerCase();
  return settingsGroups.map(group => ({ title: group.title, rows: group.rows.filter(row =>
    !q || `${label(row)} ${row.keywords}`.toLowerCase().includes(q)) })).filter(group => group.rows.length > 0);
}
