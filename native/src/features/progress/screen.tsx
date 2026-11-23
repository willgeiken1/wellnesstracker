import { useEffect, useState } from 'react';
import { AccessibilityInfo, View, useWindowDimensions } from 'react-native';
import * as Router from 'expo-router';
import { useAuth } from '@/auth/provider';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { SectionTabs } from '@/components/section-tabs';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import type { Repository } from '@/data/repository';
import { tokens } from '@/design/tokens';
import { Body } from '@/features/body/screen';
import { Insights } from '@/features/insights/screen';
import { t } from '@/i18n/en';
import { Records } from './records-screen';
import { PROGRESS_SECTIONS, PROGRESS_VIEWS, linkedPlace, oneOf, readPlace, savePlace, type ProgressPlace, type ProgressView } from './views';

type Link = { view?: string | string[]; section?: string | string[] };
const NO_LINK: Link = {};
/** What the link that opened the screen asks for. Drawn outside a navigator (a test that stands the screen on
 * its own) there is no link to read. */
function useLink(): Link {
  try { return Router.useLocalSearchParams<Link>(); } catch { return NO_LINK; }
}
type LinkNavigation = { setParams: (params: Record<string, undefined>) => void };
/** The screen's own navigator, which takes a used link off the route. The app-wide router cannot: it is not ready
 * yet when a cold link opens this screen first. Outside a navigator there is none. */
function useLinkNavigation(): LinkNavigation | null {
  try { return Router.useNavigation() as unknown as LinkNavigation; } catch { return null; }
}
/** The place with a link's view and section laid over it. */
function withLink(place: ProgressPlace, link: ReturnType<typeof linkedPlace>): ProgressPlace {
  if (!link) return place;
  const next = { ...place, view: link.view };
  if (link.view === 'tracking') next.tracking = oneOf(PROGRESS_SECTIONS.tracking, link.section) ?? place.tracking;
  else next.insights = oneOf(PROGRESS_SECTIONS.insights, link.section) ?? place.insights;
  // The same object when the link changes nothing, so the screen can tell there is nothing to adopt.
  return next.view === place.view && next.tracking === place.tracking && next.insights === place.insights ? place : next;
}

/** Progress: one screen with two views, Tracking and Insights, each with its own row of sections. */
export function Progress() {
  const { repository } = useAuth();
  // A new account starts from its own remembered place, never the last account's.
  return <ProgressPage key={repository?.owner ?? 'none'} repository={repository ?? null} />;
}

function ProgressPage({ repository }: { repository: Repository | null }) {
  // Read once. With no repository (the signed-out shell) the place lives in memory for as long as the tab does.
  const [place, setPlace] = useState(() => readPlace(repository));
  const { fontScale } = useWindowDimensions();
  const params = useLink(), navigation = useLinkNavigation();
  // A link wins over memory. It is laid over the remembered place while drawing, so the remembered view never
  // shows first, and a remembered Recovery section never reads Apple Health on the way to a weight tile.
  const shown = withLink(place, linkedPlace(params));
  if (shown !== place) setPlace(shown);
  const keep = (next: ProgressPlace) => { savePlace(repository, next); setPlace(next); };
  const linked = params.view !== undefined || params.section !== undefined;
  useEffect(() => {
    if (!linked) return;
    // A link is used once: remember where it led, then take it off the route so a later choice by hand is not
    // overwritten. A link with nothing usable in it is cleared too.
    savePlace(repository, withLink(readPlace(repository), linkedPlace({ view: params.view, section: params.section })));
    navigation?.setParams({ view: undefined, section: undefined });
  }, [linked, params.view, params.section, repository, navigation]);

  const view = shown.view, section = shown[view];
  const pickView = (next: ProgressView) => {
    if (next === view) return;
    keep({ ...shown, view: next });
    // VoiceOver stays on the switch, so say which section is now below it, for example "Insights, Trends".
    AccessibilityInfo.announceForAccessibility(`${t(next)}, ${t(shown[next])}`);
  };
  const pickSection = (next: typeof section) => keep(view === 'tracking'
    ? { ...shown, tracking: oneOf(PROGRESS_SECTIONS.tracking, next) ?? shown.tracking }
    : { ...shown, insights: oneOf(PROGRESS_SECTIONS.insights, next) ?? shown.insights });
  const sections: readonly (typeof section)[] = PROGRESS_SECTIONS[view];
  return <Screen title={t('progress')} tabHeader>
    {/* The two controls sit close together so they read as one unit: the view, then that view's sections. */}
    <View style={{ gap: tokens.spacing[1] }}>
      <SegmentedControl label={t('progressViews')} stack={fontScale >= 2} value={view} onChange={pickView}
        options={PROGRESS_VIEWS.map(value => ({ value, label: t(value) }))} />
      <SectionTabs key={view} label={t('segments')} value={section} onChange={pickSection}
        options={sections.map(value => ({ value, label: t(value) }))} />
    </View>
    {view === 'tracking' && <>
      {section === 'body' && repository && <Body key={repository.owner} repository={repository} />}
      {section === 'goals' && repository && <Records key={repository.owner} repository={repository} />}
      {section === 'photos' && <Card testID="photos-later">
        <ThemedText variant="headline" accessibilityRole="header">{t('photosLaterTitle')}</ThemedText>
        <ThemedText muted>{t('photosLaterBody')}</ThemedText>
      </Card>}
    </>}
    {view === 'insights' && <Insights section={shown.insights} />}
  </Screen>;
}
