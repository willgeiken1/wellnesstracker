export const en = {
  home: 'Home', workouts: 'Workouts', food: 'Food', progress: 'Progress', insights: 'Insights',
  settings: 'Settings', openSettings: 'Open settings', backHome: 'Back to Home', backSettings: 'Back to Settings',
  startFreestyle: 'Start freestyle', logFood: 'Log food', closeWorkout: 'Close workout',
  routines: 'Routines', history: 'History', cardio: 'Cardio', body: 'Body', photos: 'Photos', goals: 'Goals & PRs',
  trends: 'Trends', recovery: 'Recovery', weekly: 'Weekly report',
  account: 'Account', profile: 'Profile & units', appearance: 'Appearance', workoutSettings: 'Workout',
  health: 'Health & devices', notifications: 'Notifications', privacy: 'Privacy', data: 'Data', about: 'About',
  licenses: 'Licenses', licensesHint: 'Lexend (SIL Open Font License 1.1) and RepDB. Full notices coming soon.',
  theme: 'Theme', system: 'System', light: 'Light', dark: 'Dark', accent: 'Accent',
  citrus: 'Citrus', sea: 'Sea Glass', dusk: 'Dusk', sand: 'Sandstone',
  appearanceHint: 'Changes apply now. Saving your preferences comes in P2c.',
  placeholder: 'M2/M3 placeholder', placeholderBody: 'This feature is coming in M2/M3. Explore the app or change its appearance while you wait.',
  welcome: 'Your daily space', welcomeBody: 'The foundation is ready. Workout and food logging arrive in M2/M3.',
  workout: 'Active workout', foodLog: 'Food log', segments: 'Sections',
  fontError: 'The heading font could not load. System text is available.',
} as const;
export type MessageKey = keyof typeof en;
export function t(key: MessageKey): string { return en[key]; }
