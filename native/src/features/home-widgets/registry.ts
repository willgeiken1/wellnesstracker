/** Services that unlock Home widgets (I9b). Fitbit and WHOOP are stubs until their integrations land. */
export const SERVICES = ['oura', 'appleHealth', 'fitbit', 'whoop'] as const;
export type ServiceId = typeof SERVICES[number];

export type WidgetDefinition = {
  id: string;
  /** Shown in the Edit tray, exactly as REDESIGN.md §2.3. */
  title: string;
  /** Any one of these services unlocks the widget; empty means always unlocked. */
  services: readonly ServiceId[];
  defaultOnHome: boolean;
  /** False keeps the widget out of the tray and off Home (not built yet, or gated). */
  available: boolean;
};

const NONE = [] as const;
const HEALTH_OR_OURA = ['appleHealth', 'oura'] as const;
const OURA = ['oura'] as const;

/**
 * REDESIGN.md §2.3 widget catalogue (I9, I9a). Registry order is the default Home order, then tray order.
 * checkIn (AGENTS.md rule 6, supersedes Q47) is an optional tile but stays unavailable until the sentry-scrub,
 * usage and describe egress tests carry mood, energy and stress sentinels. water is designed now, built in M3 (I10).
 */
export const CATALOGUE = [
  { id: 'bodyMap', title: 'Body map', services: NONE, defaultOnHome: true, available: true },
  { id: 'insightScore', title: 'Insight Score', services: NONE, defaultOnHome: true, available: true },
  { id: 'todayWorkout', title: "Today's workout", services: NONE, defaultOnHome: true, available: true },
  { id: 'foodRing', title: 'Food', services: NONE, defaultOnHome: true, available: true },
  { id: 'water', title: 'Water', services: NONE, defaultOnHome: false, available: false },
  { id: 'weekStrip', title: "This week's days", services: NONE, defaultOnHome: false, available: true },
  { id: 'brief', title: 'Brief', services: NONE, defaultOnHome: false, available: true },
  { id: 'yourWeek', title: 'Your week', services: NONE, defaultOnHome: false, available: true },
  { id: 'headline', title: 'Daily headline', services: NONE, defaultOnHome: false, available: true },
  { id: 'pattern', title: "Today's pattern", services: NONE, defaultOnHome: false, available: true },
  { id: 'weeklyGoal', title: 'Weekly goal', services: NONE, defaultOnHome: false, available: true },
  { id: 'weeklyReport', title: 'Weekly report', services: NONE, defaultOnHome: false, available: true },
  { id: 'trendChips', title: 'Trend chips', services: NONE, defaultOnHome: false, available: true },
  { id: 'foodYesterday', title: "Yesterday's food", services: NONE, defaultOnHome: false, available: true },
  { id: 'weightTrend', title: 'Weight trend', services: NONE, defaultOnHome: false, available: true },
  { id: 'cardio', title: 'Cardio', services: NONE, defaultOnHome: false, available: true },
  { id: 'cardioMinutes', title: 'Cardio minutes', services: NONE, defaultOnHome: false, available: true },
  { id: 'musclesWeek', title: 'Muscles this week', services: NONE, defaultOnHome: false, available: true },
  { id: 'workoutPrint', title: 'Workout print', services: NONE, defaultOnHome: false, available: true },
  { id: 'checkIn', title: 'Check in', services: NONE, defaultOnHome: false, available: false },
  { id: 'steps', title: 'Steps', services: HEALTH_OR_OURA, defaultOnHome: false, available: true },
  { id: 'sleepDuration', title: 'Sleep duration', services: HEALTH_OR_OURA, defaultOnHome: false, available: true },
  { id: 'hrv', title: 'HRV', services: HEALTH_OR_OURA, defaultOnHome: false, available: true },
  { id: 'sleepScore', title: 'Sleep score', services: OURA, defaultOnHome: false, available: true },
  { id: 'readiness', title: 'Readiness', services: OURA, defaultOnHome: false, available: true },
  { id: 'lastNight', title: 'Last night', services: OURA, defaultOnHome: false, available: true },
  { id: 'restingHr', title: 'Resting heart rate', services: OURA, defaultOnHome: false, available: true },
] as const satisfies readonly WidgetDefinition[];

/** Later services (I9): stubs only, hidden from the tray until a connector ships. */
export const STUB_WIDGETS = [
  { id: 'fitbitActivity', title: 'Fitbit activity', services: ['fitbit'], defaultOnHome: false, available: false },
  { id: 'whoopRecovery', title: 'WHOOP recovery', services: ['whoop'], defaultOnHome: false, available: false },
] as const satisfies readonly WidgetDefinition[];

export const WIDGETS = [...CATALOGUE, ...STUB_WIDGETS] as const;

export type WidgetId = typeof WIDGETS[number]['id'];

const byId = new Map<string, WidgetDefinition>(WIDGETS.map(widget => [widget.id, widget]));
export const getWidget = (id: WidgetId): WidgetDefinition | undefined => byId.get(id);
export const isWidgetId = (value: unknown): value is WidgetId => typeof value === 'string' && byId.has(value);
export const isServiceId = (value: unknown): value is ServiceId => (SERVICES as readonly unknown[]).includes(value);
export const isAvailable = (id: WidgetId) => getWidget(id)?.available === true;

export const DEFAULT_LAYOUT: WidgetId[] = WIDGETS.filter(widget => widget.defaultOnHome).map(widget => widget.id);
