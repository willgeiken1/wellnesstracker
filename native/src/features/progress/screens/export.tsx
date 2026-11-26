import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Icon, List, ListRow, SectionHeader, SegmentedControl, Sheet, SheetHeader, PRETTY, prettyWeb, font, mix, useKit, Tappable, type IconName } from '@/components/kit';
import { useAuth } from '@/auth/provider';
import { t } from '@/i18n/en';
import { showToast } from '@/features/shell/toast';
import { EXPORT_KINDS, buildCsvs, shareExport, zip, type ExportKind, type ExportRange } from '../export';
import { fill } from '../format';
import { useProgress } from '../use-progress';

const KINDS: Record<ExportKind, [label: Parameters<typeof t>[0], icon: string, color: string]> = {
  weight: ['progressExWeight', 'weight', 'recovery'], sleep: ['progressExSleep', 'sleep', 'sleep'], heart: ['progressExHeart', 'heart', 'recovery'],
  steps: ['progressExSteps', 'steps', 'training'], food: ['progressExFood', 'food', 'food'], work: ['progressExWork', 'workouts', 'training'], rout: ['progressExRout', 'routines', 'sleep'],
};
/** The share row: each opens the system share sheet, where the person picks the app. */
const APPS: [Parameters<typeof t>[0], string, string][] = [['progressAirDrop', 'airdrop', 'recovery'], ['progressMessages', 'bubble', 'success'], ['progressMail', 'mail', 'accent'], ['progressSaveFiles', 'folder', 'water'], ['progressMore', 'more', 'text-muted']];

/** A round tick for a chosen row (.pg-chk). */
function Check({ on }: { on: boolean }) {
  const k = useKit();
  return <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? k.c.accent : 'transparent', borderWidth: on ? 0 : 1.75, borderColor: k.c['hair-2'] }}>
    {on ? <Icon name="check" size={15} color={k.tok('on-accent')} /> : null}</View>;
}

/** Export data: pick the logs and the range, then share one zip of CSV files through the share sheet. */
export function ExportSheet() {
  const d = useProgress(), k = useKit(), auth = useAuth(), repo = auth.repository;
  const [on, setOn] = useState<Record<ExportKind, boolean>>({ weight: true, sleep: true, heart: true, steps: true, food: true, work: true, rout: false });
  const [range, setRange] = useState<ExportRange>('90'), [busy, setBusy] = useState(false);
  const kinds = EXPORT_KINDS.filter(x => on[x]);
  const files = useMemo(() => repo && kinds.length ? buildCsvs(repo, d, kinds, range) : [], [repo, d, kinds.join(), range]); // eslint-disable-line react-hooks/exhaustive-deps
  const bytes = useMemo(() => files.length ? zip(files).length : 0, [files]);
  const name = `insight-export-${d.today}.zip`;
  const go = async () => {
    if (!files.length || busy) return;
    setBusy(true);
    try { await shareExport(files, name); router.back(); }
    catch { showToast(t('progressExportFailed'), { color: 'warning' }); }
    finally { setBusy(false); }
  };
  const summary = files.length ? fill(t(files.length === 1 ? 'progressOneCsv' : 'progressNCsv'), { n: files.length, kb: Math.max(1, Math.round(bytes / 1024)) }) : t('progressChooseOne');
  return <Sheet header={<SheetHeader title={t('progressExportData')} left={t('kitCancel')} testID="export" />}>
    <Text {...PRETTY} style={[font(500, 14, 1.45), prettyWeb, { color: k.c['text-muted'] }]}>{t('progressExportLead')}</Text>
    <SectionHeader title={t('progressExData')} />
    <List footer={t('progressExFoot')}>
      {EXPORT_KINDS.map(x => { const [l, icon, color] = KINDS[x];
        return <ListRow key={x} title={t(l)} icon={icon as IconName} color={color} right={<Check on={on[x]} />} chevron={false}
          accessibilityLabel={t(l)} onPress={() => setOn(prev => ({ ...prev, [x]: !prev[x] }))} testID={`export-${x}`} />; })}
    </List>
    <SectionHeader title={t('progressExRange')} />
    <SegmentedControl label={t('progressExRange')} value={range} onChange={setRange}
      options={[{ value: '30', label: t('progress30DaysCap') }, { value: '90', label: t('progress90Days') }, { value: 'all', label: t('progressAllTime') }]} />
    <View style={{ marginTop: 8, backgroundColor: k.dark ? k.c['surface-2'] : k.c.surface, borderRadius: 20, paddingTop: 14, paddingBottom: 6, boxShadow: k.cardEdge }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: k.c.hair }}>
        <View style={{ width: 44, height: 52, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: mix(k.c.success, k.dark ? k.c.bg : k.c['surface-2'], 0.18) }}>
          <Text style={[font(700, 10, undefined, 0.04), { color: k.c.success }]}>CSV</Text></View>
        <View style={{ flex: 1 }} accessible accessibilityLabel={`${name}, ${summary}`}>
          <Text numberOfLines={1} style={[font(600, 15), { color: k.c.text }]}>{name}</Text>
          <Text style={[font(600, 12.5), { color: k.c['text-muted'] }]}>{summary}</Text></View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 14, paddingHorizontal: 12, paddingBottom: 6 }} accessibilityLabel={t('progressShareTo')}>
        {APPS.map(([l, icon, color]) => { const c = k.tok(color);
          return <Tappable dim="row" key={l} onPress={() => { void go(); }} disabled={!files.length || busy} accessibilityRole="button" accessibilityLabel={t(l)} accessibilityHint={t('progressOpensShare')}
            style={{ width: 70, minHeight: 44, alignItems: 'center', gap: 6, opacity: files.length ? 1 : 0.4 }}>
            <View style={{ width: 56, height: 56, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: mix(c, k.c['surface-2'], 0.18) }}><Icon name={icon as IconName} size={26} color={c} /></View>
            <Text numberOfLines={1} style={[font(600, 11.5), { color: k.c.text }]}>{t(l)}</Text>
          </Tappable>; })}
      </ScrollView>
    </View>
    <View style={{ marginTop: 4 }}><Button label={t('progressExport')} icon="export" full onPress={() => { void go(); }} disabled={!files.length || busy} /></View>
    <SectionHeader title={t('progressYourAccount')} />
    <List>
      <ListRow icon="cloud" color="accent" title={t('progressBackup')} sub={t('progressBackupSub')} accessibilityHint={t('progressBackupHint')}
        onPress={() => { router.back(); setTimeout(() => router.push('/settings/data' as never), 200); }} />
    </List>
  </Sheet>;
}
