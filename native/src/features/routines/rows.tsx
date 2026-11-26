import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { KitText, Tappable, useKit } from '@/components/kit';
import { t } from '@/i18n/en';
import { fill } from '../tiles/ui';
import { toggleDone, toggleSkip } from './actions';
import { daysWord, h12, markOf, type Item, type Now, type RoutinesState } from './model';
import type { RoutinesStore } from './store';

/** The tick inside a check circle (`.rt-mk i::after`). */
export function Tick({ color, size = 9 }: { color: string; size?: number }) {
  return <Svg width={size + 3} height={size} viewBox="0 0 12 9"><Path d="M1.5 4.6 4.6 7.5 10.5 1.5" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

/** A round check-off: an outline, filled in the routine colour once done. 44 pt to touch. */
export function CheckMark({ done, next, color, label, onPress, ring = 22, box = 44, off, disabled }: {
  done: boolean; next?: boolean; color: string; label: string; onPress: () => void; ring?: number; box?: number; off?: number; disabled?: boolean;
}) {
  const k = useKit();
  return <Tappable dim="none" disabled={disabled} accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: done }} onPress={onPress}
    hitSlop={box < 44 ? (44 - box) / 2 : undefined}
    style={{ width: box, height: box, marginRight: off ?? -8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <View style={{ width: ring, height: ring, borderRadius: ring / 2, alignItems: 'center', justifyContent: 'center',
      backgroundColor: done ? color : 'transparent', borderWidth: done ? 0 : next ? 1.8 : 1.6, borderColor: next ? color : k.tint(k.c['text-muted'], 0.8) }}>
      {done ? <Tick color={k.c['on-accent']} /> : null}
    </View>
  </Tappable>;
}

/** The small Skip pill, or Skipped to take it back. */
export function SkipPill({ skipped, name, onPress, size = 12.5 }: { skipped: boolean; name: string; onPress: () => void; size?: number }) {
  const k = useKit();
  return <Tappable dim="row" accessibilityRole="button" accessibilityLabel={fill(t(skipped ? 'routinesUndoSkipFor' : 'routinesSkipToday'), { name })} onPress={onPress}
    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
    style={{ flexShrink: 0, borderRadius: 999, borderWidth: 1, borderColor: k.c['hair-2'], paddingVertical: size > 12 ? 5 : 4, paddingHorizontal: size > 12 ? 11 : 10 }}>
    <KitText weight={600} size={size} color="text-muted">{t(skipped ? 'routinesSkipped' : 'routinesSkip')}</KitText>
  </Tappable>;
}

export const checkLabel = (i: Item) => fill(t('routinesCheckLabel'), { name: i.name, dose: i.dose, time: h12(i.h) });

/** A routine's row of one item (`.rt-row`): time, name and dose, Skip, and the check-off. */
export function ItemRow({ i, s, n, store, next, color, first }: { i: Item; s: RoutinesState; n: Now; store: RoutinesStore; next: boolean; color: string; first?: boolean }) {
  const m = markOf(s, n.day, i.id), done = m === 'd', skip = m === 's';
  return <RowShell first={first}>
    <KitText weight={600} size={12} numeric color={next ? color : 'text-muted'} numberOfLines={1} style={{ width: 72, marginRight: -19, flexShrink: 0, opacity: skip ? 0.5 : 1 }}>{h12(i.h)}</KitText>
    <View style={{ flex: 1, minWidth: 0, gap: 1, opacity: skip ? 0.5 : 1 }}>
      <KitText weight={600} size={15.5} lineHeight={1.25} style={done ? { textDecorationLine: 'line-through', opacity: 0.55 } : undefined}>{i.name}</KitText>
      <KitText weight={500} size={13} color="text-muted">{i.dose}</KitText>
    </View>
    {done ? null : <SkipPill skipped={skip} name={i.name} onPress={() => toggleSkip(store, i.id)} />}
    <CheckMark done={done} next={next} color={color} label={checkLabel(i)} onPress={() => toggleDone(store, i.id)} />
  </RowShell>;
}
/** An item not due today: its days instead of a check-off. */
export function OffRow({ i, first }: { i: Item; first?: boolean }) {
  return <RowShell first={first}>
    <KitText weight={600} size={12} numeric color="text-muted" numberOfLines={1} style={{ width: 72, marginRight: -19, flexShrink: 0 }}>{h12(i.h)}</KitText>
    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
      <KitText weight={600} size={15.5} lineHeight={1.25}>{i.name}</KitText>
      <KitText weight={500} size={13} color="text-muted">{i.dose}</KitText>
    </View>
    <KitText weight={600} size={12} color="text-muted">{fill(t('routinesNotToday'), { days: daysWord(i.days) })}</KitText>
  </RowShell>;
}
function RowShell({ children, first }: { children: ReactNode; first?: boolean }) {
  const k = useKit();
  // The design rules each row along its bottom edge, inside the row's 58 pt, so the text sits in the 57 pt above the line.
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 58, paddingBottom: 1 }}>
    {first ? null : <View style={{ position: 'absolute', top: -1, left: 0, right: 0, height: 1, backgroundColor: k.c.hair }} />}
    {children}
  </View>;
}
/** The routine's list card (`.rt-ilist`): a coloured edge on the left. */
export function ItemList({ color, children }: { color: string; children: ReactNode }) {
  const k = useKit();
  return <View style={{ backgroundColor: k.c.surface, borderRadius: 22, paddingVertical: 2, paddingHorizontal: 14, borderLeftWidth: 4, borderLeftColor: color, boxShadow: k.cardEdge }}>{children}</View>;
}
