import { useCallback, useEffect, useRef, type ComponentRef } from 'react';
import { ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { tokens } from '@/design/tokens';
import { useTheme } from '@/design/theme-provider';
import { ThemedText } from './themed-text';
import { Tappable } from './tappable';
import { touchTarget } from './button';
import { useSelectionHaptic } from './selection-haptic';

/** The page padding the row bleeds through, so it runs to both edges of the screen. */
const EDGE = tokens.spacing[3];
/** How thick the line under the chosen tab is. */
const UNDERLINE = 2;

/** One row of text tabs with a line under the chosen one: the sections inside a page, a level below a
 * SegmentedControl. The row scrolls sideways when the labels or a large text size need more room than the
 * screen has, so a label is never cut short or shrunk. Content below swaps at once; nothing slides. */
export function SectionTabs<T extends string>({ label, options, value, onChange, testID = 'section-tabs' }: {
  label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; testID?: string;
}) {
  const { colors, reduceMotion } = useTheme();
  const haptic = useSelectionHaptic();
  // A tick only when the choice really changes, so tapping the chosen one again stays quiet.
  const choose = (next: T) => { if (next !== value) haptic(); onChange(next); };
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // Where each tab sits in the row, how wide the row and the screen's view of it are, and how far it is scrolled.
  const spots = useRef(new Map<string, { x: number; width: number }>());
  const row = useRef({ view: 0, content: 0, offset: 0 });
  // Bring the chosen tab fully into view, with the page padding beside it. A tab already in view stays put.
  const reveal = useCallback((key: string, animated: boolean) => {
    const spot = spots.current.get(key), { view, content, offset } = row.current;
    if (!spot || !view || content <= view) return;
    const from = spot.x - EDGE, to = spot.x + spot.width + EDGE;
    if (from >= offset && to <= offset + view) return;
    const x = Math.max(0, Math.min(from < offset ? from : to - view, content - view));
    row.current.offset = x;
    scroll.current?.scrollTo({ x, animated });
  }, []);
  useEffect(() => { reveal(value, !reduceMotion); }, [value, reduceMotion, reveal]);
  const placed = (key: string) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    spots.current.set(key, { x, width });
    // The first layout, a new text size or a rotation: put the chosen tab in view without a glide.
    if (key === value) reveal(key, false);
  };
  return <View style={{ marginHorizontal: -EDGE }}>
    {/* The hairline runs under the whole row. The chosen tab's line sits on top of it, flush to the bottom. */}
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: colors.hair }} />
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} testID={testID} accessibilityRole="tablist" accessibilityLabel={label}
      style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: EDGE, gap: tokens.spacing[3] }} scrollEventThrottle={16}
      onScroll={event => { row.current.offset = event.nativeEvent.contentOffset.x; }}
      onLayout={event => { row.current.view = event.nativeEvent.layout.width; reveal(value, false); }}
      onContentSizeChange={width => { row.current.content = width; reveal(value, false); }}>
      {options.map(option => {
        const on = option.value === value;
        return <Tappable key={option.value} testID={`${testID}-${option.value}`} accessibilityRole="tab" accessibilityLabel={option.label}
          accessibilityState={{ selected: on }} onPress={() => choose(option.value)} onLayout={placed(option.value)}
          style={{ minHeight: touchTarget, minWidth: touchTarget, alignItems: 'center', justifyContent: 'center', paddingVertical: tokens.spacing[1] }}>
          <ThemedText muted={!on} style={{ fontWeight: '600', textAlign: 'center' }}>{option.label}</ThemedText>
          {on && <View testID={`${testID}-underline`} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: UNDERLINE, borderRadius: UNDERLINE / 2, backgroundColor: colors.text }} />}
        </Tappable>;
      })}
    </ScrollView>
  </View>;
}
