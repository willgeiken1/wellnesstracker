import { useRef, useState, type ReactNode } from 'react';
import { signOutError } from './auth-errors';
import { signOutUnsynced, t } from '@/i18n/en';
import { Image, Linking, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Eyebrow, Tappable, Icon, KitText, List, ListFooter, ProgressBar, SegmentedControl, alpha, useKit, type IconName } from '@/components/kit';
import { formatNumber } from '@/components/stepper';
import { useAuth } from '@/auth/provider';
import { FLOZ } from '@/features/food/water';
import { lastWeight } from '@/features/body/model';
import { useWorkoutStore } from '@/features/workout/use-workout';
import { saveWorkoutRest, workoutRest } from './workout-data';
import { trainingMinutes } from '@/features/home/hero/data';
import { localDay } from '@/core/workout/rules';
import { readGoalsData, saveFoodTarget, saveGoalWeight, saveWaterGoal, type GoalsData } from './goals-data';
import { useTheme } from '@/design/theme-provider';
import { showToast } from '@/features/shell/toast';
import { useAppleHealth } from '@/features/health/use-apple-health';
import { useOura } from '@/features/health/use-oura';
import { readProfile, saveProfile } from '@/features/onboarding/model';
import { devicePreferencesUnsaved, saveDevicePreferences, useDevicePreferences } from '@/features/onboarding/device-preferences';
import { LEGAL_LINKS, openPage } from './links';
import { iconArt, iconId } from './app-icon';
import { st } from './copy';
import { APP_VERSION, Avatar, useWho } from './home';
import { useSettingsPrefs, type SettingsPrefs } from './prefs';
import { actionSheet } from './sheet-actions';
import { Cl, Gap, H, Hero, ListRow, Panel, PickRow, RowStepper, SetPage, TimeStepper, useOptionalAuth } from './ui';
import { backupWhen } from './data-actions';

const KG = 2.20462;
const hm = (min: number) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return `${h} h${m ? ` ${m} m` : ''}`; };
const mss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const trim = (n: number, d: number) => String(+n.toFixed(d));
/** A clock time in the person's format ("5:30 PM" or "17:30"). */
export function clock(time: string, p: SettingsPrefs) {
  if (p.units.clock === '12') return time;
  const m = /^(\d{1,2}):(\d{2}) ?(AM|PM)$/.exec(time); if (!m) return time;
  const h = (+m[1] % 12) + (m[3] === 'PM' ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}
const wt = (lb: number, p: SettingsPrefs, d = 1) => p.units.weight === 'kg' ? `${(lb / KG).toFixed(d)} kg` : `${lb.toFixed(d)} lb`;
const paceLabel = (lb: number, p: SettingsPrefs) => p.units.weight === 'kg' ? `${trim(lb / KG, 2)} kg a week` : `${trim(lb, 2)} lb a week`;

/** A row with a compact segmented control at its end (`rowSeg`, 150 pt wide). */
function SegRow<T extends string>({ title, sub, value, options, onChange }: { title: string; sub?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return <ListRow title={title} sub={sub} right={<View style={{ width: 150 }}><SegmentedControl compact label={title} value={value} options={options} onChange={onChange} /></View>} />;
}
/** The "opens outside the app" mark at a row's end; it sits where a chevron would (`.chev`: 4 pt out each side). */
const Ext = () => { const k = useKit(); return <View style={{ marginHorizontal: -4 }}><Icon name="ext" size={16} color={k.c.ghost} /></View>; };

/* ---------- Goals and targets ---------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export function GoalsPage() {
  const repo = useAuth().repository;
  const [p, set] = useSettingsPrefs();
  const [, bump] = useState(0);
  const kj = p.units.energy === 'kJ', kg = p.units.weight === 'kg', ml = p.units.water === 'ml';
  let g: GoalsData | null = null;
  try { g = repo ? readGoalsData(repo) : null; } catch { g = null; }
  const save = (fn: () => void) => { try { fn(); } catch { /* left as last saved */ } bump(n => n + 1); };
  const kcal = g?.kcal ?? p.goals.kcal, protein = g?.protein ?? p.goals.protein;
  const goalLb = g?.goalKg != null ? g.goalKg * KG : p.goals.weight;
  const sleep = Array.from({ length: 7 }, (_, i) => 390 + i * 30).map(v => ({ v, l: hm(v) }));
  const pace = (kg ? [0.1, 0.25, 0.5, 0.75].map(k => +(k * KG).toFixed(4)) : [0.25, 0.5, 1, 1.5]).map(v => ({ v, l: paceLabel(v, p) }));
  const nowLb = g?.currentKg != null ? g.currentKg * KG : null, startLb = g?.startKg != null ? g.startKg * KG : null;
  const left = nowLb != null ? Math.max(0, nowLb - goalLb) : null;
  const eta = left ? new Date(Date.now() + Math.round(left / p.goals.pace * 7) * 86400000) : null;
  const foot = nowLb == null ? st('settingsPaceFootNoWeight') : !left ? st('settingsAtGoal')
    : st('settingsPaceFoot', { pace: paceLabel(p.goals.pace, p), goal: wt(goalLb, p), date: `${MONTHS[eta!.getMonth()]} ${eta!.getDate()}` });
  const lost = nowLb != null && startLb != null ? startLb - nowLb : null, total = startLb != null ? startLb - goalLb : null;
  const hasProgress = lost != null && total != null && total > 0;
  // Minutes trained today, as Home's Insight map counts them (finished sessions and the one running now).
  const store = useWorkoutStore(repo);
  let trained: number | null = null;
  try { trained = store ? trainingMinutes(store, [localDay(new Date())], new Date())[0] : null; } catch { trained = null; }
  const waterV = g ? (ml ? Math.round(g.waterL * 10) * 100 : Math.round(g.waterL * FLOZ)) : null;
  return <SetPage back={st('settings')} title={st('settingsGoalsTitle')} testID="settings-goals">
    <H first>{st('settingsDailyTargets')}</H>
    <List footer={st('settingsTargetsFoot')}>
      <ListRow title={st('settingsCalories')} sub={g ? st('settingsEatenToday', { v: kj ? `${formatNumber(g.eaten * 4.184)} kJ` : `${formatNumber(g.eaten)} kcal` }) : undefined}
        right={<RowStepper label={st('settingsDailyCalories')} value={kj ? Math.round(kcal * 4.184 / 10) * 10 : kcal}
        step={kj ? 250 : 50} snap min={kj ? 4000 : 1000} max={kj ? 20000 : 5000} unit={kj ? 'kJ' : ''}
        onChange={v => { const next = kj ? Math.round(v / 4.184) : v; if (repo) save(() => saveFoodTarget(repo, 'kcal', next)); else set('goals.kcal', next); }} />} />
      <ListRow title={st('settingsProtein')} sub={g ? st('settingsSoFarG', { v: g.proteinSoFar }) : undefined}
        right={<RowStepper label={st('settingsDailyProtein')} value={protein} step={5} min={40} max={300} unit="g"
        onChange={v => { if (repo) save(() => saveFoodTarget(repo, 'protein', v)); else set('goals.protein', v); }} />} />
      <ListRow title={st('settingsTraining')} sub={trained != null ? st('settingsMinToday', { v: trained }) : undefined} right={<RowStepper label={st('settingsDailyTraining')} value={p.goals.train} step={5} min={10} max={180} unit="min" onChange={v => set('goals.train', v)} />} />
      <PickRow title={st('settingsSleep')} value={p.goals.sleep} options={sleep} onPick={v => set('goals.sleep', v)} />
      {g && waterV != null ? <ListRow title={st('settingsWater')} sub={st('settingsSoFar', { v: ml ? `${formatNumber(Math.round(g.drankL * 1000))} mL` : `${Math.round(g.drankL * FLOZ)} oz` })}
        right={<RowStepper label={st(ml ? 'settingsDailyWaterMl' : 'settingsDailyWaterOz')} value={waterV} step={ml ? 100 : 4} min={ml ? 1000 : 32} max={ml ? 6000 : 200} unit={ml ? 'mL' : 'oz'}
          onChange={v => save(() => saveWaterGoal(repo!, ml ? v / 1000 : v / FLOZ))} />} /> : null}
    </List>
    <H>{st('settingsWeightGoal')}</H>
    <Panel>
      {hasProgress ? <View style={{ padding: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Eyebrow>{st('settingsProgress')}</Eyebrow>
          <KitText weight={700} size={14} numeric color="text-muted">{st('settingsLostOf', { a: wt(Math.max(0, lost), p), b: wt(total, p) })}</KitText>
        </View>
        <View style={{ marginTop: 10, marginBottom: 8 }}><ProgressBar value={Math.max(0, Math.min(1, lost / total))} color="accent" label={st('settingsProgress')} /></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <KitText weight={600} size={12.5} color="text-muted">{st('settingsStartW', { v: wt(startLb!, p) })}</KitText>
          <KitText weight={600} size={12.5} color="text-muted">{st('settingsGoalW', { v: wt(goalLb, p) })}</KitText>
        </View>
      </View> : null}
      <Cl first={!hasProgress}><ListRow title={st('settingsGoalWeight')} right={<RowStepper label={st('settingsGoalWeight')} value={kg ? Number((goalLb / KG).toFixed(1)) : Number(goalLb.toFixed(1))}
        step={0.5} dec={1} min={kg ? 36 : 80} max={kg ? 180 : 400} unit={kg ? 'kg' : 'lb'}
        onChange={v => { set('goals.weight', kg ? Math.round(v * KG * 2) / 2 : v); if (repo) save(() => saveGoalWeight(repo, v, kg ? 'kg' : 'lb')); }} />} /></Cl>
      {nowLb != null && g?.currentDay ? <Cl><ListRow title={st('settingsCurrentWeight')} sub={shortDay(g.currentDay)} value={wt(nowLb, p)}
        onPress={() => router.push('/progress' as never)} /></Cl> : null}
      <Cl><PickRow title={st('settingsWeeklyPace')} value={p.goals.pace} options={pace} short={v => paceLabel(v, p)} onPick={v => set('goals.pace', v)} /></Cl>
    </Panel>
    <ListFooter>{foot}</ListFooter>
  </SetPage>;
}

/* ---------- Connections ---------- */
function Conn({ icon, color, name, meta, badge, body, children }: { icon: IconName; color: string; name: string; meta: string; badge: ReactNode; body: string; children?: ReactNode }) {
  const k = useKit(), c = k.tok(color);
  return <View style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(c, 0.16) }}><Icon name={icon} size={24} color={c} /></View>
      <View style={{ flex: 1 }}>
        <KitText weight={700} size={18} tracking={-0.02}>{name}</KitText>
        <KitText weight={500} size={13} color="text-muted" style={{ marginTop: 1 }}>{meta}</KitText>
      </View>
      {/* The kit badge sits at the top of a column; here it centres on the name and its line. */}
      <View>{badge}</View>
    </View>
    <KitText weight={500} size={13.5} lineHeight={1.45} color="text-muted" style={{ marginTop: 12 }}>{body}</KitText>
    {children}
  </View>;
}
const READS: [string, string][] = [['Weight and body fat', 'accent-2'], ['Steps', 'recovery'], ['Active energy', 'food'], ['Sleep', 'sleep'], ['Heart rate and HRV', 'danger'], ['Workouts', 'training'], ['Water', 'water']];
/** `limited`: the phone-only build, which has no Apple Health, Oura or notifications. The page keeps its layout but offers
 * nothing it cannot do: Apple Health says it comes later, Oura stays off, and Coming later has no "Tell me". */
export function ConnectionsPage({ limited = false }: { limited?: boolean }) {
  const k = useKit();
  // Settings also opens with no account provider around it; Apple Health and Oura are then simply not offered.
  const repository = useOptionalAuth()?.repository ?? null;
  const [p, set] = useSettingsPrefs();
  const apple = useAppleHealth(repository), ring = useOura(repository);
  const appleOn = apple.access === 'asked', ou = ring.state === 'on' || ring.state === 'expired', ouraOffered = ring.state !== 'unavailable';
  return <SetPage back={st('settings')} title={st('settingsConnectionsTitle')} testID="settings-connections">
    <H first>Apple Health</H>
    <Panel>
      <Conn icon="heart" color="danger" name="Apple Health" meta={limited ? st('settingsLaterVersion') : appleOn ? st('settingsReadOnOpen') : st('settingsNotConnected')}
        badge={limited ? <Badge label={st('settingsOff')} color="warning" /> : <Badge label={st('settingsReadsOnly')} color="success" />} body={st(limited ? 'settingsHealthBodyLater' : 'settingsHealthBody')}>
        <View accessibilityLabel={st('settingsWhatReads')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {READS.map(([label, color]) => <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 10, borderRadius: 999,
            backgroundColor: k.dark ? k.c['surface-2'] : k.c.bg }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: k.tok(color) }} />
            <KitText weight={600} size={12.5}>{label}</KitText>
          </View>)}
        </View>
      </Conn>
      {limited ? null : <Cl>
        <ListRow title={st(appleOn ? 'settingsReadHealthNow' : 'settingsConnectHealth')} chevron={false} right={<View style={{ marginHorizontal: -4 }}><Icon name="repeat" size={16} color={k.c.ghost} /></View>}
          disabled={apple.access === 'unavailable' || apple.busy} onPress={() => apple.connect()} />
        <ListRow title={st('settingsChooseReads')} sub={st('settingsInHealthApp')} chevron={false} right={<Ext />}
          onPress={() => actionSheet({ title: st('settingsChooseReads'), message: st('settingsChooseReadsMsg'), acts: [{ label: st('settingsOpenHealth'), onPress: () => { void Linking.openURL('x-apple-health://').catch(() => {}); } }] })} />
      </Cl>}
    </Panel>
    {apple.access === 'unavailable' && !limited && <ListFooter>{st('settingsHealthUnavailable')}</ListFooter>}
    <H>Oura</H>
    <Panel>
      <Conn icon="ring" color="recovery" name="Oura" meta={ou ? (ring.state === 'expired' ? st('settingsOuraExpired') : st('settingsConnected')) : st('settingsNotConnected')}
        badge={<Badge label={ou ? st('settingsConnected') : st('settingsOff')} color={ou ? 'success' : 'warning'} />}
        body={ou ? st('settingsOuraOnBody') : st('settingsOuraOffBody')} />
      <Cl>{ou ? <>
        <ListRow title={st('settingsSyncOura')} chevron={false} disabled={ring.busy} onPress={() => ring.refresh()} />
        <ListRow title={st('settingsReconnectOura')} sub={st('settingsReconnectOuraSub')} onPress={() => actionSheet({ title: st('settingsReconnectOuraQ'), message: st('settingsReconnectOuraMsg'),
          acts: [{ label: st('settingsContinueOura'), onPress: () => ring.connect() }] })} />
        <ListRow title={st('settingsDisconnectOura')} danger chevron={false} onPress={() => actionSheet({ title: st('settingsDisconnectOuraQ'), message: st('settingsDisconnectOuraMsg'),
          acts: [{ label: st('settingsDisconnectOura'), destructive: true, onPress: () => { ring.disconnect(); showToast(st('settingsOuraDisconnected'), { color: 'warning' }); } }] })} />
      </> : ouraOffered ? <ListRow title={st('settingsConnectOura')} sub={st('settingsConnectOuraSub')} onPress={() => ring.connect()} />
        /* Not offered (no account to keep Oura days in): the row is dimmed like the design's disabled rows and has no chevron. */
        : <View style={{ opacity: 0.45 }}><ListRow title={st('settingsConnectOura')} sub={st('settingsOuraNeedsAccount')} chevron={false} disabled onPress={() => {}} /></View>}</Cl>
    </Panel>
    <H>{st('settingsComingLater')}</H>
    <List footer={st('settingsLaterFoot')}>
      {['Fitbit', 'WHOOP', 'Garmin'].map(n => {
        const on = !!p.later[n];
        // Nothing can tell the person later without notifications, so the phone-only build only names what is coming.
        if (limited) return <ListRow key={n} title={n} sub={st('settingsComingLater')} chevron={false} />;
        return <ListRow key={n} title={n} sub={on ? st('settingsLaterOn') : st('settingsComingLater')} chevron={false}
          accessibilityLabel={`${n}, ${st('settingsComingLaterLower')}. ${on ? st('settingsLaterOnA11y') : st('settingsLaterOffA11y')}`}
          right={on ? <Badge label={st('settingsOnTheList')} color="success" /> : <View style={{ minHeight: 34, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: alpha(k.c.accent, 0.16) }}>
            <KitText weight={700} size={13.5} tracking={-0.01} color="accent">{st('settingsTellMe')}</KitText></View>}
          onPress={() => { set(`later.${n}`, !on); showToast(!on ? st('settingsLaterToast', { n }) : st('settingsLaterOffToast', { n })); }} />;
      })}
    </List>
  </SetPage>;
}

/* ---------- Account and sync ---------- */
/** `.st-field`: a label and a right-aligned text field in one 56 pt row. */
function NameField({ repo }: { repo: NonNullable<ReturnType<typeof useAuth>['repository']> }) {
  const k = useKit();
  const [name, setName] = useState(() => { try { return readProfile(repo).name; } catch { return ''; } });
  const commit = () => { try { saveProfile(repo, { ...readProfile(repo), name: name.trim() }); } catch { /* the profile keeps its last saved name */ } };
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16 }}>
    <KitText weight={600} size={15.5} style={{ width: 96 }}>{st('settingsName')}</KitText>
    <TextInput testID="settings-name" value={name} onChangeText={setName} onBlur={commit} onSubmitEditing={commit} returnKeyType="done" autoComplete="given-name"
      accessibilityLabel={st('settingsName')} style={{ flex: 1, minWidth: 0, minHeight: 44, textAlign: 'right', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15.5, color: k.c.text }} />
  </View>;
}
export function AccountPage() {
  const k = useKit();
  const who = useWho();
  const [p, set] = useSettingsPrefs();
  const auth = who.auth;
  const syncs = !!auth.session && !auth.phoneOnly;
  const relay = /privaterelay\.appleid\.com$/i.test(who.email);
  const [error, setError] = useState<'signOutFailed' | 'signOutNotStarted' | null>(null);
  const busy = useRef(false);
  const leave = async (discard: boolean) => {
    if (busy.current) return; busy.current = true;
    try { await (discard ? auth.signOut(true) : auth.signOut()); showToast(st('settingsSignedOut')); }
    catch (cause) { setError(signOutError(cause)); }
    finally { busy.current = false; }
  };
  /* Sync first; when changes would be lost, say how many and ask again (the sign-out rules in auth/screens). */
  const signOut = async () => {
    if (busy.current) return; busy.current = true; setError(null);
    let count = 0;
    try { await auth.prepareSignOut?.(); count = auth.repository?.unsyncedCount() ?? auth.pending; }
    catch (cause) { busy.current = false; setError(signOutError(cause)); return; }
    busy.current = false;
    if (count === 0) { void leave(false); return; }
    actionSheet({ title: t('signOutConfirm'), message: `${t('signOutBody')} ${signOutUnsynced(count)}`, cancel: t('signOutWait'),
      acts: [{ label: t('signOutAnyway'), destructive: true, onPress: () => { void leave(true); } }] });
  };
  return <SetPage back={st('settings')} title={st('settingsAccountTitle')} testID="settings-account">
    <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
      <Avatar name={who.name || who.email} size={92} />
      <KitText weight={700} size={24} tracking={-0.03} style={{ marginTop: 12 }}>{who.name || who.signIn}</KitText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
        {auth.session ? <Icon name="apple-fill" size={14} color={k.c['text-muted']} /> : null}
        <KitText weight={600} size={13.5} color="text-muted">{who.name ? who.signIn : who.detail}</KitText>
      </View>
    </View>
    {auth.repository && !auth.demo ? <>
      <H>{st('settingsProfileH')}</H>
      <Panel>
        <NameField repo={auth.repository} />
        {auth.session ? <Cl><ListRow title={st('settingsSignIn')} sub={relay ? st('settingsHideMyEmail') : who.email || undefined} value="Apple"
          onPress={() => actionSheet({ title: st('settingsSignedInApple'), message: st('settingsSignInMsg'), acts: [{ label: st('settingsOpenIosSettings'), onPress: () => { void Linking.openSettings().catch(() => {}); } }] })} /></Cl> : null}
      </Panel>
    </> : null}
    {syncs ? <>
      <H>{st('settingsSync')}</H>
      <List>
        <ListRow title={st('settingsSyncAcross')} sub={p.sync.on ? st('settingsSyncAcrossOn') : st('settingsSyncAcrossOff')} toggle={p.sync.on}
          onToggle={v => { set('sync.on', v); showToast(v ? st('settingsSyncOnToast') : st('settingsSyncOffToast'), { color: v ? 'success' : 'warning' }); }} />
        <ListRow title={st('settingsSyncNow')} chevron={false} onPress={() => { if (!p.sync.on) { showToast(st('settingsSyncFirst'), { color: 'warning' }); return; } void auth.syncNow?.(); showToast(st('settingsSyncedNow')); }} />
      </List>
    </> : null}
    <H>{st('settingsDevices')}</H>
    <List footer={auth.demo ? st('settingsExampleFoot') : auth.phoneOnly || !auth.session ? st('settingsPhoneOnlyFoot') : undefined}>
      <ListRow icon="iphone" color="accent" title={st('settingsThisIphone')} sub={st('settingsActiveNow')} chevron={false}
        onPress={() => showToast(st('settingsUsingIphone'))} right={<Badge label={st('settingsThisDevice')} color="accent" />} />
    </List>
    <Gap />
    {auth.demo ? <List>
        {!auth.phoneOnly && auth.configured ? <ListRow title={t('createAccount')} onPress={() => router.push('/onboarding')} /> : null}
        {!auth.phoneOnly && auth.configured ? <ListRow title={t('haveAccount')} onPress={() => router.push('/sign-in')} /> : null}
        <ListRow title={st('settingsBackToLog')} chevron={false} onPress={() => { void auth.signOut(); router.replace('/'); }} />
      </List>
      : auth.session ? <List><ListRow title={st('settingsSignOut')} danger chevron={false} onPress={() => actionSheet({ title: st('settingsSignOutQ'), message: st('settingsSignOutMsg'),
        acts: [{ label: st('settingsSignOut'), destructive: true, onPress: () => { void signOut(); } }] })} /></List>
      : <List><ListRow title={st('settingsLookAround')} sub={st('settingsLookAroundSub')} onPress={() => { auth.lookAround(); router.replace('/'); }} /></List>}
    {error ? <KitText weight={500} size={13} color="danger" accessibilityRole="alert" style={{ marginTop: 8, marginHorizontal: 16 }}>{t(error)}</KitText> : null}
  </SetPage>;
}

/* ---------- Reminders ---------- */
const REM_OFF: SettingsPrefs['rem'] = { cap: false, workout: false, workoutTime: '5:30 PM', rest: false, weekly: false, food: false, breakfast: false, lunch: false, dinner: false, oura: false };
/** `limited`: the phone-only build, which cannot send notifications. Every reminder is shown as it will be, switched off
 * and greyed out, and the hero says they come later, so no switch claims to do something it cannot. */
export function RemindersPage({ limited = false }: { limited?: boolean }) {
  const [p, set] = useSettingsPrefs();
  const r = limited ? REM_OFF : p.rem, n = (['workout', 'rest', 'weekly', 'food', 'oura'] as const).filter(key => r[key]).length;
  const times = ['6:00 AM', '7:00 AM', '12:00 PM', '5:30 PM', '7:00 PM'].map(v => ({ v, l: clock(v, p) }));
  const tog = (title: string, key: keyof SettingsPrefs['rem'], sub?: string, value?: string) =>
    <ListRow key={key} testID={`reminders-${key}`} title={title} sub={sub} value={value} toggle={!!r[key]} disabled={limited} onToggle={v => set(`rem.${key}`, v)} />;
  return <SetPage back={st('settings')} title={st('settingsRemindersTitle')} testID="settings-reminders">
    <Hero icon="bell" color="danger" title={st('settingsOnlyWhatHelps')} body={limited ? st('settingsRemHeroLater') : st(r.cap ? 'settingsRemHeroCap' : 'settingsRemHero', { n })} />
    <Gap />
    <List>{tog(st('settingsAtMost2'), 'cap', st('settingsAtMost2Sub'))}</List>
    <H>{st('settingsTraining')}</H>
    <List>
      {tog(st('settingsWorkoutReminder'), 'workout', st('settingsWorkoutReminderSub'))}
      {r.workout ? <PickRow key="time" title={st('settingsTime')} value={r.workoutTime} options={times} onPick={v => set('rem.workoutTime', v)} /> : null}
      {tog(st('settingsRestAlert'), 'rest', st('settingsRestAlertSub'))}
    </List>
    <H>{st('settingsWeeklyReport')}</H>
    <List>{tog(st('settingsWeeklyReport'), 'weekly', st('settingsWeeklyReportSub', { t: clock('8:00 AM', p) }))}</List>
    <H>{st('settingsFood')}</H>
    <List>
      {tog(st('settingsFoodReminders'), 'food', st('settingsFoodRemindersSub'))}
      {r.food ? tog(st('settingsBreakfast'), 'breakfast', undefined, clock('9:30 AM', p)) : null}
      {r.food ? tog(st('settingsLunch'), 'lunch', undefined, clock('1:30 PM', p)) : null}
      {r.food ? tog(st('settingsDinner'), 'dinner', undefined, clock('8:00 PM', p)) : null}
    </List>
    <H>{st('settingsConnectionsTitle')}</H>
    <List>{tog(st('settingsOuraAlert'), 'oura', st('settingsOuraAlertSub'))}</List>
    {limited ? null : <>
      <Gap />
      <List footer={st('settingsIosNotifFoot')}>
        <ListRow title={st('settingsIosNotifications')} chevron={false} right={<Ext />} onPress={() => { void Linking.openSettings().catch(() => {}); }} />
      </List>
    </>}
  </SetPage>;
}

/* ---------- Privacy and security ---------- */
/** `ai`: the meal estimate and workout summary controls, only passed while those features are switched on. */
export function PrivacyPage({ crash, analytics, ai }: { crash?: ReactNode; analytics?: ReactNode; ai?: ReactNode }) {
  const [p, set] = useSettingsPrefs();
  const after = [{ v: '0', l: st('settingsImmediately') }, { v: '1', l: st('settingsAfter1') }, { v: '5', l: st('settingsAfter5') }, { v: '15', l: st('settingsAfter15') }];
  const repo = useAuth().repository;
  let lastKg: number | null = null;
  try { lastKg = repo ? lastWeight(repo.list('weigh_ins')) : null; } catch { lastKg = null; }
  return <SetPage back={st('settings')} title={st('settingsPrivacyTitle')} testID="settings-privacy">
    <List>
      <ListRow icon="faceid" color="success" title={st('settingsFaceIdLock')} sub={st('settingsFaceIdLockSub')} toggle={p.priv.lock} onToggle={v => set('priv.lock', v)} />
      {p.priv.lock ? <PickRow title={st('settingsRequireFaceId')} value={p.priv.after} options={after} onPick={v => set('priv.after', v)} /> : null}
      <ListRow icon="blur" color="recovery" title={st('settingsBlur')} sub={st('settingsBlurSub')} toggle={p.priv.blur}
        onToggle={v => { set('priv.blur', v); showToast(v ? st('settingsBlurOnToast') : st('settingsBlurOffToast')); }} />
      <ListRow icon="eyeoff" color="accent-2" title={st('settingsHideNumbers')} sub={st('settingsHideNumbersSub')} toggle={p.priv.hide} onToggle={v => set('priv.hide', v)} />
    </List>
    {lastKg != null ? <Panel style={{ marginTop: 12 }}><HidePreview text={p.priv.hide ? `••• ${p.units.weight}` : wt(lastKg * KG, p)} /></Panel> : null}
    <H>{st('settingsDiagnostics')}</H>
    {crash ?? null}{analytics ?? null}
    <ListFooter>{st('settingsDiagnosticsFoot')}</ListFooter>
    {ai ?? null}
    <H>{st('settingsYourData')}</H>
    <List>
      <ListRow icon="shield" color="success" title={st('settingsPrivacyCenter')} sub={st('settingsPrivacyCenterSub')} onPress={() => router.push({ pathname: '/settings/[section]', params: { section: 'privacy-center' } })} />
      <ListRow icon="trash" color="danger" title={st('settingsDeleteRange')} sub={st('settingsDeleteRangeSub')} onPress={() => router.push({ pathname: '/settings/[section]', params: { section: 'delete-range' } })} />
    </List>
  </SetPage>;
}

function HidePreview({ text }: { text: string }) {
  const k = useKit();
  return <View accessible style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: k.c.hair }}>
    <KitText weight={600} size={13.5} color="text-muted">{st('settingsPreviewOnHome')}</KitText>
    <KitText weight={700} size={17} numeric>{text}</KitText>
  </View>;
}

/* ---------- Units and formats ---------- */
export function UnitsPage() {
  const k = useKit();
  const [p, set] = useSettingsPrefs();
  const u = p.units;
  const weeks = [{ v: 'mon' as const, l: 'Monday' }, { v: 'sun' as const, l: 'Sunday' }, { v: 'sat' as const, l: 'Saturday' }];
  const order = { mon: ['Monday', 'Sunday'], sun: ['Sunday', 'Saturday'], sat: ['Saturday', 'Friday'] }[u.week];
  const sample = [wt(182.1, p), u.height === 'cm' ? '180 cm' : '5 ft 11 in', u.energy === 'kJ' ? '5,190 kJ' : '1,240 kcal', u.water === 'ml' ? '1,680 mL' : '57 oz',
    u.distance === 'km' ? '5.8 km' : '3.6 mi', clock(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), p)];
  return <SetPage back={st('settings')} title={st('settingsUnitsTitle')} testID="settings-units">
    <List>
      <SegRow title={st('settingsWeight')} value={u.weight} onChange={v => set('units.weight', v)} options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} />
      <SegRow title={st('settingsHeight')} value={u.height} onChange={v => set('units.height', v)} options={[{ value: 'ftin', label: 'ft, in' }, { value: 'cm', label: 'cm' }]} />
      <SegRow title={st('settingsEnergy')} value={u.energy} onChange={v => set('units.energy', v)} options={[{ value: 'kcal', label: 'kcal' }, { value: 'kJ', label: 'kJ' }]} />
      <SegRow title={st('settingsWater')} value={u.water} onChange={v => set('units.water', v)} options={[{ value: 'floz', label: 'fl oz' }, { value: 'ml', label: 'mL' }]} />
      <SegRow title={st('settingsDistance')} value={u.distance} onChange={v => set('units.distance', v)} options={[{ value: 'mi', label: 'mi' }, { value: 'km', label: 'km' }]} />
      <SegRow title={st('settingsTime')} value={u.clock} onChange={v => set('units.clock', v)} options={[{ value: '12', label: '12-hour' }, { value: '24', label: '24-hour' }]} />
      <PickRow title={st('settingsWeekStarts')} value={u.week} options={weeks} onPick={v => set('units.week', v)} />
    </List>
    <H>{st('settingsHowItLooks')}</H>
    <Panel>
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, columnGap: 14, paddingVertical: 14, paddingHorizontal: 16 }}>
        <KitText weight={600} size={12.5} color="text-muted" style={{ width: '100%' }}>{st('settingsTodayOnHome')}</KitText>
        {sample.map(x => <KitText key={x} weight={600} size={15} numeric>{x}</KitText>)}
      </View>
    </Panel>
    <ListFooter>{st('settingsUnitsFoot', { a: order[0], b: order[1] })}</ListFooter>
  </SetPage>;
}

/* ---------- Workout settings ---------- */
/** `.st-plates .chip`: a 40 pt plate pill in the display face with even figures, on the grouped list's inner fill; Training when you have it. */
function PlateChip({ label, a11y, selected, onPress }: { label: string; a11y: string; selected: boolean; onPress: () => void }) {
  const k = useKit();
  return <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ selected }} onPress={onPress} hitSlop={{ top: 4, bottom: 4 }}
    style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center',
      backgroundColor: selected ? k.c.training : k.dark ? k.c['surface-2'] : k.c.bg, boxShadow: selected || k.dark ? undefined : k.cardEdge }}>
    <KitText weight={600} size={13.5} numeric color={selected ? 'on-accent' : 'text'}>{label}</KitText>
  </Tappable>;
}
export function WorkoutPage() {
  const k = useKit();
  const [p, set] = useSettingsPrefs();
  // The phone-only build sends no reminders, so the rest timer alert reads Off there.
  const auth = useOptionalAuth(), phoneOnly = auth?.phoneOnly === true, repo = auth?.repository ?? null;
  const [, bump] = useState(0);
  const w = p.work, kg = p.units.weight === 'kg', u = kg ? 'kg' : 'lb';
  const plates = kg ? [25, 20, 15, 10, 5, 2.5, 1.25] : [55, 45, 35, 25, 10, 5, 2.5];
  // Default rest, the plates you have and haptics are the ones a workout uses, so a change here shows in the next set.
  const store = useWorkoutStore(repo);
  const live = <T,>(read: () => T, fallback: T): T => { try { return store ? read() : fallback; } catch { return fallback; } };
  const rest = workoutRest(store ? repo : null, w.rest);
  const own = live<number[] | null>(() => store!.preferences().plateSet(u), null);
  const pset: Record<string, boolean> = own ? Object.fromEntries(plates.map(pl => [String(pl).replace('.', '_'), own.includes(pl)])) : kg ? w.platesKg : w.plates;
  const haptics = live(() => store!.hapticsEnabled(), w.haptics);
  const act = (fn: () => void) => { try { fn(); } catch { /* left as last saved */ } bump(n => n + 1); };
  const setRest = (v: number) => { set('work.rest', v); if (store && repo) act(() => saveWorkoutRest(repo, v)); };
  const setPlate = (pl: number, id: string, on: boolean) => {
    set(`work.${kg ? 'platesKg' : 'plates'}.${id}`, on);
    // Sizes saved in a workout that this page does not list are kept.
    if (store && own) act(() => store.preferences().savePlates(u, on ? [...own, pl] : own.filter(x => x !== pl)));
  };
  const setHaptics = (v: boolean) => { set('work.haptics', v); if (store && repo) act(() => repo.localSave('haptics', v)); };
  const top = kg ? 100 : 225, bar = kg ? +w.barKg : +w.bar, rnd = kg ? 2.5 : 5;
  const pct = ({ 1: [0.6], 2: [0.5, 0.75], 3: [0.4, 0.6, 0.8], 4: [0.4, 0.55, 0.7, 0.85] } as Record<number, number[]>)[w.warmN] ?? [0.5, 0.75];
  const reps = ({ 1: [5], 2: [8, 3], 3: [8, 5, 2], 4: [8, 5, 3, 1] } as Record<number, number[]>)[w.warmN] ?? [8, 3];
  const bars = kg ? [{ v: '20', l: '20 kg barbell' }, { v: '15', l: '15 kg barbell' }, { v: '10', l: '10 kg technique bar' }]
    : [{ v: '45', l: '45 lb barbell' }, { v: '35', l: '35 lb barbell' }, { v: '33', l: '33 lb (15 kg) barbell' }, { v: '25', l: '25 lb technique bar' }];
  const training = k.c.training;
  return <SetPage back={st('settings')} title={st('settingsWorkoutTitle')} testID="settings-workout">
    <H first>{st('settingsRestTimer')}</H>
    <List>
      <ListRow title={st('settingsDefaultRest')} sub={st('settingsDefaultRestSub')} right={<TimeStepper label={st('settingsDefaultRestA11y')} value={rest} onChange={setRest} />} />
      <ListRow title={st('settingsStartAuto')} sub={st('settingsStartAutoSub')} toggle={w.auto} onToggle={v => set('work.auto', v)} />
      <ListRow title={st('settingsRestAlert')} value={st(p.rem.rest && !phoneOnly ? 'settingsOn' : 'settingsOff')} onPress={() => router.push({ pathname: '/settings/[section]', params: { section: 'reminders', focus: 'Rest timer alert' } })} />
    </List>
    <H>{st('settingsPlates')}</H>
    <Panel>
      <View accessibilityLabel={st('settingsPlatesYouHave')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 14, paddingHorizontal: 16 }}>
        {plates.map(pl => { const id = String(pl).replace('.', '_'), on = !!pset[id];
          return <PlateChip key={id} label={`${pl} ${u}`} a11y={st(kg ? 'settingsPlateKgA11y' : 'settingsPlateLbA11y', { n: pl })} selected={on}
            onPress={() => setPlate(pl, id, !on)} />; })}
      </View>
      <Cl><PickRow title={st('settingsBar')} value={kg ? w.barKg : w.bar} options={bars} onPick={v => set(kg ? 'work.barKg' : 'work.bar', v)} /></Cl>
    </Panel>
    <ListFooter>{st('settingsPlatesFoot')}</ListFooter>
    <H>{st('settingsWarmups')}</H>
    <Panel>
      <ListRow title={st('settingsSuggestWarm')} sub={st('settingsSuggestWarmSub')} toggle={w.warm} onToggle={v => set('work.warm', v)} />
      {w.warm ? <>
        <ListRow title={st('settingsWarmups')} right={<RowStepper label={st('settingsWarmCount')} value={w.warmN} step={1} min={1} max={4} onChange={v => set('work.warmN', v)} />} />
        <View style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 14, borderTopWidth: 1, borderTopColor: k.c.hair }}>
          <KitText weight={600} size={12.5} color="text-muted">{st('settingsWarmExample', { top, u })}</KitText>
          <View style={{ marginTop: 8, gap: 6 }}>
            {pct.map((x, i) => { const v = Math.max(bar, Math.round(top * x / rnd) * rnd);
              return <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(training, 0.16) }}>
                  <KitText weight={700} size={11} color="training">{`W${i + 1}`}</KitText></View>
                <KitText weight={700} size={14.5} numeric>{`${v === bar ? 'Bar' : `${v} ${u}`} × ${reps[i]}`}</KitText>
                <KitText weight={500} size={12.5} color="text-muted" style={{ marginLeft: 'auto' }}>{`${Math.round(x * 100)}%`}</KitText>
              </View>; })}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: training }}>
                <KitText weight={700} size={11} color="on-accent">1</KitText></View>
              <KitText weight={700} size={14.5} numeric>{`${top} ${u} × 5`}</KitText>
              <KitText weight={500} size={12.5} color="text-muted" style={{ marginLeft: 'auto' }}>{st('settingsWorkSet')}</KitText>
            </View>
          </View>
        </View>
      </> : null}
    </Panel>
    <H>{st('settingsDuringWorkout')}</H>
    <List>
      <ListRow title={st('settingsKeepAwake')} sub={st('settingsKeepAwakeSub')} toggle={w.awake} onToggle={v => set('work.awake', v)} />
      <ListRow title={st('settingsHapticsRow')} sub={st('settingsHapticsSub')} toggle={haptics} onToggle={setHaptics} />
    </List>
  </SetPage>;
}

/* ---------- Your data ---------- */
export function DataPage({ backup, restore, exportCsv }: { backup?: () => void; restore?: () => void; exportCsv?: () => void }) {
  const [p] = useSettingsPrefs();
  const lastBackup = p.data.lastBackup, phone = useAuth().phoneOnly;
  return <SetPage back={st('settings')} title={st('settingsDataTitle')} testID="settings-data">
    <Hero icon="layers" color="warning" title={st('settingsDataHero')} body={st(phone ? 'settingsDataHeroBodyPhone' : 'settingsDataHeroBody')} />
    <H>{st('settingsExport')}</H>
    <List><ListRow icon="export" color="accent" title={st('settingsExportCsv')} sub={st('settingsExportCsvSub')} onPress={exportCsv ?? (() => router.push('/progress/export' as never))} /></List>
    <H>{st('settingsBackup')}</H>
    <List footer={st('settingsBackupFoot')}>
      <ListRow icon="download" color="success" title={st('settingsSaveBackup')} sub={lastBackup ? st('settingsLastBackup', { v: backupWhen(lastBackup) }) : st('settingsNoBackup')} chevron={false} disabled={!backup} onPress={backup} />
      <ListRow icon="upload" color="recovery" title={st('settingsRestore')} sub={st('settingsRestoreSub')} chevron={false} disabled={!restore}
        onPress={() => actionSheet({ title: st('settingsRestoreQ'), message: st('settingsRestoreMsg'), acts: [{ label: st('settingsChooseBackup'), onPress: restore }] })} />
    </List>
    <H>{st('settingsRemove')}</H>
    <List footer={st('settingsRemoveFoot')}>
      <ListRow icon="cal" color="warning" title={st('settingsDeleteRange')} onPress={() => router.push({ pathname: '/settings/[section]', params: { section: 'delete-range' } })} />
      <ListRow icon="trash" color="danger" title={st('settingsDeleteAccount')} danger onPress={() => router.push({ pathname: '/settings/[section]', params: { section: 'delete-account' } })} />
    </List>
  </SetPage>;
}

/* ---------- About ---------- */
export function AboutPage() {
  const k = useKit(), { palette, mode } = useTheme();
  const [p] = useSettingsPrefs();
  const [failed, setFailed] = useState(false);
  const open = (url: string) => { setFailed(false); void openPage(url).then(ok => { if (!ok) setFailed(true); }); };
  const sub = (section: string) => () => router.push({ pathname: '/settings/[section]', params: { section } });
  return <SetPage back={st('settings')} title={st('settingsAboutTitle')} testID="settings-about">
    <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
      <View style={{ width: 84, height: 84, borderRadius: 20, overflow: 'hidden', boxShadow: k.lift, marginTop: 2 }}>
        <Image source={iconArt(iconId(p.look.icon), palette, mode)} style={{ width: 84, height: 84 }} accessible={false} />
      </View>
      <KitText weight={700} size={24} tracking={-0.03} style={{ marginTop: 12 }}>Insight</KitText>
      <KitText weight={600} size={13.5} color="text-muted" style={{ marginTop: 2 }}>{st('settingsVersionN', { v: APP_VERSION })}</KitText>
    </View>
    <Gap />
    <List>
      <ListRow icon="gift" color="accent-2" title={st('settingsWhatsNew')} onPress={sub('whats-new')} />
      <ListRow icon="chat" color="training" title={st('settingsSendFeedback')} onPress={sub('feedback')} />
    </List>
    <Gap />
    <List>
      <ListRow title={st('privacyPolicy')} chevron={false} right={<Ext />} onPress={() => open(LEGAL_LINKS.privacy)} />
      <ListRow title={st('termsOfUse')} chevron={false} right={<Ext />} onPress={() => open(LEGAL_LINKS.terms)} />
      <ListRow title={st('settingsHelp')} chevron={false} right={<Ext />} onPress={() => open(LEGAL_LINKS.support)} />
      <ListRow title={st('settingsAcknowledgements')} onPress={sub('licenses')} />
    </List>
    {failed && <KitText testID="settings-about-link-failed" weight={500} size={13} color="danger" accessibilityRole="alert" style={{ marginTop: 8, marginHorizontal: 16 }}>{st('linkFailed')}</KitText>}
    <Gap />
    <List footer={st('settingsFreeAtLaunch')}>
      <ListRow title={st('settingsVersion')} value={APP_VERSION} chevron={false} />
    </List>
    <ListFooter>{st('aboutDisclaimer')}</ListFooter>
  </SetPage>;
}


/** Send crash reports and Share usage analytics: the real device switches, changed at once and saved on this phone. */
export function DiagnosticsList() {
  const preferences = useDevicePreferences();
  const [failed, setFailed] = useState(devicePreferencesUnsaved);
  const change = (next: typeof preferences.value) => {
    if (!preferences.loaded) return;
    preferences.onChange(next);
    saveDevicePreferences(next).then(() => setFailed(false), () => setFailed(true));
  };
  return <>
    <List testID="settings-diagnostics">
      <ListRow title={st('settingsCrashReports')} toggle={preferences.value.crashReports} disabled={!preferences.loaded} onToggle={v => change({ ...preferences.value, crashReports: v })} />
      <ListRow title={st('settingsAnalytics')} toggle={preferences.value.analytics} disabled={!preferences.loaded} onToggle={v => change({ ...preferences.value, analytics: v })} />
    </List>
    {failed && <KitText testID="privacy-save-failed" weight={500} size={13} color="danger" accessibilityRole="alert" style={{ marginTop: 8, marginHorizontal: 16 }}>{st('privacySaveFailed')}</KitText>}
  </>;
}
