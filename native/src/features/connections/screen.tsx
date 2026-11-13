import { Alert, View } from 'react-native';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import type { AppleHealthState } from '@/features/health/use-apple-health';
import type { OuraState } from '@/features/health/use-oura';
import { WIDGETS, type ServiceId } from '@/features/home-widgets/registry';
import { t } from '@/i18n/en';

const card = { borderRadius: 18, padding: tokens.spacing[3], gap: tokens.spacing[1] } as const;
const semibold = { fontWeight: '600' } as const;

const NAMES: Record<ServiceId, string> = { oura: 'Oura', appleHealth: 'Apple Health', fitbit: 'Fitbit', whoop: 'WHOOP' };
const PILLAR: Record<ServiceId, 'training' | 'food' | 'sleep'> = { oura: 'sleep', appleHealth: 'food', fitbit: 'training', whoop: 'sleep' };
/** The services Insight can connect today. Others join this list only once they can really connect. */
export const SHOWN: readonly ServiceId[] = ['appleHealth', 'oura'];
/** What each service adds, read from the Home widget catalogue so the two never drift apart. */
export const unlocks = (service: ServiceId) => WIDGETS.filter(widget => (widget.services as readonly ServiceId[]).includes(service)).map(widget => widget.title);
/** A service is ready to connect once at least one of its widgets is built. */
export const ready = (service: ServiceId) => WIDGETS.some(widget => widget.available && (widget.services as readonly ServiceId[]).includes(service));

function Monogram({ service }: { service: ServiceId }) {
  const { colors } = useTheme();
  // The letter is in the text colour so it reads in every theme; the service's pillar colour is the ring around it.
  return <View style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 2, borderColor: colors[PILLAR[service]], alignItems: 'center', justifyContent: 'center', backgroundColor: colors['surface-2'] }}>
    <ThemedText style={semibold}>{NAMES[service].charAt(0)}</ThemedText>
  </View>;
}

/** Health & devices: the services Insight can connect, each with its status, and the Apple Health and Oura cards
 * that connect them. With neither card given it only lists them and connects nothing. */
export function ConnectedServices({ connected: given = [], apple, oura }: { connected?: readonly ServiceId[]; apple?: AppleHealthState; oura?: OuraState }) {
  const { colors } = useTheme();
  const live = !!apple && apple.access !== 'unavailable';
  // Oura is offered only to a signed-in account, which is where its connection lives.
  // "Expired" is still connected (the stored days still show) but needs Oura's page again for new ones.
  const ring = !!oura && oura.state !== 'unavailable', ringOn = ring && oura.state === 'on', ringExpired = ring && oura.state === 'expired';
  // Unreachable: the connection could not be read, so nothing is claimed either way; the only button tries again.
  const ringUnknown = ring && oura.state === 'unreachable';
  const connected = [...given, ...(live && apple.access === 'asked' && !given.includes('appleHealth') ? ['appleHealth' as const] : []),
    ...((ringOn || ringExpired) && !given.includes('oura') ? ['oura' as const] : [])];
  // Disconnecting removes the Oura login and the stored Oura days from the account, so the system asks first.
  const confirmOff = () => Alert.alert(t('ouraOffTitle'), t('ouraOffBody'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('ouraDisconnect'), style: 'destructive', onPress: () => oura?.disconnect() },
  ]);
  return <View style={{ gap: tokens.spacing[3] }}>
    <View style={{ gap: tokens.spacing[0] }}>
      <ThemedText variant="title" accessibilityRole="header" style={semibold}>{t('connectTitle')}</ThemedText>
      <ThemedText muted>{t('connectBody')}</ThemedText>
    </View>
    <Card style={[card, { gap: 0, paddingVertical: tokens.spacing[1] }]} testID="connect-services">
      {SHOWN.map((service, index) => {
        const adds = unlocks(service), state = service === 'oura' && ringExpired ? 'connectAgain' : service === 'oura' && ringUnknown ? 'connectUnknown' : connected.includes(service) ? 'connectOn' : ready(service) ? 'connectOff' : 'connectLater';
        return <View key={service} testID={`connect-${service}`} accessible accessibilityLabel={`${NAMES[service]}, ${t(state)}. ${t('connectAdds')} ${adds.join(', ')}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2], paddingVertical: tokens.spacing[2], borderTopWidth: index ? 1 : 0, borderTopColor: colors['surface-2'] }}>
          <Monogram service={service} />
          <View style={{ flex: 1 }}>
            <ThemedText variant="headline">{NAMES[service]}</ThemedText>
            <ThemedText muted variant="caption">{adds.join(' · ')}</ThemedText>
          </View>
          <View style={{ paddingHorizontal: 10, minHeight: 26, borderRadius: 99, justifyContent: 'center', backgroundColor: state === 'connectOn' ? colors['accent-tint'] : colors['surface-2'] }}>
            <ThemedText variant="caption" style={[semibold, { color: state === 'connectOn' ? colors.text : colors['text-muted'] }]}>{t(state)}</ThemedText>
          </View>
        </View>;
      })}
    </Card>
    {live && <Card style={card} testID="connect-apple-card">
      <ThemedText variant="headline" accessibilityRole="header" style={semibold}>{t('appleHealthTitle')}</ThemedText>
      <ThemedText muted>{t(apple.access === 'asked' ? 'appleHealthOn' : 'appleHealthOff')}</ThemedText>
      {apple.added !== null && <ThemedText testID="connect-apple-added" accessibilityLiveRegion="polite">{apple.added === 0 ? t('appleHealthNone') : apple.added === 1 ? t('appleHealthOne') : t('appleHealthMany').replace('{n}', String(apple.added))}</ThemedText>}
      {apple.failed && <ThemedText testID="connect-apple-failed" accessibilityLiveRegion="polite" style={{ color: colors.warning }}>{t('appleHealthFailed')}</ThemedText>}
      <Button testID="connect-apple-button" label={t(apple.busy ? 'appleHealthBusy' : apple.access === 'asked' ? 'appleHealthAgain' : 'appleHealthConnect')} disabled={apple.busy} variant={apple.access === 'asked' ? 'secondary' : 'primary'} onPress={apple.connect} />
      {apple.access === 'asked' && <ThemedText muted variant="caption">{t('appleHealthStop')}</ThemedText>}
    </Card>}
    {ring && <Card style={card} testID="connect-oura-card">
      <ThemedText variant="headline" accessibilityRole="header" style={semibold}>{t('ouraTitle')}</ThemedText>
      {!ringUnknown && <ThemedText muted>{t(ringOn ? 'ouraOn' : ringExpired ? 'ouraExpired' : 'ouraOff')}</ThemedText>}
      {oura.failed && <ThemedText testID="connect-oura-failed" accessibilityLiveRegion="polite" style={{ color: colors.warning }}>{t('ouraFailed')}</ThemedText>}
      <Button testID="connect-oura-button" label={t(oura.busy ? 'appleHealthBusy' : ringOn ? 'appleHealthAgain' : ringExpired ? 'ouraReconnect' : ringUnknown ? 'ouraRetry' : 'ouraConnect')} disabled={oura.busy} variant={ringOn ? 'secondary' : 'primary'} onPress={ringOn || ringUnknown ? oura.refresh : oura.connect} />
      {ringExpired && <Button testID="connect-oura-again" label={t('appleHealthAgain')} disabled={oura.busy} variant="secondary" onPress={oura.refresh} />}
      {(ringOn || ringExpired) && <Button testID="connect-oura-off" label={t('ouraDisconnect')} disabled={oura.busy} variant="secondary" onPress={confirmOff} />}
      {!ringOn && !ringUnknown && <ThemedText muted variant="caption">{t('ouraReturn')}</ThemedText>}
    </Card>}
    {!live && !ring && <ThemedText muted variant="caption">{t('connectSoon')}</ThemedText>}
    <ThemedText muted variant="caption">{t(ring ? 'connectPrivacyOura' : 'connectPrivacy')}</ThemedText>
  </View>;
}
