import type { Repository } from '@/data/repository';
import { INSIGHT_SECTIONS, type InsightSection } from '@/features/insights/screen';

/** Progress is one screen with two views, each with its own sections. The first of each list is the default. */
export const PROGRESS_VIEWS = ['tracking', 'insights'] as const;
export type ProgressView = (typeof PROGRESS_VIEWS)[number];
export const TRACKING_SECTIONS = ['body', 'photos', 'goals'] as const;
export type TrackingSection = (typeof TRACKING_SECTIONS)[number];
export const PROGRESS_SECTIONS = { tracking: TRACKING_SECTIONS, insights: INSIGHT_SECTIONS } as const;
export interface ProgressPlace { view: ProgressView; tracking: TrackingSection; insights: InsightSection }

/** Where the last view and each view's last section are kept: on this phone, for this account, never synced. */
export const VIEW_KEY = 'progress.view';
export const SECTION_KEY = { tracking: 'progress.section.tracking', insights: 'progress.section.insights' } as const;

/** The value if it is one of the allowed ones, or nothing. Anything else, of any type, is refused. */
export function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : undefined;
}

/** Where Progress was left. Anything missing or unknown falls back to Tracking and each view's first section. */
export function readPlace(repository: Pick<Repository, 'localGet'> | null | undefined): ProgressPlace {
  const get = (key: string) => repository?.localGet<unknown>(key);
  return {
    view: oneOf(PROGRESS_VIEWS, get(VIEW_KEY)) ?? 'tracking',
    tracking: oneOf(TRACKING_SECTIONS, get(SECTION_KEY.tracking)) ?? 'body',
    insights: oneOf(INSIGHT_SECTIONS, get(SECTION_KEY.insights)) ?? 'trends',
  };
}

/** Keeps the place on this phone for this account, writing only what changed. Never a synced row. With no
 * repository (the signed-out shell) there is nowhere to keep it. */
export function savePlace(repository: Pick<Repository, 'localGet' | 'localSave'> | null | undefined, next: ProgressPlace) {
  if (!repository) return;
  const was = readPlace(repository);
  if (next.view !== was.view) repository.localSave(VIEW_KEY, next.view);
  if (next.tracking !== was.tracking) repository.localSave(SECTION_KEY.tracking, next.tracking);
  if (next.insights !== was.insights) repository.localSave(SECTION_KEY.insights, next.insights);
}

/** What a link such as /progress?view=insights&section=weekly asks for. A section alone names its view. A section
 * that does not belong to the view asked for is dropped, and anything outside the lists is ignored. */
export function linkedPlace(params: { view?: unknown; section?: unknown }): { view: ProgressView; section?: string } | undefined {
  const asked = oneOf(PROGRESS_VIEWS, params.view);
  const view = asked ?? PROGRESS_VIEWS.find(name => oneOf<string>(PROGRESS_SECTIONS[name], params.section));
  if (!view) return undefined;
  return { view, section: oneOf<string>(PROGRESS_SECTIONS[view], params.section) };
}
