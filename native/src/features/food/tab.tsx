import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from 'expo-router';
import { Button, IconButton, KitText, PageHeader, Ring, StackGapContext, Tappable, alpha, useKit, useSelectionHaptic } from '@/components/kit';
import type { Repository } from '@/data/repository';
import { useHealthDays } from '@/features/health/use-health-days';
import { lastDays } from '@/features/health/days';
import { pageEndSpace } from '@/features/shell/geometry';
import { useQuickActions, useShellEditMode } from '@/features/shell/registry';
import { TileGrid, tileEdit, useTileEdit } from '@/features/tiles';
import { t } from '@/i18n/en';
import { fill } from '../tiles/ui';
import { addWater, mealName } from './actions';
import { daySums, dayView, fullDate, monthDay, nextMealId, plural, stripDays, weekdayName } from './day';
import { useSettingsPrefs } from '@/features/settings/prefs';
import { combos, shiftDay } from './model';
import { foodRoutes } from './nav';
import { pickFoodDay, setBurned, useFoodDay } from './selection';
import { setFoodTileRepo } from './tiles';
import { useFoodRevision } from './use-food-revision';
import { quickContainers, readWater, sizeText } from './water';
import { enAmt, useEnergyUnit } from './energy';

/** Apple Health's active calories for the strip's two weeks, kept in memory for the tiles. */
function useBurned(focused: boolean) {
  const health = useHealthDays(focused, undefined, 14);
  useEffect(() => {
    const kcal = health?.activeKcal;
    if (!kcal) { setBurned({}); return; }
    const days = lastDays(new Date(), 14), map: Record<string, number> = {};
    kcal.forEach((v, i) => { if (v != null) map[days[i]] = v; });
    setBurned(map);
  }, [health]);
}

/**
 * The Food tab: the date and title with Scan and Log, a two week strip of days (each a ring of that day's calories), a
 * line to come back to today when an earlier day is picked, then the page of Food tiles, which follow the picked day.
 */
export function FoodTab({ repo }: { repo: Repository }) {
  const k = useKit(), insets = useSafeAreaInsets(), scrollRef = useAnimatedRef<Animated.ScrollView>();
  const focused = useIsFocused();
  useFoodRevision(repo);
  useBurned(focused);
  setFoodTileRepo(repo);
  const sel = useFoodDay(), eu = useEnergyUnit();
  const { editing } = useTileEdit('food');
  useShellEditMode('food', editing, () => tileEdit.end());
  useEffect(() => { if (!focused) tileEdit.set('food', false); }, [focused]);

  const todayView = dayView(repo, sel.today, { today: sel.today });
  const next = nextMealId(todayView), nextName = mealName(repo, next);
  const water = readWater(repo), first = quickContainers(water)[0];
  const saved = combos(repo);
  const yesterday = dayView(repo, shiftDay(sel.today, -1), { today: sel.today });
  useQuickActions('food', {
    meal: { run: () => foodRoutes.log(next), hint: fill(t('shellMealNext'), { meal: nextName }) },
    scan: { run: () => foodRoutes.barcode(next) },
    water: { run: () => { if (first) addWater(repo, sel.today, { c: first }); else foodRoutes.water(); },
      hint: first ? `${first.name}, ${sizeText(first.oz, water.unit)}` : undefined },
    quick: { run: () => foodRoutes.quick(next) },
    saved: { run: () => foodRoutes.saved(next), hint: saved.length ? fill(t('foodNSaved'), { n: saved.length }) : undefined },
    copy: { run: () => foodRoutes.copy(yesterday.logged),
      hint: yesterday.logged ? `${plural(yesterday.logged, t('foodMealWord'), t('foodMealsWord'))}, ${enAmt(yesterday.eaten, eu)}` : undefined },
    tiles: { run: () => tileEdit.set('food', true) },
  });

  return <Animated.ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: k.c.bg }} testID="food-tab"
    contentContainerStyle={{ paddingTop: insets.top, paddingHorizontal: 16, paddingBottom: pageEndSpace(insets.bottom) }}>
    <StackGapContext.Provider value={0}>
      <PageHeader eyebrow={sel.isToday ? fullDate(sel.today) : fullDate(sel.day)} title={t('food')}
        right={<>
          <IconButton icon="barcode" label={t('foodScanBarcode')} onPress={() => foodRoutes.barcode(next)} />
          <IconButton icon="plus" label={t('foodLogFood')} onPress={() => foodRoutes.log(next)} />
        </>} />
    </StackGapContext.Provider>
    <DayStrip repo={repo} day={sel.day} today={sel.today} goal={todayView.goal} />
    {sel.isToday ? null : <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: -2, marginHorizontal: 4, marginBottom: 14 }}>
      <KitText weight={500} size={13} color="text-muted" style={{ flex: 1 }}>{fill(t('foodShowing'), { day: weekdayName(sel.day), date: monthDay(sel.day) })}</KitText>
      <Button variant="secondary" size="sm" color="food" label={t('foodBackToToday')} onPress={() => pickFoodDay(null)} />
    </View>}
    {/* The engine draws a tile's header text once; a new key when the day or the logged meals change redraws it. */}
    <TileGrid key={`${sel.day}|${todayView.logged}|${next}|${todayView.left == null || todayView.left > 0}`} page="food" scrollRef={scrollRef} />
  </Animated.ScrollView>;
}

/** Two weeks of days, from the first day of the week the person chose, paged by week; it opens on this week. */
function DayStrip({ repo, day, today, goal }: { repo: Repository; day: string; today: string; goal: number }) {
  const k = useKit(), haptic = useSelectionHaptic(), { width } = useWindowDimensions(), eu = useEnergyUnit();
  const wk = useSettingsPrefs()[0].units.week, days = useMemo(() => stripDays(today, wk), [today, wk]);
  const sums = daySums(repo, days.map(d => d.day));
  // contentOffset opens on this week on iOS; the web ignores it, so the first layout scrolls there too.
  const strip = useRef<ComponentRef<typeof ScrollView>>(null);
  return <ScrollView ref={strip} horizontal pagingEnabled showsHorizontalScrollIndicator={false} accessibilityRole="none" accessibilityLabel={t('foodStripLabel')}
    contentOffset={{ x: width, y: 0 }} onLayout={() => strip.current?.scrollTo({ x: width, animated: false })}
    style={{ flexGrow: 0, marginTop: -6, marginHorizontal: -16, marginBottom: 14 }}>
    {[0, 1].map(w => <View key={w} style={{ width, flexDirection: 'row', gap: 2, paddingHorizontal: 10 }}>
      {days.slice(w * 7, w * 7 + 7).map((d, i) => {
        const on = d.day === day, kcal = sums[w * 7 + i].kcal, logged = sums[w * 7 + i].meals > 0;
        const spoken = `${d.today ? `${t('foodToday')}, ` : ''}${fullDate(d.day)}, ${kcal == null ? logged ? enAmt(null, eu) : t('foodNothingLogged') : enAmt(kcal, eu)}`;
        return <Tappable key={d.day} dim="fill" disabled={d.future} accessibilityRole="button" accessibilityLabel={spoken} accessibilityState={{ selected: on, disabled: d.future }}
          onPress={() => { if (!on) haptic(); pickFoodDay(d.day); }}
          style={{ flex: 1, minHeight: 70, paddingTop: 8, paddingBottom: 7, borderRadius: 16, alignItems: 'center', gap: 5, backgroundColor: on ? alpha(k.c.food, 0.15) : 'transparent', opacity: d.future ? 0.4 : 1 }}>
          <KitText weight={700} size={11} tracking={0.06} color={d.today || on ? k.c.food : 'text-muted'}>{d.wd}</KitText>
          <Ring value={(kcal ?? 0) / goal} size={38} stroke={3} color="food" label={spoken}>
            <KitText weight={700} size={14} tracking={-0.02} color={d.today ? k.c.food : 'text'}>{d.date}</KitText>
          </Ring>
        </Tappable>;
      })}
    </View>)}
  </ScrollView>;
}
