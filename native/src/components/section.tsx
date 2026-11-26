import { useContext, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { capitals, StackGapContext } from './kit-style';
import { KitText } from './themed-text';
import { Tappable } from './tappable';
import { ListFooter } from './list-row';

/**
 * The kit's `.sec` (`ui.sec`): a 20 pt bold section title with an optional aside on the right, muted text or an accent
 * button (grown to 50 pt to touch). 28 pt above it (4 pt when `first`) and 12 pt below, whatever gap its parent adds.
 */
export function SectionHeader({ title, aside, onAside, asideLabel, first = false, testID }: {
  title: string; aside?: string; onAside?: () => void; asideLabel?: string; first?: boolean; testID?: string;
}) {
  const gap = useContext(StackGapContext);
  return <View testID={testID} style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
    marginTop: Math.max(0, (first ? 4 : 28) - gap), marginBottom: Math.max(0, 12 - gap) }}>
    <KitText weight={700} size={20} lineHeight={1.15} tracking={-0.025} accessibilityRole="header" style={{ flexShrink: 1 }}>{title}</KitText>
    {aside ? onAside
      ? <Tappable dim="text" accessibilityRole="button" accessibilityLabel={asideLabel ?? aside} onPress={onAside} hitSlop={{ top: 9, bottom: 9, left: 8, right: 8 }}
          style={{ minHeight: 32, justifyContent: 'center' }}>
          <KitText weight={600} size={13.5} color="accent">{aside}</KitText>
        </Tappable>
      : <KitText weight={600} size={13.5} color="text-muted">{aside}</KitText> : null}
  </View>;
}

/** A section: its header, its content (a List, cards, anything) and an optional footnote. */
export function Section({ title, aside, onAside, asideLabel, first, footer, children, style }: {
  title?: string; aside?: string; onAside?: () => void; asideLabel?: string; first?: boolean; footer?: string; children: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  return <View style={style}>
    <StackGapContext.Provider value={0}>
      {title ? <SectionHeader title={title} aside={aside} onAside={onAside} asideLabel={asideLabel} first={first} /> : null}
      {children}
      {footer ? <ListFooter>{footer}</ListFooter> : null}
    </StackGapContext.Provider>
  </View>;
}

/** The kit's `.eyebrow`: small bold capitals, widely spaced and muted (10.5 pt in the mockup, 11 pt here: the floor). */
export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={style}><KitText weight={700} size={10.5} lineHeight={1} tracking={0.14} color="text-muted" style={capitals}>{children}</KitText></View>;
}

/** The kit's `.bigt`: a 30 pt title at the top of a pushed screen's content, under its nav bar. `display` gives 34 pt. */
export function LargeTitle({ children, display = false, style }: { children: ReactNode; display?: boolean; style?: StyleProp<ViewStyle> }) {
  const gap = useContext(StackGapContext);
  return <View style={[{ marginTop: display ? 2 : 4, marginBottom: Math.max(0, (display ? 12 : 16) - gap) }, style]}>
    <KitText weight={700} size={display ? 34 : 30} lineHeight={display ? 1.08 : 1.1} tracking={display ? -0.035 : -0.03} accessibilityRole="header">{children}</KitText>
  </View>;
}
