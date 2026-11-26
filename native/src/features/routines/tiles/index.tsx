import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, TSpan, Text as SvgText } from 'react-native-svg';
import { Icon, KitText, Tappable, alpha, useKit, type IconName } from '@/components/kit';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { WellBar } from '../../food/tiles/well-bar';
import { implementTile } from '../../tiles/registry';
import type { TileRenderProps } from '../../tiles/types';
import { fill } from '../../tiles/ui';
import {
  WD, addDays, bestRun, byType, count, dateOf, h12, hist, isDone, isPaused, markOf, monthDay, nextItem, nowOf, peptides, currentPause,
  rById, rItems, shortDate, stats, supplies, todayItems, until, weekData, weekLetter, weekdayOf, win, win12, shortDate as sd,
  type Now, type Routine, type RoutinesState,
} from '../model';
import { routinesRoutes, routinesTab } from '../nav';
import { SunPath, Thumb } from '../sun-path';
import { activeRoutinesStore, useActiveRoutinesStore, useRoutines } from '../store';
import { B, Ck, Dot, Hair, Head, IRow, Ic, Kick, Num, OffIRow, RingG, Segs, Sub, TBtn, Title, type Ctx } from './parts';

/* Registers the Routines tab's eleven tiles with the tile engine: what each draws, the grey text in its header and what
   a tap opens. Each reads the shared routines store; check-off and skip inside a tile run only outside edit mode. */

type Body = (p: { p: TileRenderProps; c: Ctx }) => ReactNode;
function tile(Body: Body) {
  const Host = ({ p }: { p: TileRenderProps }) => {
    const store = useActiveRoutinesStore(), { s, n } = useRoutines(store);
    if (!store) return null;
    return <View style={{ width: p.body.w, height: p.body.h }}><Body p={p} c={{ s, n, store, live: !p.editing && !p.preview, w: p.body.w, h: p.body.h }} /></View>;
  };
  const Tile = (p: TileRenderProps) => <Host p={p} />;
  return Tile;
}
const col = { flex: 1, flexDirection: 'column' } as const;
const auto = { marginTop: 'auto' } as const;
const cOf = (k: ReturnType<typeof useKit>, r: Routine | null | undefined) => k.c[r?.color ?? 'sleep'];
const rIcon = (r: Routine): IconName => (r.id === 'morning' ? 'sun' : r.id === 'midday' ? 'clock' : r.id === 'night' ? 'moon' : 'routines');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const pickR = (s: RoutinesState, n: Now, which?: string) => {
  if (which && which !== 'auto') { const r = rById(s, which); if (r) return r; }
  const nx = nextItem(s, n); return (nx ? rById(s, nx.routines[0]) : null) ?? s.routines[s.routines.length - 1] ?? null;
};
const itemsFor = (s: RoutinesState, n: Now, which?: string) => (which && which !== 'all' ? rItems(s, which, n, true) : s.items.filter(i => i.routines.length));
const whichName = (s: RoutinesState, which?: string) => (which && which !== 'all' ? rById(s, which)?.name : null) ?? t('routinesAllRoutines');
const pausedNow = (s: RoutinesState, n: Now, r: Routine) => isPaused(r, n.day);
const range30 = (n: Now) => fill(t('routinesRange'), { a: monthDay(addDays(n.day, -29)), b: monthDay(n.day) });

/* 1. Sun path */
const Sun: Body = ({ p, c }) => {
  const k = useKit(), { s, n } = c, today = todayItems(s, n), left = today.filter(i => !markOf(s, n.day, i.id)).length, nx = nextItem(s, n), now = h12(n.h);
  const byLeft = p.options.center === 'left';
  const label = fill(t('routinesSunLabel'), { a: h12(5), b: h12(23), now, left }) + (nx ? ` ${fill(t('routinesSunNext'), { name: nx.name, time: h12(nx.h) })}` : '');
  const big = byLeft ? (left ? fill(t('routinesNLeft'), { n: left }) : t('routinesAllDone')) : now;
  const caps = byLeft ? fill(t('routinesNowCaps'), { now }) : left ? fill(t('routinesNLeftToday'), { n: left }) : t('routinesAllDoneToday');
  if (p.size === 'M') {
    return <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
      <View style={{ width: 206, marginTop: -6, marginLeft: -6 }}><SunPath s={s} n={n} width={206} big={big} caps={caps.toUpperCase()} label={label} /></View>
      <View style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
        {byLeft ? <><Num v={today.length - left} unit={fill(t('routinesOfN'), { n: today.length })} fs={28} /><Sub style={{ marginTop: 4 }}>{t('routinesDoneToday')}</Sub></>
          : <><Num v={left} unit={t('routinesLeftWord')} fs={28} /><Sub style={{ marginTop: 4 }}>{fill(t('routinesOfNToday'), { n: today.length })}</Sub></>}
        <View style={auto}>{nx ? <>
          <Kick color={cOf(k, rById(s, nx.routines[0]))}>{fill(t('routinesNextAt'), { time: h12(nx.h) })}</Kick>
          <Title size={13.5} lines={2} style={{ marginTop: 5 }}>{nx.name}</Title>
        </> : <Sub>{t('routinesNothingLeft')}</Sub>}</View>
      </View>
    </View>;
  }
  let foot: ReactNode;
  if (p.options.foot === 'next') {
    const r = nx ? rById(s, nx.routines[0]) : null;
    foot = <Plate>{nx && r ? <>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Kick color={cOf(k, r)}>{`${r.name} · ${h12(nx.h)} · ${until(nx.h, n.h)}`}</Kick>
        <KitText weight={600} size={14} numberOfLines={1} style={{ marginTop: 5 }}>{nx.name} <KitText weight={500} size={14} color="text-muted">{nx.dose}</KitText></KitText>
      </View>
      <Ck i={nx} c={c} next />
    </> : <Sub>{t('routinesNothingLeft')}</Sub>}</Plate>;
  } else {
    foot = <>
      <View style={{ flexDirection: 'row', gap: 12 }}>{s.routines.slice(0, 3).map(r => {
        const its = rItems(s, r.id, n), cn = count(s, r.id, n), color = cOf(k, r);
        return <View key={r.id} style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Dot color={color} />
            <KitText weight={600} size={12.5} numberOfLines={1} style={{ flexShrink: 1 }}>{r.name}</KitText>
            <KitText weight={700} size={12} numeric color="text-muted" style={{ marginLeft: 'auto' }}>{pausedNow(s, n, r) ? t('routinesPaused') : `${cn.done}/${cn.n}`}</KitText>
          </View>
          <Segs s={s} n={n} items={its} color={color} h={5} />
        </View>;
      })}</View>
      {nx ? <Sub style={{ marginTop: 9, textAlign: 'right' }}>{t('routinesNext')} <B>{nx.name}</B>, {h12(nx.h)}</Sub> : null}
    </>;
  }
  return <View style={col}>
    <View style={{ marginTop: -10, marginHorizontal: -10 }}><SunPath s={s} n={n} width={c.w + 20} big={big} caps={caps.toUpperCase()} label={label} /></View>
    <View style={auto}>{foot}</View>
  </View>;
};
/** A raised neutral plate (`.rtt-plate.rtt-nxp`). */
function Plate({ children }: { children: ReactNode }) {
  const k = useKit();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, paddingRight: 4, height: 52, borderRadius: 14,
    backgroundColor: k.dark ? k.c['surface-2'] : k.c.surface, boxShadow: k.dark ? '0px 1px 1px rgba(0,0,0,0.35), 0px 6px 14px -8px rgba(0,0,0,0.6)' : `0px 0px 0px 1px ${k.c.hair}` }}>{children}</View>;
}

/* 2. Next up */
const Next: Body = ({ p, c }) => {
  const k = useKit(), { s, n } = c, nx = nextItem(s, n);
  if (!nx) return <View style={[col, { justifyContent: 'flex-end' }]}><Ic name="check" color={k.c.sleep} /><Title style={{ marginTop: 10 }}>{t('routinesAllDoneToday')}</Title><Sub>{t('routinesAllLogged')}</Sub></View>;
  const r = rById(s, nx.routines[0]), color = cOf(k, r), dose = nx.kind === 'dose';
  const go = <TBtn kind="fill" color={color} icon="check" label={dose ? fill(t('routinesLogDose'), { dose: nx.dose }) : t('routinesDone')} full={p.size === 'S'} live={c.live}
    spoken={dose ? fill(t('routinesLogName'), { name: nx.name, dose: nx.dose }) : fill(t('routinesMarkDone'), { name: nx.name, dose: nx.dose })} onPress={() => c.store.toggleDone(nx.id)} />;
  if (p.size === 'S') return <View style={col}>
    <Kick color={color}>{until(nx.h, n.h)}</Kick>
    <Title lines={2} style={{ marginTop: 6 }}>{nx.name}</Title>
    <Sub style={{ marginTop: 2 }}>{`${nx.dose} · ${h12(nx.h)}`}</Sub>
    <View style={auto}>{go}</View>
  </View>;
  const later = todayItems(s, n).filter(i => !markOf(s, n.day, i.id) && i !== nx), then = later[0];
  const side = p.options.then === 'window' && r ? <Sub style={{ marginTop: 3 }}>{`${r.name} ${win(r)}`}</Sub>
    : then ? <Sub style={{ marginTop: 3 }}>{t('routinesThen')} <B>{then.name}</B>, {h12(then.h)}</Sub> : <Sub style={{ marginTop: 3 }}>{t('routinesLastOne')}</Sub>;
  const mm = Math.max(0, Math.round((nx.h - n.h) * 60)), H = Math.floor(mm / 60), M = mm % 60;
  const onHand = nx.left != null && nx.perDay ? ` · ${fill(t('routinesDaysOnHand'), { n: Math.floor(nx.left / nx.perDay) })}` : '';
  return <View style={col}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Kick color={color}>{`${r?.name ?? ''} · ${h12(nx.h)}`}</Kick>
        <KitText weight={700} size={19} lineHeight={1.2} tracking={-0.02} numberOfLines={1} style={{ marginTop: 6 }}>{nx.name}</KitText>
        <Sub style={{ marginTop: 2 }}>{nx.dose + onHand}</Sub>
        {side}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {mm ? <><View style={{ flexDirection: 'row', gap: 4 }}>{H ? <Num v={H} unit="hr" fs={24} /> : null}<Num v={M} unit="min" fs={24} /></View><Sub style={{ marginTop: 4 }}>{t('routinesUntilDue')}</Sub></>
          : <Num v={t('routinesNow')} fs={24} />}
      </View>
    </View>
    <View style={[auto, { flexDirection: 'row', gap: 10 }]}>{go}<TBtn kind="quiet" color={color} label={t('routinesSkip')} live={c.live} spoken={fill(t('routinesSkipToday'), { name: nx.name })} onPress={() => c.store.toggleSkip(nx.id)} /></View>
  </View>;
};

/* 3. Routine (draws its own header in the routine colour) */
const RoutineTile: Body = ({ p, c }) => {
  const k = useKit(), { s, n } = c, r = pickR(s, n, p.options.which);
  if (!r) return null;
  const color = cOf(k, r), its = rItems(s, r.id, n), off = rItems(s, r.id, n, true).filter(i => !its.includes(i)), cn = count(s, r.id, n), nx = nextItem(s, n);
  const nxId = nx && nx.routines[0] === r.id ? nx.id : null, open = its.filter(i => !markOf(s, n.day, i.id)), pause = currentPause(r, n.day);
  if (pause && pausedNow(s, n, r)) return <View style={col}><Head icon={rIcon(r)} title={r.name} meta={t('routinesPaused')} color={color} />
    <View style={auto}><Title>{fill(t('routinesPausedUntil'), { date: shortDate(pause.until) })}</Title><Sub style={{ marginTop: 2 }}>{t('routinesPausedStreak')}</Sub>
      <View style={{ marginTop: 10 }}><TBtn kind="ghost" color={color} label={t('routinesResume')} live={c.live} onPress={() => c.store.resume(r.id)} /></View></View></View>;
  if (!its.length) return <View style={col}><Head icon={rIcon(r)} title={r.name} color={color} />
    <View style={auto}><Title>{t('routinesNothingToday')}</Title><Sub>{fill(t('routinesAddToSee'), { name: r.name })}</Sub></View></View>;
  if (p.size === 'S') {
    const first = open[0];
    return <View style={col}><Head icon={rIcon(r)} title={r.name} color={color} />
      <Num v={cn.done} unit={fill(t('routinesOfN'), { n: cn.n })} fs={30} style={{ marginTop: 12 }} />
      <Sub style={{ marginTop: 4 }}>{win12(r)}</Sub>
      <View style={auto}><Segs s={s} n={n} items={its} color={color} />
        <Sub style={{ marginTop: 8 }}>{first ? <><B>{fill(t('routinesNItemsLeft'), { n: plural(open.length, t('routinesItem'), t('routinesItems')) })}</B>{` · ${fill(t('routinesNextLower'), { time: h12(first.h) })}`}</> : <B>{t('routinesAllDone')}</B>}</Sub>
      </View></View>;
  }
  if (p.size === 'M') {
    const at = Math.max(0, Math.min(its.length - 3, its.indexOf(open[0] ?? its[its.length - 1]))), show = its.slice(at, at + 3);
    return <View style={col}><Head icon={rIcon(r)} title={r.name} meta={`${fill(t('routinesNOfM'), { n: cn.done, m: cn.n })} · ${win(r)}`} color={color} />
      <View style={{ marginTop: 6 }}>{show.map((i, j) => <IRow key={i.id} i={i} c={c} next={i.id === nxId} h={38} first={j === 0} color={color} />)}</View></View>;
  }
  const rows = [...its, ...off].slice(0, 5), rh = Math.min(46, Math.floor(176 / rows.length));
  return <View style={col}><Head icon={rIcon(r)} title={r.name} meta={win12(r)} color={color} />
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 12 }}>
      <View style={{ flex: 1 }}><Num v={cn.done} unit={fill(t('routinesOfNDone'), { n: cn.n })} fs={26} /></View>
      <Sub>{open.length ? fill(t('routinesNItemsLeft'), { n: plural(open.length, t('routinesItem'), t('routinesItems')) }) : t('routinesAllDone')}</Sub>
    </View>
    <View style={{ marginTop: 9 }}><Segs s={s} n={n} items={its} color={color} /></View>
    <View style={auto}>{rows.map((i, j) => its.includes(i) ? <IRow key={i.id} i={i} c={c} next={i.id === nxId} h={rh} skip={i.id === nxId} first={j === 0} color={color} /> : <OffIRow key={i.id} i={i} h={rh} first={j === 0} />)}</View>
  </View>;
};

/* 4. Today's routines */
const Overview: Body = ({ p, c }) => {
  const k = useKit(), { s, n } = c, rs = s.routines.slice(0, 3), today = todayItems(s, n), done = today.filter(i => isDone(s, n, i)).length;
  const aria = rs.map(r => { const cn = count(s, r.id, n); return `${r.name} ${cn.done} of ${cn.n}`; }).join(', ');
  const rings = (sz: number, sw: number, gap: number) => <View accessible accessibilityRole="image" accessibilityLabel={aria} style={{ width: sz, height: sz }}>
    <Svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>
      {rs.map((r, j) => {
        const cn = count(s, r.id, n), rad = sz / 2 - sw / 2 - j * (sw + gap), C = 2 * Math.PI * rad, f = cn.n ? cn.done / cn.n : 0, color = cOf(k, r);
        return [<Circle key={`${r.id}t`} cx={sz / 2} cy={sz / 2} r={rad} fill="none" stroke={alpha(color, 0.2)} strokeWidth={sw} />,
          f > 0 ? <Circle key={`${r.id}f`} cx={sz / 2} cy={sz / 2} r={rad} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" rotation={-90} origin={`${sz / 2}, ${sz / 2}`} strokeDasharray={`${(C * f).toFixed(1)} ${C.toFixed(1)}`} /> : null];
      })}
      <SvgText x={sz / 2} y={sz / 2 + 6} textAnchor="middle" fill={k.c.text} fontFamily={tokens.font.heading} fontSize={sz > 108 ? 19 : 17}>
        {String(done)}<TSpan fill={k.c['text-muted']} fontFamily={tokens.font.bodyStrong} fontSize={10.5}>{` /${today.length}`}</TSpan>
      </SvgText>
    </Svg>
  </View>;
  const bars = (gap: number) => <View style={{ gap }}>{rs.map(r => {
    const its = rItems(s, r.id, n), cn = count(s, r.id, n), color = cOf(k, r);
    return <View key={r.id}>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 5 }}>
        <Sub color="text" style={{ fontWeight: undefined }}><B>{r.name}</B></Sub><View style={{ flex: 1 }} />
        <Sub style={{ fontVariant: ['tabular-nums'] }}>{pausedNow(s, n, r) ? t('routinesPaused') : `${cn.done}/${cn.n}`}</Sub>
      </View>
      <Segs s={s} n={n} items={its} color={color} />
    </View>;
  })}</View>;
  if (p.size === 'S') return p.options.look === 'bars' ? <View style={[col, { justifyContent: 'flex-end' }]}>{bars(11)}</View>
    : <View style={[col, { alignItems: 'center', justifyContent: 'center' }]}>{rings(112, 11, 3)}</View>;
  if (p.size === 'M') {
    const list = <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>{rs.map((r, j) => {
      const cn = count(s, r.id, n), full = cn.n > 0 && cn.done === cn.n, color = cOf(k, r);
      return <View key={r.id} style={{ height: 36, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: j ? 1 : 0, borderTopColor: k.c.hair }}>
        <Dot color={color} /><Title size={13.5}>{r.name}</Title><Sub style={{ flex: 1 }}>{fill(t('routinesFromTime'), { time: h12(r.from) })}</Sub>
        {full ? <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={12} color={k.c['on-accent']} /></View>
          : <KitText weight={600} size={12.5} numeric>{pausedNow(s, n, r) ? t('routinesPaused') : `${cn.done}/${cn.n}`}</KitText>}
      </View>;
    })}</View>;
    return <View style={{ flex: 1, flexDirection: 'row', gap: 16, alignItems: 'center' }}>
      {p.options.look === 'bars' ? <><View style={{ width: 110 }}><Num v={done} unit={fill(t('routinesOfN'), { n: today.length })} fs={28} /><Sub style={{ marginTop: 4 }}>{t('routinesItemsDone')}</Sub></View><View style={{ flex: 1 }}>{bars(10)}</View></>
        : <>{rings(116, 11, 3)}{list}</>}
    </View>;
  }
  return <View style={col}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}><View style={{ flex: 1 }}><Num v={done} unit={fill(t('routinesOfNDone'), { n: today.length })} fs={28} /></View><Sub>{fill(t('routinesNLeftTodayLower'), { n: today.length - done })}</Sub></View>
    <View style={{ marginTop: 12 }}>{rs.map((r, j) => {
      const its = rItems(s, r.id, n), cn = count(s, r.id, n), color = cOf(k, r);
      return <Tappable key={r.id} dim="row" disabled={!c.live} accessibilityRole="button" accessibilityLabel={`${r.name}, ${win(r)}, ${cn.done} of ${cn.n} done`} onPress={() => routinesRoutes.detail(r.id)}
        style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: j ? 1 : 0, borderTopColor: k.c.hair }}>
        <Thumb tile from={r.from} to={r.to} color={color} />
        <View style={{ flex: 1, minWidth: 0 }}><Title size={14}>{r.name}</Title><Sub style={{ marginTop: 1 }}>{win12(r)}</Sub></View>
        <View style={{ width: 96 }}>{its.length ? <Segs s={s} n={n} items={its} color={color} /> : null}</View>
        <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{pausedNow(s, n, r) ? <KitText weight={600} size={11} color="text-muted">{t('routinesPaused')}</KitText>
          : <KitText weight={700} size={15} lineHeight={1} numeric>{cn.done}<KitText weight={600} size={11} color="text-muted">{`/${cn.n}`}</KitText></KitText>}</View>
      </Tappable>;
    })}</View>
    <View style={[auto, { flexDirection: 'row', gap: 8 }]}>
      <TBtn kind="ghost" color={k.c.sleep} icon="plus" label={t('routinesNewRoutine')} live={c.live} onPress={() => routinesRoutes.newRoutine()} />
      <TBtn kind="quiet" color={k.c.sleep} label={t('routinesEditRoutines')} live={c.live} onPress={() => routinesRoutes.reorder()} />
    </View>
  </View>;
};

/* 5. Last 30 days */
type Dm = 'f' | 'p' | 'm' | 'o' | 'l';
function DotCell({ st, color, size }: { st: Dm; color: string; size: number }) {
  const k = useKit();
  const style = st === 'f' ? { backgroundColor: color } : st === 'p' ? { borderWidth: 1.4, borderColor: color } : st === 'm' ? { backgroundColor: alpha(k.c['text-muted'], 0.34) }
    : st === 'l' ? { borderWidth: 1.4, borderColor: alpha(color, 0.55), backgroundColor: alpha(color, 0.18) } : { backgroundColor: k.c['hair-2'], transform: [{ scale: 0.45 }] };
  return <View style={[{ width: size, height: size, borderRadius: size / 2 }, style]} />;
}
const Adherence: Body = ({ p, c }) => {
  const k = useKit(), { s, n } = c, which = p.options.which, items = itemsFor(s, n, which), st = stats(s, items, n);
  const color = which && which !== 'all' ? cOf(k, rById(s, which)) : k.c.sleep;
  const shade = (x: { s: number; d: number }) => !x.s ? alpha(k.c['text-muted'], 0.1) : x.d >= x.s ? color : alpha(color, (18 + (x.d / x.s) * 50) / 100);
  const aria = fill(t('routinesAdhAria'), { done: st.done, sched: st.sched, pct: st.pct });
  if (p.size === 'S') return <View style={col} accessible accessibilityRole="image" accessibilityLabel={aria}>
    <Num v={st.done} unit={fill(t('routinesOfN'), { n: st.sched })} fs={28} />
    <Sub style={{ marginTop: 4 }}>{fill(t('routinesLoggedPct'), { pct: st.pct })}</Sub>
    <View style={[auto, { flexDirection: 'row', flexWrap: 'wrap', gap: 3 }]}>{st.days.map((x, j) => {
      const sz = (c.w - 27) / 10;
      return <View key={j} style={{ width: sz, height: sz, borderRadius: 3, backgroundColor: shade(x), borderWidth: j === 29 ? 1.4 : 0, borderColor: k.c.text }} />;
    })}</View>
  </View>;
  if (p.size === 'M') {
    const rows = which && which !== 'all'
      ? items.slice(0, 5).map(i => ({ lbl: i.name, c: color, h: hist(s, i, n).map((x): Dm => (x === 'd' ? 'f' : x === 's' ? 'p' : x === 'o' ? 'o' : x === 'u' ? 'l' : 'm')) }))
      : s.routines.slice(0, 4).map(r => { const rd = stats(s, rItems(s, r.id, n, true), n).days; return { lbl: r.name, c: cOf(k, r), h: rd.map((x, j): Dm => (j === 29 && !x.s && count(s, r.id, n).n ? 'l' : !x.s ? 'o' : x.d >= x.s ? 'f' : x.d ? 'p' : 'm')) }; });
    const dot = rows.length > 3 ? 4.5 : 5.5, rh = rows.length > 3 ? 18 : 24;
    return <View style={{ flex: 1, flexDirection: 'row', gap: 14 }} accessible accessibilityRole="image" accessibilityLabel={aria}>
      <View style={{ width: 96 }}>
        <Num v={st.pct} unit="%" fs={30} />
        <Sub lines={2} style={{ marginTop: 4 }}>{fill(t('routinesNOfMLogged'), { n: st.done.toLocaleString('en-US'), m: st.sched.toLocaleString('en-US') })}</Sub>
        <Sub style={auto}><B>{st.streak}</B>{` ${t('routinesDayStreak')}`}</Sub>
      </View>
      <View style={{ flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
        {rows.map(rw => <View key={rw.lbl} style={{ height: rh, flexDirection: 'row', alignItems: 'center' }}>
          <KitText weight={600} size={11} color="text-muted" numberOfLines={1} style={{ width: 66 }}>{rw.lbl}</KitText>
          {rw.h.map((x, j) => <View key={j} style={{ flex: 1, alignItems: 'center' }}><DotCell st={x} color={rw.c} size={dot} /></View>)}
        </View>)}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5, marginLeft: 66 }}>
          <Kick size={9.5}>{monthDay(addDays(n.day, -29))}</Kick><Kick size={9.5}>{t('routinesToday')}</Kick>
        </View>
      </View>
    </View>;
  }
  // L: a month calendar, Monday first.
  const start = addDays(n.day, -29), lead = (weekdayOf(start) + 6) % 7, cw = (c.w - 24) / 7;
  const cells: ReactNode[] = [];
  for (let j = 0; j < lead; j++) cells.push(<View key={`b${j}`} style={{ width: cw, height: 23 }} />);
  st.days.forEach((x, j) => {
    const day = addDays(start, j), f = x.s ? x.d / x.s : -1;
    cells.push(<View key={day} style={{ width: cw, height: 23, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: f < 0 ? alpha(k.c['text-muted'], 0.14) : shade(x), borderWidth: j === 29 ? 1.6 : 0, borderColor: k.c.text }}>
      <KitText weight={700} size={11} numeric color={f >= 1 ? 'on-accent' : f >= 0 ? 'text' : 'text-muted'}>{dateOf(day).getDate()}</KitText>
    </View>);
  });
  return <View style={col} accessible accessibilityRole="image" accessibilityLabel={aria}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}><View style={{ flex: 1 }}><Num v={st.done} unit={fill(t('routinesOfNLogged'), { n: st.sched })} fs={28} /></View><Num v={st.pct} unit="%" fs={20} /></View>
    <View style={{ flexDirection: 'row', gap: 4, marginTop: 12 }}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, j) => <KitText key={j} weight={700} size={11} color="text-muted" style={{ width: cw, textAlign: 'center' }}>{l}</KitText>)}</View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>{cells}</View>
    {which && which !== 'all' ? <Sub style={auto}><B>{st.streak}</B>{` ${fill(t('routinesStreakIn'), { items: plural(items.length, t('routinesItem'), t('routinesItems')), name: whichName(s, which) })}`}</Sub>
      : <View style={[auto, { flexDirection: 'row', gap: 10 }]}>{s.routines.slice(0, 3).map(r => {
        const rs = stats(s, rItems(s, r.id, n, true), n);
        return <View key={r.id} style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Dot color={cOf(k, r)} size={7} /><Sub>{r.name}</Sub></View>
          <Num v={rs.pct} unit="%" fs={16} style={{ marginTop: 3 }} />
        </View>;
      })}</View>}
  </View>;
};

/* 6. Streak */
const Streak: Body = ({ p, c }) => {
  const k = useKit(), { s, n } = c, which = p.options.which, st = stats(s, itemsFor(s, n, which), n), best = bestRun(st);
  const color = which && which !== 'all' ? cOf(k, rById(s, which)) : k.c.sleep;
  const last7 = <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{st.days.slice(23).map((x, j) => {
    const day = addDays(n.day, j - 6), full = !x.s || x.d >= x.s, today = j === 6;
    return <View key={day} style={{ alignItems: 'center', gap: 5 }}>
      <View style={{ width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: today ? 1.5 : 0, borderColor: k.c.text }}>
        <View style={{ width: 13, height: 13, borderRadius: 7, backgroundColor: full ? color : 'transparent', borderWidth: full ? 0 : 1.5, borderColor: alpha(k.c['text-muted'], 0.6) }} />
      </View>
      <Kick size={9.5} color={today ? 'text' : undefined}>{weekLetter(weekdayOf(day))}</Kick>
    </View>;
  })}</View>;
  if (p.size === 'S') return <View style={col} accessible accessibilityRole="image" accessibilityLabel={fill(t('routinesStreakAria'), { n: st.streak, name: whichName(s, which) })}>
    <Num v={st.streak} unit={st.streak === 1 ? t('routinesDay') : t('routinesDays')} fs={32} />
    <Sub style={{ marginTop: 4 }}>{whichName(s, which)}</Sub>
    <View style={auto}>{last7}</View>
  </View>;
  return <View style={{ flex: 1, flexDirection: 'row', gap: 16 }}>
    <View style={{ width: 104 }}>
      <Num v={st.streak} unit={t('routinesDays')} fs={30} />
      <Sub style={{ marginTop: 4 }}>{whichName(s, which)}</Sub>
      <Sub style={auto}>{`${t('routinesBest30')} `}<B>{best}</B></Sub>
    </View>
    <View style={{ flex: 1, minWidth: 0, justifyContent: 'space-between' }}>
      {last7}
      <View>{s.routines.slice(0, 3).map(r => {
        const rs = stats(s, rItems(s, r.id, n, true), n), rc = cOf(k, r);
        return <View key={r.id} style={{ height: 30, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <KitText weight={600} size={12.5} numberOfLines={1} style={{ width: 62 }}>{r.name}</KitText>
          <WellBar frac={rs.streak / 30} h={8} color={rc} />
          <View style={{ width: 52, alignItems: 'flex-end' }}><Num v={rs.streak} unit="d" fs={15} /></View>
        </View>;
      })}</View>
    </View>
  </View>;
};

/* 7. Supplies */
const Supplies: Body = ({ p, c }) => {
  const k = useKit(), { s, n } = c, list = supplies(s), flag = +(p.options.flag ?? 10) || 10, low = list.filter(x => x.days < flag);
  if (!list.length) return <View style={[col, { justifyContent: 'flex-end' }]}><Title>{t('routinesNothingTracked')}</Title><Sub>{t('routinesAddOnHand')}</Sub></View>;
  const row = (x: (typeof list)[number], h: number, first: boolean) => {
    const lw = x.days < flag;
    return <View key={x.i.id} style={{ height: h, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: first ? 0 : 1, borderTopColor: k.c.hair }}>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}><KitText weight={600} size={13} lineHeight={1.2} numberOfLines={1}>{x.i.name}</KitText><Sub size={11.5}>{x.hand}</Sub></View>
      <View style={{ width: 92 }}><WellBar frac={x.days / 60} h={8} color={lw ? k.c.warning : k.c.sleep} mark={flag / 60} /></View>
      <View style={{ width: 50, alignItems: 'flex-end' }}><Num v={x.days} unit="d" fs={14} color={lw ? 'warning' : undefined} /></View>
    </View>;
  };
  if (p.size === 'S') {
    const x = list[0], lw = x.days < flag;
    return <View style={col} accessible accessibilityRole="image" accessibilityLabel={fill(t('routinesSupAria'), { name: x.i.name, n: x.days })}>
      <Num v={x.days} unit={t('routinesDays')} fs={32} color={lw ? 'warning' : undefined} />
      <Title size={13.5} style={{ marginTop: 6 }}>{x.i.name}</Title>
      <Sub>{fill(t('routinesRunsOut'), { date: shortDate(addDays(n.day, x.days)) })}</Sub>
      <View style={auto}><WellBar frac={x.days / 60} h={8} color={lw ? k.c.warning : k.c.sleep} mark={flag / 60} /></View>
    </View>;
  }
  if (p.size === 'M') return <View style={[col, { justifyContent: 'space-between' }]}>{list.slice(0, 3).map((x, j) => row(x, 36, j === 0))}</View>;
  const show = list.slice(0, 6), more = list.length - show.length;
  return <View style={col}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <View style={{ flex: 1 }}>{low.length ? <Num v={low.length} unit={t('routinesRunningLow')} fs={26} color="warning" /> : <Num v={t('routinesAll')} unit={t('routinesStocked')} fs={26} />}</View>
      <Sub>{fill(t('routinesMarkerAt'), { n: flag })}</Sub>
    </View>
    <View style={auto}>{show.map((x, j) => row(x, 34, j === 0))}</View>
    {more > 0 ? <Sub style={{ marginTop: 9 }}>{fill(t('routinesMoreOver'), { n: more, d: show[show.length - 1].days })}</Sub> : null}
  </View>;
};

/* 8. Peptides */
const SITES: [string, string, string, number][] = [['L abdomen', 'Abdomen', 'Left', 0], ['R abdomen', 'Abdomen', 'Right', 1], ['L thigh', 'Thigh', 'Left', 4], ['R thigh', 'Thigh', 'Right', 2]];
function Sites({ h, n }: { h: number; n: Now }) {
  const k = useKit(), rest = SITES.slice().sort((a, b) => b[3] - a[3])[0];
  const ago = (d: number) => (d === 0 ? t('routinesToday') : d === 1 ? t('routinesYesterday') : WD[((n.wd - d) % 7 + 7) % 7]);
  return <View style={{ flexDirection: 'row', gap: 6 }}>{SITES.map(x => {
    const isRest = x === rest;
    return <View key={x[0]} accessible accessibilityLabel={`${x[0]}, last used ${ago(x[3])}`} style={{ flex: 1, minWidth: 0, height: h, paddingHorizontal: 9, justifyContent: 'center', gap: 3, borderRadius: 14,
      backgroundColor: k.dark ? k.c['surface-2'] : k.c.surface, borderWidth: isRest ? 1.5 : k.dark ? 0 : 1, borderColor: isRest ? k.c.sleep : k.c.hair }}>
      <Kick size={9} color={isRest ? k.c.sleep : x[3] === 0 ? 'text' : undefined}>{isRest ? t('routinesRested') : ago(x[3])}</Kick>
      <KitText weight={600} size={12.5} lineHeight={1.15} numberOfLines={1}>{x[1]}</KitText>
      <KitText weight={500} size={11} color="text-muted" numberOfLines={1}>{x[2]}</KitText>
    </View>;
  })}</View>;
}
const PeptidesTile: Body = ({ p, c }) => {
  const k = useKit(), { s, n } = c, ps = peptides(s, n), color = k.c.sleep;
  if (!ps.length) return <View style={[col, { justifyContent: 'flex-end' }]}><Title>{t('routinesNoPeptides')}</Title>
    <View style={{ marginTop: 10 }}><TBtn kind="ghost" color={color} icon="plus" label={t('routinesAdd')} live={c.live} onPress={() => routinesRoutes.add({ type: 'Peptide' })} /></View></View>;
  const gauge = (x: (typeof ps)[number], sz: number) => <RingG size={sz} sw={sz > 50 ? 6 : 5} frac={(x.i.left ?? 0) / (x.i.vial ?? 1)} color={color} label={fill(t('routinesDosesLeft'), { left: x.i.left ?? 0, vial: x.i.vial ?? 0 })}>
    <KitText weight={700} size={sz > 50 ? 17 : 14} numeric>{x.i.left ?? 0}</KitText></RingG>;
  const week = (x: (typeof ps)[number]) => <View style={{ flexDirection: 'row', gap: 2 }}>{[1, 2, 3, 4, 5, 6, 0].map(w => {
    const on = !x.i.days || x.i.days.includes(w), today = w === n.wd;
    return <View key={w} style={{ width: 13, height: 18, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? color : alpha(k.c['text-muted'], 0.12), borderWidth: today ? 1.4 : 0, borderColor: k.c.text }}>
      <KitText weight={700} size={11} style={{ fontSize: 9 }} color={on ? 'on-accent' : 'text-muted'}>{weekLetter(w)}</KitText>
    </View>;
  })}</View>;
  const pepRow = (x: (typeof ps)[number]) => <View key={x.i.id} style={{ height: 54, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    {gauge(x, 44)}
    <View style={{ flex: 1, minWidth: 0 }}>
      <KitText weight={600} size={14} numberOfLines={1}>{x.i.name} <KitText weight={500} size={14} color="text-muted">{x.i.dose}</KitText></KitText>
      <Sub style={{ marginTop: 2 }}>{`${t('routinesNext')} `}<B>{x.when}</B></Sub>
    </View>
    {week(x)}
  </View>;
  if (p.size === 'S') {
    const x = ps[0];
    return <View style={col}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>{gauge(x, 56)}<View style={{ paddingTop: 4 }}><Sub>{fill(t('routinesOfN'), { n: x.i.vial ?? 0 })}</Sub><Sub>{t('routinesDosesWord')}</Sub></View></View>
      <View style={auto}><Title size={13.5}>{x.i.name}</Title><Sub>{x.when}</Sub></View>
    </View>;
  }
  if (p.size === 'M') {
    if (p.options.show === 'sites') return <View style={[col, { justifyContent: 'flex-end' }]}><Sites h={70} n={n} /><Sub style={{ marginTop: 8 }}>{fill(t('routinesLastUsed'), { site: SITES[0][0] })}</Sub></View>;
    return <View style={[col, { justifyContent: 'space-between' }]}>{ps.slice(0, 2).map((x, j) => <View key={x.i.id}>{j ? <Hair /> : null}{pepRow(x)}</View>)}</View>;
  }
  return <View style={col}>
    {ps.slice(0, 2).map((x, j) => <View key={x.i.id}>{j ? <Hair /> : null}{pepRow(x)}</View>)}
    <View style={[auto, { flexDirection: 'row', alignItems: 'center', marginBottom: 8 }]}>
      <Kick style={{ flex: 1 }}>{t('routinesInjectionSites')}</Kick>
      <TBtn kind="ghost" color={color} icon="rt-conv" label={t('routinesUnitConverter')} h={28} fs={12.5} live={c.live} onPress={() => routinesRoutes.converter()} />
    </View>
    <Sites h={62} n={n} />
  </View>;
};

/* 9. Medications */
const Meds: Body = ({ p, c }) => {
  const k = useKit(), { s, n } = c, l = byType(s, 'Medication'), color = k.c.sleep;
  const add = <TBtn kind="ghost" color={color} icon="plus" label={p.size === 'S' ? t('routinesAdd') : t('routinesAddMed')} spoken={t('routinesAddMed')} live={c.live} onPress={() => routinesRoutes.add({ type: 'Medication' })} />;
  if (!l.length) {
    if (p.size === 'S') return <View style={col}><Ic name="rt-med" color={color} /><Title size={14} style={{ marginTop: 10 }}>{t('routinesNoneYet')}</Title><Sub>{t('routinesTickHere')}</Sub><View style={auto}>{add}</View></View>;
    return <View style={[col, { justifyContent: 'flex-end' }]}><Title>{t('routinesNoMeds')}</Title><Sub lines={2} style={{ marginTop: 3 }}>{t('routinesNoMedsTile')}</Sub><View style={{ marginTop: 12 }}>{add}</View></View>;
  }
  const due = l.filter(i => !markOf(s, n.day, i.id));
  if (p.size === 'S') return <View style={col}><Num v={due.length} unit={t('routinesDue')} fs={30} /><Sub style={{ marginTop: 4 }}>{fill(t('routinesOfNToday'), { n: l.length })}</Sub>
    <View style={auto}>{due[0] ? <><Title size={13.5}>{due[0].name}</Title><Sub>{h12(due[0].h)}</Sub></> : <Sub>{t('routinesAllTaken')}</Sub>}</View></View>;
  return <View style={[col, { justifyContent: 'flex-end' }]}>{l.slice(0, 3).map((i, j) => <IRow key={i.id} i={i} c={c} next={false} h={38} first={j === 0} color={cOf(k, rById(s, i.routines[0]))} />)}</View>;
};

/* 10. This week */
const PCLS = (k: ReturnType<typeof useKit>, st: string, color: string) => (st === 'f' ? { backgroundColor: color }
  : st === 'p' ? { backgroundColor: alpha(color, 0.3), borderWidth: 1.3, borderColor: color }
    : st === 'm' ? { backgroundColor: alpha(k.c['text-muted'], 0.18) }
      : st === 'o' ? { borderWidth: 1, borderColor: k.c.hair }
        : { backgroundColor: alpha(color, 0.2), borderWidth: 1.3, borderColor: alpha(color, 0.6), borderStyle: 'dashed' as const });
const Week: Body = ({ p, c }) => {
  const k = useKit(), { s, n } = c, ahead = p.options.span === 'ahead', w = weekData(s, n, ahead), rs = s.routines.slice(0, 3);
  let tot = 0, dn = 0; w.forEach(d => d.cells.forEach(x => { tot += x.s; dn += x.d; }));
  const head = ahead ? <Num v={tot} unit={t('routinesItemsAhead')} fs={28} /> : <Num v={dn} unit={fill(t('routinesOfN'), { n: tot })} fs={28} />;
  const aria = ahead ? fill(t('routinesWeekAheadAria'), { n: tot }) : fill(t('routinesWeekPastAria'), { n: dn, m: tot });
  if (p.size === 'S') return <View style={col} accessible accessibilityRole="image" accessibilityLabel={aria}>{head}
    <Sub style={{ marginTop: 4 }}>{ahead ? t('routinesNext7') : t('routinesDoneThisWeek')}</Sub>
    <View style={[auto, { gap: 5 }]}>
      {rs.map((r, ri) => <View key={r.id} style={{ flexDirection: 'row' }}>{w.map(d => {
        const x = d.cells[ri], st = ({ f: 'f', p: 'p', m: 'm', o: 'o', l: 'l', o2: 'p' } as const)[x.st];
        return <View key={d.day} style={{ flex: 1, alignItems: 'center' }}><DotCell st={st} color={cOf(k, r)} size={11} /></View>;
      })}</View>)}
      <View style={{ flexDirection: 'row', marginTop: 3 }}>{w.map(d => <KitText key={d.day} weight={600} size={11} color={d.today ? 'text' : 'text-muted'} style={{ flex: 1, textAlign: 'center' }}>{weekLetter(d.wd)}</KitText>)}</View>
    </View>
  </View>;
  if (p.size === 'M') return <View style={{ flex: 1, flexDirection: 'row', gap: 14 }} accessible accessibilityRole="image" accessibilityLabel={aria}>
    <View style={{ width: 100 }}>{head}<Sub lines={2} style={{ marginTop: 4 }}>{ahead ? t('routinesScheduledNext7') : t('routinesDoneLast7')}</Sub>
      <View style={[auto, { gap: 3 }]}>{rs.map(r => <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Dot color={cOf(k, r)} size={7} /><Sub>{r.name}</Sub></View>)}</View>
    </View>
    <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>{w.map(d => <View key={d.day} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <View style={{ gap: 3 }}>{d.cells.map(x => <View key={x.r.id} style={[{ width: 22, height: 14, borderRadius: 5 }, PCLS(k, x.st, cOf(k, x.r))]} />)}</View>
      <KitText weight={700} size={11} color={d.today ? 'text' : 'text-muted'}>{weekLetter(d.wd)}</KitText>
      <KitText weight={700} size={11} numeric color="text-muted" style={{ opacity: 0.8 }}>{dateOf(d.day).getDate()}</KitText>
    </View>)}</View>
  </View>;
  const ch = Math.floor((176 - 14) / (rs.length + 1)) - 5, cw = (c.w - 62 - 35) / 7;
  const peptideDays = byType(s, 'Peptide').filter(i => i.days).map(i => `${i.name} on ${i.days!.map(x => WD[x]).join(', ')}`);
  return <View style={col} accessible accessibilityRole="image" accessibilityLabel={aria}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}><View style={{ flex: 1 }}>{head}</View><Sub>{ahead ? t('routinesScheduled') : t('routinesDoneLast7')}</Sub></View>
    <View style={[auto, { gap: 5 }]}>
      <View style={{ flexDirection: 'row', gap: 5 }}><View style={{ width: 62 }} />{w.map(d => <KitText key={d.day} weight={700} size={11} color={d.today ? 'text' : 'text-muted'} style={{ width: cw, textAlign: 'center', fontSize: 9.5 }}>{`${weekLetter(d.wd)} ${dateOf(d.day).getDate()}`}</KitText>)}</View>
      {rs.map((r, ri) => <View key={r.id} style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
        <View style={{ width: 62, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Dot color={cOf(k, r)} size={7} /><KitText weight={600} size={12} numberOfLines={1} style={{ flexShrink: 1 }}>{r.name}</KitText></View>
        {w.map(d => { const x = d.cells[ri]; return <View key={d.day} style={[{ width: cw, height: ch, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, PCLS(k, x.st, cOf(k, r))]}>
          {x.s ? ahead ? <KitText weight={700} size={11} numeric>{x.s}</KitText> : x.st === 'f' ? <Icon name="check" size={13} color={k.c['on-accent']} /> : <KitText weight={700} size={11} numeric color={x.st === 'm' ? 'text-muted' : 'text'}>{`${x.d}/${x.s}`}</KitText> : null}
        </View>; })}
      </View>)}
      <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
        <KitText weight={600} size={12} color="text-muted" style={{ width: 62 }}>{t('routinesAll')}</KitText>
        {w.map(d => { let ds = 0, dd = 0; d.cells.forEach(x => { ds += x.s; dd += x.d; });
          return <View key={d.day} style={{ width: cw, height: ch, alignItems: 'center', justifyContent: 'center' }}><KitText weight={700} size={11.5} numeric color={ds && dd >= ds ? 'text' : 'text-muted'}>{ds ? ahead ? String(ds) : `${dd}/${ds}` : '—'}</KitText></View>; })}
      </View>
    </View>
    {ahead ? <Sub lines={2} style={{ marginTop: 12 }}>{peptideDays.length ? `${t('routinesNotEveryDay')} ${peptideDays.join('; ')}` : t('routinesEveryItemDaily')}</Sub>
      : <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
        {([['f', t('routinesAllDone')], ['p', t('routinesSome')], ['l', t('routinesLaterToday')]] as const).map(([st, lbl], j) => <View key={st} style={{ flexDirection: 'row', alignItems: 'center', marginLeft: j ? 12 : 0 }}>
          <View style={[{ width: 10, height: 10, borderRadius: 3, marginRight: 5 }, PCLS(k, st, k.c.sleep)]} /><Sub>{lbl}</Sub></View>)}
      </View>}
  </View>;
};

/* 11. Shortcuts */
const Tools: Body = ({ p, c }) => {
  const k = useKit(), small = p.size === 'S', color = k.c.sleep;
  const items: [IconName, string, string, () => void][] = [
    ['plus', t('routinesNewRoutine'), t('routinesNewShort'), () => routinesRoutes.newRoutine()],
    ['rt-conv', t('routinesConverter'), t('routinesConvertShort'), () => routinesRoutes.converter()],
    ['pause', t('routinesPause'), t('routinesPause'), () => routinesRoutes.pause()],
    ['reorder', t('routinesEditRoutines'), t('routinesEditShort'), () => routinesRoutes.reorder()],
  ];
  return <View style={[col, { justifyContent: 'center' }]}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: small ? 10 : 8 }}>{items.map(([icon, label, short, go]) => <Tappable key={label} dim="row" disabled={!c.live} accessibilityRole="button" accessibilityLabel={label} onPress={go}
      style={{ width: small ? '50%' : '25%', alignItems: 'center', gap: 7 }}>
      <View style={{ width: small ? 38 : 44, height: small ? 38 : 44, borderRadius: small ? 12 : 14, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(color, 0.15) }}><Icon name={icon} size={small ? 19 : 21} color={color} /></View>
      <KitText weight={600} size={small ? 11 : 12} lineHeight={1.2} numberOfLines={1}>{small ? short : label}</KitText>
    </Tappable>)}</View>
  </View>;
};

/* ---------- header text and taps ---------- */

const read = () => { const st = activeRoutinesStore(); return st ? { s: st.read(), n: nowOf() } : null; };
const toNext = () => { const d = read(); const nx = d ? nextItem(d.s, d.n) : null; const rid = nx?.routines[0] ?? d?.s.routines[d.s.routines.length - 1]?.id; if (rid) routinesRoutes.detail(rid); };
const TILES: Record<string, { render: Body; meta?: (p: TileRenderProps) => string; open: (o: Record<string, string>) => void }> = {
  sun: { render: Sun, meta: () => sd(nowOf().day), open: toNext },
  next: { render: Next, meta: () => { const d = read(); const nx = d ? nextItem(d.s, d.n) : null; return nx && d ? rById(d.s, nx.routines[0])?.name ?? '' : ''; }, open: toNext },
  routine: { render: RoutineTile, open: o => { const d = read(); const r = d ? pickR(d.s, d.n, o.which) : null; if (r) routinesRoutes.detail(r.id); } },
  overview: { render: Overview, meta: p => { if (p.size === 'L') return ''; const d = read(); if (!d) return ''; const tt = todayItems(d.s, d.n); return fill(t('routinesNOfM'), { n: tt.filter(i => isDone(d.s, d.n, i)).length, m: tt.length }); }, open: () => routinesRoutes.reorder() },
  adherence: { render: Adherence, meta: p => { const d = read(); if (!d) return ''; return p.options.which && p.options.which !== 'all' ? whichName(d.s, p.options.which) : range30(d.n); }, open: o => routinesRoutes.history(o.which && o.which !== 'all' ? o.which : 'all') },
  streak: { render: Streak, meta: () => t('routinesDaysInARow'), open: o => routinesRoutes.history(o.which && o.which !== 'all' ? o.which : 'all') },
  supplies: { render: Supplies, meta: p => { const d = read(); if (!d) return ''; const low = supplies(d.s).filter(x => x.days < (+(p.options.flag ?? 10) || 10)).length; return low ? fill(t('routinesNLow'), { n: low }) : t('routinesAllStocked'); }, open: () => routinesTab.set('supplements') },
  peptides: { render: PeptidesTile, meta: p => { if (p.options.show === 'sites' && p.size === 'M') return t('routinesLastUsedMeta'); const d = read(); const v = d ? byType(d.s, 'Peptide').length : 0; return plural(v, t('routinesVial'), t('routinesVials')); }, open: () => routinesTab.set('peptides') },
  meds: { render: Meds, meta: () => { const d = read(); if (!d) return ''; const l = byType(d.s, 'Medication'); return l.length ? fill(t('routinesNOfM'), { n: l.filter(i => isDone(d.s, d.n, i)).length, m: l.length }) : ''; }, open: () => routinesTab.set('medications') },
  week: { render: Week, meta: p => { const d = read(); if (!d) return ''; const w = weekData(d.s, d.n, p.options.span === 'ahead'); const a = w[0].day, b = w[6].day; return `${monthDay(a)} to ${dateOf(a).getMonth() !== dateOf(b).getMonth() ? monthDay(b) : dateOf(b).getDate()}`; }, open: () => routinesRoutes.history() },
  tools: { render: Tools, open: () => routinesRoutes.reorder() },
};
/** Every tile id this file builds, for tests. */
export const ROUTINES_TILE_IDS = Object.keys(TILES);

let done = false;
/** Builds every Routines tile once, before the tab first draws. */
export function registerRoutinesTiles() {
  if (done) return; done = true;
  for (const [id, x] of Object.entries(TILES)) implementTile('routines', id, { render: tile(x.render), meta: x.meta, open: x.open });
}
registerRoutinesTiles();

