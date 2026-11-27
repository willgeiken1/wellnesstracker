import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Text, View, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { useAuth } from '@/auth/provider';
import { Icon } from '@/components/icon';
import { font, mix, alpha, tabular } from '@/components/kit-style';
import type { ThemeColors, ThemeMode } from '@/design/tokens';
import { liveReads } from '@/data/read-cache';
import type { Repository } from '@/data/repository';
import { t } from '@/i18n/en';
import { TrainingData } from './training-data';

/* The Training drawing pieces shared by the tiles and the pushed screens (summary, past workout). Nothing here
   depends on the tile surfaces, so a screen can use them without loading the tiles' depth renderer. */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Tile body text: an exact mockup style in a given colour. */
export function T({ w = 500, s, lh, tr, c, num, lines = 1, style, children }: {
  w?: 500 | 600 | 700; s: number; lh?: number; tr?: number; c: string; num?: boolean; lines?: number; style?: StyleProp<TextStyle>; children: ReactNode;
}) {
  return <Text numberOfLines={lines} allowFontScaling={false} style={[font(w, s, lh, tr), { color: c }, num && tabular, style]}>{children}</Text>;
}

export function PrBadge({ colors }: { colors: ThemeColors }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 19, paddingHorizontal: 7, borderRadius: 999, backgroundColor: alpha(colors.warning, 0.16) }}>
    <Icon name="trophy" size={11} color={colors.warning} />
    <T w={700} s={10.5} c={colors.warning}>{t('prs')}</T>
  </View>;
}

/** The 270 degree gauge with ticks (`INS.vz.gauge`). */
export function Gauge({ frac, from, size, sw, color, colors, fs, us, value, unit, label }: {
  frac: number; from?: number; size: number; sw: number; color: string; colors: ThemeColors; fs: number; us: number; value: string; unit?: string; label: string;
}) {
  const tk = size >= 110 ? 8 : size >= 100 ? 6 : 5, R = size / 2 - sw / 2 - tk - 3, cx = size / 2, cy = size / 2 + R * 0.1;
  const f = Math.max(0, Math.min(1, frac || 0));
  const pt = (tt: number, rr: number) => { const a = (135 + 270 * tt) * Math.PI / 180; return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; };
  const arc = (t0: number, t1: number) => { const a = pt(t0, R), b = pt(t1, R); return `M${r2(a[0])} ${r2(a[1])}A${R} ${R} 0 ${(t1 - t0) * 270 > 180 ? 1 : 0} 1 ${r2(b[0])} ${r2(b[1])}`; };
  const ticks: ReactNode[] = [];
  for (let k = 0; k <= 20; k++) {
    const major = k % 5 === 0; if (size < 100 && !major) continue;
    const a = pt(k / 20, R + sw / 2 + 3), b = pt(k / 20, R + sw / 2 + 3 + (major ? tk : tk * 0.6)), lit = k / 20 <= f + 1e-6 && f > 0;
    ticks.push(<Line key={k} x1={r2(a[0])} y1={r2(a[1])} x2={r2(b[0])} y2={r2(b[1])} stroke={lit ? color : major ? colors['text-muted'] : colors['hair-2']} strokeWidth={major ? 1.5 : 1} strokeLinecap="round" opacity={lit && !major ? 0.7 : 1} />);
  }
  return <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size }}>
    <Svg width={size} height={size}>
      {ticks}
      <Path d={arc(0, 1)} fill="none" stroke={mix(color, colors['surface-2'], 0.16)} strokeWidth={sw} strokeLinecap="round" />
      {f > 0.004 ? <Path d={arc(0, Math.max(f, 0.012))} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" /> : null}
      {from != null && from > 0.004 && from < f ? <Path d={arc(0, from)} fill="none" stroke={mix(color, colors.surface, 0.45)} strokeWidth={sw} strokeLinecap="round" /> : null}
    </Svg>
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingTop: Math.round(R * 0.2) }}>
      <T w={700} s={fs} lh={1} tr={-0.035} c={colors.text} num>{value}</T>
      {unit ? <T w={600} s={us} lh={1.2} c={colors['text-muted']} style={{ marginTop: 3 }}>{unit}</T> : null}
    </View>
  </View>;
}

/** A row of small cells (`INS.vz.cells`): 1 on, 0 off, 'now' outlined; groups add a wider gap. */
export function Cells({ states, w, h, gap, r, groups, color, colors, mode, label }: {
  states: (0 | 1 | 'now')[]; w: number; h: number; gap: number; r: number; groups?: number[] | null; color: string; colors: ThemeColors; mode: ThemeMode; label?: string;
}) {
  const GG = 7, breaks = groups ? groups.length - 1 : 0;
  const cw = Math.max(1, (w - gap * (states.length - 1 + breaks) - (GG) * breaks) / Math.max(1, states.length));
  const off = mode === 'light' ? mix(color, mix(colors.text, colors.bg, 0.06), 0.14) : mix(color, colors['surface-2'], 0.15);
  const out: ReactNode[] = []; let gi = 0, gc = 0;
  states.forEach((v, i) => {
    if (groups && i && gc === groups[gi]) { out.push(<View key={`g${i}`} style={{ width: GG }} />); gi++; gc = 0; }
    gc++;
    out.push(<View key={i} style={{ width: cw, height: h, borderRadius: r, backgroundColor: v === 1 ? color : v === 'now' ? 'transparent' : off, borderWidth: v === 'now' ? 1.5 : 0, borderColor: color }} />);
  });
  return <View accessible={!!label} accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap }}>{out}</View>;
}

// One per repository and revision: a new repository (signing in or out) never reads or writes through the last one's data.
let cached: { key: string; repo: Repository; data: TrainingData } | null = null;
const minuteListeners = new Set<() => void>();
let minuteTimer: ReturnType<typeof setInterval> | null = null;
let minute = Math.floor(Date.now() / 60000);
function subscribeMinute(cb: () => void) {
  minuteListeners.add(cb);
  if (!minuteTimer) minuteTimer = setInterval(() => { const m = Math.floor(Date.now() / 60000); if (m !== minute) { minute = m; minuteListeners.forEach(l => l()); } }, 5000);
  return () => { minuteListeners.delete(cb); if (!minuteListeners.size && minuteTimer) { clearInterval(minuteTimer); minuteTimer = null; } };
}
function dataFor(repository: Repository, key: string) {
  if (cached?.key !== key || cached.repo !== repository) cached = { key, repo: repository, data: new TrainingData(liveReads(repository), Date.now(), t('workoutName')) };
  return cached.data;
}
/** Training data for the signed-in person, shared by every tile and redrawn when the data changes or a minute passes. */
export function useTrainingData(): TrainingData | null {
  const { repository } = useAuth();
  const revision = useSyncExternalStore(cb => repository?.subscribe(cb) ?? (() => {}), () => repository?.getRevision() ?? 0, () => repository?.getRevision() ?? 0);
  const m = useSyncExternalStore(subscribeMinute, () => minute, () => minute);
  return useMemo(() => {
    return repository ? dataFor(repository, `${repository.owner}:${revision}:${m}`) : null;
  }, [repository, revision, m]);
}
/** The time, ticking every second while `on`. */
export function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [on]);
  return now;
}

