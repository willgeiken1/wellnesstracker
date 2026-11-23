import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { formatHistoryDay } from '@/features/routines/model/edit-log';
import { ROUTINE_SITES, type RoutineView } from '@/features/routines/model/shape';
import { routinesText } from '@/i18n/en';
import { Note, Panel, PrimaryButton, SheetHeader, semibold } from './parts';
import { useRoutines } from './use-routines';

/** The day each site was last logged on a taken dose. A skip and an undone log do not count. */
export function siteDays(view: RoutineView): Map<string, string> {
  const days = new Map<string, string>();
  for (const log of view.logs) {
    if (!log.site || log.rest === true || (log.status !== 'done' && log.status !== 'partial')) continue;
    if (log.day > (days.get(log.site) ?? '')) days.set(log.site, log.day);
  }
  return days;
}

/** Injection sites: the eight sites, each with the day it was last logged. Nothing here suggests a site. */
export function SitesSheet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const days = siteDays(useRoutines().view);
  return <ScrollView testID="routine-sites" style={{ flex: 1, backgroundColor: colors.bg }}
    contentContainerStyle={{ padding: tokens.spacing[3], paddingBottom: tokens.spacing[3] + insets.bottom, gap: tokens.spacing[2] }}>
    <SheetHeader title={routinesText('sites')} close={routinesText('close')} onClose={() => router.back()} />
    <ThemedText muted>{routinesText('sitesIntro')}</ThemedText>
    {!days.size && <Note testID="routine-sites-none">{routinesText('noSiteYet')}</Note>}
    <Panel style={{ gap: 0 }}>
      {ROUTINE_SITES.map((site, index) => <View key={site.id} testID={`routine-site-${site.id}`} accessible
        style={{ minHeight: 48, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacing[1], borderTopWidth: index ? 1 : 0, borderTopColor: colors.hair }}>
        <ThemedText style={[semibold, { flex: 1 }]}>{site.label}</ThemedText>
        <ThemedText variant="caption" muted numeric>{days.has(site.id) ? formatHistoryDay(days.get(site.id)) : routinesText('siteUnused')}</ThemedText>
      </View>)}
    </Panel>
    <PrimaryButton testID="routine-sites-done" label={routinesText('done')} onPress={() => router.back()} />
  </ScrollView>;
}
