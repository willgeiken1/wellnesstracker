import { useRef, useState } from 'react';
import { Image, Linking, Platform, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { Button, Icon, KitText, List, ListFooter, SegmentedControl, Sheet, SheetHeader, alpha, useKit, type IconName } from '@/components/kit';
import { useTheme } from '@/design/theme-provider';
import { showToast } from '@/features/shell/toast';
import { iconArt, iconId } from './app-icon';
import { readPhotos } from '@/features/progress/local';
import { combos } from '@/features/food/model';
import { st } from './copy';
import { deletionError } from './auth-errors';
import { t } from '@/i18n/en';
import { useDataActions } from './data-actions';
import { RANGE_KINDS, canDeleteKind, deleteDateRange, isoDay, type RangeKind } from './delete-range';
import { APP_VERSION } from './home';
import { LEGAL_LINKS, openPage } from './links';
import { useSettingsPrefs } from './prefs';
import { actionSheet } from './sheet-actions';
import { Gap, H, Hero, ListRow, Panel, PickRow, SetPage } from './ui';

/** `.st-info`: an icon square, a title and a line, and an optional value at the end. */
function Info({ icon, color, title, sub, value, first }: { icon: IconName; color: string; title: string; sub?: string; value?: string; first?: boolean }) {
  const k = useKit(), c = k.tok(color);
  return <View accessible style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'flex-start', borderTopWidth: first ? 0 : 1, borderTopColor: k.c.hair }}>
    <View style={{ width: 30, height: 30, borderRadius: 9, marginTop: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(c, 0.15) }}><Icon name={icon} size={17} color={c} /></View>
    <View style={{ flex: 1 }}>
      <KitText weight={600} size={15} lineHeight={1.3}>{title}</KitText>
      {sub ? <KitText weight={500} size={13} lineHeight={1.4} color="text-muted" style={{ marginTop: 2 }}>{sub}</KitText> : null}
    </View>
    {value ? <KitText weight={700} size={13.5} color="text-muted" style={{ paddingTop: 2 }}>{value}</KitText> : null}
  </View>;
}
/** Where Send feedback goes: the support address on the public support page. */
const FEEDBACK_EMAIL = 'insight.wellnessos@gmail.com';
const Ext = () => { const k = useKit(); return <View style={{ marginHorizontal: -4 }}><Icon name="ext" size={16} color={k.c.ghost} /></View>; };
const openRange = () => router.push({ pathname: '/settings/[section]', params: { section: 'delete-range' } });

/* ---------- Privacy center ---------- */
export function PrivacyCenterPage() {
  const auth = useAuth(), phone = auth.phoneOnly;
  // The plan's name and the saved meal count are said where there are any, as the design words these lines.
  let photos = 0, saved = 0, plan = '';
  try { photos = auth.repository ? readPhotos(auth.repository).length : 0; } catch { photos = 0; }
  try { saved = auth.repository ? combos(auth.repository).length : 0; } catch { saved = 0; }
  try { plan = (auth.repository?.localGet<string>('plans:name') || '').trim(); } catch { plan = ''; }
  return <SetPage back={st('settingsPrivacyShort')} title={st('settingsPrivacyCenter')} testID="settings-privacy-center">
    <Hero tint icon="shield" color="success" title={st('settingsWhatWeStore')} body={st('settingsWhatWeStoreBody')} />
    <H>{st('settingsOnlyOnIphone')}</H>
    <Panel>
      <Info first icon="heart" color="danger" title={st('settingsPcHealth')} sub={st('settingsPcHealthSub')} />
      <Info icon="camera" color="accent-2" title={st('settingsPcPhotos')} sub={st('settingsPcPhotosSub')} value={photos ? st('settingsNPhotos', { n: photos }) : undefined} />
      <Info icon="faceid" color="success" title={st('settingsFaceId')} sub={st('settingsPcFaceIdSub')} />
    </Panel>
    <H>{st(phone ? 'settingsAlsoOnIphone' : 'settingsInAccount')}</H>
    <Panel>
      <Info first icon="workouts" color="training" title={st('settingsPcWorkouts')} sub={plan ? st('settingsPcWorkoutsPlanSub', { plan }) : st('settingsPcWorkoutsSub')} />
      <Info icon="food" color="food" title={st('settingsPcFood')} sub={saved > 1 ? st('settingsPcFoodNSub', { n: saved }) : st('settingsPcFoodSub')} />
      <Info icon="scale" color="accent" title={st('settingsPcBody')} sub={st('settingsPcBodySub')} />
      <Info icon="routines" color="sleep" title={st('settingsPcRoutines')} sub={st('settingsPcRoutinesSub')} />
      <Info icon="ring" color="recovery" title={st('settingsPcOura')} sub={st('settingsPcOuraSub')} />
    </Panel>
    <ListFooter>{st(phone ? 'settingsPcFootPhone' : 'settingsPcFoot')}</ListFooter>
    <H>{st('settingsNeverDo')}</H>
    <Panel>
      <Info first icon="x" color="danger" title={st('settingsNever1')} sub={st('settingsNever1Sub')} />
      <Info icon="eyeoff" color="warning" title={st('settingsNever2')} sub={st('settingsNever2Sub')} />
      <Info icon="link" color="recovery" title={st('settingsNever3')} sub={st('settingsNever3Sub')} />
    </Panel>
    <Gap />
    <List>
      <ListRow icon="export" color="accent" title={st('settingsExportYours')} onPress={() => router.push('/progress/export' as never)} />
      <ListRow icon="cal" color="warning" title={st('settingsDeleteRange')} onPress={openRange} />
      <ListRow icon="doc" color="text-muted" title={st('privacyPolicy')} chevron={false} right={<Ext />} onPress={() => { void openPage(LEGAL_LINKS.privacy); }} />
    </List>
  </SetPage>;
}

/* ---------- Delete account (2 steps) ---------- */
export function DeleteAccountPage() {
  const k = useKit();
  const auth = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [failure, setFailure] = useState<'deleteAccountUncertain' | 'deleteAccountFailed' | 'signOutFailed' | null>(null);
  const going = useRef(false);
  const can = !!auth.deleteAccount && !!auth.session;
  const ok = typed.trim().toUpperCase() === 'DELETE';
  const { backup } = useDataActions();
  // What goes with the account, counted where the app keeps a count: saved meals and progress photos.
  let saved = 0, photos = 0;
  try { saved = auth.repository ? combos(auth.repository).length : 0; } catch { saved = 0; }
  try { photos = auth.repository ? readPhotos(auth.repository).length : 0; } catch { photos = 0; }
  let plan = '';
  try { plan = (auth.repository?.localGet<string>('plans:name') || '').trim(); } catch { plan = ''; }
  const final = () => {
    if (going.current || !ok || !auth.deleteAccount) return;
    going.current = true; setBusy(true); setFailure(null);
    void auth.deleteAccount().then(() => { router.replace('/'); showToast(st('settingsDeletedAccount')); })
      .catch((cause: unknown) => { setFailure(deletionError(cause)); })
      .finally(() => { going.current = false; setBusy(false); });
  };
  const eyebrow = (n: number) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <Icon name="trash" size={16} color={k.c.danger} /><KitText weight={700} size={11.5} tracking={0.12} color="danger">{st('settingsStepNof2', { n }).toUpperCase()}</KitText>
  </View>;
  const two = step === 2;
  return <SetPage back={two ? st('settingsBack') : st('settingsDataTitle')} onBack={two ? () => setStep(1) : undefined} title={st('settingsDeleteAccount')} testID="settings-delete-account">
    <View style={{ paddingTop: 8 }}>
      {eyebrow(step)}
      <KitText weight={700} size={28} lineHeight={1.12} tracking={-0.03} accessibilityRole="header" style={{ marginTop: 10 }}>{st(two ? 'settingsTypeDelete' : 'settingsDeleteQ')}</KitText>
      <KitText weight={500} size={15} lineHeight={1.5} color="text-muted" style={{ marginTop: 10 }}>{st(two ? 'settingsDeleteBody2' : 'settingsDeleteBody1')}</KitText>
      {two ? <>
        <View style={{ marginTop: 18, backgroundColor: k.c.surface, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, boxShadow: typing ? `0px 0px 0px 2px ${k.c.danger}` : `0px 0px 0px 1.5px ${k.c['hair-2']}` }}>
          <KitText weight={600} size={12} color="text-muted">{st('settingsTypeDeleteShort')}</KitText>
          <TextInput testID="delete-type" value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} spellCheck={false} autoFocus onFocus={() => setTyping(true)} onBlur={() => setTyping(false)}
            accessibilityLabel={st('settingsTypeDelete')} selectionColor={k.c.danger} cursorColor={k.c.danger}
            style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, letterSpacing: 2.4, textTransform: 'uppercase', paddingTop: 4, paddingBottom: 0, color: k.c.text }} />
        </View>
        {failure ? <KitText weight={500} size={13} color="danger" accessibilityRole="alert" style={{ marginTop: 10 }}>{t(failure)}</KitText> : null}
        {!can && <KitText weight={500} size={13} color="text-muted" style={{ marginTop: 10 }}>{st('settingsDeleteNoAccount')}</KitText>}
        <View style={{ gap: 10, marginTop: 22 }}>
          <Button testID="delete-final" label={st('settingsDeletePermanently')} variant="destructive" full disabled={!ok || !can || busy} busy={busy} onPress={final} />
          <Button label={st('settingsKeepAccount')} variant="quiet" full onPress={() => router.back()} />
        </View>
      </> : <>
        <Gap />
        <Panel>
          <Info first icon="workouts" color="training" title={st('settingsDel1')} value={plan || undefined} />
          <Info icon="food" color="food" title={st('settingsDel2')} value={saved ? st('settingsNSavedMeals', { n: saved }) : undefined} />
          <Info icon="scale" color="accent" title={st('settingsDel3')} value={photos ? st('settingsNPhotos', { n: photos }) : undefined} />
          <Info icon="routines" color="sleep" title={st('settingsDel4')} />
          <Info icon="ring" color="recovery" title={st('settingsDel5')} />
        </Panel>
        <KitText weight={500} size={15} lineHeight={1.5} color="text-muted" style={{ marginTop: 10 }}>{st('settingsDeleteFoot')}</KitText>
        <View style={{ gap: 10, marginTop: 22 }}>
          <Button label={st('settingsBackupFirst')} variant="secondary" icon="download" full disabled={!backup} onPress={() => backup?.()} />
          <Button testID="delete-continue" label={st('settingsContinue')} variant="destructive" full onPress={() => setStep(2)} />
          <Button label={st('settingsKeepAccount')} variant="plain" full onPress={() => router.back()} />
        </View>
      </>}
    </View>
  </SetPage>;
}

/* ---------- Sheets ---------- */
const RANGE_IDS = ['today', 'week', 'd30', 'all'] as const;
type RangeId = (typeof RANGE_IDS)[number];
const RANGE_KEYS = { today: 'settingsToday', week: 'settingsThisWeek', d30: 'settingsLast30', all: 'settingsSinceJoined' } as const;
/** The days a preset covers, first and last. */
export function rangeDays(preset: RangeId, today = new Date(), weekStart: 'mon' | 'sun' | 'sat' = 'mon', joined?: Date): [Date, Date] {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  if (preset === 'week') { const first = { sun: 0, mon: 1, sat: 6 }[weekStart]; start.setDate(end.getDate() - ((end.getDay() - first + 7) % 7)); }
  if (preset === 'd30') start.setDate(end.getDate() - 29);
  if (preset === 'all') return [joined && joined < end ? new Date(joined.getFullYear(), joined.getMonth(), joined.getDate()) : start, end];
  return [start, end];
}
const dayLabel = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
/** The first day anything was logged, for Since you joined. */
function firstDay(repo: ReturnType<typeof useAuth>['repository']): Date | undefined {
  if (!repo) return undefined;
  let min = '';
  try {
    for (const table of ['sessions', 'food_entries', 'weigh_ins', 'measurements', 'cardio_sessions'] as const)
      for (const r of repo.list(table)) { const d = r.data.day; if (r.deleted_at === null && typeof d === 'string' && (!min || d < min)) min = d; }
  } catch { return undefined; }
  return min ? new Date(`${min}T12:00:00`) : undefined;
}

export function DeleteRangePage() {
  const auth = useAuth();
  const [p] = useSettingsPrefs();
  const [preset, setPreset] = useState<RangeId>('week');
  const [kinds, setKinds] = useState<Record<RangeKind, boolean>>({ workouts: true, food: true, body: false, routines: false, photos: false });
  const picked = RANGE_KINDS.filter(kd => kinds[kd] && canDeleteKind(kd)), n = picked.length;
  const [from, to] = rangeDays(preset, new Date(), p.units.week, preset === 'all' ? firstDay(auth.repository) : undefined);
  const label = (a: Date, b: Date) => dayLabel(a) + (a.getTime() === b.getTime() ? '' : ` to ${dayLabel(b)}`);
  const opts = RANGE_IDS.map(v => ({ v, l: st(RANGE_KEYS[v]) }));
  const can = !!auth.repository && !auth.demo;
  const go = () => {
    const repo = auth.repository; if (!repo) return;
    try { deleteDateRange(repo, isoDay(preset === 'all' ? new Date(1970, 0, 1) : from), isoDay(to), picked); }
    catch { showToast(st('settingsRangeFailed'), { color: 'warning' }); return; }
    router.back(); showToast(st('settingsDeletedRange', { r: label(from, to) }), { color: 'warning' });
  };
  const tog = (key: RangeKind, title: string, icon: IconName, color: string) =>
    <ListRow key={key} icon={icon} color={color} title={title} toggle={kinds[key] && canDeleteKind(key)} disabled={!canDeleteKind(key)} onToggle={v => setKinds(s => ({ ...s, [key]: v }))} />;
  return <Sheet gap={0} testID="settings-delete-range" header={<SheetHeader title={st('settingsDeleteRange')} left={st('cancel')} />}>
    <KitText weight={500} size={14.5} lineHeight={1.5} color="text-muted" style={{ marginHorizontal: 4, marginBottom: 16 }}>{st('settingsRangeLead')}</KitText>
    <List>
      <PickRow title={st('settingsDates')} value={preset} options={opts} onPick={setPreset} />
      <PickRow title={st('settingsFrom')} value={preset} options={opts} onPick={setPreset} short={() => dayLabel(from)} chevron />
      <PickRow title={st('settingsTo')} value={preset} options={opts} onPick={setPreset} short={() => dayLabel(to)} chevron />
    </List>
    <H>{st('settingsWhatToDelete')}</H>
    <List footer={st('settingsRangeFoot')}>
      {tog('workouts', st('settingsRangeWorkouts'), 'workouts', 'training')}
      {tog('food', st('settingsRangeFood'), 'food', 'food')}
      {tog('body', st('settingsRangeBody'), 'scale', 'accent')}
      {tog('routines', st('settingsRangeRoutines'), 'routines', 'sleep')}
      {tog('photos', st('settingsRangePhotos'), 'camera', 'accent-2')}
    </List>
    <View style={{ marginTop: 20 }}>
      <Button testID="delete-range-go" label={n ? st(n > 1 ? 'settingsDeleteNTypes' : 'settingsDelete1Type', { n }) : st('settingsPickToDelete')} variant="destructive" full disabled={!n || !can}
        onPress={() => actionSheet({ title: st('settingsDeleteRangeQ', { r: label(from, to) }), message: st(auth.phoneOnly ? 'settingsDeleteRangeMsgPhone' : 'settingsDeleteRangeMsg'),
          acts: [{ label: st('settingsDelete'), destructive: true, onPress: go }] })} />
    </View>
  </Sheet>;
}

const NEWS: [IconName, string, string, string][] = [
  ['home', 'accent', 'A Home you arrange', 'Tiles for what you care about, with a day score that fills as you go.'],
  ['workouts', 'training', 'Training with a plan', 'Follow your plan, log sets fast and let the rest timer run.'],
  ['food', 'food', 'Food in a few taps', 'Search, scan a barcode or reuse a saved meal.'],
  ['progress', 'recovery', 'Progress and a weekly report', 'Trends for weight, sleep and training, every Monday.'],
  ['routines', 'sleep', 'Routines', 'Supplements and habits on a schedule, with a unit converter.'],
  ['link', 'water', 'Apple Health and Oura', 'Sleep, steps and heart readings beside everything else.'],
];
export function WhatsNewPage() {
  const k = useKit(), { palette, mode } = useTheme();
  const [p] = useSettingsPrefs();
  return <Sheet gap={0} testID="settings-whats-new" header={<SheetHeader title={st('settingsWhatsNew')} left={null} right={st('settingsDone')} onRight={() => router.back()} />}>
    <View style={{ alignItems: 'center', paddingBottom: 4 }}>
      <View style={{ width: 84, height: 84, borderRadius: 20, overflow: 'hidden', boxShadow: k.lift, marginTop: 2 }}>
        <Image source={iconArt(iconId(p.look.icon), palette, mode)} style={{ width: 84, height: 84 }} accessible={false} />
      </View>
      <KitText weight={700} size={24} tracking={-0.03} style={{ marginTop: 12 }}>Insight 1.0</KitText>
      <KitText weight={600} size={13.5} color="text-muted" style={{ marginTop: 2 }}>{st('settingsFirstRelease')}</KitText>
    </View>
    <Panel style={{ marginTop: 20 }}>
      {NEWS.map(([icon, color, title, body], i) => { const c = k.tok(color);
        return <View key={title} style={{ flexDirection: 'row', gap: 14, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'flex-start', borderTopWidth: i ? 1 : 0, borderTopColor: k.c.hair }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, marginTop: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(c, 0.16) }}><Icon name={icon} size={21} color={c} /></View>
          <View style={{ flex: 1 }}>
            <KitText weight={700} size={16} lineHeight={1.3} tracking={-0.015}>{title}</KitText>
            <KitText weight={500} size={13.5} lineHeight={1.45} color="text-muted" style={{ marginTop: 3 }}>{body}</KitText>
          </View>
        </View>; })}
    </Panel>
    <View style={{ marginTop: 20 }}><Button label={st('settingsContinue')} full onPress={() => router.back()} /></View>
  </Sheet>;
}

export function FeedbackPage() {
  const k = useKit();
  const [topic, setTopic] = useState<'idea' | 'problem' | 'other'>('idea');
  const [text, setText] = useState('');
  const [meta, setMeta] = useState(true);
  const [writing, setWriting] = useState(false);
  const send = () => {
    const topicLabel = st(topic === 'idea' ? 'settingsAnIdea' : topic === 'problem' ? 'settingsAProblem' : 'settingsSomethingElse');
    const body = text.trim() + (meta ? `\n\nInsight ${APP_VERSION}, ${Platform.OS} ${String(Platform.Version)}` : '');
    const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(`Insight feedback: ${topicLabel}`)}&body=${encodeURIComponent(body)}`;
    void Linking.openURL(url).then(() => { router.back(); showToast(st('settingsFeedbackMail')); }, () => { void openPage(LEGAL_LINKS.support); });
  };
  return <Sheet gap={0} testID="settings-feedback" header={<SheetHeader title={st('settingsSendFeedback')} left={st('cancel')} right={st('settingsSend')} rightDisabled={!text.trim()} onRight={send} />}>
    <SegmentedControl label={st('settingsFeedbackTopic')} value={topic} onChange={setTopic}
      options={[{ value: 'idea', label: st('settingsAnIdea') }, { value: 'problem', label: st('settingsAProblem') }, { value: 'other', label: st('settingsSomethingElse') }]} />
    <TextInput testID="feedback-text" value={text} onChangeText={setText} multiline placeholder={st('settingsFeedbackPlaceholder')} placeholderTextColor={k.c['text-muted']}
      accessibilityLabel={st('settingsYourFeedback')} textAlignVertical="top" onFocus={() => setWriting(true)} onBlur={() => setWriting(false)} selectionColor={k.c.accent} cursorColor={k.c.accent}
      style={{ minHeight: 150, marginTop: 12, marginBottom: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, backgroundColor: k.c.surface, boxShadow: writing ? `0px 0px 0px 2px ${k.c.accent}` : k.cardEdge,
        fontFamily: 'PlusJakartaSans_500Medium', fontSize: 16, lineHeight: 23, color: k.c.text }} />
    <List footer={st('settingsFeedbackFoot')}>
      <ListRow title={st('settingsIncludeDetails')} sub={st('settingsIncludeDetailsSub', { v: APP_VERSION })} toggle={meta} onToggle={setMeta} />
    </List>
  </Sheet>;
}
