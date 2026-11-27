import { Children, createContext, isValidElement, useContext, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Tappable as Pressable } from './tappable';
import { KitText } from './themed-text';
import { Icon, type IconName } from './icon';
import { KIT, StackGapContext, SurfaceContext, useKit } from './kit-style';
import { Switch } from './switch';
import { ROW_DENSITY, useRowDensity } from './row-density';

/** Where a row sits in its list: whether a hairline goes above it and how far in it starts. */
const RowPlace = createContext<{ index: number; inset: number }>({ index: 0, inset: 16 });

/**
 * The kit's `.list` (`ui.list`): rows on one surface with 20 pt corners, a hairline between rows (inset 16 pt, or 60 pt
 * beside an icon), and an optional footnote under it (`.foot`). On a dark sheet it sits one step up.
 */
export function List({ children, footer, style, testID }: { children: ReactNode; footer?: string; style?: StyleProp<ViewStyle>; testID?: string }) {
  const k = useKit();
  const rows = Children.toArray(children);
  const hasIcon = (i: number) => { const r = rows[i]; return isValidElement(r) && !!(r.props as { icon?: unknown }).icon; };
  return <View testID={testID}>
    <View style={[{ backgroundColor: k.cardBg, borderRadius: KIT.radius.list, overflow: 'hidden', boxShadow: k.cardEdge }, style]}>
      <SurfaceContext.Provider value={k.surface === 'page' ? 'page' : 'sheet-inset'}>
        {rows.map((row, i) => <RowPlace.Provider key={isValidElement(row) && row.key != null ? row.key : i}
          value={{ index: i, inset: hasIcon(i) || (i > 0 && hasIcon(i - 1)) ? 60 : 16 }}>{row}</RowPlace.Provider>)}
      </SurfaceContext.Provider>
    </View>
    {footer ? <StackGapContext.Provider value={0}><ListFooter>{footer}</ListFooter></StackGapContext.Provider> : null}
  </View>;
}

/** The kit's `.foot`: a 12.5 pt muted note under a list or section. */
export function ListFooter({ children }: { children: ReactNode }) {
  // The design puts the note 8 pt under its card; inside a stack that already spaces blocks, it pulls back by the gap.
  const gap = useContext(StackGapContext);
  return <KitText weight={500} size={12.5} lineHeight={1.45} color="text-muted" style={{ marginTop: 8 - gap, marginHorizontal: 16 }}>{children}</KitText>;
}

export type ListRowProps = {
  /** The row's title (`.tt`). */ title?: string;
  /** Older name for `title`. */ label?: string;
  /** A second line (`.ts`). */ sub?: string;
  /** An icon in a 32 pt rounded square tinted with `color` (a theme token, the accent unless given). */ icon?: IconName; color?: string;
  /** A value on the right in 700 15 pt tabular figures, muted unless `strong`. */ value?: ReactNode; strong?: boolean;
  /** A chevron at the end. Rows with `onPress` show one unless this is false. */ chevron?: boolean;
  /** A switch at the end, with its change handler. */ toggle?: boolean; onToggle?: (next: boolean) => void;
  /** Anything else for the right side, such as a stepper or a badge. */ right?: ReactNode;
  /** The title in the danger colour (`.row.danger`). */ danger?: boolean;
  onPress?: () => void; disabled?: boolean; testID?: string; accessibilityLabel?: string; accessibilityHint?: string;
};

/**
 * The kit's `.row` (`ui.row`): at least 56 pt tall (62 airy, 46 dense: the Density choice in Settings), 16 pt in from
 * each side, 12 pt between its parts. Tappable rows
 * highlight while held. Put rows in a List so the hairlines between them are drawn.
 */
export function ListRow({ title, label, sub, icon, color, value, strong, chevron, toggle, onToggle, right, danger, onPress, disabled,
  testID, accessibilityLabel, accessibilityHint }: ListRowProps) {
  const k = useKit();
  const place = useContext(RowPlace);
  const density = useRowDensity();
  const name = title ?? label ?? '';
  const c = k.tok(color);
  const showChevron = chevron ?? !!onPress;
  const body = <>
    {place.index > 0 && <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, left: place.inset, height: 1, backgroundColor: k.c.hair }} />}
    {icon && <View style={{ width: 32, height: 32, borderRadius: KIT.radius.ic, alignItems: 'center', justifyContent: 'center', backgroundColor: k.tint(c, 0.16) }}>
      <Icon name={icon} size={18} color={c} />
    </View>}
    <View style={{ flex: 1, minWidth: 0 }}>
      <KitText weight={600} size={15.5} lineHeight={1.25} tracking={-0.01} color={danger ? 'danger' : 'text'}>{name}</KitText>
      {sub ? <KitText weight={500} size={13} lineHeight={1.35} color="text-muted" style={{ marginTop: 2 }}>{sub}</KitText> : null}
    </View>
    {value != null && (typeof value === 'string' || typeof value === 'number'
      ? <KitText weight={700} size={15} tracking={-0.01} numeric color={strong ? 'text' : 'text-muted'} style={{ textAlign: 'right', flexShrink: 0 }}>{value}</KitText>
      : value)}
    {right}
    {toggle != null && <Switch value={toggle} onValueChange={next => onToggle?.(next)} label={name} disabled={disabled} />}
    {showChevron && <View style={{ marginHorizontal: -4 }}><Icon name="chevron-right" size={16} color={k.c.ghost} /></View>}
  </>;
  const rowStyle: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 12, ...ROW_DENSITY[density], paddingHorizontal: 16 };
  if (!onPress) return <View testID={testID} style={rowStyle}>{body}</View>;
  return <Pressable dim="none" testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? [name, sub, typeof value === 'string' ? value : undefined].filter(Boolean).join(', ')}
    accessibilityHint={accessibilityHint} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [rowStyle, pressed && { backgroundColor: k.tint(k.c.text, 0.07) }]}>
    {body}
  </Pressable>;
}
