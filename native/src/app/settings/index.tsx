import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { touchTarget } from '@/components/button';
import { useAuth } from '@/auth/provider';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { readProfile } from '@/features/onboarding/model';
import { Group, NavRow, SectionLabel, SettingsIcon, semibold } from '@/features/settings/parts';
import { searchSettings, type SettingsRow } from '@/features/settings/sections';
import { t } from '@/i18n/en';

const open = (route: SettingsRow['route']) => route === 'appearance' ? router.push('/settings/appearance')
  : route === 'account' ? router.push('/settings/account')
  : router.push({ pathname: '/settings/[section]', params: { section: route } });

/** Who is using the app and where their data lives. Opens Account. Shows only what is known: no made-up name or status. */
function ProfileCard() {
  const auth = useAuth();
  const { colors } = useTheme();
  let name = '';
  try { name = auth.repository ? readProfile(auth.repository).name.trim() : ''; } catch { /* The card still shows where data lives. */ }
  const email = auth.session?.user.email ?? '';
  const place = auth.demo ? t('settingsExample') : auth.phoneOnly ? t('settingsOnPhone') : auth.session ? (email || t('settingsSignedIn')) : t('settingsNotSignedIn');
  const detail = auth.demo ? t('settingsExampleBody') : auth.phoneOnly ? t('settingsOnPhoneBody') : auth.session
    ? t(auth.syncStatus === 'syncing' ? 'syncBusy' : auth.syncStatus === 'offline' ? 'syncOffline' : auth.pending > 0 ? 'syncPending' : auth.conflicts > 0 ? 'syncConflictStatus' : 'syncIdle') : '';
  const title = name || place, lines = name ? [place, detail] : [detail];
  const sub = lines.filter(Boolean).join(' · ');
  const initial = (name || email).charAt(0).toUpperCase();
  return <Pressable testID="settings-profile" accessibilityRole="button" accessibilityLabel={[title, sub].filter(Boolean).join(', ')}
    accessibilityHint={t('account')} onPress={() => open('account')} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
    <Card style={{ borderRadius: 18, padding: tokens.spacing[3], flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] }}>
      <View style={{ minWidth: 52, minHeight: 52, borderRadius: 99, alignItems: 'center', justifyContent: 'center', backgroundColor: colors['accent-tint'] }}>
        {initial ? <ThemedText variant="title" style={{ color: colors.accent }}>{initial}</ThemedText>
          : <SettingsIcon name="account" size={26} color={colors.accent} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText variant="headline" style={semibold}>{title}</ThemedText>
        {!!sub && <ThemedText muted variant="caption">{sub}</ThemedText>}
      </View>
      <SettingsIcon name="forward" size={14} color={colors['text-muted']} />
    </Card>
  </Pressable>;
}

export default function Settings() {
  const { colors, palette } = useTheme();
  const [query, setQuery] = useState('');
  const groups = searchSettings(query, row => t(row.label));
  const value = (row: SettingsRow) => row.route === 'appearance' ? tokens.palettes[palette].name : undefined;
  // The shared screen layout, with one difference: a row can be tapped while the search keyboard is up.
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['left', 'right', 'bottom']}>
    <ScrollView testID="screen-scroll" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      contentContainerStyle={{ padding: tokens.spacing[3], gap: tokens.spacing[3], flexGrow: 1 }}>
    <ThemedText variant="title" accessibilityRole="header">{t('settings')}</ThemedText>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[1], minHeight: touchTarget, paddingHorizontal: tokens.spacing[2],
      borderRadius: 12, borderWidth: 1, borderColor: colors.hair, backgroundColor: colors.surface }}>
      <SettingsIcon name="search" size={18} color={colors['text-muted']} />
      <TextInput testID="settings-search" accessibilityLabel={t('settingsSearch')} placeholder={t('settingsSearchHint')}
        placeholderTextColor={colors['text-muted']} value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none"
        returnKeyType="search" clearButtonMode="while-editing"
        style={{ flex: 1, minHeight: touchTarget, paddingVertical: tokens.spacing[1], color: colors.text, fontSize: tokens.type.body }} />
    </View>
    {!query.trim() && <ProfileCard />}
    {groups.map(group => <View key={group.title} style={{ gap: tokens.spacing[2] }}>
      <SectionLabel>{t(group.title)}</SectionLabel>
      <Group testID={`settings-group-${group.title}`}>
        {group.rows.map(row => <NavRow key={row.route} testID={`settings-row-${row.route}`} icon={row.icon} label={t(row.label)}
          value={value(row)} onPress={() => open(row.route)} />)}
      </Group>
    </View>)}
    {groups.length === 0 && <ThemedText testID="settings-no-match" muted style={{ paddingHorizontal: tokens.spacing[0], paddingVertical: tokens.spacing[2] }}>{t('settingsNoMatch')}</ThemedText>}
    </ScrollView>
  </SafeAreaView>;
}
