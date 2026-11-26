import { Children } from 'react';
import { View, type ViewProps } from 'react-native';
import { KIT, SurfaceContext, useKit } from './kit-style';

/**
 * The kit's `.card` (`ui.card`): a surface with 20 pt corners and 16 pt padding. `tint` fills it with the accent tint,
 * `flat` drops the padding and clips (for a chart or a list edge to edge). On a dark sheet it sits one step up
 * (surface 2); in light mode it carries the kit's hairline edge.
 */
export function Card({ style, variant = 'default', children, ...props }: ViewProps & { variant?: 'default' | 'tint' | 'flat' }) {
  const k = useKit();
  return <View {...props} style={[{ backgroundColor: variant === 'tint' ? k.c['accent-tint'] : k.cardBg, borderRadius: KIT.radius.card,
    padding: variant === 'flat' ? 0 : 16, overflow: variant === 'flat' ? 'hidden' : undefined, boxShadow: k.cardEdge }, style]}>
    <SurfaceContext.Provider value={k.surface === 'page' ? 'page' : 'sheet-inset'}>{children}</SurfaceContext.Provider>
  </View>;
}
/** Another name for Card, for a plain raised surface. */
export const Surface = Card;

/** The kit's `.grid2` and `.grid3`: equal columns with a 12 pt (two) or 10 pt (three) gap, filled row by row. */
export function Grid({ columns = 2, style, children, ...props }: ViewProps & { columns?: 2 | 3 }) {
  const gap = columns === 2 ? KIT.gap : KIT.gap3;
  const items = Children.toArray(children);
  const rows = Array.from({ length: Math.ceil(items.length / columns) }, (_, r) => items.slice(r * columns, r * columns + columns));
  return <View {...props} style={[{ gap }, style]}>
    {rows.map((row, r) => <View key={r} style={{ flexDirection: 'row', gap }}>
      {Array.from({ length: columns }, (_, i) => <View key={i} style={{ flex: 1, minWidth: 0 }}>{row[i] ?? null}</View>)}
    </View>)}
  </View>;
}
