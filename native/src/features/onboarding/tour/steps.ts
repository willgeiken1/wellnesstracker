import { t, type MessageKey } from '@/i18n/en';
import { PAGES, pageLabel, type PageKey } from '@/features/shell/pages';

/** The four tour stops (ob-tour to ob-tour-4): each opens its tab and spotlights it on the bar. */
export const TOUR_PAGES = ['home', 'training', 'food', 'progress'] as const satisfies readonly PageKey[];
const BODY: Record<(typeof TOUR_PAGES)[number], MessageKey> = { home: 'obaTourHome', training: 'obaTourTraining', food: 'obaTourFood', progress: 'obaTourProgress' };

export interface TourStep { page: PageKey; href: string; color: string; eyebrow: string; title: string; body: string }
export function tourSteps(): TourStep[] {
  return TOUR_PAGES.map(key => {
    const page = PAGES.find(p => p.key === key)!, label = pageLabel(key);
    return { page: key, href: page.href, color: page.color, eyebrow: t('obaTourEyebrow').replace('{tab}', label), title: label, body: t(BODY[key]) };
  });
}
