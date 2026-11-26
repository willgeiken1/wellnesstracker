import { implementTile, type TileRenderProps } from '@/features/tiles';
import { t } from '@/i18n/en';
import { router } from 'expo-router';
import { trainingNav } from '../nav';
import { CardioTile, E1rmTile, MusclesTile, RecentTile, RecordsTile, StreakTile, liftShort } from './more';
import { GoalTile, SessionTile } from './today';
import { NextTile, PlanTile, WeekTile, weekMeta } from './week';

/* The Training tab's tiles. Each body is a component so it can read the live data and tick its own clock. */
const S = (p: TileRenderProps) => p.size === 'S';
/** The goal, muscles and streak tiles open the training trend, as in the design. */
const toTrend = () => router.push('/progress/trend?metric=training');
implementTile('training', 'session', { render: p => <SessionTile {...p} />, open: () => trainingNav.logger() });
implementTile('training', 'goal', { render: p => <GoalTile {...p} />, meta: p => S(p) ? '' : t('trainingToday'), open: toTrend });
implementTile('training', 'week', { render: p => <WeekTile {...p} />, meta: () => weekMeta(), open: () => trainingNav.plan() });
implementTile('training', 'next', { render: p => <NextTile {...p} />, meta: () => t('trainingPlanMeta'), open: () => trainingNav.plan() });
implementTile('training', 'plan', { render: p => <PlanTile {...p} />, open: () => trainingNav.plan() });
implementTile('training', 'muscles', { render: p => <MusclesTile {...p} />, meta: p => S(p) ? '' : t('trainingThisWeek'), open: toTrend });
implementTile('training', 'e1rm', { render: p => <E1rmTile {...p} />, meta: p => S(p) ? '' : liftShort(p.options.lift), open: o => trainingNav.exercise(o.lift || 'Back squat') });
implementTile('training', 'recent', { render: p => <RecentTile {...p} />, meta: p => S(p) ? '' : `${t('trainingLast')} ${p.size === 'L' ? 4 : 3}` });
implementTile('training', 'records', { render: p => <RecordsTile {...p} /> });
implementTile('training', 'streak', { render: p => <StreakTile {...p} />, open: toTrend });
implementTile('training', 'cardio', { render: p => <CardioTile {...p} />, meta: p => S(p) ? '' : t('trainingThisWeek'), open: () => trainingNav.cardio() });

export const trainingTilesReady = true;
