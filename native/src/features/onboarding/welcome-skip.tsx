import { View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Icon, KitText, PressScale, Sheet, SheetHeader, useKit } from '@/components/kit';
import { useAuth } from '@/auth/provider';
import { useTheme } from '@/design/theme-provider';
import { t, type MessageKey } from '@/i18n/en';
import { chooseSkip, type SkipChoice } from './skip-choice';

/** The design's `ob-spark` for sample data. */
function Spark({ color }: { color: string }) {
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
    <Path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" /><Circle cx={12} cy={12} r={2.2} />
  </Svg>;
}

/** One 84 pt choice card (`.ob-choice`): a tinted icon tile, the name and a line, and a chevron. */
function Choice({ id, color, title, body, onPress }: { id: SkipChoice; color: string; title: MessageKey; body: MessageKey; onPress: (id: SkipChoice) => void }) {
  const k = useKit(), c = k.tok(color);
  return <PressScale testID={`skip-${id}`} accessibilityRole="button" accessibilityLabel={t(title)} accessibilityHint={t(body)} onPress={() => onPress(id)}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 84, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20,
      backgroundColor: k.dark ? k.c['surface-2'] : k.c.surface, boxShadow: k.cardEdge }}>
    <View style={{ width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: k.tint(c, 0.16) }}>
      {id === 'guest' ? <Icon name="person" size={22} color={c} /> : <Spark color={c} />}
    </View>
    {/* The design's card text sits in the muted colour, title and line alike. */}
    <View style={{ flex: 1, minWidth: 0 }}>
      <KitText weight={700} size={16.5} lineHeight={1.25} tracking={-0.015} color="text-muted">{t(title)}</KitText>
      <KitText weight={500} size={13.5} lineHeight={1.4} color="text-muted" style={{ marginTop: 3 }}>{t(body)}</KitText>
    </View>
    <Icon name="chevron-right" size={16} color={k.c.ghost} />
  </PressScale>;
}

/** ob-skip, the Skip for now sheet: start as a guest, or explore the app on sample data after a short tour. */
export function SkipSheet() {
  const auth = useAuth(), { reduceMotion } = useTheme();
  const pick = (choice: SkipChoice) => {
    router.back();
    setTimeout(() => chooseSkip(choice, { auth, replace: href => router.replace(href) }), reduceMotion ? 0 : 280);
  };
  return <Sheet testID="skip-sheet" header={<SheetHeader />}>
    <View>
      <KitText weight={700} size={30} lineHeight={1.1} tracking={-0.03} accessibilityRole="header" style={{ marginTop: 2, marginBottom: 6 }}>{t('obaSkip')}</KitText>
      <KitText weight={500} size={15} lineHeight={1.45} color="text-muted" style={{ marginBottom: 18 }}>{t('obaSkipLede')}</KitText>
      <View style={{ gap: 10 }}>
        <Choice id="guest" color="accent" title="obaGuest" body="obaGuestBody" onPress={pick} />
        <Choice id="demo" color="accent-2" title="obaSample" body="obaSampleBody" onPress={pick} />
      </View>
    </View>
  </Sheet>;
}
