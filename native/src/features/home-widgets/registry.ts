/** Services that unlock Home widgets (I9b). Fitbit and WHOOP are stubs until their integrations land. */
export const SERVICES = ['oura', 'appleHealth', 'fitbit', 'whoop'] as const;
export type ServiceId = typeof SERVICES[number];

export type WidgetDefinition = {
  id: string;
  /** Sentence case, shown in the Edit tray. */
  title: string;
  requiredService: ServiceId | null;
  defaultOnHome: boolean;
};

/** Registry order is the default Home order, then tray order (I9, I9a). No check-in widget: Q47 FINAL. */
export const WIDGETS = [
  { id: 'bodyMap', title: 'Body map', requiredService: null, defaultOnHome: true },
  { id: 'insightScore', title: 'Insight score', requiredService: null, defaultOnHome: true },
  { id: 'todayWorkout', title: "Today's workout", requiredService: null, defaultOnHome: true },
  { id: 'foodRing', title: 'Food ring', requiredService: null, defaultOnHome: true },
  { id: 'yourWeek', title: 'Your week', requiredService: null, defaultOnHome: false },
  { id: 'weekStrip', title: 'Week strip', requiredService: null, defaultOnHome: false },
  { id: 'weeklyReport', title: 'Weekly report', requiredService: null, defaultOnHome: false },
  { id: 'trendChips', title: 'Trend chips', requiredService: null, defaultOnHome: false },
  { id: 'morningBrief', title: 'Morning brief', requiredService: null, defaultOnHome: false },
  { id: 'ouraSleepScore', title: 'Sleep score', requiredService: 'oura', defaultOnHome: false },
  { id: 'ouraReadiness', title: 'Readiness', requiredService: 'oura', defaultOnHome: false },
  { id: 'healthSteps', title: 'Steps', requiredService: 'appleHealth', defaultOnHome: false },
  { id: 'healthSleep', title: 'Sleep', requiredService: 'appleHealth', defaultOnHome: false },
  { id: 'fitbitActivity', title: 'Fitbit activity', requiredService: 'fitbit', defaultOnHome: false },
  { id: 'whoopRecovery', title: 'Recovery', requiredService: 'whoop', defaultOnHome: false },
] as const satisfies readonly WidgetDefinition[];

export type WidgetId = typeof WIDGETS[number]['id'];

const byId = new Map<string, WidgetDefinition>(WIDGETS.map(widget => [widget.id, widget]));
export const getWidget = (id: WidgetId): WidgetDefinition => byId.get(id)!;
export const isWidgetId = (value: unknown): value is WidgetId => typeof value === 'string' && byId.has(value);
export const isServiceId = (value: unknown): value is ServiceId => (SERVICES as readonly unknown[]).includes(value);

export const DEFAULT_LAYOUT: WidgetId[] = WIDGETS.filter(widget => widget.defaultOnHome).map(widget => widget.id);
