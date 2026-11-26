import { useEffect, useState, type ReactNode } from 'react';
import { Animated, PanResponder, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, EmptyState, Icon, KitText, List, ListFooter, ListRow, NavBar, NavButton, SectionHeader, Tappable, useKit } from '@/components/kit';
import type { Repository } from '@/data/repository';
import { t } from '@/i18n/en';
import { fill } from '../tiles/ui';
import { removeFood } from './actions';
import { clock, dayView, monthDay, num, plural, shortDate, weekdayName, type FoodItem } from './day';
import { combos, saveCombo, shiftDay } from './model';
import { foodRoutes } from './nav';
import { useFoodDay } from './selection';
import { RowLine, useLatest } from './sheet';
import { MACRO_COLOR, SplitBar } from './ui';
import { showToast } from '../shell/toast';
import { useFoodRevision } from './use-food-revision';
import { useFoodWeightUnit, weightText, type FoodWeightUnit } from './weight';
import { capitals } from '@/components/kit-style';

/** A pushed Food screen: the kit's bar, then the page scrolling under it. */
export function FoodPage({ back, title, right, children, testID }: { back: string; title?: string; right?: ReactNode; children: ReactNode; testID?: string }) {
  const k = useKit(), insets = useSafeAreaInsets();
  return <View testID={testID} style={{ flex: 1, backgroundColor: k.c.bg }}>
    {/* The bar pulls itself out to the edges by the page's 16 pt margin, so it sits in that margin here. */}
    <View style={{ paddingHorizontal: 16, zIndex: 5 }}><NavBar back={back} title={title} right={right} /></View>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 + insets.bottom }}>{children}</ScrollView>
  </View>;
}

const DEL = 88;
const g = (v: number) => `${num(v)} g`;

/**
 * A meal (`meal-detail`): what it came to against the day, its foods (tap to change one, swipe left or tap Edit to
 * delete), Add food and Save as a meal. An empty meal offers the ways to fill it.
 */
export function MealScreen({ repo, meal: id }: { repo: Repository; meal: string }) {
  useFoodRevision(repo);
  const k = useKit(), unit = useFoodWeightUnit(repo);
  const { day, today } = useFoodDay();
  const view = dayView(repo, day, { today }), m = view.meals.find(x => x.id === id) ?? view.meals[0];
  const [editing, setEditing] = useState(false), [open, setOpen] = useState<string | null>(null);
  const empty = m.empty, isEditing = editing && !empty;
  const header = <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 18 }}>
    <View style={{ width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: k.tint(k.c.food, 0.16) }}><Icon name={m.icon} size={22} color={k.c.food} /></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <KitText weight={700} size={10.5} lineHeight={1} tracking={0.14} color="text-muted" style={capitals}>{shortDate(day)}</KitText>
      <KitText accessibilityRole="header" weight={700} size={30} lineHeight={1.05} tracking={-0.035} style={{ marginTop: 6 }}>{m.name}</KitText>
    </View>
    {m.time != null ? <View accessible accessibilityLabel={fill(t('foodTimeEaten'), { time: clock(m.time) })}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: k.controlBg, boxShadow: k.cardEdge }}>
      <Icon name="clock" size={15} color={k.c.text} /><KitText weight={600} size={13.5} tracking={-0.02} numeric>{clock(m.time)}</KitText>
    </View> : null}
  </View>;
  const right = empty ? undefined : <NavButton label={isEditing ? t('shellDone') : t('foodEditBtn')} onPress={() => { setEditing(!isEditing); setOpen(null); }} />;

  if (empty) return <FoodPage testID="food-meal-screen" back={t('food')} right={right}>
    {header}
    <Card><EmptyState icon="meal" color="food" title={fill(t('foodMealEmpty'), { meal: m.name.toLowerCase() })} description={t('foodMealEmptyHint')}
      action={{ label: t('foodAddFood'), onPress: () => foodRoutes.log(m.id) }} /></Card>
    <View style={{ height: 12 }} />
    <List>
      <ListRow icon="bookmark" color="food" title={t('foodSavedMeals')} sub={fill(t('foodNSaved'), { n: combos(repo).length })} onPress={() => foodRoutes.saved(m.id)} />
      <ListRow icon="copy" color="food" title={t('foodCopyYesterday')} sub={`${weekdayName(shiftDay(day, -1))}, ${num(dayView(repo, shiftDay(day, -1), { today }).eaten)} ${t('foodKcal')}`} onPress={foodRoutes.copy} />
      <ListRow icon="bolt" color="food" title={t('foodTileQuick')} sub={t('foodJustCalories')} onPress={() => foodRoutes.quick(m.id)} />
    </List>
  </FoodPage>;

  const share = Math.round(m.kcal / view.goal * 100);
  const saveMeal = () => {
    const name = `${m.name}, ${monthDay(day)}`;
    try { saveCombo(repo, day, m.id, name); showToast(fill(t('foodSavedAsMeal'), { name }), { color: 'food' }); } catch { showToast(t('foodCannotSave'), { color: 'food' }); }
  };
  return <FoodPage testID="food-meal-screen" back={t('food')} right={right}>
    {header}
    <Card>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        {([[num(m.kcal), t('foodKcal'), 'food'], [g(m.p), t('foodMacroProtein')], [g(m.c), t('foodMacroCarbs')], [g(m.f), t('foodMacroFat')]] as [string, string, string?][]).map(([v, l, c]) =>
          <View key={l} style={{ flex: 1 }} accessible accessibilityLabel={`${v} ${l}`}>
            <KitText weight={700} size={22} lineHeight={1.05} tracking={-0.035} numeric color={c ?? 'text'}>{v}</KitText>
            <KitText weight={600} size={12.5} color="text-muted" style={{ marginTop: 4 }}>{l}</KitText>
          </View>)}
      </View>
      <SplitBar h={10} gap={3} radius={5} track={k.c['surface-2']} parts={[{ v: m.p * 4, color: k.tok(MACRO_COLOR.p) }, { v: m.c * 4, color: k.tok(MACRO_COLOR.c) }, { v: m.f * 9, color: k.tok(MACRO_COLOR.f) }]} />
      <KitText weight={500} size={12.5} lineHeight={1.4} tracking={-0.02} numeric color="text-muted" style={{ marginTop: 10, marginHorizontal: 2 }}>{fill(t('foodShareOfDay'), { pct: share, goal: num(view.goal) })}</KitText>
    </Card>
    <SectionHeader title={t('foodFoodsCap')} aside={plural(m.items.length, t('foodItemWord'), t('foodItemsWord'))} />
    <List>
      {m.items.map((it, i) => <SwipeRow key={it.id} item={it} unit={unit} first={i === 0} editing={isEditing} open={open === it.id} onOpen={on => setOpen(on ? it.id : null)}
        onEdit={() => { if (open) { setOpen(null); return; } foodRoutes.item({ food: it.data, meal: m.id, day, entryId: it.id }); }}
        onDelete={() => { setOpen(null); removeFood(repo, it.id, m.id); }} />)}
    </List>
    <ListFooter>{t('foodSwipeHint')}</ListFooter>
    <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
      <View style={{ flex: 1 }}><Button full variant="secondary" color="food" icon="plus" label={t('foodAddFood')} onPress={() => foodRoutes.log(m.id)} /></View>
      <View style={{ flex: 1 }}><Button full variant="quiet" icon="bookmark" label={t('foodSaveAsMeal')} onPress={saveMeal} /></View>
    </View>
  </FoodPage>;
}

/** A logged food that slides left to show Delete; in edit mode a red minus does the same. */
function SwipeRow({ item, unit, first, editing, open, onOpen, onEdit, onDelete }: {
  item: FoodItem; unit: FoodWeightUnit; first: boolean; editing: boolean; open: boolean; onOpen: (on: boolean) => void; onEdit: () => void; onDelete: () => void;
}) {
  const k = useKit();
  const [x] = useState(() => new Animated.Value(0));
  const live = useLatest({ open, onOpen, reduce: !!k.reduceMotion });
  useEffect(() => { Animated.timing(x, { toValue: open ? -DEL : 0, duration: k.reduceMotion ? 0 : 280, useNativeDriver: true }).start(); }, [open, x, k.reduceMotion]);
  const [pan] = useState(() => {
    const settle = (on: boolean) => { Animated.timing(x, { toValue: on ? -DEL : 0, duration: live().reduce ? 0 : 280, useNativeDriver: true }).start(); };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, s) => Math.abs(s.dx) > 8 && Math.abs(s.dx) > Math.abs(s.dy),
      onPanResponderMove: (_, s) => x.setValue(Math.max(-120, Math.min(0, (live().open ? -DEL : 0) + s.dx))),
      onPanResponderRelease: (_, s) => { const on = (live().open ? -DEL : 0) + s.dx < -44; settle(on); live().onOpen(on); },
      onPanResponderTerminate: () => settle(live().open),
    });
  });
  const p = item.p == null ? null : `${num(item.p)} g ${t('foodProteinLower')}`;
  const sub = [item.grams != null ? weightText(item.grams, unit) : null, p].filter(Boolean).join(' · ');
  return <View style={{ overflow: 'hidden' }}>
    <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={fill(t('foodDeleteNamed'), { name: item.name })} onPress={onDelete} importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: DEL, alignItems: 'center', justifyContent: 'center', backgroundColor: k.c.danger }}>
      <KitText weight={700} size={15} color="on-accent">{t('foodDeleteBtn')}</KitText>
    </Tappable>
    <Animated.View {...pan.panHandlers} accessibilityActions={[{ name: 'delete', label: t('foodDeleteBtn') }]} onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'delete') onDelete(); }}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, backgroundColor: k.cardBg, transform: [{ translateX: x }] }}>
      {!first && <RowLine />}
      {editing ? <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={fill(t('foodDeleteNamed'), { name: item.name })} onPress={() => onOpen(!open)}
        style={{ width: 44, height: 44, marginLeft: -10, marginRight: -8, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: k.c.danger }}><Icon name="minus" size={14} color={k.c['on-accent']} /></View>
      </Tappable> : null}
      <Tappable dim="none" accessibilityRole="button" accessibilityLabel={`${item.name}${sub ? `, ${sub}` : ''}, ${item.kcal == null ? t('foodUnknownVal') : `${num(item.kcal)} ${t('foodKcal')}`}. ${t('foodEditBtn')}`}
        onPress={onEdit} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, marginLeft: editing ? 10 : 0 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <KitText weight={600} size={15.5} lineHeight={1.25} tracking={-0.01} numberOfLines={1}>{item.name}</KitText>
          {sub ? <KitText weight={500} size={13} lineHeight={1.35} color="text-muted" numberOfLines={1} style={{ marginTop: 2 }}>{sub}</KitText> : null}
        </View>
        <KitText weight={700} size={15} tracking={-0.01} numeric>{item.kcal == null ? '–' : num(item.kcal)}</KitText>
      </Tappable>
    </Animated.View>
  </View>;
}
