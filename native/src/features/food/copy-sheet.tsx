import { useState } from 'react';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Badge, Button, EmptyState, KitText, List, SheetHeader, Tappable, useKit, proportional } from '@/components/kit';
import type { Repository } from '@/data/repository';
import { t } from '@/i18n/en';
import { fill } from '../tiles/ui';
import { kcalTail, logFoods } from './actions';
import { dayView, foodsLine, fullDate, num, plural } from './day';
import { shiftDay } from './model';
import { useFoodDay } from './selection';
import { closeSheet, FoodSheet, KcalValue, RowLine } from './sheet';
import { Caption, CheckCircle } from './ui';
import { showToast } from '../shell/toast';
import { useFoodRevision } from './use-food-revision';
import { capitals } from '@/components/kit-style';

/** Which of yesterday's meals start ticked: the ones not yet logged today. */
export function copyPicks(yesterday: { id: string; empty: boolean }[], today: { id: string; empty: boolean }[]) {
  return Object.fromEntries(yesterday.filter(m => !m.empty).map(m => [m.id, today.find(x => x.id === m.id)?.empty ?? true]));
}

/**
 * Copy yesterday (`copy-day`): yesterday's meals with what was in them, ticked unless that meal already has food
 * today. Copy puts the ticked meals' foods into the same meals on the picked day, with Undo.
 */
export function CopySheet({ repo }: { repo: Repository }) {
  useFoodRevision(repo);
  const k = useKit();
  const { day, today } = useFoodDay();
  const from = shiftDay(day, -1), y = dayView(repo, from, { today }), now = dayView(repo, day, { today });
  const [pick, setPick] = useState<Record<string, boolean>>(() => copyPicks(y.meals, now.meals));
  const list = y.meals.filter(m => !m.empty), sel = list.filter(m => pick[m.id]), total = sel.reduce((a, m) => a + m.kcal, 0);
  const copy = () => {
    if (!sel.length) return;
    const undos = sel.map(m => logFoods(repo, day, m.id, m.items.map(i => ({ food: i.data }))));
    closeSheet(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    showToast(sel.length === 1 ? fill(t('foodCopiedOne'), { meal: sel[0].name.toLowerCase() }) : fill(t('foodCopiedMany'), { n: sel.length }), {
      color: 'food', ms: 4200, action: { label: t('foodUndoBtn'), onAction: () => { [...undos].reverse().forEach(u => u()); showToast(t('foodCopyUndone'), { color: 'food' }); } } });
  };
  const header = <SheetHeader title={t('foodCopyYesterday')} left={t('cancel')} onLeft={() => closeSheet()} />;
  if (!list.length) return <FoodSheet testID="food-copy-sheet" header={header}>
    <View style={{ marginTop: 24 }}><EmptyState icon="copy" color="food" title={t('foodNothingYesterday')} description={t('foodNothingYesterdayHint')} /></View>
  </FoodSheet>;
  return <FoodSheet testID="food-copy-sheet" header={header}>
    <View style={{ marginHorizontal: 4, marginBottom: 14 }}>{/* .fd-ch: its 2 pt top margin folds into the header's 4 */}
      <KitText weight={700} size={10.5} lineHeight={1} tracking={0.14} color="text-muted" style={capitals}>{fullDate(from)}</KitText>
      <KitText weight={700} size={24} lineHeight={1.1} tracking={-0.02} numeric style={{ marginTop: 6 }}>{num(y.eaten)}
        <KitText weight={600} tracking={0} size={13} color="text-muted" style={proportional}>{` ${t('foodKcal')} · ${plural(list.length, t('foodMealWord'), t('foodMealsWord'))}`}</KitText></KitText>
    </View>
    <List>
      {list.map((m, i) => {
        const on = !!pick[m.id], has = !(now.meals.find(x => x.id === m.id)?.empty ?? true);
        return <Tappable key={m.id} dim="none" accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${m.name}, ${foodsLine(m.items)}, ${num(m.kcal)} ${t('foodKcal')}${has ? `, ${t('foodLoggedToday')}` : ''}`}
          onPress={() => setPick(p => ({ ...p, [m.id]: !p[m.id] }))}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: pressed ? k.tint(k.c.text, 0.07) : 'transparent' })}>
          {i > 0 && <RowLine />}
          <CheckCircle on={on} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <KitText weight={600} size={15.5} lineHeight={1.25} tracking={-0.01}>{m.name}</KitText>
              {has ? <Badge label={t('foodLoggedToday')} color="text-muted" /> : null}
            </View>
            <KitText weight={500} size={13} lineHeight={1.35} color="text-muted" numberOfLines={1} style={{ marginTop: 2 }}>{foodsLine(m.items)}</KitText>
          </View>
          <KcalValue kcal={m.kcal} strong />
        </Tappable>;
      })}
    </List>
    <Caption>{t('foodCopyNote')}</Caption>
    <View style={{ marginTop: 16 }}>
      <Button full color="food" icon="copy" disabled={!sel.length} testID="food-copy-go"
        label={sel.length ? fill(t('foodCopyN'), { n: plural(sel.length, t('foodMealWord'), t('foodMealsWord')) }) + kcalTail(total) : t('foodChooseToCopy')} onPress={copy} />
    </View>
  </FoodSheet>;
}
