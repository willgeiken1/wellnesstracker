import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens, type ThemeColors, type ThemeMode } from '@/design/tokens';
import { colorMix, rgba } from './depth';
import { TileIcon } from './tile-icon';

/** Fills {name} placeholders in a string from en.ts. */
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (v[k] != null ? String(v[k]) : m));

/** A sheet's background: the raised surface in dark themes, the page background in light ones. */
export const sheetBg = (c: ThemeColors, mode: ThemeMode) => (mode === 'dark' ? c.surface : c.bg);
/** A card inside a sheet: surface-2 on a dark sheet, surface with a hairline ring on a light one. */
export const sheetCard = (c: ThemeColors, mode: ThemeMode) => (mode === 'dark'
  ? { backgroundColor: c['surface-2'] }
  : { backgroundColor: c.surface, boxShadow: `0 0 0 1px ${c.hair}` });
/** The app's lift shadow (bars and pills that float above content). */
export const liftShadow = (c: ThemeColors, mode: ThemeMode) => (mode === 'dark'
  ? '0 10px 28px rgba(0,0,0,0.42), 0 2px 6px rgba(0,0,0,0.3)'
  : `0 10px 26px ${rgba(c.text, 0.16)}, 0 2px 6px ${rgba(c.text, 0.1)}`);
export const tintOf = (c: ThemeColors, color: string, p: number, base = 'transparent') => (base === 'transparent' ? rgba(color, p) : colorMix(color, p, base));

/** The sheet header: a centred title and Done on the left. */
export function SheetHeader({ title, left, onLeft, colors, mode }: { title: string; left: string; onLeft: () => void; colors: ThemeColors; mode: ThemeMode }) {
  return <View style={[s.sh, { backgroundColor: sheetBg(colors, mode) }]}>
    <View style={s.side}><Pressable accessibilityRole="button" onPress={onLeft} hitSlop={4} style={({ pressed }) => [s.shBtn, pressed && { opacity: 0.45 }]}>
      <Text style={[s.shL, { color: colors.accent }]}>{left}</Text>
    </Pressable></View>
    <Text accessibilityRole="header" numberOfLines={1} style={[s.shT, { color: colors.text }]}>{title}</Text>
    <View style={s.side} />
  </View>;
}

/** A section heading with an optional count on the right. */
export function SecHead({ title, aside, first, colors }: { title: string; aside?: string; first?: boolean; colors: ThemeColors }) {
  return <View style={[s.sec, first && { marginTop: 4 }]}>
    <Text accessibilityRole="header" style={[s.secT, { color: colors.text }]}>{title}</Text>
    {aside ? <Text style={[s.secA, { color: colors['text-muted'] }]}>{aside}</Text> : null}
  </View>;
}

/** The empty state: an icon in a soft tile of the page colour, a title and a line. */
export function EmptyBlock({ icon, color, title, body, colors, style }: { icon?: string; color?: string; title: string; body: string; colors: ThemeColors; style?: object }) {
  const c = color ?? colors.accent;
  return <View accessible accessibilityLabel={`${title}. ${body}`} style={[s.empty, style]}>
    {icon ? <View style={[s.ei, { backgroundColor: rgba(c, 0.14) }]}><TileIcon name={icon} size={26} color={c} /></View> : null}
    <Text style={[s.emptyT, { color: colors.text }]}>{title}</Text>
    <Text style={[s.emptyP, { color: colors['text-muted'] }]}>{body}</Text>
  </View>;
}

export function Row({ children, style }: { children: ReactNode; style?: object }) { return <View style={[s.row, style]}>{children}</View>; }

const s = StyleSheet.create({
  sh: { flexDirection: 'row', alignItems: 'center', minHeight: 56, marginHorizontal: -16, marginBottom: 4, paddingVertical: 4, paddingHorizontal: 8 },
  side: { flex: 1, minWidth: 80, alignItems: 'flex-start' },
  shBtn: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: 'center' },
  shL: { fontFamily: tokens.font.body, fontSize: 17, letterSpacing: -0.17 },
  shT: { fontFamily: tokens.font.heading, fontSize: 17, letterSpacing: -0.34, textAlign: 'center' },
  sec: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 28, marginBottom: 12 },
  secT: { fontFamily: tokens.font.heading, fontSize: 20, lineHeight: 23, letterSpacing: -0.5 },
  secA: { fontFamily: tokens.font.bodyStrong, fontSize: 13.5 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 28, paddingHorizontal: 16 },
  ei: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emptyT: { fontFamily: tokens.font.heading, fontSize: 17, letterSpacing: -0.34, textAlign: 'center' },
  emptyP: { fontFamily: tokens.font.body, fontSize: 14, lineHeight: 20.3, maxWidth: 270, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
});
