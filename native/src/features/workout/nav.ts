import { router } from 'expo-router';

/** Every Training route in one place, so they can move together (see the packet report: detail, exercise and plan
 * would push as cards, and the sheets opened from the tab would sit at the app root). */
export const trainingRoutes = {
  logger: '/workout',
  summary: '/workout/summary',
  detail: '/workout/detail',
  exercise: '/workout/exercise',
  plan: '/workout/plan',
  picker: '/workout/picker',
  rest: '/workout/rest',
  cardio: '/workout/cardio',
} as const;

export const trainingNav = {
  logger: (routine?: string) => router.push(routine ? { pathname: trainingRoutes.logger, params: { routine } } : trainingRoutes.logger),
  summary: (id: string) => router.replace({ pathname: trainingRoutes.summary, params: { id } }),
  detail: (id: string) => router.push({ pathname: trainingRoutes.detail, params: { id } }),
  exercise: (name: string) => router.push({ pathname: trainingRoutes.exercise, params: { name } }),
  plan: () => router.push(trainingRoutes.plan),
  picker: (params: { mode?: 'add' | 'replace'; entry?: string } = {}) => router.push({ pathname: trainingRoutes.picker, params }),
  rest: (entry?: string) => router.push(entry ? { pathname: trainingRoutes.rest, params: { entry } } : trainingRoutes.rest),
  cardio: () => router.push(trainingRoutes.cardio),
};
