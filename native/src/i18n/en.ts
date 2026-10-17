export const en = {
  getStarted: 'Get started', haveAccount: 'I have an account', lookAround: 'Look around first',
  authWelcome: 'Welcome to Insight', signIn: 'Sign in', createAccount: 'Create account',
  authUnavailable: "Sign-in isn't set up in this build", email: 'Email', password: 'Password', confirmPassword: 'Confirm password',
  requiredPassword: 'Enter your password.', invalidEmail: 'Enter a valid email address.', shortPassword: 'Use at least 8 characters for your password.',
  passwordMismatch: 'Passwords must match.', authFailed: 'Unable to sign in or create an account. Check your details and try again.',
  confirmEmail: 'Check your email to confirm your account, then sign in.', working: 'Please wait…',
  onboardingStub: 'Your account is ready. Profile and units setup arrives in M2.',
  demoMode: 'Demo mode · synthetic examples only', leaveDemo: 'Leave demo', signOut: 'Sign out',
  signOutConfirm: 'Sign out of this account?', signOutBody: 'This account’s data will be erased from this phone.', signOutUnsynced_one: '{count} unsynced change will be lost, including changes that need review.', signOutUnsynced_other: '{count} unsynced changes will be lost, including changes that need review.',
  cancel: 'Cancel', syncConflictStatus: 'Some changes need review', syncConflicts: 'sync conflicts · review needed', syncPending: 'Changes waiting to sync', syncNow: 'Sync now', syncIdle: 'Up to date', syncOffline: 'Offline · changes remain on this phone', syncBusy: 'Syncing…', pending: 'pending',
  localRecovery: 'Local data recovery', eraseAllLocal: 'Erase all local data and sign out',
  eraseAllBody: 'Local data on this device for all accounts will be erased and you will be signed out. Synced data stays in your account.',
  retrySignOut: 'Finish signing out', recoveryFailed: 'Recovery did not finish. The app is still locked. Try again.',
  localError: 'Local data is unavailable. Please restart the app.', preferenceError: 'Preferences could not be saved. Please try again.',
  signOutFailed: 'Sign-out did not finish. Some local data may already have been erased. Try again now to finish signing out.', backWelcome: 'Back to Welcome',

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
  appearanceHint: 'Your preferences are saved on this phone.',
  placeholder: 'M2/M3 placeholder', placeholderBody: 'This feature is coming in M2/M3. Explore the app or change its appearance while you wait.',
  welcome: 'Your daily space', welcomeBody: 'The foundation is ready. Workout and food logging arrive in M2/M3.',
  workout: 'Active workout', foodLog: 'Food log', segments: 'Sections',
  fontError: 'The heading font could not load. System text is available.',
} as const;
export type MessageKey = keyof typeof en;
export function t(key: MessageKey): string { return en[key]; }

export function signOutUnsynced(count: number): string {
  return t(count===1?'signOutUnsynced_one':'signOutUnsynced_other').replace('{count}',String(count));
}
