import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { touchTarget } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';
import { tokens } from '../../design/tokens';
import type { Repository } from '../../data/repository';
import { t } from '../../i18n/en';
import { allFavorites, recentFoods, type Food } from './model';
import { energyText, Glyph, Group, GroupLabel, ItemRow, macroText, semibold } from './parts';
import { useFieldOutline } from '@/components/field-outline';

/** Saved foods first, then this meal's favorites, then recent foods; one row per name. */
export function searchableFoods(repo: Repository, meal: string): Food[] {
  const saved = repo.list('saved_foods').map((row): Food => ({ ...row.data, saved_food_id: row.id, amount_g: row.data.serving_g ?? null }));
  const seen = new Set<string>();
  return [...saved, ...allFavorites(repo, meal), ...recentFoods(repo)].filter(food => {
    const key = String(food.name ?? '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

/**
 * Search over the foods already on this phone (saved, favorite and recent). Nothing is sent anywhere.
 * Tapping a food logs it; "Enter manually" opens the form, carrying the typed words as the name.
 */
export function FoodSearch({ repo, meal, onLog, onManual }: { repo: Repository; meal: string; onLog: (food: Food) => void; onManual: (name?: string) => void }) {
  'use no memo';
  const { colors } = useTheme();
  const outline = useFieldOutline();
  const [query, setQuery] = useState('');
  const words = query.trim().toLowerCase(), all = searchableFoods(repo, meal);
  const shown = words ? all.filter(food => String(food.name).toLowerCase().includes(words)) : recentFoods(repo).slice(0, 10);
  return <View style={{ gap: tokens.spacing[2] }} testID="food-search">
    <Group style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: tokens.spacing[2], gap: tokens.spacing[1], ...outline }}>
      <Glyph name="search" size={18} color={colors['text-muted']} width={2} />
      <TextInput accessibilityLabel={t('foodSearchField')} placeholder={t('foodSearchField')} placeholderTextColor={colors['text-muted']} value={query} onChangeText={setQuery}
        autoCapitalize="none" autoCorrect={false} returnKeyType="search" clearButtonMode="never"
        style={{ flex: 1, minHeight: 48, paddingVertical: 8, color: colors.text, fontSize: 16 }} />
      {!!query && <Pressable accessibilityRole="button" accessibilityLabel={t('foodSearchClear')} onPress={() => setQuery('')}
        style={{ width: touchTarget, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' }}><Glyph name="close" size={16} color={colors['text-muted']} width={2} /></Pressable>}
    </Group>
    {!!shown.length && <View>
      <GroupLabel>{t(words ? 'foodSearchResults' : 'foodSearchRecent')}</GroupLabel>
      {shown.map((food, index) => <ItemRow key={index} first={index === 0} label={t('foodLogSaved').replace('{name}', String(food.name))}
        title={String(food.name)} detail={macroText(food) ?? undefined} value={energyText(food.energy_kj)} onPress={() => onLog(food)} />)}
    </View>}
    {!shown.length && <View style={{ gap: 2, paddingVertical: tokens.spacing[1] }} testID="food-search-empty">
      <ThemedText style={semibold}>{words ? t('foodSearchNone').replace('{query}', query.trim()) : t('foodSearchEmpty')}</ThemedText>
      <ThemedText muted variant="caption">{t(words ? 'foodSearchScope' : 'foodSearchEmptyBody')}</ThemedText>
    </View>}
    <View style={{ borderTopWidth: 1, borderTopColor: colors['surface-2'] }}>
      <ItemRow first testID="food-enter-manually" glyph="chevron" label={words ? t('foodEnterManuallyNamed').replace('{query}', query.trim()) : t('foodEnterManually')}
        title={words ? t('foodEnterManuallyNamed').replace('{query}', query.trim()) : t('foodEnterManually')} detail={t('foodEnterManuallyBody')}
        onPress={() => onManual(query.trim() || undefined)} />
    </View>
  </View>;
}
