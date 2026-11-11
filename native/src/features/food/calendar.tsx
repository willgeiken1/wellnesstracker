import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';
import { tokens } from '../../design/tokens';
import type { Repository } from '../../data/repository';
import { foodDayLabel, t } from '../../i18n/en';
import { FoodAction } from './action';
import { shiftDay } from './model';
import { Glyph, GroupLabel, semibold } from './parts';

const noon = (day: string) => new Date(`${day}T12:00:00Z`);
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2023, 0, 1 + i, 12)).toLocaleDateString('en-US', { weekday: 'narrow', timeZone: 'UTC' }));

/**
 * Month grid plus a strip of the last 14 days.
 * With `repo`, days that have food logged carry a dot; without it no day is marked either way, and the key says nothing about logging.
 */
export function FoodCalendar({ day, today, onSelect, repo }: { day: string; today: string; onSelect: (day: string) => void; repo?: Repository }) {
  'use no memo';
  const { colors } = useTheme();
  const [month, setMonth] = useState(day.slice(0, 7));
  const first = `${month}-01`, next = shiftDay(first, 32).slice(0, 7) + '-01', length = Number(shiftDay(next, -1).slice(8));
  const weekday = noon(first).getUTCDay();
  const logged = repo ? new Set(repo.list('food_entries').map(row => String(row.data.day))) : null;
  /** Spoken state of a day: today, and whether food is logged when that is known. Future days say neither. */
  const state = (date: string) => [date === today ? t('foodCalToday') : null, logged && date <= today ? t(logged.has(date) ? 'foodCalLogged' : 'foodCalNotLogged') : null].filter(Boolean);
  const mark = (date: string, selected: boolean) => <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: logged?.has(date) ? (selected ? colors['on-accent'] : colors.food) : 'transparent' }} />;
  return <View style={{ gap: tokens.spacing[1] }} testID="food-calendar">
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1] }}>
      <FoodAction label={t('foodPreviousMonth')} onPress={() => setMonth(shiftDay(first, -1).slice(0, 7))}><Glyph name="back" size={16} width={2} /></FoodAction>
      <ThemedText variant="headline" accessibilityRole="header" style={[semibold, { flex: 1, textAlign: 'center' }]}>{noon(first).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</ThemedText>
      <FoodAction label={t('foodNextMonth')} disabled={month >= today.slice(0, 7)} onPress={() => setMonth(next.slice(0, 7))}><Glyph name="chevron" size={16} width={2} /></FoodAction>
    </View>
    <View style={{ flexDirection: 'row' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {WEEKDAYS.map((name, i) => <ThemedText key={i} muted variant="caption" style={[semibold, { width: '14.28%', textAlign: 'center' }]}>{name}</ThemedText>)}
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {Array.from({ length: weekday }, (_, i) => <View key={`blank${i}`} style={{ width: '14.28%' }} />)}
      {Array.from({ length }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`).map(date => {
        const selected = date === day, future = date > today;
        return <Pressable key={date} testID={`food-cal-${date}`} accessibilityRole="button" disabled={future} onPress={() => onSelect(date)}
          accessibilityLabel={[noon(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }), ...state(date)].join(', ')}
          accessibilityState={{ selected, disabled: future }}
          style={({ pressed }) => ({ width: '14.28%', minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: future ? 0.35 : pressed ? 0.7 : 1 })}>
          <View style={{ minWidth: 40, minHeight: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 1, paddingTop: 5,
            backgroundColor: selected ? colors.accent : 'transparent', borderWidth: 2, borderColor: selected ? colors.accent : date === today ? colors.text : 'transparent' }}>
            <ThemedText numeric style={{ fontSize: 15, lineHeight: 18, fontWeight: selected || date === today ? '600' : '400', color: selected ? colors['on-accent'] : colors.text }}>{Number(date.slice(8))}</ThemedText>
            {mark(date, selected)}
          </View>
        </Pressable>;
      })}
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: tokens.spacing[3], rowGap: 4 }} testID="food-cal-key">
      {logged && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.food }} />
        <ThemedText muted variant="caption">{t('foodCalKeyLogged')}</ThemedText>
      </View>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.text }} />
        <ThemedText muted variant="caption">{t('foodToday')}</ThemedText>
      </View>
    </View>
    <GroupLabel>{t('foodLast14')}</GroupLabel>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} testID="food-cal-recent">
      {Array.from({ length: 14 }, (_, i) => shiftDay(today, -i)).map(date => {
        const selected = date === day;
        return <Pressable key={date} accessibilityRole="button" accessibilityLabel={[foodDayLabel(date, today), ...state(date).filter(word => word !== t('foodCalToday'))].join(', ')}
          accessibilityState={{ selected }} onPress={() => onSelect(date)}
          style={({ pressed }) => ({ minWidth: 48, minHeight: 60, paddingHorizontal: 6, paddingVertical: 6, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 1,
            backgroundColor: selected ? colors.accent : colors['surface-2'], opacity: pressed ? 0.7 : 1 })}>
          <ThemedText variant="caption" style={{ color: selected ? colors['on-accent'] : colors['text-muted'] }}>{noon(date).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</ThemedText>
          <ThemedText numeric style={{ fontSize: 16, lineHeight: 20, fontWeight: '600', color: selected ? colors['on-accent'] : colors.text }}>{Number(date.slice(8))}</ThemedText>
          {mark(date, selected)}
        </Pressable>;
      })}
    </ScrollView>
  </View>;
}
