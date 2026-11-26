import type { NativeStackNavigationOptions } from 'expo-router';

/*
 * How every screen opens, in one place. Tabs stay full screen. A screen the design pushes slides in from the right
 * and goes back with the edge swipe. A sheet rises from the bottom with a grabber and closes with a swipe down:
 * a large sheet stops just short of the top and turns the page behind it into a card; a medium sheet sits at its own
 * height over the page and does not grow.
 */

/** The sheet's top corners (`.sheet { border-radius: 24px 24px 0 0 }`). */
export const SHEET_RADIUS = 24;

/** A large sheet's height on the design's 852 pt phone, as a share of the screen: the system's large detent. */
export const LARGE_SHARE = 0.934;

/** Each medium sheet's height on the 852 pt phone, as a share of the screen, measured from the design. */
export const MEDIUM_SHARE = {
  'page-section': 0.252,
  'tile-edit': 0.252,
  'home-tile-edit': 0.462,
  'rest-timer': 0.684,
  'quick-cal': 0.679,
  'copy-day': 0.563,
  'log-weight': 0.651,
} as const;
export type MediumSheet = keyof typeof MEDIUM_SHARE;

/** A form sheet detent is a share of the large detent, so a measured height becomes its share of the large sheet. */
export const detentOf = (screenShare: number) => Math.round((screenShare / LARGE_SHARE) * 1000) / 1000;

const sheet = { headerShown: false, presentation: 'formSheet', sheetGrabberVisible: true, sheetCornerRadius: SHEET_RADIUS } as const;

/** A large sheet: one detent at the top, the page behind becomes a card. */
export const largeSheet: NativeStackNavigationOptions = { ...sheet, sheetAllowedDetents: [1] };

/** A medium sheet at the design's height, as its only detent, so it cannot be dragged up to full height. */
export function mediumSheet(id: MediumSheet): NativeStackNavigationOptions {
  return { ...sheet, sheetAllowedDetents: [detentOf(MEDIUM_SHARE[id])], sheetExpandsWhenScrolledToEdge: false };
}

/**
 * Copy yesterday is sized by what it lists, as the design's medium sheet is (`max-height: 72%`): its measured height
 * holds three meals, each further meal adds a 69 pt row (68 pt row and its line), fewer take rows away, and it never
 * passes 72 percent of the screen, where the list scrolls instead.
 */
export function copyDaySheet(meals?: unknown): NativeStackNavigationOptions {
  const n = Math.max(1, Math.round(Number(meals)) || 3);
  const pt = Math.min(0.72 * 852, MEDIUM_SHARE['copy-day'] * 852 + (n - 3) * 69);
  return { ...sheet, sheetAllowedDetents: [detentOf(pt / 852)], sheetExpandsWhenScrolledToEdge: false };
}

/** A medium sheet as tall as what it holds (the Tab bar sheet), which never needs to scroll. */
export const fittedSheet: NativeStackNavigationOptions = { ...sheet, sheetAllowedDetents: 'fitToContents' };

/** A pushed screen: in from the right, back with the edge swipe. It draws its own bar. */
export const pushedScreen: NativeStackNavigationOptions = { headerShown: false };

/** Customize a tile: Home's sheet is taller than the other pages' (it shows the tile's styles and sizes in a card). */
export const tileEditSheet = (page?: unknown) => mediumSheet(page === 'home' ? 'home-tile-edit' : 'tile-edit');

/**
 * The root stack's routes that open over the tabs, with the design screen each one is. Read by app/_layout.tsx, so a
 * route's presentation is known before it opens (a route can't change from a push to a sheet once it is on screen).
 */
export const ROOT_ROUTES: Record<string, { mock: string; options: NativeStackNavigationOptions | ((params: Record<string, unknown> | undefined) => NativeStackNavigationOptions) }> = {
  // Home and the tile grid
  'tiles/tray': { mock: 'tile-tray', options: largeSheet },
  'tiles/edit': { mock: 'tile-edit', options: params => tileEditSheet(params?.page) },
  'tiles/section': { mock: 'page-section', options: mediumSheet('page-section') },
  'tab-bar': { mock: 'tab-bar', options: fittedSheet },
  // Training
  workout: { mock: 'workout-active', options: pushedScreen },
  'training/detail': { mock: 'workout-detail', options: pushedScreen },
  'training/exercise': { mock: 'exercise-detail', options: pushedScreen },
  'training/plan': { mock: 'plan', options: pushedScreen },
  'training/picker': { mock: 'exercise-picker', options: largeSheet },
  'training/rest': { mock: 'rest-timer', options: mediumSheet('rest-timer') },
  'training/cardio': { mock: 'cardio-log', options: largeSheet },
  // Food
  'food/meal': { mock: 'meal-detail', options: pushedScreen },
  'food/nutrition': { mock: 'nutrition', options: pushedScreen },
  'food/log': { mock: 'log-meal', options: largeSheet },
  'food/item': { mock: 'food-item', options: largeSheet },
  'food/barcode': { mock: 'barcode', options: largeSheet },
  'food/quick': { mock: 'quick-cal', options: mediumSheet('quick-cal') },
  'food/saved': { mock: 'saved-meals', options: largeSheet },
  'food/copy': { mock: 'copy-day', options: params => copyDaySheet(params?.meals) },
  'food/water': { mock: 'water', options: largeSheet },
  'food/water-containers': { mock: 'water-containers', options: largeSheet },
  // Progress
  score: { mock: 'score', options: pushedScreen },
  'progress/trend': { mock: 'trend', options: pushedScreen },
  'progress/weekly': { mock: 'weekly-report', options: pushedScreen },
  'progress/sleep': { mock: 'sleep', options: pushedScreen },
  'progress/body': { mock: 'body', options: pushedScreen },
  'progress/photos': { mock: 'photos', options: pushedScreen },
  'progress/log-weight': { mock: 'log-weight', options: mediumSheet('log-weight') },
  'progress/photo-capture': { mock: 'photo-capture', options: largeSheet },
  'progress/measurements': { mock: 'measurements', options: largeSheet },
  'progress/export': { mock: 'export', options: largeSheet },
  // Routines
  'routines/detail': { mock: 'routine-detail', options: pushedScreen },
  'routines/add': { mock: 'add-item', options: largeSheet },
  'routines/converter': { mock: 'converter', options: largeSheet },
  'routines/pause': { mock: 'pause-routine', options: largeSheet },
  'routines/reorder': { mock: 'routines-reorder', options: pushedScreen },
  'routines/history': { mock: 'routine-history', options: pushedScreen },
  'routines/new': { mock: 'new-routine', options: largeSheet },
  // Settings is its own stack, pushed; its sheets are in SETTINGS_ROUTES.
  settings: { mock: 'settings', options: pushedScreen },
};

/** The Settings stack's sheets (registered in app/settings/_layout.tsx); every other Settings page pushes. */
export const SETTINGS_ROUTES: Record<string, { mock: string; options: NativeStackNavigationOptions }> = {
  'delete-range': { mock: 'settings-delete-range', options: largeSheet },
  'whats-new': { mock: 'settings-whats-new', options: largeSheet },
  feedback: { mock: 'settings-feedback', options: largeSheet },
};

/** A route's options for `<Stack.Screen options>`, which takes a function of the route. `extra` adds a VoiceOver title. */
export function routeOptions(name: string, extra?: NativeStackNavigationOptions) {
  const o = ROOT_ROUTES[name].options;
  return typeof o === 'function'
    ? ({ route }: { route: { params?: object } }) => ({ ...o(route.params as Record<string, unknown> | undefined), ...extra })
    : { ...o, ...extra };
}
