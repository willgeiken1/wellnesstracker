import { useRef, useState, type ReactNode } from 'react';
import { Modal, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { stepValue } from '@/components/stepper';
import { useSelectionHaptic } from '@/components/selection-haptic';
import { t } from '@/i18n/en';
import { Icon, KitText, ListRow, NavBar, StackGapContext, SurfaceContext, Tappable, alpha, mix, useKit, type IconName } from '@/components/kit';

/* The pieces every Settings screen shares (the mockup's .st-* classes in pages/settings.js). */

/** A pushed Settings screen: the bar with its back button and title, then the page scroll (16 pt sides). */
export function SetPage({ back, title, onBack, children, testID, right, large }: {
  back: string; title: string; onBack?: () => void; children: ReactNode; testID?: string; right?: ReactNode; large?: boolean;
}) {
  const k = useKit(), insets = useSafeAreaInsets();
  const [scrolled, setScrolled] = useState(false);
  return <View testID={testID} style={{ flex: 1, backgroundColor: k.c.bg }}>
    <View style={{ paddingHorizontal: 16, zIndex: 5 }}><NavBar back={back} onBack={onBack} title={title} right={right} large={false} scrolled={!large || scrolled} /></View>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" scrollEventThrottle={16}
      onScroll={large ? e => setScrolled(e.nativeEvent.contentOffset.y > 46) : undefined}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 + insets.bottom, paddingTop: 0 }}>
      <StackGapContext.Provider value={0}><SurfaceContext.Provider value="page">{children}</SurfaceContext.Provider></StackGapContext.Provider>
    </ScrollView>
  </View>;
}

/** `.st-h`: a 13.5 pt muted group header, 26 pt above (8 for the first), 8 below, 16 in. */
export function H({ children, first }: { children: string; first?: boolean }) {
  return <KitText weight={600} size={13.5} lineHeight={1.2} tracking={0.01} color="text-muted" accessibilityRole="header"
    style={{ marginTop: first ? 8 : 26, marginBottom: 8, marginHorizontal: 16 }}>{children}</KitText>;
}
/** `.st-gap`: 20 pt between lists. */
export const Gap = () => <View style={{ height: 20 }} />;

/** A list surface for custom content (`.list` with no rows): 20 pt corners, the light-mode hairline edge. */
export function Panel({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const k = useKit();
  return <View testID={testID} style={[{ backgroundColor: k.cardBg, borderRadius: 20, overflow: 'hidden', boxShadow: k.cardEdge }, style]}>
    <SurfaceContext.Provider value="sheet-inset">{children}</SurfaceContext.Provider>
  </View>;
}
/** `.st-cl`: a hairline above the rows that follow custom content in a panel. */
export function Cl({ children }: { children: ReactNode }) {
  const k = useKit();
  return <View style={{ borderTopWidth: 1, borderTopColor: k.c.hair }}>{children}</View>;
}

/** `.st-hero`: an intro card with a tinted icon square, a title and a line. */
export function Hero({ icon, color, title, body, tint }: { icon: IconName; color: string; title: string; body: string; tint?: boolean }) {
  const k = useKit(), c = k.tok(color);
  return <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start', padding: 16, borderRadius: 20, marginTop: 8,
    backgroundColor: tint ? k.c['accent-tint'] : k.c.surface, boxShadow: tint ? undefined : k.cardEdge }}>
    <View style={{ width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(c, 0.16) }}>
      <Icon name={icon} size={24} color={c} />
    </View>
    <View style={{ flex: 1 }}>
      <KitText weight={700} size={17} lineHeight={1.25} tracking={-0.02}>{title}</KitText>
      <KitText weight={500} size={13.5} lineHeight={1.45} color="text-muted" style={{ marginTop: 4 }}>{body}</KitText>
    </View>
  </View>;
}

export type MenuOption<T> = { v: T; l: string };
/** A value row with ⌃⌄ that opens a menu of choices with a check on the current one (`pick` + `openMenu`, UIMenu). */
export function PickRow<T extends string | number>({ title, sub, value, options, onPick, short, testID, chevron }: {
  title: string; sub?: string; value: T; options: readonly MenuOption<T>[]; onPick: (v: T) => void; short?: (v: T) => string; testID?: string;
  /** Show a chevron instead of ⌃⌄ (the From and To rows of Delete a date range). */ chevron?: boolean;
}) {
  const k = useKit();
  const anchor = useRef<{ measureInWindow(cb: (x: number, y: number, w: number, h: number) => void): void } | null>(null);
  const [at, setAt] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const label = short ? short(value) : options.find(o => String(o.v) === String(value))?.l ?? String(value);
  const open = () => anchor.current?.measureInWindow((x, y, w, h) => setAt({ x, y, w, h }));
  return <View ref={anchor as never} collapsable={false}>
    <ListRow testID={testID} title={title} sub={sub} onPress={open} accessibilityHint={label}
      value={<KitText weight={700} size={15} tracking={-0.01} numeric color="text-muted" numberOfLines={1} style={{ maxWidth: 170 }}>{label}</KitText>}
      right={chevron ? undefined : <View style={{ marginLeft: -6 }}><Icon name="updown" size={14} color={k.c.ghost} /></View>} chevron={!!chevron} />
    <Menu at={at} title={title} options={options} value={value} onClose={() => setAt(null)} onPick={v => { setAt(null); onPick(v); }} />
  </View>;
}

/** `.st-menu`: 236 pt wide, under the row's right edge (above it when it would not fit), a check on the current choice. */
export function Menu<T extends string | number>({ at, title, options, value, onPick, onClose }: {
  at: { x: number; y: number; w: number; h: number } | null; title: string; options: readonly MenuOption<T>[]; value: T; onPick: (v: T) => void; onClose: () => void;
}) {
  const k = useKit();
  const [height, setHeight] = useState(0);
  if (!at) return null;
  const rowH = 44, h = Math.min(396, options.length * rowH + options.length - 1);
  const below = at.y + at.h - 6;
  const screenH = height || 852;
  const top = below + h > screenH - 40 ? Math.max(60, at.y - h + 6) : Math.max(60, below);
  const right = 12;
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
    <Tappable dim="none" accessibilityRole="button" accessibilityLabel={title} style={{ flex: 1 }} onPress={onClose} onLayout={e => setHeight(e.nativeEvent.layout.height)}>
      <View accessibilityRole="menu" accessibilityLabel={title} style={{ position: 'absolute', top, right: right + Math.max(0, 0), width: 236, maxHeight: 396,
        borderRadius: 14, overflow: 'hidden', backgroundColor: mix(k.dark ? k.c['surface-2'] : k.c.surface, 'transparent', 0.94),
        boxShadow: k.dark ? k.lift : `${k.lift}, 0px 0px 0px 1px ${k.c.hair}` }}>
        <ScrollView bounces={false}>
          {options.map((o, i) => {
            const on = String(o.v) === String(value);
            return <Tappable key={String(o.v)} dim="none" accessibilityRole="menuitem" accessibilityState={{ checked: on }} accessibilityLabel={o.l}
              onPress={() => onPick(o.v)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: rowH, paddingLeft: 10, paddingRight: 16,
                borderTopWidth: i ? 1 : 0, borderTopColor: k.c['hair-2'], backgroundColor: pressed ? alpha(k.c.text, 0.08) : 'transparent' })}>
              <View style={{ width: 20, alignItems: 'center' }}>{on ? <Icon name="check" size={16} color={k.c.text} /> : null}</View>
              <KitText weight={500} size={16}>{o.l}</KitText>
            </Tappable>;
          })}
        </ScrollView>
      </View>
    </Tappable>
  </Modal>;
}

/** `.st-ud` and friends need these icons; the kit's set has them under these names. */
export const settingsIcons = { updown: 'updown', ext: 'ext' } as const;

/** The kit stepper with the value shown as a clock ("2:00"), as the mockup's Default rest shows it. The kit's Stepper has no format option yet. */
export function TimeStepper({ value, onChange, label, step = 15, min = 30, max = 300 }: { value: number; onChange: (v: number) => void; label: string; step?: number; min?: number; max?: number }) {
  const k = useKit();
  const haptic = useSelectionHaptic();
  const text = `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  const go = (d: -1 | 1) => { const v = stepValue(value, d, { step, min, max }); if (v !== value) haptic(); onChange(v); };
  const button = (d: -1 | 1) => <Tappable dim="none" accessibilityRole="button" accessibilityLabel={d < 0 ? t('kitLess') : t('kitMore')} onPress={() => go(d)}
    hitSlop={{ top: 4, bottom: 4, left: 3, right: 3 }}
    style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? k.c['hair-2'] : 'transparent' })}>
    <Icon name={d < 0 ? 'minus' : 'plus'} size={18} color={k.c.text} />
  </Tappable>;
  return <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, padding: 3, borderRadius: 999, backgroundColor: k.c['surface-2'] }}>
    {button(-1)}
    <View accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={e => go(e.nativeEvent.actionName === 'increment' ? 1 : -1)} style={{ minWidth: 64 }}>
      <KitText weight={700} size={17} tracking={-0.015} numeric style={{ textAlign: 'center' }}>{text}</KitText>
    </View>
    {button(1)}
  </View>;
}
