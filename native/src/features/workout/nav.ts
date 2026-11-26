import { router, type NativeStackNavigationOptions } from 'expo-router';
import { largeSheet, mediumSheet } from '../navigation/presentation';

/** Every Training route in one place. The logger and its summary live in the workout modal; workout detail, exercise
 * detail and the plan push as cards at the app root, and the picker, rest timer and cardio log open as sheets there,
 * so they open the same way from the Training tab and from inside a workout (registered in app/_layout.tsx). */
export const trainingRoutes = {
  logger: '/workout',
  summary: '/workout/summary',
  detail: '/training/detail',
  exercise: '/training/exercise',
  plan: '/training/plan',
  picker: '/training/picker',
  rest: '/training/rest',
  cardio: '/training/cardio',
} as const;

export const trainingNav = {
  logger: (routine?: string) => router.push(routine ? { pathname: trainingRoutes.logger, params: { routine } } : trainingRoutes.logger),
  summary: (id: string) => router.replace({ pathname: trainingRoutes.summary, params: { id } }),
  detail: (id: string) => router.push({ pathname: trainingRoutes.detail, params: { id } }),
  exercise: (name: string) => router.push({ pathname: trainingRoutes.exercise, params: { name } }),
  plan: () => router.push(trainingRoutes.plan),
  picker: (params: { mode?: 'add' | 'replace' | 'routine' | 'browse'; entry?: string; routine?: string } = {}) => router.push({ pathname: trainingRoutes.picker, params }),
  rest: (entry?: string) => router.push(entry ? { pathname: trainingRoutes.rest, params: { entry } } : trainingRoutes.rest),
  cardio: () => router.push(trainingRoutes.cardio),
};

/** Training's form sheets: the picker and cardio log open large, the rest timer at the design's medium height. */
export const trainingSheetOptions: Record<'large' | 'medium', NativeStackNavigationOptions> = {
  large: largeSheet,
  medium: mediumSheet('rest-timer'),
};
