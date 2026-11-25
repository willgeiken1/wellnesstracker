import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { IconButton, PageHeader, SegmentedControl, useKit } from '@/components/kit';
import { useFocused } from '@/features/home/use-focused';
import '@/features/progress/tiles';
import { dFull, type Range } from '@/features/progress/model';
import { setPageRange, usePageRange } from '@/features/progress/store';
import { useProgress } from '@/features/progress/use-progress';
import { pageEndSpace } from '@/features/shell/geometry';
import { useQuickActions, useShellEditMode } from '@/features/shell/registry';
import { showToast } from '@/features/shell/toast';
import { TileGrid, tileEdit, useTileEdit } from '@/features/tiles';
import { t } from '@/i18n/en';

const RANGE_NEXT: Record<Range, Range> = { week: 'month', month: 'year', year: 'week' };

/** The Progress tab: a page of Progress tiles. Week, Month and Year at the top set the range every tile follows unless it picks its own. */
export default function ProgressTab() {
  const k = useKit(), insets = useSafeAreaInsets(), scrollRef = useAnimatedRef<Animated.ScrollView>();
  const d = useProgress(), range = usePageRange(), focused = useFocused(), { editing } = useTileEdit('progress');
  useShellEditMode('progress', editing, () => tileEdit.end());
  useEffect(() => { if (!focused) tileEdit.set('progress', false); }, [focused]);
  useQuickActions('progress', {
    weigh: { run: () => router.push('/progress/log-weight'), label: t('progressQaWeigh'), hint: t('progressQaWeighHint') },
    photo: { run: () => router.push('/progress/photo-capture'), label: t('progressQaPhoto'), hint: t('progressQaPhotoHint') },
    range: {
      run: () => { const next = RANGE_NEXT[range]; setPageRange(next); showToast(t(next === 'week' ? 'progressRangeWeek' : next === 'month' ? 'progressRangeMonth' : 'progressRangeYear')); },
      label: t('progressQaRange'), hint: t('progressQaRangeHint'),
    },
    charts: { run: () => tileEdit.set('progress', true), label: t('progressQaCharts'), hint: t('progressQaChartsHint') },
    measure: { run: () => router.push('/progress/measurements'), label: t('progressQaMeasure'), hint: t('progressQaMeasureHint') },
    export: { run: () => router.push('/progress/export'), label: t('progressQaExport'), hint: t('progressQaExportHint') },
  });
  return <Animated.ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: k.c.bg }} contentInsetAdjustmentBehavior="never"
    contentContainerStyle={{ paddingTop: insets.top, paddingHorizontal: 16, paddingBottom: pageEndSpace(insets.bottom) }}>
    <PageHeader eyebrow={dFull(d.today)} title={t('progress')} right={<>
      <IconButton icon="sliders2" label={t('progressEditTiles')} onPress={() => tileEdit.set('progress', true)} />
      <IconButton icon="export" label={t('progressExportData')} onPress={() => router.push('/progress/export')} />
    </>} />
    <View style={{ marginBottom: 16 }}>
      <SegmentedControl label={t('progressTimeRange')} value={range} onChange={setPageRange}
        options={[{ value: 'week', label: t('progressWeek') }, { value: 'month', label: t('progressMonth') }, { value: 'year', label: t('progressYear') }]} />
    </View>
    <TileGrid page="progress" scrollRef={scrollRef} />
  </Animated.ScrollView>;
}
