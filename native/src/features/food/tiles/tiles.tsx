import type { ComponentType } from 'react';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Icon, KitText, Tappable, alpha, mix, useKit } from '@/components/kit';
import type { Repository } from '@/data/repository';
import { t } from '@/i18n/en';
import { fill } from '../../tiles/ui';
import type { TileRenderProps } from '../../tiles/types';
import { addSaved, addWater, comboKcal, comboProtein, mealName, quickAdd } from '../actions';
import { clock, daySums, eatingWindow, foodsLine, grams, kcalOf, num, oftenFoods, plural, shortDate, streak, weekDays, weekday, type DayView } from '../day';
import { combos, recentFoods, shiftDay, type Food } from '../model';
import { foodRoutes } from '../nav';
import { burnedOn, pickFoodDay } from '../selection';
import { Cells, Gauge, MACRO_COLOR, MacroRings, SplitBar, WaterIcon, WellBar, macroPercents, meter } from '../ui';
import { litresOn, quickContainers, sizeNum, sizeSpoken, sizeText, unitLabel, waterAmt, waterNum, type Container } from '../water';
import { B, Cols, Dot, Hair, Ic, KV, Kick, Num, Plate, Plus, Stripes, Sub, TileButton, Title, useDayData, useShade, useTileDay } from './kit';

type Data = ReturnType<typeof useDayData>;
type TileBody = ComponentType<{ p: TileRenderProps; repo: Repository; d: Data }>;
const tx = (key: Parameters<typeof t>[0], v: Record<string, string | number> = {}) => fill(t(key), v);
const KC = () => t('foodKcal');
const WD1 = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAYN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function Host({ p, Body }: { p: TileRenderProps; Body: TileBody }) {
  const repo = useTileDay();
  return repo ? <Inner p={p} repo={repo} Body={Body} /> : null;
}
function Inner({ p, repo, Body }: { p: TileRenderProps; repo: Repository; Body: TileBody }) {
  const d = useDayData(repo);
  return <Body p={p} repo={repo} d={d} />;
}
/** Wraps a tile body so it reads the day, the food and the water it shows. */
export const tile = (Body: TileBody) => (p: TileRenderProps) => <Host p={p} Body={Body} />;

const col = { flex: 1, flexDirection: 'column' } as const;
const live = (p: TileRenderProps) => !p.editing && !p.preview;
/** The day picked in the strip, as the tile headers read it: Today, or Sat, Nov 21. */
export const dayLabel = (d: { isToday: boolean; day: string }) => d.isToday ? t('foodToday') : shortDate(d.day);
/** Nov 16 to 22. */
export function weekOf(day: string) {
  const days = weekDays(day), [a, b] = [days[0], days[6]].map(x => new Date(`${x}T12:00:00`));
  const m = (x: Date) => x.toLocaleDateString('en-US', { month: 'short' });
  return m(a) === m(b) ? `${m(a)} ${a.getDate()} to ${b.getDate()}` : `${m(a)} ${a.getDate()} to ${m(b)} ${b.getDate()}`;
}
const dayIndexTap = (d: Data) => (i: number) => { const day = weekDays(d.day)[i]; if (day <= d.today) pickFoodDay(day); };

/* 1. Calories */
const Calories: TileBody = ({ p, d }) => {
  const k = useKit(), shade = useShade(), v = d.view, over = v.left < 0, eat = p.options.lead === 'eaten';
  const big = eat ? v.eaten : Math.abs(v.left), word = eat ? t('foodEaten') : over ? t('foodOver') : t('foodLeft');
  const label = tx('foodCalA11y', { eaten: num(v.eaten), goal: num(v.goal), left: num(Math.abs(v.left)), word: over ? t('foodOver') : t('foodLeft') });
  const g = (sz: number, fs: number, sw?: number) => <Gauge frac={v.eaten / v.goal} size={sz} sw={sw} color={over ? k.c.warning : k.c.food} fs={fs} us={sz > 120 ? 12 : 10.5}
    value={num(big)} unit={`${KC()} ${word}`} label={label} />;
  const burned = v.burned == null ? '–' : num(v.burned);
  if (p.size === 'S') return <View style={[col, { alignItems: 'center', justifyContent: 'flex-end' }]}>
    {g(104, 24)}
    <Sub style={{ marginTop: -8 }}>{eat ? `${num(Math.abs(v.left))} ${over ? t('foodOver') : tx('foodLeftOf')} ` : `${t('foodOf')} `}{num(v.goal)} {KC()}</Sub>
  </View>;
  const kvs = (gap: number, more?: boolean) => <View style={{ flex: 1, gap }}>
    <KV k={eat ? t('foodLeftCap') : t('foodEatenCap')} v={num(eat ? Math.abs(v.left) : v.eaten)} unit={KC()} /><Hair />
    <KV k={t('foodGoal')} v={num(v.goal)} unit={KC()} /><Hair />
    <KV k={t('foodBurnedCap')} v={burned} unit={v.burned == null ? undefined : KC()} after={more ? undefined : <IconFlame />} />
    {more ? <><Hair /><KV k={t('foodMealsCap')} v={String(v.logged)} unit={tx('foodOfN', { n: v.meals.length })} /></> : null}
  </View>;
  if (p.size === 'M') return <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 18 }}>{g(118, 25, 9)}{kvs(9)}</View>;
  const tot = Math.max(v.goal, v.eaten);
  return <View style={col}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>{g(140, 30, 11)}{kvs(8, true)}</View>
    <View style={{ marginTop: 'auto' }}>
      <View style={{ flexDirection: 'row', marginBottom: 8 }}><Kick style={{ flex: 1 }}>{t('foodByMeal')}</Kick><Sub size={11.5}>{num(v.eaten)} {t('foodOf')} {num(tot)} {KC()}</Sub></View>
      <View accessible accessibilityRole="image" accessibilityLabel={`${t('foodByMealA11y')} ${v.meals.map(m => `${m.name} ${m.empty ? t('foodNotLogged') : `${num(m.kcal)} ${KC()}`}`).join(', ')}`}
        style={{ flexDirection: 'row', gap: 2, height: 12, borderRadius: 999, overflow: 'hidden' }}>
        {v.meals.map((m, i) => m.kcal > 0 ? <View key={m.id} style={{ flex: m.kcal, backgroundColor: shade(i) }} /> : null)}
        {v.left > 0 ? <View style={{ flex: v.left, backgroundColor: k.dark ? mix(k.c.surface, '#000000', 0.66) : mix(k.c.bg, k.c.text, 0.93), borderTopRightRadius: 999, borderBottomRightRadius: 999 }} /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>{v.meals.slice(0, 4).map((m, i) => <View key={m.id} style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Dot color={shade(i)} /><Sub size={11.5}>{m.name}</Sub></View>
        <KitText weight={700} size={15} lineHeight={1.2} numeric color={m.empty ? 'text-muted' : 'text'} style={{ marginTop: 4 }}>
          {m.empty ? t('foodNone') : num(m.kcal)}{m.empty ? null : <KitText weight={600} size={10.5} color="text-muted">{` ${KC()}`}</KitText>}
        </KitText>
      </View>)}</View>
    </View>
  </View>;
};
function IconFlame() { const k = useKit(); return <Icon name="flame" size={13} color={k.c.warning} />; }

/* 2. Macros */
const MAC = [['p', 'foodMacroProtein'], ['c', 'foodMacroCarbs'], ['f', 'foodMacroFat'], ['fib', 'foodMacroFiber']] as const;
const Macros: TileBody = ({ p, d }) => {
  const k = useKit(), v = d.view, left = p.options.show === 'left';
  const g = (key: typeof MAC[number][0]) => Math.round(Math.max(0, v[key]));
  const goal = (key: typeof MAC[number][0]) => Math.round(v.goals[key]);
  const shown = (key: typeof MAC[number][0]) => left ? Math.max(0, goal(key) - g(key)) : g(key);
  const aria = MAC.map(([key, name]) => tx('foodOfGrams', { name: t(name), v: g(key), goal: goal(key) })).join(', ');
  const c = (key: typeof MAC[number][0]) => k.tok(MACRO_COLOR[key]);
  if (p.size === 'S') return <View accessible accessibilityRole="image" accessibilityLabel={aria} style={[col, { alignItems: 'center' }]}>
    <MacroRings size={76} values={MAC.slice(0, 3).map(([key]) => ({ frac: g(key) / goal(key), color: c(key) }))} />
    <View style={{ flexDirection: 'row', width: '100%', marginTop: 'auto', paddingTop: 4 }}>{MAC.slice(0, 3).map(([key, name]) => <View key={key} style={{ flex: 1, alignItems: 'center', minWidth: 0 }}>
      <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: c(key) }} />
      <KitText weight={700} size={15} lineHeight={1} numeric style={{ marginTop: 5 }}>{shown(key)}<KitText weight={600} size={10} color="text-muted">g</KitText></KitText>
      <Sub size={10.5} style={{ marginTop: 3 }}>{t(name)}</Sub>
    </View>)}</View>
  </View>;
  const sp = macroPercents(v.p, v.c, v.f);
  const split = (h: number) => <View accessible accessibilityRole="image" accessibilityLabel={tx('foodSplitA11y', { p: sp.pc[0], c: sp.pc[1], f: sp.pc[2] })}>
    <SplitBar h={h} parts={[{ v: sp.kcal[0], color: c('p') }, { v: sp.kcal[1], color: c('c') }, { v: sp.kcal[2], color: c('f') }]} /></View>;
  if (p.size === 'M') return <View accessible accessibilityLabel={aria} style={col}>
    <View style={{ flexDirection: 'row', gap: 14 }}>{MAC.map(([key, name]) => <View key={key} style={{ flex: 1, minWidth: 0 }}>
      <Sub size={12}>{t(name)}{left ? ` ${t('foodLeft')}` : ''}</Sub>
      <KitText weight={700} size={19} lineHeight={1.1} tracking={-0.02} numeric numberOfLines={1} style={{ marginTop: 4, marginBottom: 8 }}>
        {shown(key)}<KitText weight={600} size={11} color="text-muted">/{goal(key)} g</KitText>
      </KitText>
      <Cells states={meter(g(key) / goal(key), 8)} color={c(key)} h={8} gap={2} r={2} />
    </View>)}</View>
    <View style={{ marginTop: 'auto' }}>
      {split(8)}
      <Sub size={11.5} style={{ marginTop: 7 }}>{t('foodFromProtein')} <B>{sp.pc[0]}%</B> · {t('foodCarbsLower')} <B>{sp.pc[1]}%</B> · {t('foodFatLower')} <B>{sp.pc[2]}%</B></Sub>
    </View>
  </View>;
  return <View style={col}>
    <Kick>{t('foodWhereFrom')}</Kick>
    <View style={{ marginTop: 9 }}>{split(12)}</View>
    <View style={{ flexDirection: 'row', gap: 12, marginTop: 9 }}>{MAC.slice(0, 3).map(([key, name], i) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Dot color={c(key)} /><KitText weight={600} size={11.5} color="text-muted">{t(name)} </KitText><KitText weight={700} size={12} numeric>{sp.pc[i]}%</KitText></View>)}</View>
    <View style={{ gap: 19, marginTop: 'auto' }}>{MAC.map(([key, name]) => {
      const gg = g(key), gl = goal(key), togo = gl - gg;
      return <View key={key} accessible accessibilityLabel={tx('foodOfGrams', { name: t(name), v: gg, goal: gl })} style={{ flexDirection: 'row', alignItems: 'center', columnGap: 10 }}>
        <View style={{ width: 70, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Dot color={c(key)} /><KitText weight={600} size={13} lineHeight={1}>{t(name)}</KitText></View>
          <KitText weight={500} size={11} lineHeight={1} color="text-muted" numberOfLines={1}>{togo > 0 ? tx('foodGToGo', { g: togo }) : t('foodTargetMet')}</KitText>
        </View>
        <WellBar frac={gg / gl} h={8} color={c(key)} />
        <KitText weight={700} size={14} lineHeight={1} numeric style={{ width: 74, textAlign: 'right' }}>{left ? Math.max(0, togo) : gg}<KitText weight={600} size={10.5} color="text-muted">/{gl} g</KitText></KitText>
      </View>;
    })}</View>
  </View>;
};

/* 3. Protein */
const PER_MEAL = 40;
function proteinWeek(repo: Repository, d: Data) { return daySums(repo, weekDays(d.day)).map((x, i) => weekDays(d.day)[i] > d.today ? null : x.p); }
function MealBars({ d, rowH, gap, w }: { d: Data; rowH: number; gap: number; w: number }) {
  const k = useKit(), meals = d.view.meals, mx = Math.max(PER_MEAL * 1.6, Math.max(...meals.map(m => m.p)) * 1.05);
  return <View style={{ gap }}>{meals.map(m => <View key={m.id} accessible accessibilityLabel={`${m.name} ${m.empty ? t('foodNotLogged') : tx('foodGramsProtein', { g: Math.round(m.p) })}`}
    style={{ flexDirection: 'row', alignItems: 'center', columnGap: 10, height: rowH }}>
    <KitText weight={600} size={12.5} numberOfLines={1} style={{ width: 66 }}>{m.name}</KitText>
    <WellBar frac={m.p / mx} h={8} color={k.c.food} mark={PER_MEAL / mx} dim={m.p < PER_MEAL} width={w - 66 - 40 - 20} />
    <KitText weight={700} size={13.5} lineHeight={1} numeric color={m.empty ? 'text-muted' : 'text'} style={{ width: 40, textAlign: 'right' }}>
      {m.empty ? t('foodNone') : Math.round(m.p)}{m.empty ? null : <KitText weight={600} size={10} color="text-muted"> g</KitText>}</KitText>
  </View>)}</View>;
}
const Protein: TileBody = ({ p, repo, d }) => {
  const k = useKit(), v = d.view, goal = Math.round(v.goals.p), pr = Math.round(v.p), togo = goal - pr, meal = p.options.view === 'meal';
  const hitM = v.meals.filter(m => m.p >= PER_MEAL).length, nMeals = v.meals.length;
  const wk = proteinWeek(repo, d), sel = weekday(d.day);
  const wkCols = (H: number, cw: number) => <Cols vals={wk} H={H} cw={cw} max={Math.max(goal * 1.15, Math.max(0, ...wk.map(x => x ?? 0)) * 1.04)} goal={goal} sel={sel}
    live={weekDays(d.day).indexOf(d.today)} labels={WD1} onDay={live(p) ? dayIndexTap(d) : undefined} aria={(i, x) => `${DAYN[i]}, ${x == null ? t('foodNothingLogged') : tx('foodGramsProtein', { g: Math.round(x) })}`}
    label={tx('foodProteinByDay', { g: goal })} />;
  const toGo = togo > 0 ? <><B>{togo} g</B> {t('foodToGoWord')}</> : t('foodTargetMet');
  if (p.size === 'S') {
    if (meal) return <View style={col}><Num v={String(hitM)} unit={tx('foodOfN', { n: nMeals })} fs={30} /><Sub style={{ marginTop: 4 }}>{t('foodMealsAt40')}</Sub>
      <View style={{ marginTop: 'auto' }}><Cols vals={v.meals.map(m => m.p)} H={50} cw={16} max={70} goal={PER_MEAL} labels={v.meals.map(m => m.name.charAt(0))}
        aria={(i, x) => `${v.meals[i].name} ${Math.round(x ?? 0)} g`} label={t('foodProteinByMeal')} /></View></View>;
    return <View style={col}><Num v={String(pr)} unit="g" fs={32} /><Sub style={{ marginTop: 4 }}>{tx('foodOfTarget', { g: goal })}</Sub>
      <View style={{ marginTop: 'auto' }}><WellBar frac={pr / goal} h={10} color={k.c.food} /><Sub style={{ marginTop: 8 }}>{toGo}</Sub></View></View>;
  }
  if (p.size === 'M') {
    if (meal) return <View style={col}><View style={{ marginTop: 'auto' }}><MealBars d={d} rowH={22} gap={7} w={p.body.w} /></View></View>;
    return <View style={{ flex: 1, flexDirection: 'row', gap: 16 }}>
      <View style={{ width: 112, ...col }}><Num v={String(pr)} unit="g" fs={30} /><Sub style={{ marginTop: 4 }}>{tx('foodOfG', { g: goal })}</Sub>
        <View style={{ marginTop: 'auto' }}><WellBar frac={pr / goal} h={8} color={k.c.food} width={112} /><Sub style={{ marginTop: 7 }}>{toGo}</Sub></View></View>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>{wkCols(72, 18)}</View>
    </View>;
  }
  const closers = recentFoods(repo).filter(f => typeof f.protein_g === 'number' && f.protein_g >= 10 && kcalOf(f.energy_kj))
    .sort((a, b) => Number(b.protein_g) / kcalOf(b.energy_kj)! - Number(a.protein_g) / kcalOf(a.energy_kj)!).slice(0, 2);
  const mn = mealName(repo, d.next).toLowerCase();
  return <View style={col}>
    <Num v={String(pr)} unit={tx('foodOfG', { g: goal })} fs={30} />
    <Sub style={{ marginTop: 5 }}>{togo > 0 ? <><B>{togo} g</B> {t('foodToGoWord')}{d.isToday ? '' : ` ${t('foodThatDay')}`}</> : t('foodTargetMet')}{meal ? ` · ${tx('foodMealsAt40Of', { n: hitM, of: nMeals })}` : ''}</Sub>
    <View style={{ marginTop: 14 }}>{meal ? <MealBars d={d} rowH={20} gap={6} w={p.body.w} /> : wkCols(64, 22)}</View>
    <View style={{ marginTop: 'auto' }}>
      <Kick style={{ marginBottom: 4 }}>{d.isToday ? tx('foodCloseGapTo', { meal: mn }) : t('foodCloseGapToday')}</Kick>
      {closers.length ? closers.map((f, i) => <FoodQuickRow key={String(f.name)} f={f} h={38} first={i === 0} repo={repo} d={d} sm />) : <Sub>{t('foodNoCloser')}</Sub>}
    </View>
  </View>;
};
function FoodQuickRow({ f, h, first, repo, d, sm, sub }: { f: Food; h: number; first: boolean; repo: Repository; d: Data; sm?: boolean; sub?: string }) {
  const k = useKit(), kcal = kcalOf(f.energy_kj), pg = typeof f.protein_g === 'number' ? Math.round(f.protein_g) : null, name = String(f.name);
  const serving = typeof f.amount_g === 'number' ? `${grams(f.amount_g)} g` : t('foodOneServing');
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: h, borderTopWidth: first ? 0 : 1, borderTopColor: k.c.hair }}>
    <Tappable dim="row" accessibilityRole="button" accessibilityLabel={`${name}, ${serving}${pg != null ? `, ${tx('foodGramsProtein', { g: pg })}` : ''}${kcal != null ? `, ${num(kcal)} ${KC()}` : ''}. ${t('foodShowDetails')}`}
      onPress={() => foodRoutes.item({ food: f, meal: d.next, day: d.today })} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch' }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Title size={sm ? 13.5 : 14}>{sm ? name.split(',')[0] : name}</Title>
        <Sub size={11.5}>{sub ?? `${serving}${kcal != null ? ` · ${num(kcal)} ${KC()}` : ''}`}</Sub>
      </View>
      {sm && pg != null ? <KitText weight={700} size={14.5} lineHeight={1} numeric>{pg}<KitText weight={600} size={11} color="text-muted"> g</KitText></KitText> : null}
    </Tappable>
    <Plus label={tx('foodAddTo', { food: name, meal: mealName(repo, d.next).toLowerCase() })} onPress={() => quickAdd(repo, d.today, d.next, f)} />
  </View>;
}

/* 4. Meals */
const Meals: TileBody = ({ p, repo, d }) => {
  const k = useKit(), shade = useShade(), v = d.view, pv = p.options.value === 'p', today = d.isToday;
  const val = (m: DayView['meals'][number]) => pv ? <>{Math.round(m.p)}<KitText weight={600} size={11} color="text-muted"> g</KitText></> : <>{num(m.kcal)}<KitText weight={600} size={11} color="text-muted">{` ${KC()}`}</KitText></>;
  const open = (m: DayView['meals'][number]) => m.empty ? foodRoutes.log(m.id) : foodRoutes.meal(m.id);
  if (p.size === 'S') {
    const nx = v.meals.find(m => m.empty);
    if (!today || !nx) return <View style={col}><Num v={String(v.logged)} unit={tx('foodOfN', { n: v.meals.length })} fs={30} /><Sub style={{ marginTop: 4 }}>{t('foodMealsLogged')}</Sub>
      <View style={{ marginTop: 'auto', gap: 4 }}>{v.meals.map((m, i) => <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Dot color={shade(i)} /><Sub size={11.5} style={{ flex: 1 }}>{m.name}</Sub><Sub size={11.5} color="text">{pv ? `${Math.round(m.p)} g` : num(m.kcal)}</Sub></View>)}</View></View>;
    return <View style={col}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Ic name={nx.icon} /><Kick>{t('foodUpNext')}</Kick></View>
      <KitText weight={700} size={19} lineHeight={1.2} numberOfLines={1} style={{ marginTop: 10 }}>{nx.name}</KitText>
      <Sub style={{ marginTop: 2 }}>{v.left > 0 ? pv ? tx('foodProteinLeft', { g: Math.max(0, Math.round(v.goals.p - v.p)) }) : `${num(v.left)} ${KC()} ${t('foodLeft')}` : t('foodGoalReached')}</Sub>
      <View style={{ marginTop: 'auto' }}><TileButton sm full icon="plus" label={tx('foodAddMealNamed', { meal: nx.name.toLowerCase() })} onPress={() => foodRoutes.log(nx.id)} /></View>
    </View>;
  }
  if (p.size === 'M') {
    const w = (p.body.w - 8) / 2;
    return <View style={col}><View style={{ marginTop: 'auto', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{v.meals.slice(0, 4).map(m => {
      const none = m.empty;
      return <Tappable key={m.id} dim="fill" disabled={!today} accessibilityRole={today ? 'button' : undefined}
        accessibilityLabel={`${m.name}${none ? `, ${t('foodNothingLoggedAdd')}` : `, ${num(m.kcal)} ${KC()}, ${tx('foodGramsProtein', { g: Math.round(m.p) })}`}`} onPress={() => open(m)}>
        <Plate w={w} h={55} none={none} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 9, paddingRight: 8 }}>
          <Ic name={m.icon} outline={none} />
          <View style={{ flex: 1, minWidth: 0 }}><Title size={13.5}>{m.name}</Title><Sub size={11.5}>{none ? t('foodNotLoggedCap') : pv ? tx('foodGProtein', { g: Math.round(m.p) }) : `${num(m.kcal)} ${KC()}`}</Sub></View>
          {none ? <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(k.c.food, 0.16) }}><PlusGlyph color={k.c.food} /></View> : null}
        </Plate>
      </Tappable>;
    })}</View></View>;
  }
  return <View style={col}>
    <View>{v.meals.map((m, i) => {
      const none = m.empty, sub = none ? t('foodNothingYet') : today ? foodsLine(m.items) : tx('foodGProtein', { g: Math.round(m.p) });
      return <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderTopWidth: i ? 1 : 0, borderTopColor: k.c.hair }}>
        <Tappable dim="row" disabled={!today} accessibilityRole={today ? 'button' : undefined} onPress={() => open(m)}
          accessibilityLabel={`${m.name}${none ? `, ${t('foodNothingYetLower')}` : pv ? `, ${tx('foodGramsProtein', { g: Math.round(m.p) })}` : `, ${num(m.kcal)} ${KC()}`}`}
          style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch' }}>
          <Ic name={m.icon} outline={none} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7 }}><Title size={14} style={{ flexShrink: 0 }}>{m.name}</Title>
              {m.time && !none ? <Sub size={11.5}>{clock(m.time)}</Sub> : null}</View>
            <Sub size={12}>{sub}</Sub>
          </View>
          {none ? null : <KitText weight={700} size={14.5} lineHeight={1} numeric>{val(m)}</KitText>}
        </Tappable>
        {today ? <Plus label={tx('foodAddFoodTo', { meal: m.name.toLowerCase() })} onPress={() => foodRoutes.log(m.id)} /> : null}
      </View>;
    })}</View>
    <View style={{ marginTop: 'auto' }}>
      {today ? <View style={{ flexDirection: 'row', gap: 8 }}>
        <TileButton sm ghost icon="copy" label={t('foodCopyYesterday')} onPress={foodRoutes.copy} />
        <TileButton sm ghost icon="bookmark" label={t('foodSavedMeals')} onPress={() => foodRoutes.saved(d.next)} />
      </View> : <Sub>{tx('foodLoggedClosed', { day: shortDate(d.day) })}</Sub>}
    </View>
  </View>;
};
function PlusGlyph({ color }: { color: string }) { return <Icon name="plus" size={17} color={color} />; }

/* 5. Water */
function WaterButton({ c, compact, onPress, unit }: { c: Container; compact: boolean; onPress: () => void; unit: 'oz' | 'ml' }) {
  const k = useKit();
  return <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={tx('foodAddContainer', { name: c.name, size: sizeSpoken(c.oz, unit) })} onPress={onPress}
    style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 13, paddingHorizontal: compact ? 2 : 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: compact ? 3 : 5, backgroundColor: alpha(k.c.water, 0.14) }}>
    <WaterIcon name={c.icon} size={17} color={k.c.water} />
    <KitText weight={700} size={13.5} numeric color={k.c.water} numberOfLines={1}>{compact ? sizeNum(c.oz, unit) : sizeText(c.oz, unit)}{compact ? <KitText weight={600} size={11} color={k.c.water}>{unitLabel(unit)}</KitText> : null}</KitText>
  </Tappable>;
}
function WaterRow({ cs, repo, d, compact, style }: { cs: Container[]; repo: Repository; d: Data; compact?: boolean; style?: object }) {
  return <View style={[{ flexDirection: 'row', gap: 8 }, style]}>{cs.map(c => <WaterButton key={c.id} c={c} unit={d.water.unit} compact={!!compact || cs.length > 2} onPress={() => addWater(repo, d.today, { c })} />)}</View>;
}
const Water: TileBody = ({ p, repo, d }) => {
  const k = useKit(), W = d.water, u = W.unit, l = litresOn(W, d.day), goal = W.goal, left = Math.max(0, goal - l), qs = quickContainers(W), un = unitLabel(u);
  const showLeft = p.options.show === 'left';
  let big = showLeft ? <Num v={waterNum(left, u)} unit={`${un} ${t('foodLeft')}`} fs={30} /> : <Num v={waterNum(l, u)} unit={`${t('foodOf')} ${waterNum(goal, u)} ${un}`} fs={30} />;
  const togo = left > 0.005 ? showLeft ? tx('foodWaterSoFar', { v: waterNum(l, u), goal: waterAmt(goal, u) }) : tx('foodWaterToGo', { v: waterAmt(left, u) }) : t('foodGoalReached');
  const cells = (n: number) => <View accessible accessibilityRole="image" accessibilityLabel={`${waterNum(l, u)} ${t('foodOf')} ${waterAmt(goal, u)}`}><Cells states={meter(l / goal, n)} color={k.c.water} h={9} gap={2} r={2} /></View>;
  if (p.size === 'S') {
    if (!showLeft) big = <Num v={waterNum(l, u)} unit={un} fs={30} />;
    return <View style={col}>{big}<Sub style={{ marginTop: 4 }}>{togo}</Sub><View style={{ marginTop: 'auto' }}>{cells(12)}</View>
      {d.isToday ? <WaterRow cs={qs.slice(0, 2)} repo={repo} d={d} compact style={{ marginTop: 10 }} /> : <Sub style={{ marginTop: 12 }}>{dayLabel(d)}</Sub>}</View>;
  }
  const days = weekDays(d.day), ww = days.map(x => x > d.today ? null : litresOn(W, x));
  const past = ww.slice(0, 6).filter((x): x is number => x != null);
  const head = <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
    <View style={{ flex: 1 }}>{big}<Sub style={{ marginTop: 4 }}>{togo}</Sub></View>
    {p.size === 'M' ? d.isToday ? <Sub style={{ flexShrink: 0 }}>{tx('foodDrinksToday', { n: plural((W.log[d.day] ?? []).length, t('foodDrink'), t('foodDrinks')) })}</Sub> : null
      : <Sub>{t('foodWeekAverage')} <B>{waterAmt(past.length ? past.reduce((a, b) => a + b, 0) / past.length : 0, u)}</B></Sub>}
  </View>;
  if (p.size === 'M') return <View style={col}>{head}<View style={{ marginTop: 12 }}>{cells(20)}</View>
    {d.isToday ? <WaterRow cs={qs} repo={repo} d={d} style={{ marginTop: 'auto' }} /> : <Sub style={{ marginTop: 'auto' }}>{shortDate(d.day)}</Sub>}</View>;
  return <View style={col}>{head}<View style={{ marginTop: 12 }}>{cells(20)}</View>
    <View style={{ marginTop: 14 }}><Cols vals={ww} H={100} cw={18} max={goal * 1.25} goal={goal} sel={weekday(d.day)} live={days.indexOf(d.today)} color="water" labels={WD1}
      onDay={live(p) ? dayIndexTap(d) : undefined} vfmt={x => waterNum(x, u)} aria={(i, x) => `${DAYN[i]}, ${x == null ? t('foodNothingLogged') : waterAmt(x, u)}`} label={tx('foodWaterByDay', { goal: waterAmt(goal, u) })} /></View>
    {d.isToday ? <WaterRow cs={qs} repo={repo} d={d} style={{ marginTop: 'auto' }} /> : <Sub style={{ marginTop: 'auto' }}>{tx('foodLoggedClosed', { day: shortDate(d.day) })}</Sub>}
  </View>;
};

/* 6. This week */
const Week: TileBody = ({ p, repo, d }) => {
  const pv = p.options.measure === 'p', lastMode = p.options.compare === 'last', u = pv ? 'g' : KC(), goal = pv ? d.view.goals.p : d.view.goal;
  const days = weekDays(d.day), cur = daySums(repo, days), prevS = daySums(repo, days.map(x => shiftDay(x, -7)));
  const vals = cur.map((x, i) => days[i] > d.today ? null : pv ? x.p : x.kcal), prev = prevS.map(x => pv ? x.p : x.kcal);
  const liveI = days.indexOf(d.today), full = liveI >= 0 ? liveI : 7;
  const known = (a: (number | null)[]) => a.slice(0, full).filter((x): x is number => x != null);
  const avgOf = (a: (number | null)[]) => { const k2 = known(a); return k2.length ? Math.round(k2.reduce((x, y) => x + y, 0) / k2.length) : 0; };
  const avg = avgOf(vals), pavg = avgOf(prev), onT = known(vals).filter(x => Math.abs(x - goal) <= goal * 0.1).length;
  const mx = Math.max(goal * 1.18, ...[...vals, ...(lastMode ? prev : [])].map(x => (x ?? 0) * 1.04));
  const VF = (x: number) => num(x), dlt = avg - pavg;
  const C = (H: number, cw: number, vl?: boolean, ls?: number) => <Cols vals={vals} H={H} cw={cw} max={mx} goal={lastMode ? null : goal} band={lastMode ? null : 0.1} last={lastMode ? prev : null}
    sel={weekday(d.day)} live={liveI >= 0 ? liveI : null} vlab={vl} labels={WD1} labelSize={ls} vfmt={x => pv ? String(Math.round(x)) : `${(x / 1000).toFixed(1)}k`}
    onDay={live(p) ? dayIndexTap(d) : undefined} label={pv ? t('foodProteinByDayPlain') : t('foodCaloriesByDay')}
    aria={(i, x) => `${DAYN[i]}, ${x == null ? t('foodNothingLogged') : `${VF(x)} ${u}${i === liveI ? ` ${t('foodSoFar')}` : ''}`}${lastMode ? `, ${t('foodWeekBefore')} ${prev[i] == null ? t('foodNothingLogged') : VF(prev[i]!)}` : ''}`} />;
  const cmp = tx(dlt >= 0 ? 'foodMoreADay' : 'foodLessADay', { v: num(Math.abs(dlt)), u });
  if (p.size === 'S') return <View style={col}>
    {lastMode ? <><Num v={VF(avg)} unit={u} fs={26} /><Sub style={{ marginTop: 4 }}>{dlt >= 0 ? '+' : '−'}{num(Math.abs(dlt))} {u} {t('foodADay')}</Sub></>
      : <><Num v={String(onT)} unit={tx('foodOfN', { n: full })} fs={30} /><Sub style={{ marginTop: 4 }}>{t('foodDaysOnGoal')}</Sub></>}
    <View style={{ marginTop: 'auto' }}>{C(48, 12, false, 9.5)}</View>
  </View>;
  if (p.size === 'M') return <View style={{ flex: 1, flexDirection: 'row', gap: 16 }}>
    <View style={{ width: 104, ...col }}><Num v={VF(avg)} unit={u} fs={24} /><Sub style={{ marginTop: 4 }}>{t('foodDailyAverageLower')}</Sub>
      <Sub lines={3} style={{ marginTop: 'auto', lineHeight: 16 }}>{lastMode ? <><B>{num(Math.abs(dlt))} {u}</B> {t(dlt >= 0 ? 'foodMoreThanLast' : 'foodLessThanLast')}</> : <><B>{tx('foodNOfM', { n: onT, m: full })}</B> {t('foodWithin10')}</>}</Sub></View>
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>{C(76, 18)}</View>
  </View>;
  const k = useKit();
  return <View style={col}>
    <Num v={VF(avg)} unit={`${u} ${t('foodADay')}`} fs={30} />
    <Sub style={{ marginTop: 5 }}>{lastMode ? cmp : tx('foodDaysWithin', { n: onT, m: full })}</Sub>
    <View style={{ marginTop: 'auto' }}>{C(150, 26, true)}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 14 }}>
        {lastMode ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 12, height: 2, backgroundColor: k.c.text, opacity: 0.6 }} /><KitText weight={600} size={11.5} color="text-muted">{t('foodWeekBeforeCap')}</KitText></View>
          : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Svg width={14} height={2}><Line x1={0} y1={1} x2={14} y2={1} stroke={alpha(k.c.text, 0.5)} strokeWidth={1.5} strokeDasharray="4 3" /></Svg>
            <KitText weight={600} size={11.5} color="text-muted">{tx('foodGoalLegend', { v: VF(Math.round(goal)), u })}</KitText></View>}
        <View style={{ flex: 1 }} /><Sub size={11.5}>{t('foodTapADay')}</Sub>
      </View>
    </View>
  </View>;
};

/* 7. Nutrients */
export interface Nu { key: string; v: number | null; goal: number; u: string; limit?: boolean; color?: string }
export function nutrients(v: DayView): { reach: Nu[]; limit: Nu[] } {
  const known = (key: 'sugar' | 'sodium') => v.items.some(i => i[key] != null) ? v.items.reduce((a, i) => a + (i[key] ?? 0), 0) : null;
  return {
    reach: [{ key: t('foodMacroFiber'), v: Math.round(v.fib), goal: v.goals.fib, u: 'g', color: 'success' },
      ...(['foodPotassium', 'foodCalcium', 'foodIron', 'foodVitaminC', 'foodVitaminD'] as const).map((key, i) => ({ key: t(key), v: null, goal: [3400, 1000, 8, 90, 15][i], u: ['mg', 'mg', 'mg', 'mg', 'mcg'][i] }))],
    limit: [{ key: t('foodNuSugar'), v: known('sugar') == null ? null : Math.round(known('sugar')!), goal: 50, u: 'g', limit: true },
      { key: t('foodSatFat'), v: null, goal: 22, u: 'g', limit: true },
      { key: t('foodNuSodium'), v: known('sodium') == null ? null : Math.round(known('sodium')!), goal: 2300, u: 'mg', limit: true },
      { key: t('foodCholesterol'), v: null, goal: 300, u: 'mg', limit: true }],
  };
}
export function nuNote(x: Nu) {
  if (x.v == null) return t('foodNotOnFoods');
  if (x.limit) return x.v <= x.goal ? tx('foodUnderLimit', { v: num(x.goal - x.v), u: x.u }) : tx('foodOverLimit', { v: num(x.v - x.goal), u: x.u });
  return x.v >= x.goal ? t('foodGoalMet') : tx('foodToGo', { v: num(x.goal - x.v), u: x.u });
}
function NuMeter({ x, h }: { x: Nu; h: number }) {
  const k = useKit();
  if (x.v == null) return <WellBar frac={0} h={h} color={k.c.food} />;
  if (!x.limit) return <Cells states={meter(x.v / x.goal, 12)} color={k.tok(x.color ?? 'food')} h={h} gap={2} r={2} />;
  const mx = x.goal * 1.25;
  return <WellBar frac={x.v / mx} h={h} color={x.v > x.goal ? k.c.warning : k.c.food} mark={x.goal / mx} />;
}
const Micros: TileBody = ({ p, d }) => {
  const N = nutrients(d.view), lim = p.options.show === 'limit', list = lim ? N.limit : N.reach;
  const valText = (x: Nu, slash: boolean) => x.v == null ? <KitText weight={700} size={13} color="text-muted">{t('foodUnknownVal')}</KitText>
    : <KitText weight={700} size={13} lineHeight={1} numeric>{num(x.v)}<KitText weight={600} size={10.5} color="text-muted">{slash ? `/${num(x.goal)} ${x.u}` : ` ${x.u}`}</KitText></KitText>;
  if (p.size === 'S') {
    const x = lim ? N.limit[2] : N.reach[0];
    return <View accessible accessibilityLabel={`${x.key} ${x.v == null ? t('foodUnknownLower') : `${x.v} ${t('foodOf')} ${x.goal} ${x.u}`}`} style={col}>
      <Kick>{x.key}</Kick><Num v={x.v == null ? '–' : num(x.v)} unit={x.u} fs={30} style={{ marginTop: 8 }} />
      <Sub style={{ marginTop: 4 }}>{t('foodOf')} {num(x.goal)} {x.u}{lim ? ` ${t('foodLimitWord')}` : ''}</Sub>
      <View style={{ marginTop: 'auto' }}><NuMeter x={x} h={9} /><Sub style={{ marginTop: 7 }}>{nuNote(x)}</Sub></View>
    </View>;
  }
  if (p.size === 'M') return <View style={[col, { justifyContent: lim ? 'center' : 'flex-end' }]}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: lim ? 22 : 11 }}>{list.map(x => <View key={x.key} accessible
      accessibilityLabel={`${x.key} ${x.v == null ? t('foodUnknownLower') : `${x.v} ${t('foodOf')} ${x.goal} ${x.u}`}`} style={{ width: (p.body.w - 18) / 2, gap: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <KitText weight={600} size={12.5} lineHeight={1.25} numberOfLines={1} color={x.v == null ? 'text-muted' : 'text'} style={{ flexShrink: 1 }}>{x.key}</KitText>{valText(x, !!lim)}</View>
      <NuMeter x={x} h={lim ? 7 : 6} />
    </View>)}</View>
  </View>;
  return <View style={col}>
    <View style={{ gap: lim ? 18 : 11 }}>{list.map(x => <View key={x.key} accessible accessibilityLabel={`${x.key}, ${x.v == null ? t('foodUnknownLower') : `${x.v} ${t('foodOf')} ${x.goal} ${x.u}`}, ${nuNote(x)}`} style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <KitText weight={600} size={12.5} numberOfLines={1} color={x.v == null ? 'text-muted' : 'text'}>{x.key}</KitText><View style={{ flex: 1 }} />
        <Sub size={11}>{nuNote(x)}</Sub>
        <View style={{ minWidth: 84, alignItems: 'flex-end' }}>{x.v == null ? valText(x, true) : valText(x, true)}</View>
      </View>
      <NuMeter x={x} h={lim ? 8 : 7} />
    </View>)}</View>
    <Sub size={11.5} lines={2} style={{ marginTop: 'auto' }}>{lim ? t('foodMarkIsLimit') : t('foodUnknownMeans')}</Sub>
  </View>;
};

/* 8. Meal timing */
const T0 = 5, T1 = 23;
const X = (h: number, w: number) => (Math.max(T0, Math.min(T1, h)) - T0) / (T1 - T0) * w;
const hours = (ms: number) => { const x = new Date(ms); return x.getHours() + x.getMinutes() / 60; };
const hm = (h: number) => { const H = Math.floor(h), M = Math.round((h - H) * 60); return new Date(2000, 0, 1, H + (M === 60 ? 1 : 0), M === 60 ? 0 : M).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
const dur = (h: number) => { let H = Math.floor(h), M = Math.round((h - H) * 60); if (M === 60) { H++; M = 0; } return `${H}h${M ? ` ${M}m` : ''}`; };
const TICKS: [number, string][] = [[6, '6 AM'], [12, 'Noon'], [18, '6 PM'], [22, '10 PM']];
function windowOf(d: Data) {
  const v = d.view, w = eatingWindow(v), now = hours(Date.now());
  const ms = v.meals.filter(m => !m.empty && m.time).map((m, i) => ({ t: hours(m.time!), k: m.kcal, i: v.meals.indexOf(m) + 0 * i }));
  return { meals: ms, first: w ? hours(w.first) : null, last: w ? hours(w.last) : null, live: d.isToday, now };
}
function Timeline({ d, w, h, mh, mw = 6, target, ticks }: { d: Data; w: number; h: number; mh: number; mw?: number; target: number; ticks?: boolean }) {
  const k = useKit(), shade = useShade(), W = windowOf(d), base = h - 3, end = W.live ? Math.max(W.last ?? 0, W.now) : W.last;
  return <View accessible accessibilityRole="image" style={{ height: h, width: w, marginBottom: ticks ? 17 : 0 }}
    accessibilityLabel={W.first == null ? t('foodNothingLoggedYet') : tx('foodWindowA11y', { from: hm(W.first), to: hm(W.last!) }) + (W.live ? ` ${t('foodSoFar')}` : '') + (target ? `, ${tx('foodTargetHours', { n: target })}` : '')}>
    <View style={{ position: 'absolute', left: 0, right: 0, top: base - 1, height: 2, borderRadius: 1, backgroundColor: k.c['hair-2'] }} />
    {W.first != null ? <View style={{ position: 'absolute', left: X(W.first, w), width: Math.max(4, X(end!, w) - X(W.first, w)), top: base - 2.5, height: 5, borderRadius: 999,
      backgroundColor: k.dark ? mix(k.c.food, k.c['surface-2'], 0.48) : mix(k.c.food, k.c.surface, 0.34) }} /> : null}
    {target && W.first != null && X(W.first + target, w) > X(end!, w) + 3 ? <Svg style={{ position: 'absolute', left: X(end!, w) + 2, top: base - 1 }} width={X(W.first + target, w) - X(end!, w) - 2} height={2}>
      <Line x1={0} y1={1} x2={400} y2={1} stroke={k.c.food} strokeWidth={2} strokeDasharray="4 3" opacity={0.8} /></Svg> : null}
    {W.meals.map((m, i) => { const hh = mh * (0.42 + 0.58 * Math.min(1, m.k / 650));
      return <View key={i} style={{ position: 'absolute', left: X(m.t, w) - mw / 2, width: mw, top: base - 2.5 - hh, height: hh, borderTopLeftRadius: mw / 2, borderTopRightRadius: mw / 2, borderBottomLeftRadius: 1, borderBottomRightRadius: 1, backgroundColor: shade(m.i), boxShadow: `0px 0px 0px 1.5px ${k.c.surface}` }} />; })}
    {W.live ? <View style={{ position: 'absolute', left: X(W.now, w) - 0.75, width: 1.5, top: base - mh - 2, height: mh + 6, borderRadius: 1, backgroundColor: alpha(k.c.text, 0.75) }}>
      <View style={{ position: 'absolute', left: -2.25, top: -3, width: 6, height: 6, borderRadius: 3, backgroundColor: k.c.text }} /></View> : null}
    {ticks ? TICKS.map(([x, l]) => <KitText key={l} weight={600} size={10} lineHeight={1} color="text-muted" style={{ position: 'absolute', top: h + 7, left: X(x, w) - 20, width: 40, textAlign: 'center' }}>{l}</KitText>) : null}
  </View>;
}
const Timing: TileBody = ({ p, repo, d }) => {
  const k = useKit(), W = windowOf(d), tg = Number(p.options.target) || 0, span = W.first == null ? 0 : (W.live ? Math.max(W.last!, W.now) : W.last!) - W.first;
  const close = tg && W.first != null ? W.first + tg : null;
  const note = W.first == null ? t('foodNothingLoggedYet') : tg ? W.live ? <>{t('foodWindowCloses')} <B>{hm(close!)}</B></> : span <= tg ? tx('foodInsideWindow', { n: tg }) : tx('foodPastWindow', { d: dur(span - tg), n: tg })
    : <>{t('foodLastMeal')} <B>{hm(W.last!)}</B></>;
  if (p.size === 'S') return <View style={col}><Num v={dur(span)} fs={28} /><Sub style={{ marginTop: 4 }}>{W.first == null ? t('foodNoMealsYet') : `${W.live ? t('foodSoFarSince') : t('foodFrom')} ${hm(W.first)}`}</Sub>
    <View style={{ marginTop: 'auto' }}><Timeline d={d} w={p.body.w} h={26} mh={20} mw={5} target={tg} /><Sub style={{ marginTop: 8 }}>{note}</Sub></View></View>;
  const stats = <View style={{ alignItems: 'flex-end' }}><Sub>{t('foodFirst')} <B>{W.first != null ? hm(W.first) : t('foodNone')}</B></Sub><Sub style={{ marginTop: 3 }}>{t('foodLast')} <B>{W.last != null ? hm(W.last) : t('foodNone')}</B></Sub></View>;
  const top = <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}><View style={{ flex: 1 }}><Num v={dur(span)} unit={W.live ? t('foodSoFar') : t('foodWindowWord')} fs={28} /><Sub style={{ marginTop: 4 }}>{note}</Sub></View>{stats}</View>;
  if (p.size === 'M') return <View style={col}>{top}<View style={{ marginTop: 'auto' }}><Timeline d={d} w={p.body.w} h={32} mh={26} mw={7} target={tg} ticks /></View></View>;
  const days = weekDays(d.day), gw = p.body.w - 22, liveI = days.indexOf(d.today);
  const rows = days.slice(0, liveI >= 0 ? liveI : 7).map(day => { const items = repo.list('food_entries').filter(r => r.data.day === day).map(r => hours(r.updated_at)); return items.length ? [Math.min(...items), Math.max(...items)] as const : null; });
  const lens = rows.filter((x): x is readonly [number, number] => !!x).map(x => x[1] - x[0]), avgL = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  return <View style={col}>{top}
    <View style={{ marginTop: 'auto' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 8 }}><KitText weight={700} size={10} color={k.c.food} style={{ width: 14, textAlign: 'center' }}>{WD1[weekday(d.day)]}</KitText><Timeline d={d} w={gw} h={32} mh={26} mw={7} target={tg} /></View>
      <View style={{ height: 1, backgroundColor: k.c.hair, marginTop: 12, marginBottom: 10 }} />
      <View style={{ flexDirection: 'row' }}><Kick style={{ flex: 1 }}>{d.isToday || liveI >= 0 ? t('foodEarlierWeek') : t('foodThatWeek')}</Kick><Sub size={11.5}>{t('foodAverage')} <B>{dur(avgL)}</B> {t('foodADay')}</Sub></View>
      <View style={{ gap: 6, marginTop: 9 }}>{rows.map((x, i) => <View key={i} style={{ flexDirection: 'row', alignItems: 'center', columnGap: 8 }}>
        <KitText weight={700} size={10} color={weekday(d.day) === i ? k.c.food : 'text-muted'} style={{ width: 14, textAlign: 'center' }}>{WD1[i]}</KitText>
        <View style={{ height: 10, width: gw }}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 4, height: 2, borderRadius: 1, backgroundColor: k.c.hair }} />
          {x ? <View style={{ position: 'absolute', top: 0, bottom: 0, left: X(x[0], gw), width: Math.max(10, X(x[1], gw) - X(x[0], gw)), borderRadius: 999, overflow: 'hidden', opacity: tg && x[1] - x[0] > tg ? 0.5 : 1 }}>
            <WellBar frac={1} h={10} color={k.c.food} width={Math.max(10, X(x[1], gw) - X(x[0], gw))} /></View> : null}
        </View>
      </View>)}</View>
      <View style={{ flexDirection: 'row', columnGap: 8, marginTop: 9 }}><View style={{ width: 14 }} /><View style={{ height: 10, width: gw }}>
        {TICKS.map(([x, l]) => <KitText key={l} weight={600} size={10} lineHeight={1} color="text-muted" style={{ position: 'absolute', top: 0, left: X(x, gw) - 20, width: 40, textAlign: 'center' }}>{l}</KitText>)}</View></View>
    </View>
  </View>;
};

/* 9. Logging streak */
function CalGrid({ repo, d, cell, gap, nums, full, weeks, w }: { repo: Repository; d: Data; cell: number; gap: number; nums: boolean; full: boolean; weeks: number; w: number }) {
  const k = useKit(), s = streak(repo, d.today, full), any = streak(repo, d.today, false), every = streak(repo, d.today, true);
  const start = shiftDay(weekDays(d.today)[0], -7 * (weeks - 1)), cw = (w - gap * 6) / 7;
  const cells = Array.from({ length: weeks * 7 }, (_, i) => shiftDay(start, i));
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>{cells.map(day => {
    const future = day > d.today, now = day === d.today, lvl = future ? -1 : every.done(day) ? 2 : any.done(day) ? (full ? 0 : 1) : 0;
    const bg = future ? 'transparent' : now ? 'transparent' : lvl === 2 ? k.c.food : lvl === 1 ? (k.dark ? mix(k.c.food, k.c['surface-2'], 0.42) : mix(k.c.food, k.c.surface, 0.3)) : k.dark ? mix(k.c.food, k.c['surface-2'], 0.07) : mix(k.c.food, k.c.bg, 0.06);
    return <View key={day} style={{ width: cw, height: cell, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, overflow: 'hidden',
      borderWidth: now ? 1.5 : 0, borderColor: k.c.food }}>
      {now && lvl === 1 ? <Stripes w={cw} h={cell} color={k.c.food} a={0.34} b={0} /> : null}
      {nums && !future ? <KitText weight={700} size={10.5} lineHeight={1} numeric color={now ? k.c.food : lvl === 2 ? k.c['on-accent'] : lvl === 1 ? 'text' : 'text-muted'}>{Number(day.slice(8))}</KitText> : null}
    </View>;
  })}{s ? null : null}</View>;
}
const Streak: TileBody = ({ p, repo, d }) => {
  const k = useKit(), full = p.options.count === 'full', s = streak(repo, d.today, full), unit = s.count === 1 ? t('foodDayWord') : t('foodDays');
  const sub = full ? t('foodWithEveryMeal') : t('foodInARowFood');
  const last35 = Array.from({ length: 35 }, (_, i) => shiftDay(d.today, i - 34));
  const any = streak(repo, d.today, false), every = streak(repo, d.today, true);
  const logged = last35.filter(x => any.done(x)).length, all = last35.filter(x => every.done(x)).length;
  let best = 0, run = 0; for (const x of last35) { if ((full ? every : any).done(x)) { run++; best = Math.max(best, run); } else run = 0; }
  best = Math.max(best, s.count);
  const aria = tx('foodStreakA11y', { n: s.count, unit, sub, logged, every: all });
  if (p.size === 'S') return <View accessible accessibilityLabel={aria} style={col}><Num v={String(s.count)} unit={unit} fs={30} /><Sub style={{ marginTop: 4 }}>{full ? t('foodEveryMealLogged') : t('foodInARow')}</Sub>
    <View style={{ marginTop: 'auto' }}><CalGrid repo={repo} d={d} cell={12} gap={4} nums={false} full={full} weeks={3} w={p.body.w} /></View></View>;
  if (p.size === 'M') return <View accessible accessibilityLabel={aria} style={{ flex: 1, flexDirection: 'row', gap: 18 }}>
    <View style={{ width: 100, ...col }}><Num v={String(s.count)} unit={unit} fs={30} /><Sub lines={2} style={{ marginTop: 4 }}>{sub}</Sub><Sub style={{ marginTop: 'auto' }}>{t('foodBest')} <B>{best} {t('foodDays')}</B></Sub></View>
    <View style={{ flex: 1, justifyContent: 'flex-end' }}><CalGrid repo={repo} d={d} cell={14.5} gap={4} nums={false} full={full} weeks={5} w={p.body.w - 118} /></View>
  </View>;
  const sw = (bg: string | null, border?: boolean) => <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: bg ?? 'transparent', borderWidth: border ? 1.5 : 0, borderColor: k.c.food }} />;
  return <View accessible accessibilityLabel={aria} style={col}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <View style={{ flex: 1 }}><Num v={String(s.count)} unit={unit} fs={32} /><Sub style={{ marginTop: 5 }}>{sub}{s.count >= best ? `, ${t('foodBestYet')}` : `, ${t('foodBestLower')} ${best}`}</Sub></View>
      <View style={{ alignItems: 'flex-end' }}><Num v={String(full ? all : logged)} unit={tx('foodOfN', { n: 35 })} fs={20} /><Sub style={{ marginTop: 3 }}>{t('foodDays')}</Sub></View>
    </View>
    <View style={{ marginTop: 'auto' }}>
      <View style={{ flexDirection: 'row', gap: 5, marginBottom: 6 }}>{WD1.map((l, i) => <KitText key={i} weight={700} size={9.5} lineHeight={1} tracking={0.04} color="text-muted" style={{ flex: 1, textAlign: 'center' }}>{l}</KitText>)}</View>
      <CalGrid repo={repo} d={d} cell={29} gap={5} nums full={full} weeks={5} w={p.body.w} />
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
        {full ? null : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>{sw(k.dark ? mix(k.c.food, k.c['surface-2'], 0.42) : mix(k.c.food, k.c.surface, 0.3))}<KitText weight={600} size={11} color="text-muted">{t('foodSomeMeals')}</KitText></View>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>{sw(k.c.food)}<KitText weight={600} size={11} color="text-muted">{t('foodEveryMeal')}</KitText></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>{sw(null, true)}<KitText weight={600} size={11} color="text-muted">{t('foodToday')}</KitText></View>
      </View>
    </View>
  </View>;
};

/* 10. Quick add */
const Quick: TileBody = ({ p, repo, d }) => {
  const k = useKit(), kind = p.options.list, cnt = p.size === 'S' ? 2 : p.size === 'M' ? 3 : 6, rh = p.size === 'S' ? 52 : p.size === 'M' ? 39 : 43;
  const mn = mealName(repo, d.next).toLowerCase();
  if (kind === 'saved') {
    const list = combos(repo).slice(0, cnt);
    if (!list.length) return <View style={[col, { justifyContent: 'center' }]}><Title>{t('foodNoSavedYet')}</Title><Sub lines={2} style={{ marginTop: 4 }}>{t('foodNoSavedHint')}</Sub></View>;
    return <View style={col}><View style={{ marginTop: 'auto' }}>{list.map((c, i) => <View key={c.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: rh, borderTopWidth: i ? 1 : 0, borderTopColor: k.c.hair }}>
      <Tappable dim="row" accessibilityRole="button" accessibilityLabel={`${c.name}, ${plural(c.foods.length, t('foodFood'), t('foodFoods'))}, ${num(comboKcal(c))} ${KC()}`} onPress={() => foodRoutes.saved(d.next)} style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', justifyContent: 'center' }}>
        <Title size={p.size === 'S' ? 13 : 14}>{c.name}</Title>
        <Sub size={11.5}>{p.size === 'S' ? `${num(comboKcal(c))} ${KC()}` : `${plural(c.foods.length, t('foodFood'), t('foodFoods'))} · ${num(comboKcal(c))} ${KC()} · ${tx('foodGProtein', { g: Math.round(comboProtein(c)) })}`}</Sub>
      </Tappable>
      <Plus label={tx('foodAddTo', { food: c.name, meal: mn })} onPress={() => addSaved(repo, d.today, d.next, c)} />
    </View>)}</View></View>;
  }
  const often = kind === 'often' ? oftenFoods(repo, cnt) : null;
  const list = often ? often.map(x => x.food) : recentFoods(repo).slice(0, cnt);
  if (!list.length) return <View style={[col, { justifyContent: 'center' }]}><Title>{t('foodNothingRecent')}</Title><Sub lines={2} style={{ marginTop: 4 }}>{t('foodNothingRecentHint')}</Sub></View>;
  return <View style={col}><View style={{ marginTop: 'auto' }}>{list.map((f, i) => {
    const kcal = kcalOf(f.energy_kj), pg = typeof f.protein_g === 'number' ? Math.round(f.protein_g) : null;
    const q = typeof f.amount_g === 'number' ? `${grams(f.amount_g)} g` : t('foodOneServing');
    const sub = p.size === 'S' ? (kcal != null ? `${num(kcal)} ${KC()}` : pg != null ? tx('foodGProtein', { g: pg }) : q)
      : [q, kcal != null ? `${num(kcal)} ${KC()}` : null, pg != null ? tx('foodGProtein', { g: pg }) : null].filter(Boolean).join(' · ') + (often ? ` · ${tx('foodTimes', { n: often[i].count })}` : '');
    return <QuickRow key={String(f.name)} f={f} first={i === 0} h={rh} repo={repo} d={d} sub={sub} title={p.size === 'L' ? String(f.name) : String(f.name).split(',')[0]} size={p.size === 'S' ? 13 : 14} />;
  })}</View></View>;
};
function QuickRow({ f, first, h, repo, d, sub, title, size }: { f: Food; first: boolean; h: number; repo: Repository; d: Data; sub: string; title: string; size: number }) {
  const k = useKit(), mn = mealName(repo, d.next).toLowerCase();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: h, borderTopWidth: first ? 0 : 1, borderTopColor: k.c.hair }}>
    <Tappable dim="row" accessibilityRole="button" accessibilityLabel={`${String(f.name)}, ${sub}. ${t('foodShowDetails')}`} onPress={() => foodRoutes.item({ food: f, meal: d.next, day: d.today })}
      style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', justifyContent: 'center' }}>
      <Title size={size}>{title}</Title><Sub size={11.5}>{sub}</Sub>
    </Tappable>
    <Plus label={tx('foodAddTo', { food: String(f.name), meal: mn })} onPress={() => quickAdd(repo, d.today, d.next, f)} />
  </View>;
}

/* 11. Net calories */
const Net: TileBody = ({ p, repo, d }) => {
  const k = useKit(), v = d.view, burned = v.burned, net = burned == null ? null : v.eaten - burned, week = p.options.range === 'week';
  const days = weekDays(d.day), sums = daySums(repo, days), liveI = days.indexOf(d.today), full = liveI >= 0 ? liveI : 7;
  const eat = sums.map((x, i) => days[i] > d.today ? null : x.kcal ?? 0), bw = days.map(x => x > d.today ? null : burnedOn(x));
  const nets = eat.map((x, i) => x == null || bw[i] == null ? null : x - bw[i]!);
  const knownN = nets.slice(0, full).filter((x): x is number => x != null), avg = knownN.length ? Math.round(knownN.reduce((a, b) => a + b, 0) / knownN.length) : null;
  const mx = Math.max(1, ...eat.map(x => x ?? 0)) * 1.06;
  const E = (x: number | null) => x == null ? '–' : num(x);
  const eb = (H: number) => { const m = Math.max(v.eaten, burned ?? 0) || 1;
    return <View style={{ gap: H > 8 ? 9 : 7 }}>{([[t('foodEatenCap'), v.eaten, k.c.food], [t('foodBurnedCap'), burned, k.c.warning]] as const).map(([name, x, c]) => <View key={name} style={{ flexDirection: 'row', alignItems: 'center', columnGap: 8 }}>
      <Sub size={12} style={{ width: 52 }}>{name}</Sub><WellBar frac={(x ?? 0) / m} h={H} color={c} /><KitText weight={700} size={13.5} lineHeight={1} numeric style={{ width: 62, textAlign: 'right' }}>{E(x)}</KitText></View>)}</View>; };
  const weekCols = (H: number, cw: number, vl?: boolean, ls = 10.5) => <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>{eat.map((x, i) => {
    const hE = (x ?? 0) / mx * H, hB = Math.min(x ?? 0, bw[i] ?? 0) / mx * H, sel = weekday(d.day) === i, lv = i === liveI;
    return <Tappable key={i} dim="fill" disabled={!live(p) || days[i] > d.today} accessibilityRole="button" accessibilityState={{ selected: sel }} onPress={() => pickFoodDay(days[i])}
      accessibilityLabel={`${DAYN[i]}, ${x == null ? t('foodNothingLogged') : tx('foodNetA11y', { eaten: E(x), burned: E(bw[i]), net: E(nets[i]) })}`} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
      {vl ? <KitText weight={700} size={10.5} lineHeight={1} numeric color={sel ? k.c.food : 'text-muted'} style={{ height: 11 }}>{nets[i] == null ? '' : `${(nets[i]! / 1000).toFixed(1)}k`}</KitText> : null}
      <View style={[{ width: cw, height: H, borderRadius: cw / 2, overflow: 'hidden' }, sel && { boxShadow: `0px 0px 0px 2px ${k.c.surface}, 0px 0px 0px 3.5px ${k.c.food}` }]}>
        <WellBar frac={0} h={H} color={k.c.food} width={cw} />
        {hE ? <View style={{ position: 'absolute', left: 0, bottom: 0, width: cw, height: hE, opacity: lv ? 0.55 : 1, borderRadius: cw / 2, overflow: 'hidden' }}><View style={{ flex: 1, backgroundColor: k.c.food }} /></View> : null}
        {hB ? <View style={{ position: 'absolute', left: 0, bottom: hE - hB, width: cw, height: hB, borderTopLeftRadius: cw / 2, borderTopRightRadius: cw / 2, overflow: 'hidden', borderWidth: 1.5, borderColor: k.c.warning }}>
          <Stripes w={cw} h={hB} color={k.c.warning} a={0.55} b={0} step={5} /></View> : null}
      </View>
      <KitText weight={700} size={ls} lineHeight={1} color={sel ? k.c.food : 'text-muted'}>{WD1[i]}</KitText>
    </Tappable>;
  })}</View>;
  const math = (fs: number) => { const c = (name: string, x: number | null, color?: string) => <View style={{ minWidth: 0 }}><Sub size={11.5}>{name}</Sub>
      <KitText weight={700} size={fs} lineHeight={1.1} tracking={-0.02} numeric color={color} style={{ marginTop: 3 }}>{E(x)}</KitText></View>;
    const op = (s: string) => <KitText weight={500} size={fs - 4} lineHeight={1} color="text-muted" style={{ alignSelf: 'flex-end', paddingBottom: 3 }}>{s}</KitText>;
    return <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>{c(t('foodEatenCap'), v.eaten)}{op('−')}{c(t('foodBurnedCap'), burned)}{op('=')}{c(tx('foodNetUnit', { u: KC() }), net, k.c.food)}</View>; };
  if (p.size === 'S') {
    if (week) return <View style={col}><Num v={E(avg)} unit={KC()} fs={26} /><Sub style={{ marginTop: 4 }}>{t('foodNetADay')}</Sub><View style={{ marginTop: 'auto' }}>{weekCols(46, 12, false, 9.5)}</View></View>;
    return <View style={col}><Num v={E(net)} unit={KC()} fs={28} /><Sub style={{ marginTop: 4 }}>{d.isToday ? t('foodNetSoFar') : t('foodNetThatDay')}</Sub>
      <View style={{ marginTop: 'auto' }}>{([[t('foodEatenCap'), v.eaten, k.c.food], [t('foodBurnedCap'), burned, k.c.warning]] as const).map(([name, x, c], i) => <View key={name} style={{ marginTop: i ? 9 : 0 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}><Sub size={11.5} style={{ flex: 1 }}>{name}</Sub><KitText weight={700} size={12.5} numeric>{E(x)}</KitText></View>
        <View style={{ marginTop: 4 }}><WellBar frac={(x ?? 0) / (Math.max(v.eaten, burned ?? 0) || 1)} h={6} color={c} /></View></View>)}</View></View>;
  }
  if (p.size === 'M') {
    if (week) return <View style={{ flex: 1, flexDirection: 'row', gap: 16 }}><View style={{ width: 104, ...col }}><Num v={E(avg)} unit={KC()} fs={24} /><Sub style={{ marginTop: 4 }}>{t('foodNetADay')}</Sub>
      <Sub lines={3} style={{ marginTop: 'auto', lineHeight: 16 }}>{t('foodStripedTop')}</Sub></View><View style={{ flex: 1, justifyContent: 'flex-end' }}>{weekCols(80, 18)}</View></View>;
    return <View style={col}>{math(24)}<View style={{ marginTop: 'auto' }}>{eb(8)}</View></View>;
  }
  return <View style={col}>{math(26)}<View style={{ marginTop: 14 }}>{eb(8)}</View>
    <View style={{ flexDirection: 'row', marginTop: 14 }}><Kick style={{ flex: 1 }}>{liveI >= 0 ? t('foodThisWeek') : t('foodThatWeek')}</Kick><Sub size={11.5}>{t('foodAverageNet')} <B>{E(avg)} {KC()}</B></Sub></View>
    <View style={{ marginTop: 'auto' }}>{weekCols(72, 22, true)}<Sub size={11.5} style={{ marginTop: 8 }}>{t('foodStripedTops')}</Sub></View>
  </View>;
};

/* 12. What fits today */
const Fits: TileBody = ({ p, repo, d }) => {
  const k = useKit(), today = d.today === d.day ? d.view : null, v = today ?? d.view, left = v.goal - v.eaten, pg = Math.max(0, Math.round(v.goals.p - v.p));
  const mn = mealName(repo, d.next).toLowerCase();
  const list = combos(repo).map(c => ({ c, kcal: comboKcal(c), p: comboProtein(c) })).filter(x => x.kcal <= left)
    .sort(p.options.by === 'p' ? (a, b) => b.p - a.p : (a, b) => b.kcal - a.kcal);
  if (left <= 0 || !list.length) return <View style={[col, { justifyContent: 'center' }]}>
    <Title>{left <= 0 ? t('foodReachedGoal') : t('foodNoneFits')}</Title>
    <Sub lines={2} style={{ marginTop: 4 }}>{left <= 0 ? tx('foodGoesOver', { v: num(v.goal), u: KC() }) : tx('foodTryQuick', { v: num(left), u: KC() })}</Sub>
  </View>;
  const row = (x: typeof list[number], h: number, i: number) => <View key={x.c.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: h, borderTopWidth: i ? 1 : 0, borderTopColor: k.c.hair }}>
    <Tappable dim="row" accessibilityRole="button" onPress={() => foodRoutes.saved(d.next)} accessibilityLabel={tx('foodFitsA11y', { name: x.c.name, kcal: num(x.kcal), p: Math.round(x.p), left: num(left - x.kcal) })}
      style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch' }}>
      <View style={{ flex: 1, minWidth: 0 }}><Title size={14}>{x.c.name}</Title><Sub size={11.5}>{num(x.kcal)} {KC()} · {tx('foodGProtein', { g: Math.round(x.p) })}</Sub></View>
      <View style={{ alignItems: 'flex-end' }}><Sub size={11}>{t('foodLeaves')}</Sub><KitText weight={700} size={13.5} numeric>{num(left - x.kcal)}<KitText weight={600} size={10} color="text-muted">{` ${KC()}`}</KitText></KitText></View>
    </Tappable>
    <Plus label={tx('foodAddTo', { food: x.c.name, meal: mn })} onPress={() => addSaved(repo, d.today, d.next, x.c)} />
  </View>;
  if (p.size === 'S') { const b = list[0];
    return <View style={col}><Kick>{t('foodBestFit')}</Kick><KitText weight={700} size={16} lineHeight={1.2} numberOfLines={2} style={{ marginTop: 8 }}>{b.c.name}</KitText>
      <Sub style={{ marginTop: 3 }}>{num(b.kcal)} {KC()} · {Math.round(b.p)} g</Sub>
      <View style={{ marginTop: 'auto' }}><TileButton sm full icon="plus" label={tx('foodAddToMeal', { meal: mn })} onPress={() => addSaved(repo, d.today, d.next, b.c)} /></View></View>; }
  if (p.size === 'M') return <View style={col}><Sub><B>{num(left)} {KC()}</B> {t('foodAnd')} <B>{tx('foodGProtein', { g: pg })}</B> {t('foodLeftToday')}</Sub>
    <View style={{ marginTop: 'auto' }}>{list.slice(0, 2).map((x, i) => row(x, 44, i))}</View></View>;
  return <View style={col}>
    <View style={{ flexDirection: 'row', gap: 16 }}>
      <View style={{ flex: 1 }}><Num v={num(left)} unit={KC()} fs={22} /><Sub style={{ marginTop: 3, marginBottom: 8 }}>{tx('foodLeftOfGoal', { v: num(v.goal), u: KC() })}</Sub><WellBar frac={v.eaten / v.goal} h={6} color={k.c.food} /></View>
      <View style={{ flex: 1 }}><Num v={String(pg)} unit="g" fs={22} /><Sub style={{ marginTop: 3, marginBottom: 8 }}>{t('foodProteinToGo')}</Sub><WellBar frac={v.p / v.goals.p} h={6} color={k.c.food} /></View>
    </View>
    <View style={{ marginTop: 'auto' }}>{list.slice(0, 4).map((x, i) => row(x, 46, i))}</View>
  </View>;
};

export const FOOD_TILES = { cal: Calories, macros: Macros, protein: Protein, meals: Meals, water: Water, week: Week, micros: Micros, window: Timing, streak: Streak, quick: Quick, net: Net, fits: Fits } as const;
