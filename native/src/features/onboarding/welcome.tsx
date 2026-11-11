import { View } from 'react-native';
import { router } from 'expo-router';
import { Card } from '../../components/card';
import { ThemedText } from '../../components/themed-text';
import { useAuth } from '../../auth/provider';
import { tokens } from '../../design/tokens';
import { t } from '../../i18n/en';
import { ContourArt, Heading, LinkRow, Notice, PrimaryButton, STRANDS, Shell, StrandShape, panel, semibold } from './parts';

const STRAND_COPY = { training: ['welcomeWorkouts', 'welcomeWorkoutsBody'], food: ['welcomeFood', 'welcomeFoodBody'], sleep: ['welcomeHealth', 'welcomeHealthBody'] } as const;

/** The first of three setup screens: what the app is for, one way forward, and the three other ways in. */
export function Welcome() {
  const auth = useAuth();
  return <Shell step={1}>
    <Heading title={t('welcomeTitle')} body={t('welcomeIntro')} />
    <ContourArt label={t('welcomeMapLabel')} footer={<View testID="welcome-strands" style={{ paddingHorizontal: tokens.spacing[0], paddingBottom: tokens.spacing[0] }}>
      {STRANDS.map((kind, index) => <View key={kind} style={{ flexDirection: 'row', gap: tokens.spacing[2], paddingVertical: tokens.spacing[1] }}>
        <View style={{ paddingTop: 6 }}><StrandShape kind={kind} /></View>
        <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${t(STRAND_COPY[kind][0])}. ${t(STRAND_COPY[kind][1])}`} testID={`welcome-strand-${index}`}>
          <ThemedText style={semibold}>{t(STRAND_COPY[kind][0])}</ThemedText>
          <ThemedText muted variant="caption" style={{ lineHeight: 18 }}>{t(STRAND_COPY[kind][1])}</ThemedText>
        </View>
      </View>)}
    </View>} />
    {!auth.configured && <Notice testID="welcome-unavailable" text={t('accountsUnavailable')} />}
    {auth.configError && <Notice testID="welcome-config-error" text={auth.configError} />}
    <PrimaryButton testID="welcome-get-started" label={t('getStarted')} disabled={!auth.configured} onPress={() => router.push('/onboarding')} />
    <Card style={[panel, { gap: 0, paddingVertical: tokens.spacing[0] }]} testID="welcome-other-ways">
      <LinkRow first testID="welcome-sign-in" label={t('haveAccount')} body={t('haveAccountBody')} disabled={!auth.configured} onPress={() => router.push('/auth/sign-in')} />
      <LinkRow testID="welcome-look-around" label={t('lookAround')} body={t('lookAroundBody')} onPress={auth.lookAround} />
      <LinkRow testID="welcome-import" label={t('importChoose')} body={t('welcomeImportBody')} onPress={() => router.push('/import')} />
    </Card>
  </Shell>;
}
