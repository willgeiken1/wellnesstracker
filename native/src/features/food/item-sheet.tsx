import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge, Button, Card, Chip, Chips, Icon, KitText, List, SheetHeader, Tappable, useKit } from '@/components/kit';
import type { Repository } from '@/data/repository';
import { t } from '@/i18n/en';
import { fill } from '../tiles/ui';
import { kcalTail, mealName, quickAdd, removeFood } from './actions';
import { addToCart, cartItem, currentCart } from './cart';
import { dayView, kcalOf, nextMealId, num } from './day';
import { meals, portion, saveFood, saveReusable, type Food } from './model';
import { itemTarget, type ItemTarget } from './nav';
import { closeSheet, foodKey, FoodSheet } from './sheet';
import { useFoodDay } from './selection';
import { MACRO_COLOR, MealSeg, PillStepper, SectionLabel, SplitBar, macroPercents } from './ui';
import { useFoodRevision } from './use-food-revision';
import { showToast } from '../shell/toast';

const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const nice = (v: number) => String(Number(v.toFixed(2)));
const lower = (s: string) => s.toLowerCase();

/** The serving choices a food offers: its own serving when its weight is known, and 100 g beside it. */
export function servingsOf(food: Food): { label: string; grams: number | null }[] {
  const g = n(food.amount_g);
  if (g == null || g <= 0) return [{ label: t('foodOneServing'), grams: null }];
  const own = { label: `${t('foodOneServing')} (${num(g)} g)`, grams: g };
  return Math.round(g) === 100 ? [{ label: '100 g', grams: 100 }] : [own, { label: '100 g', grams: 100 }];
}
/** How many times the food's own nutrients a choice of serving and amount comes to. */
export function multipleFor(food: Food, grams: number | null, amount: number) {
  const g = n(food.amount_g);
  return grams != null && g ? amount * grams / g : amount;
}

/**
 * Food details (`food-item`): energy and macros, serving size and amount, which meal, and a nutrition facts panel.
 * Adds to the Log food tray when that sheet is open, otherwise logs straight into the meal. Opened on a logged food,
 * it edits that entry instead, with Remove.
 */
export function ItemSheet({ repo }: { repo: Repository }) {
  useFoodRevision(repo);
  const [target] = useState<ItemTarget | null>(() => itemTarget());
  if (!target) return <FoodSheet header={<SheetHeader title={t('foodDetails')} left={t('cancel')} onLeft={() => closeSheet()} />}><View /></FoodSheet>;
  return <ItemBody repo={repo} target={target} />;
}

function ItemBody({ repo, target }: { repo: Repository; target: ItemTarget }) {
  const { day, today } = useFoodDay();
  const editing = !!target.entryId, inTray = !!currentCart() && !editing;
  const food = target.food, name = String(food.name ?? '');
  const options = servingsOf(food);
  const [si, setSi] = useState(0), [amount, setAmount] = useState(target.servings ?? 1);
  const [meal, setMeal] = useState(() => target.meal || nextMealId(dayView(repo, today, { today })));
  const savedRow = () => repo.list('saved_foods').find(r => foodKey(r.data) === foodKey(food));
  const [saved, setSaved] = useState(() => target.source === 'mine' || !!savedRow());
  const choice = options[si], mult = multipleFor(food, choice.grams, amount), p = portion(food, mult);
  const kcal = kcalOf(p.energy_kj), grams = n(p.amount_g);
  const servingText = choice.grams != null ? `${nice(amount)} × ${num(choice.grams)} g` : `${nice(amount)} ${amount === 1 ? t('foodServingWord') : t('foodServingsWord')}`;
  const source = target.source === 'barcode' ? { badge: t('foodSrcOff'), line: String(food.barcode ?? t('foodSrcOffLine')) }
    : saved ? { badge: t('foodMyFood'), line: t('foodSrcMineLine') } : { badge: t('foodSrcLog'), line: t('foodSrcLogLine') };

  const toggleSave = () => {
    if (saved) { const row = savedRow(); if (row) repo.remove('saved_foods', row.id); setSaved(false); showToast(t('foodUnsavedMine'), { color: 'food' }); return; }
    try { saveReusable(repo, food); setSaved(true); showToast(t('foodSavedMine'), { color: 'food' }); } catch { showToast(t('foodCannotSave'), { color: 'food' }); }
  };
  const commit = () => {
    if (editing) {
      const before = repo.get('food_entries', target.entryId!)?.data;
      saveFood(repo, day, meal, food, mult, target.entryId); closeSheet();
      showToast(fill(t('foodSavedNamed'), { name }), { color: 'food', ms: 4200, action: { label: t('foodUndoBtn'), onAction: () => { if (before) { repo.save('food_entries', before, target.entryId); showToast(t('foodChangeUndone'), { color: 'food' }); } } } });
      return;
    }
    if (inTray) { addToCart([cartItem(foodKey(food), food, mult)]); closeSheet(); return; }
    closeSheet(); quickAdd(repo, day, meal, food, mult);
  };
  const mn = lower(mealName(repo, meal));
  const footer = <Button full color="food" label={editing ? t('foodSaveChanges') : fill(t('foodAddToMeal'), { meal: mn }) + kcalTail(kcal)} onPress={commit} testID="food-item-add" />;

  return <FoodSheet testID="food-item-sheet" footer={footer}
    header={<SheetHeader title={editing ? t('foodEditFood') : t('foodDetails')} left={t('cancel')} onLeft={() => closeSheet()} />}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginTop: 4, marginBottom: 16 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <KitText accessibilityRole="header" weight={700} size={25} lineHeight={1.15} tracking={-0.03}>{name}</KitText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <Badge label={source.badge} color="food" />
          <KitText weight={500} size={13} color="text-muted" numberOfLines={1} style={{ flexShrink: 1 }}>{source.line}</KitText>
        </View>
      </View>
      <SaveButton on={saved} onPress={toggleSave} />
    </View>
    <EnergyCard kcal={kcal} p={n(p.protein_g)} c={n(p.carbs_g)} f={n(p.fat_g)} />
    <SectionLabel title={t('foodServingSize')} />
    <Chips style={{ marginBottom: -2 }}>
      {options.map((o, i) => <Chip key={o.label} label={o.label} color="food" selected={i === si} onPress={() => setSi(i)} />)}
    </Chips>
    <List style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, paddingLeft: 16, paddingRight: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <KitText weight={600} size={15.5} lineHeight={1.25} tracking={-0.01}>{t('foodServingsCap')}</KitText>
          <KitText weight={500} size={13} numeric color="text-muted" style={{ marginTop: 2 }}>{grams != null ? `${servingText} · ${num(grams)} g` : servingText}</KitText>
        </View>
        <PillStepper label={t('foodServingsCap')} value={amount} onChange={setAmount} step={0.25} min={0.25} max={10} format={nice} />
      </View>
    </List>
    {inTray || editing ? null : <><SectionLabel title={t('foodAddToCap')} /><MealSeg label={t('foodMealLabel')} meals={meals(repo)} value={meal} onChange={setMeal} /></>}
    <FactsPanel food={p} grams={grams} servingText={servingText} barcode={target.source === 'barcode'} />
    {editing ? <View style={{ marginTop: 16 }}>
      <Button full variant="danger" icon="trash" label={fill(t('foodRemoveFromMeal'), { meal: mn })} onPress={() => { closeSheet(); removeFood(repo, target.entryId!, meal); }} />
    </View> : null}
  </FoodSheet>;
}

function SaveButton({ on, onPress }: { on: boolean; onPress: () => void }) {
  const k = useKit();
  return <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={on ? t('foodSavedMine') : t('foodSaveMine')} accessibilityState={{ selected: on }} onPress={onPress} hitSlop={2}
    style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: k.cardBg, boxShadow: k.cardEdge }}>
    <Icon name="bookmark" size={20} color={on ? k.c.food : k.c.text} />
  </Tappable>;
}

/** The energy and how it splits between protein, carbs and fat (`.fd-ikc`). */
export function EnergyCard({ kcal, p, c, f }: { kcal: number | null; p: number | null; c: number | null; f: number | null }) {
  const k = useKit();
  return <Card>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <View style={{ minWidth: 84 }}>
        <KitText weight={700} size={32} lineHeight={1} tracking={-0.04} numeric>{kcal == null ? '–' : num(kcal)}</KitText>
        <KitText weight={600} size={12} color="text-muted" style={{ marginTop: 4 }}>{t('foodKcal')}</KitText>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <SplitBar h={10} gap={3} radius={5} track={k.c['surface-2']} parts={[{ v: (p ?? 0) * 4, color: k.c.food }, { v: (c ?? 0) * 4, color: k.c.accent }, { v: (f ?? 0) * 9, color: k.c.sleep }]} />
        <EnergyLegend p={p} c={c} f={f} />
      </View>
    </View>
  </Card>;
}

/** The US label style nutrition facts panel (`.fd-nf`). Unknown values show a dash and no daily value. */
function FactsPanel({ food, grams, servingText, barcode }: { food: Food; grams: number | null; servingText: string; barcode: boolean }) {
  const k = useKit(), kcal = kcalOf(food.energy_kj);
  const bar = (h: number, extra?: object) => <View style={[{ height: h, backgroundColor: k.c.text, borderRadius: 2 }, extra]} />;
  const row = (label: ReactNode, v: number | null, u: string, dv: number, indent = false) => <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingVertical: 6, paddingLeft: indent ? 16 : 0, borderTopWidth: 1, borderTopColor: k.c.hair }}>
    <KitText weight={500} size={14}>{label}<KitText weight={500} size={14} numeric>{` ${v == null ? '–' : `${v % 1 && v < 10 ? v.toFixed(1) : num(v)} ${u}`}`}</KitText></KitText>
    <KitText weight={700} size={14} numeric>{v == null || !dv ? '' : `${Math.round(v / dv * 100)}%`}</KitText>
  </View>;
  const b = (s: string) => <KitText weight={700} size={14}>{s}</KitText>;
  return <View accessibilityLabel={t('foodNutritionFacts')} style={{ marginTop: 20, backgroundColor: k.cardBg, boxShadow: k.cardEdge, borderRadius: 20, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14 }}>
    <KitText accessibilityRole="header" weight={700} size={24} lineHeight={1} tracking={-0.03} style={{ marginBottom: 6 }}>{t('foodNutritionFacts')}</KitText>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <KitText weight={700} size={14}>{t('foodServingSizeCap')}</KitText>
      <KitText weight={700} size={14} numeric>{grams != null ? `${servingText} (${num(grams)} g)` : servingText}</KitText>
    </View>
    {bar(8, { marginTop: 4, marginBottom: 6 })}
    <KitText weight={700} size={12}>{t('foodPerServing')}</KitText>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 2, paddingBottom: 4 }}>
      <KitText weight={700} size={22}>{t('foodCaloriesCap')}</KitText>
      <KitText weight={700} size={28} numeric>{kcal == null ? '–' : num(kcal)}</KitText>
    </View>
    {bar(4)}
    <View style={{ alignItems: 'flex-end', paddingVertical: 6 }}><KitText weight={700} size={12}>{t('foodDailyValue')}</KitText></View>
    {row(b(t('foodTotalFat')), n(food.fat_g), 'g', 78)}
    {row(t('foodSatFat'), null, 'g', 20, true)}
    {row(b(t('foodCholesterol')), null, 'mg', 300)}
    {row(b(t('foodNuSodium')), n(food.sodium_mg), 'mg', 2300)}
    {row(b(t('foodTotalCarb')), n(food.carbs_g), 'g', 275)}
    {row(t('foodDietaryFiber'), n(food.fiber_g), 'g', 28, true)}
    {row(t('foodTotalSugars'), n(food.sugar_g), 'g', 0, true)}
    {row(b(t('foodMacroProtein')), n(food.protein_g), 'g', 50)}
    {bar(4, { marginTop: 2 })}
    <KitText weight={500} size={12} lineHeight={1.4} color="text-muted" style={{ marginTop: 8 }}>{`${t(barcode ? 'foodFactsOff' : 'foodFactsMine')} ${t('foodFactsDv')}`}</KitText>
  </View>;
}

/** Protein, carbs and fat with their grams and share of the calories (`.fd-leg`). */
export function EnergyLegend({ p, c, f }: { p: number | null; c: number | null; f: number | null }) {
  const k = useKit(), [pp, pcc, pf] = macroPercents(p ?? 0, c ?? 0, f ?? 0).pc, pc = { p: pp, c: pcc, f: pf };
  const rows: [string, number | null, number, string][] = [[t('foodMacroProtein'), p, pc.p, MACRO_COLOR.p], [t('foodMacroCarbs'), c, pc.c, MACRO_COLOR.c], [t('foodMacroFat'), f, pc.f, MACRO_COLOR.f]];
  return <View style={{ gap: 6, marginTop: 12 }} accessible accessibilityLabel={fill(t('foodSplitA11y'), { p: pc.p, c: pc.c, f: pc.f })}>
    {rows.map(([label, g, pct, color]) => <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: k.tok(color) }} />
      <KitText weight={500} size={13} color="text-muted" style={{ flex: 1 }}>{label}</KitText>
      <KitText weight={700} size={13.5} tracking={-0.02} numeric>{g == null ? '–' : `${g < 10 && g % 1 ? g.toFixed(1) : num(g)} g`}</KitText>
      <KitText weight={700} size={12.5} tracking={-0.02} numeric color="text-muted" style={{ width: 38, textAlign: 'right' }}>{g == null ? '' : `${pct}%`}</KitText>
    </View>)}
  </View>;
}
