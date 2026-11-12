import { Pressable } from 'react-native';
import { useEffect, useState } from 'react';
import { router, Stack, useNavigation } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { touchTarget } from '@/components/button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { t } from '@/i18n/en';
import { FoodLogScreen } from '@/features/food/log-screen';

/** Shown in the header only when this screen was opened cold (a link or a widget), where there is nothing to go back to. */
function Close() {
  return <Pressable accessibilityRole="button" accessibilityLabel={t('foodLogClose')} onPress={() => router.replace('/food')} hitSlop={8}
    style={{ minHeight: touchTarget, minWidth: touchTarget, justifyContent: 'center' }}>
    <ThemedText style={{ fontWeight: '600' }}>{t('foodLogClose')}</ThemedText>
  </Pressable>;
}
export default function FoodLog() {
  const { repository } = useAuth();
  // Asked after mount and on every stack change: at the first render of a pushed screen the stack has not yet recorded the push.
  const navigation = useNavigation(), [cold, setCold] = useState(false);
  useEffect(() => {
    const check = () => setCold(!navigation.canGoBack());
    check();
    return navigation.addListener('state', check);
  }, [navigation]);
  // The stack header carries the one title; the page itself has none.
  return <>
    <Stack.Screen options={{ title: t('foodLogTitle'), headerBackButtonDisplayMode: 'minimal', headerLeft: cold ? () => <Close /> : undefined }} />
    <Screen>
      {repository ? <FoodLogScreen key={repository.owner} repository={repository} /> : <Card testID="food-log-unavailable">
        <ThemedText variant="headline" style={{ fontWeight: '600' }}>{t('foodLogUnavailable')}</ThemedText>
        <ThemedText muted>{t('foodLogUnavailableBody')}</ThemedText>
      </Card>}
    </Screen>
  </>;
}
