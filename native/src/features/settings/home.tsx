import { UnderBar } from '@/components/blur-bar';
import { useId, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { syncLineKey } from '@/data/sync-line';
import { t } from '@/i18n/en';
import { readGoalsData } from './goals-data';
import { EmptyState, Icon, KitText, LargeTitle, List, ListRow, NavBar, SearchField, StackGapContext, SurfaceContext, Tappable, mix, useKit } from '@/components/kit';
import { useTheme } from '@/design/theme-provider';
import { useAppleHealth } from '@/features/health/use-apple-health';
import { useOura } from '@/features/health/use-oura';
import { readProfile } from '@/features/onboarding/model';
import { st } from './copy';
import { workoutRest } from './workout-data';
import { useSettingsPrefs, type SettingsPrefs } from './prefs';
import { AvatarPhoto, useProfilePhoto } from './avatar-photo';
import { GROUPS, SECTIONS, searchSettings, type SectionId } from './sections';
import { remindersOn } from '@/features/reminders/plan';

/** The version the way iOS shows it, "1.0 (1)": a zero patch number is left off ("1.0.0" reads 1.0), any other stays. */
export function versionLabel(version: string | undefined, build: string | undefined) {
  return `${(version || '1.0').replace(/^(\d+\.\d+)\.0$/, '$1')} (${build || '1'})`;
}
export const APP_VERSION = versionLabel(Constants.expoConfig?.version, Constants.expoConfig?.ios?.buildNumber);
/** When the running app came from an over-the-air update, the day and time that update was published ("Nov 27, 9:02 PM"),
 * so a person can tell which update their phone is on. Empty for the code the build shipped with, or where updates are off. */
export function updateLabel(u: { isEnabled?: boolean; isEmbeddedLaunch?: boolean; createdAt?: Date | null } | null): string {
  if (!u?.isEnabled || u.isEmbeddedLaunch || !u.createdAt) return '';
  return u.createdAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function loadUpdates() { try { return require('expo-updates') as { isEnabled?: boolean; isEmbeddedLaunch?: boolean; createdAt?: Date | null }; } catch { return null; } }
export const APP_UPDATE = updateLabel(loadUpdates());
const mss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Opens a Settings section, optionally flashing one setting in it. */
export function openSection(id: SectionId, focus?: string) {
  if (id === 'appearance') router.push('/settings/appearance');
  else router.push({ pathname: '/settings/[section]', params: focus ? { section: id, focus } : { section: id } });
}

/** `.st-av`: the round avatar, the initial over the accent gradient with three faint contour lines. */
export function Avatar({ name, size }: { name: string; size: number }) {
  const k = useKit();
  const end = mix(k.c.training, k.c.accent, 0.7);
  const initial = name ? name.charAt(0).toLocaleUpperCase() : '';
  const id = 'st-av' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const photo = useProfilePhoto();
  return <View accessible={false} style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
    <Svg width={size} height={size} viewBox="0 0 60 60" style={{ position: 'absolute' }}>
      <Defs><RadialGradient id={id} cx="12" cy="6" r="72" gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor={k.c['accent-2']} /><Stop offset="0.45" stopColor={k.c.accent} /><Stop offset="1" stopColor={end} />
      </RadialGradient></Defs>
      <Rect width={60} height={60} fill={`url(#${id})`} />
      <Path d="M-4 40c14-10 26 6 40-4s18-12 30-6M-4 50c16-8 26 4 40-2s18-8 30-4M-4 30c12-8 24 4 38-4s20-10 32-6" stroke={k.c['on-accent']} strokeWidth={1} fill="none" opacity={0.35} />
    </Svg>
    {/* positioned, so web paints it above the absolute art as native does */}
    <View style={{ position: 'relative' }}>
      {initial ? <KitText weight={700} size={Math.round(size * 0.42)} tracking={-0.03} color="on-accent">{initial}</KitText>
        : <Icon name="person" size={Math.round(size * 0.46)} color={k.c['on-accent']} />}
    </View>
    {photo ? <AvatarPhoto uri={photo} size={size} /> : null}
  </View>;
}

/** Who is using the app, for the profile card and Account: a name only when one was given, and where the data lives. */
export function useWho() {
  const auth = useAuth();
  let name = '';
  try { name = auth.repository ? readProfile(auth.repository).name.trim() : ''; } catch { /* the card still says where data lives */ }
  const email = auth.session?.user.email ?? '';
  const signIn = auth.demo ? st('settingsExample') : auth.phoneOnly ? st('settingsOnPhone') : auth.session ? st('settingsSignedInApple') : st('settingsNotSignedIn');
  const detail = auth.demo ? st('settingsExampleBody') : auth.phoneOnly ? st('settingsOnPhoneBody') : '';
  return { auth, name, email, signIn, detail };
}

/** The value at the end of each section's row (SUM in the mockup). */
export function summary(id: SectionId, p: SettingsPrefs, theme: string, connected: number, syncs: boolean, o: { kcal?: number; limited?: boolean; rest?: number } = {}): string {
  // The calorie target is the one Goals and targets edits (the food targets), not a copy kept in Settings.
  const kcal = o.kcal ?? p.goals.kcal;
  switch (id) {
    case 'goals': return p.units.energy === 'kJ' ? `${Math.round(kcal * 4.184 / 10) * 10} kJ`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : `${kcal.toLocaleString('en-US')} kcal`;
    case 'connections': return st('settingsNConnected', { n: connected });
    case 'account': return st(syncs ? 'settingsSyncOn' : 'settingsSyncOff');
    // Without notifications (the phone-only build) no reminder is on, whatever was chosen before.
    case 'reminders': if (o.limited) return st('settingsOff'); return st('settingsNOn', { n: remindersOn(p.rem) });
    case 'privacy': return st(p.priv.lock ? 'settingsFaceId' : 'settingsNoLock');
    case 'appearance': return theme;
    case 'units': return p.units.weight === 'lb' ? 'US' : st('settingsMetric');
    case 'workout': return st('settingsRestValue', { v: mss(o.rest ?? p.work.rest) });
    case 'about': return APP_VERSION;
    default: return '';
  }
}

/** Settings: the large title, search, the profile card and the four groups of sections. */
export function SettingsHome() {
  const k = useKit(), insets = useSafeAreaInsets();
  const { override, mode } = useTheme();
  const [prefs] = useSettingsPrefs();
  const who = useWho();
  const [query, setQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const theme = st(override === 'system' ? 'settingsSystem' : mode === 'dark' ? 'settingsDark' : 'settingsLight');
  const apple = useAppleHealth(who.auth.repository), ring = useOura(who.auth.repository);
  const connected = (apple.access === 'asked' ? 1 : 0) + (ring.state === 'on' || ring.state === 'expired' ? 1 : 0);
  const hits = searchSettings(query);
  const syncs = !!who.auth.session && !who.auth.phoneOnly && prefs.sync.on;
  let goalKcal: number | undefined;
  try { goalKcal = who.auth.repository ? readGoalsData(who.auth.repository).kcal : undefined; } catch { goalKcal = undefined; }
  const line1 = who.name ? who.signIn : who.detail;
  // The card says where sync really stands, never "synced" while changes wait or sync is offline.
  const line2 = who.auth.session ? syncs ? t(syncLineKey({ status: who.auth.syncStatus, pending: who.auth.pending, conflicts: who.auth.conflicts })) : st('settingsSyncOff') : who.name ? who.detail : '';
  const leave = () => router.canGoBack() ? router.back() : router.replace('/');
  return <View testID="settings-home" style={{ flex: 1, backgroundColor: k.c.bg }}>
    <UnderBar bar={<NavBar testID="settings" back={st('settingsHomeBack')} onBack={leave} title={scrolled ? st('settings') : ''} />}>{top =>
    <ScrollView testID="screen-scroll" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" scrollEventThrottle={16} scrollIndicatorInsets={{ top }}
      onScroll={e => setScrolled(e.nativeEvent.contentOffset.y > 46)} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: top, paddingBottom: 48 + insets.bottom }}>
      <StackGapContext.Provider value={0}><SurfaceContext.Provider value="page">
        <LargeTitle display>{st('settings')}</LargeTitle>
        <View style={{ marginBottom: 16 }}>
          <SearchField testID="settings-search" placeholder={st('settingsSearchPlaceholder')} accessibilityLabel={st('settingsSearchPlaceholder')} value={query} onChangeText={setQuery}
            autoCorrect={false} autoCapitalize="none" returnKeyType="search" clearButtonMode="while-editing" />
        </View>
        {query.trim() ? <View accessibilityLiveRegion="polite">
          {hits.length ? <List testID="settings-results">{hits.map((hit, i) => <ListRow key={`${hit.section}-${hit.title}-${i}`} icon={SECTIONS[hit.section].icon}
            color={SECTIONS[hit.section].color} title={hit.title} sub={hit.sub} onPress={() => openSection(hit.section, hit.focus)} />)}</List>
            : <EmptyState icon="search" title={st('settingsNoMatchQ', { q: query.trim() })} description={st('settingsNoMatchHint')} />}
        </View> : <>
          <Tappable dim="none" testID="settings-profile" accessibilityRole="button" accessibilityLabel={[who.name || who.signIn, who.signIn, SECTIONS.account.title].filter(Boolean).join(', ')}
            onPress={() => openSection('account')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 84, paddingVertical: 14, paddingHorizontal: 16,
              borderRadius: 20, backgroundColor: pressed ? mix(k.c.text, k.c.surface, 0.05) : k.c.surface, boxShadow: k.cardEdge })}>
            <Avatar name={who.name || who.email} size={60} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <KitText weight={700} size={20} lineHeight={1.2} tracking={-0.02}>{who.name || who.signIn}</KitText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                {who.auth.session && who.name ? <Icon name="apple-fill" size={13} color={k.c['text-muted']} /> : null}
                <KitText weight={600} size={13.5} color="text-muted">{line1}</KitText>
              </View>
              {line2 ? <KitText weight={500} size={12.5} color="ghost" style={{ marginTop: 2 }}>{line2}</KitText> : null}
            </View>
            <Icon name="chevron-right" size={16} color={k.c.ghost} />
          </Tappable>
          <View style={{ height: 20 }} />
          {GROUPS.map((group, gi) => <View key={gi} style={{ marginTop: gi ? 20 : 0 }}>
            <List testID={`settings-group-${gi}`}>{group.map(id => {
              const s = SECTIONS[id], v = summary(id, prefs, theme, connected, syncs, { kcal: goalKcal, limited: !!who.auth.phoneOnly, rest: workoutRest(who.auth.repository, prefs.work.rest) });
              return <ListRow key={id} testID={`settings-row-${id}`} icon={s.icon} color={s.color === 'muted' ? 'text-muted' : s.color} title={s.title} value={v || undefined} onPress={() => openSection(id)} />;
            })}</List>
          </View>)}
          <KitText weight={500} size={12.5} color="ghost" style={{ textAlign: 'center', marginTop: 24 }}>{`Insight ${APP_VERSION}`}</KitText>
        </>}
      </SurfaceContext.Provider></StackGapContext.Provider>
    </ScrollView>}
    </UnderBar>
  </View>;
}
