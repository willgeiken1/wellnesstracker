import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '@/components/card';
import { Eyebrow } from '@/components/section';
import { SegmentedControl } from '@/components/segmented-control';
import { Stepper } from '@/components/stepper';
import { Tappable } from '@/components/tappable';
import { KitText } from '@/components/themed-text';
import { alpha, mix, useKit } from '@/components/kit-style';
import { tr } from '../workout/tr';
import { timesLabel, type Coverage, type SplitMode } from './model';

/* Pieces the Split screen and the split sheets share (Insight Mockup v21, splits.js `.sp-*`). */

/** A section's small capitals heading inside a sheet (`.eyebrow` with 22 pt above, 10 below). */
export function SheetEyebrow({ children, first }: { children: string; first?: boolean }) {
  return <Eyebrow style={{ marginTop: first ? 6 : 10, marginHorizontal: 4 }}>{children}</Eyebrow>;
}

/** A list row with a title and a muted line on the left and a control on the right (`.tr-cf`). */
export function ControlRow({ title, sub, children, first = true }: { title: string; sub?: string; children: ReactNode; first?: boolean }) {
  const k = useKit();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 64, paddingVertical: 8, paddingLeft: 16, paddingRight: 8,
    borderTopWidth: first ? 0 : 1, borderTopColor: k.c.hair }}>
    <View style={{ flexShrink: 1 }}>
      <KitText weight={600} size={15.5}>{title}</KitText>
      {sub ? <KitText weight={500} size={12.5} color="text-muted">{sub}</KitText> : null}
    </View>
    {children}
  </View>;
}
export function ModeControl({ value, onChange, width }: { value: SplitMode; onChange: (m: SplitMode) => void; width?: number }) {
  const seg = <SegmentedControl label={tr('splitHowItRuns')} value={value} onChange={onChange} testID="split-mode"
    options={[{ value: 'rotate', label: tr('splitRotate') }, { value: 'weekdays', label: tr('splitWeekdays') }]} />;
  return width ? <View style={{ width }}>{seg}</View> : seg;
}
export function PerWeekStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return <Stepper value={value} min={1} max={7} label={tr('splitDaysPerWeek')} onChange={onChange} testID="split-per-week" />;
}

/** Seven weekday buttons (`.sp-wkc`): on means a training weekday. At least one stays on. */
export function WeekdayChips({ on, onToggle }: { on: readonly boolean[]; onToggle: (i: number) => void }) {
  const k = useKit(), short = tr('splitWeekdayShort').split(','), long = tr('splitWeekdayLong').split(',');
  return <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="none" testID="split-weekdays">
    {short.map((w, i) => <Tappable key={w} dim="fill" accessibilityRole="button" accessibilityLabel={long[i]} accessibilityState={{ selected: !!on[i] }}
      onPress={() => { if (on[i] && on.filter(Boolean).length <= 1) return; onToggle(i); }} testID={`split-weekday-${i}`}
      style={{ flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
        backgroundColor: on[i] ? k.c.training : k.controlBg, boxShadow: on[i] ? undefined : k.cardEdge }}>
      <KitText weight={700} size={13} color={on[i] ? 'on-accent' : 'text-muted'}>{w}</KitText>
    </Tappable>)}
  </View>;
}

/** Weekly sets per muscle (`.sp-cov`): a bar against the 10 to 20 set band, the sets, and how often. */
export function CoverageCard({ coverage, testID }: { coverage: readonly Coverage[]; testID?: string }) {
  const k = useKit(), max = 24, some = tr('splitSomeWeeks');
  return <Card style={{ gap: 6, padding: 16 }} testID={testID}>
    {coverage.map(c => {
      const zero = c.sets === 0, lo = c.sets < 10, times = timesLabel(c.times, some);
      return <View key={c.m} accessible accessibilityLabel={tr('splitCoverageLabel', { m: c.m, sets: c.sets, times })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 30 }}>
        <KitText weight={600} size={13.5} color={zero ? 'text-muted' : 'text'} numberOfLines={1} style={{ width: 86 }}>{c.m}</KitText>
        <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: mix(k.c.training, k.c['surface-2'], 0.12) }}>
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: `${(10 / max) * 100}%`, width: `${(10 / max) * 100}%`, backgroundColor: alpha(k.c.training, 0.14),
            borderLeftWidth: 1.5, borderRightWidth: 1.5, borderColor: alpha(k.c.text, 0.3) }} />
          {c.sets > 0 ? <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, width: `${Math.min(100, (c.sets / max) * 100)}%`,
            backgroundColor: k.c.training, opacity: lo ? 0.55 : 1 }} /> : null}
        </View>
        <View style={{ width: 74, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'baseline' }}>
          <KitText weight={700} size={13.5} numeric color={zero ? 'text-muted' : 'text'}>{String(c.sets)}</KitText>
          <KitText weight={600} size={11} color="text-muted" numberOfLines={1} style={{ marginLeft: 3 }}>{times}</KitText>
        </View>
      </View>;
    })}
  </Card>;
}

/** A day's number in a soft square (`.sp-dl .no`). */
export function DayNumber({ n, size = 30 }: { n: number; size?: number }) {
  const k = useKit();
  return <View style={{ width: size, height: size, borderRadius: size / 3, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(k.c.training, 0.14) }}>
    <KitText weight={700} size={13} color="training" numeric>{String(n)}</KitText>
  </View>;
}
/** A day's muscles as small pills (`.spt-mus`). */
export function MusclePills({ muscles, wrap = true }: { muscles: readonly string[]; wrap?: boolean }) {
  const k = useKit();
  return <View style={{ flexDirection: 'row', flexWrap: wrap ? 'wrap' : 'nowrap', gap: 5, marginTop: 9 }}>
    {muscles.map(m => <View key={m} style={{ height: 23, paddingHorizontal: 9, borderRadius: 999, justifyContent: 'center', backgroundColor: alpha(k.c.training, 0.13) }}>
      <KitText weight={600} size={11.5} lineHeight={1} color={mix(k.c.training, k.c.text, 0.7)}>{m}</KitText>
    </View>)}
  </View>;
}
