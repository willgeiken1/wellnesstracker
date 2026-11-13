import { t } from '@/i18n/en';
import type { Score, ScorePillar } from './model';

export const PILLAR_NAME: Record<ScorePillar, 'homeTraining' | 'homeFood' | 'recovery'> = { training: 'homeTraining', food: 'homeFood', recovery: 'recovery' };
export const needs = (score: Score) => t(score.daysLeft === 1 ? 'scoreNeedsOne' : 'scoreNeeds').replace('{n}', String(score.daysLeft));
/** The one line under the title: the countdown, what is missing, or the score in words. */
export const headline = (score: Score) => !score.ready ? needs(score) : score.value === null ? t('scoreNoData') : t('scoreOutOf').replace('{n}', String(score.value));
/** What VoiceOver says for the ring and the card. */
export const spokenScore = (score: Score) => !score.ready ? `${t('scoreTitle')}. ${t(score.daysLeft === 1 ? 'scoreNeedsOneSpoken' : 'scoreNeedsSpoken').replace('{n}', String(score.daysLeft))}`
  : score.value === null ? `${t('scoreTitle')}. ${t('scoreNoData')}` : `${t('scoreTitle')}, ${t('scoreOutOf').replace('{n}', String(score.value))}`;
