import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { touchTarget } from '../../components/button';
import { Card } from '../../components/card';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';
import { tokens } from '../../design/tokens';
import type { Repository } from '../../data/repository';
import { foodDayLabel, t } from '../../i18n/en';
import { today } from '../onboarding/model';
import { FoodAiEntry } from './ai/entry';
import { FoodAiResults } from './ai/review';
import { aiState, attachFallback, confirmEstimate } from './ai/service';
import { FoodCalendar } from './calendar';
import { FoodEntry } from './entry';
import { sharedReads } from '../../data/read-cache';
import { useFoodDay } from './use-food-day';
import { attributedDay, deleteFood, logCombo, meals, saveFood, type Combo, type Food } from './model';
import { FoodLogModes, type LogMode } from './modes';
import { dayInSentence, energyText, foodCard, Glyph, GroupLabel, ItemRow, macroText, NoticeRow, semibold } from './parts';
import { FoodSaved } from './saved';
import { FoodScanner } from './scanner';
import { FoodSearch } from './search';
import { useFoodRevision } from './use-food-revision';

/**
 * The food logging screen: pick the day and meal, then one of five ways to log.
 * Search covers foods already on this phone and leads to manual entry; Snap and Describe are the AI entry, unchanged.
 */
export function FoodLogScreen({ repository }: { repository: Repository }) {
  // Repository reads are mutable method calls; do not memoize derived values by object identity.
  'use no memo';
  // One remembering view per repository: this screen redraws on every change and reads the same lists many times.
  const repo = sharedReads(repository);
  useFoodRevision(repo);
  const { colors } = useTheme();
  const [day, setDay] = useFoodDay(), [calendar, setCalendar] = useState(false);
  const mealList = meals(repo), [selectedMeal, setSelectedMeal] = useState(mealList[0].id);
  const [mode, setMode] = useState<LogMode>('search');
  const [entry, setEntry] = useState<{ initial?: Food; id?: string; meal: string } | null>(null);
  const [fallbackId, setFallbackId] = useState<number | undefined>();
  // What was just added, so it can be taken back; and the last thing that failed, so it can be tried again.
  const [added, setAdded] = useState<{ text: string; ids: string[] } | null>(null);
  const [failed, setFailed] = useState<{ retry: () => void } | null>(null);
  const now = today(), early = attributedDay() !== now;
  const mealName = (id: string) => mealList.find(meal => meal.id === id)?.name ?? '';
  const rows = repo.list('food_entries').filter(row => row.data.day === day)
    .sort((a, b) => (mealList.findIndex(meal => meal.id === a.data.meal_id) - mealList.findIndex(meal => meal.id === b.data.meal_id)));
  const ai = aiState(repo);
  const attempt = (action: () => void) => { try { action(); setFailed(null); } catch { setAdded(null); setFailed({ retry: () => attempt(action) }); } };
  const chooseDay = (value: string) => { setDay(value); setCalendar(false); setEntry(null); setAdded(null); setFailed(null); };
  const chooseMode = (value: LogMode) => { setMode(value); setEntry(null); setFailed(null); };
  const log = (food: Food) => attempt(() => {
    const row = saveFood(repo, day, selectedMeal, food);
    setAdded({ text: t('foodAdded').replace('{name}', String(row.data.name)).replace('{meal}', mealName(selectedMeal)), ids: [row.id] });
  });
  const logSet = (combo: Combo) => attempt(() => {
    const before = new Set(repo.list('food_entries').map(row => row.id));
    logCombo(repo, combo, day, selectedMeal);
    const ids = repo.list('food_entries').filter(row => !before.has(row.id)).map(row => row.id);
    setAdded({ text: t('foodAddedCombo').replace('{count}', String(ids.length)).replace('{meal}', mealName(selectedMeal)), ids });
  });
  const undo = () => { const ids = added?.ids ?? []; attempt(() => { repo.atomic(() => ids.forEach(id => { deleteFood(repo, id); })); setAdded(null); }); };
  return <View style={{ gap: tokens.spacing[3] }} testID="food-log">
    <Card style={[foodCard, { gap: tokens.spacing[1] }]} testID="food-log-where">
      <Pressable accessibilityRole="button" accessibilityLabel={t('foodLogDayPick')} accessibilityValue={{ text: foodDayLabel(day, now) }} accessibilityState={{ expanded: calendar }} onPress={() => setCalendar(!calendar)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], minHeight: touchTarget, opacity: pressed ? 0.6 : 1 })}>
        <ThemedText muted variant="caption" style={[semibold, { flex: 1 }]}>{t('foodLogDay')}</ThemedText>
        <ThemedText testID="food-log-day" style={semibold}>{foodDayLabel(day, now)}</ThemedText>
        <View style={{ transform: [{ rotate: calendar ? '-90deg' : '90deg' }] }}><Glyph name="chevron" size={16} color={colors['text-muted']} width={2} /></View>
      </Pressable>
      {calendar && <FoodCalendar day={day} today={now} onSelect={chooseDay} repo={repo} />}
      <View style={{ borderTopWidth: 1, borderTopColor: colors['surface-2'], paddingTop: tokens.spacing[1], gap: 2 }}>
        <ThemedText muted variant="caption" style={semibold}>{t('foodLogMeal')}</ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ columnGap: 6 }}>
          {mealList.map(meal => {
            const selected = meal.id === selectedMeal;
            return <Pressable key={meal.id} accessibilityRole="button" accessibilityLabel={meal.name} accessibilityState={{ selected }}
              onPress={() => { setSelectedMeal(meal.id); if (entry) setEntry({ ...entry, meal: meal.id }); }} style={{ minHeight: touchTarget, justifyContent: 'center' }}>
              <View style={{ minHeight: 34, paddingHorizontal: 14, borderRadius: 99, justifyContent: 'center', backgroundColor: selected ? colors.accent : colors['surface-2'] }}>
                <ThemedText style={{ fontSize: 15, fontWeight: selected ? '600' : '400', color: selected ? colors['on-accent'] : colors.text }}>{meal.name}</ThemedText>
              </View>
            </Pressable>;
          })}
        </ScrollView>
      </View>
    </Card>
    {early && (day === attributedDay() || day === now) && <NoticeRow text={t('foodEarly').replace('{day}', dayInSentence(day, now))}
      action={{ label: t(day === now ? 'foodUsePrevious' : 'foodUseToday'), onPress: () => chooseDay(day === now ? attributedDay() : now) }} />}
    <FoodLogModes value={mode} onChange={chooseMode} />
    {failed && <NoticeRow alert text={t('foodFailure')} action={{ label: t('foodRetry'), onPress: failed.retry }} />}
    {added && <NoticeRow testID="food-log-added" text={added.text} action={added.ids.length ? { label: t('foodUndoAdd'), onPress: undo } : undefined} />}
    <Card style={foodCard} testID="food-log-panel">
      {entry
        ? <FoodEntry key={entry.id ?? 'new'} editing={!!entry.id} initial={entry.initial} day={day} onClose={() => setEntry(null)} onSave={(food, multiple) => {
            const row = saveFood(repo, day, entry.meal, food, multiple, entry.id);
            if (fallbackId !== undefined) { attachFallback(repo, row.id, fallbackId); setFallbackId(undefined); }
            if (entry.id && aiState(repo).entries[entry.id]) confirmEstimate(repo, entry.id);
            setAdded(entry.id ? { text: t('foodSavedChange').replace('{name}', String(row.data.name)), ids: [] }
              : { text: t('foodAdded').replace('{name}', String(row.data.name)).replace('{meal}', mealName(entry.meal)), ids: [row.id] });
            setFailed(null); setEntry(null);
          }} />
        : mode === 'search' ? <FoodSearch repo={repo} meal={selectedMeal} onLog={log} onManual={name => setEntry({ meal: selectedMeal, initial: name ? { name } : undefined })} />
        : mode === 'scan' ? <FoodScanner repo={repo} onChoose={food => setEntry({ meal: selectedMeal, initial: food })} onManual={() => setEntry({ meal: selectedMeal })}
            onSearch={() => chooseMode('search')} onClose={() => chooseMode('search')} />
        : mode === 'saved' ? <FoodSaved repo={repo} meal={selectedMeal} mealName={mealName(selectedMeal)} onLog={log} onLogCombo={logSet} />
        : <FoodAiEntry key={mode + day + selectedMeal} repo={repo} fallbackId={fallbackId} mode={mode} day={day} meal={selectedMeal}
            onClose={() => chooseMode('search')} onManual={() => setEntry({ meal: selectedMeal })} />}
    </Card>
    {(!!ai.ready.length || !!ai.fallback.length) && <Card style={foodCard}>
      <FoodAiResults repo={repo}
        onDescribe={id => { const job = aiState(repo).fallback.find(j => j.id === id)!; setEntry(null); setDay(job.day); setSelectedMeal(job.meal); setFallbackId(id); setMode('describe'); }}
        onManual={id => { const job = aiState(repo).fallback.find(j => j.id === id)!; setDay(job.day); setSelectedMeal(job.meal); setFallbackId(id); setEntry({ meal: job.meal }); }} />
    </Card>}
    <Card style={foodCard} testID="food-log-day-list">
      <GroupLabel>{t('foodLoggedDay').replace('{day}', dayInSentence(day, now))}</GroupLabel>
      {!rows.length && <ThemedText muted style={{ paddingVertical: 6 }}>{t('foodLoggedNone').replace('{day}', dayInSentence(day, now))}</ThemedText>}
      {rows.map((row, index) => {
        const name = String(row.data.name), pending = ai.entries[row.id]?.confirmed === false;
        return <ItemRow key={row.id} first={index === 0} glyph="pencil" label={t('foodEdit').replace('{name}', name)} title={name}
          detail={[mealName(String(row.data.meal_id)), macroText(row.data), pending ? t('foodEstimateChip') : null].filter(Boolean).join(' · ')}
          value={energyText(row.data.energy_kj)} onPress={() => { setSelectedMeal(String(row.data.meal_id)); setEntry({ id: row.id, initial: row.data, meal: String(row.data.meal_id) }); }} />;
      })}
    </Card>
  </View>;
}
