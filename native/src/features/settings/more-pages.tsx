import { useRef, useState } from 'react';
import { Image, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { Button, Icon, KitText, List, ListFooter, ListRow, SegmentedControl, Sheet, SheetHeader, alpha, useKit, type IconName } from '@/components/kit';
import { useTheme } from '@/design/theme-provider';
import { showToast } from '@/features/shell/toast';
import { exportAccountBackup, exportPhoneBackup } from '@/phone-only/export';
import { iconArt, iconId } from './app-icon';
import { st } from './copy';
import { APP_VERSION } from './home';
import { LEGAL_LINKS, openPage } from './links';
import { useSettingsPrefs } from './prefs';
import { actionSheet } from './sheet-actions';
import { Gap, H, Hero, Panel, PickRow, SetPage } from './ui';

/** `.st-info`: an icon square, a title and a line, and an optional value at the end. */
function Info({ icon, color, title, sub, value, first }: { icon: IconName; color: string; title: string; sub?: string; value?: string; first?: boolean }) {
  const k = useKit(), c = k.tok(color);
  return <View accessible style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'flex-start', borderTopWidth: first ? 0 : 1, borderTopColor: k.c.hair }}>
    <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(c, 0.15) }}><Icon name={icon} size={17} color={c} /></View>
    <View style={{ flex: 1 }}>
      <KitText weight={600} size={15} lineHeight={1.3}>{title}</KitText>
      {sub ? <KitText weight={500} size={13} lineHeight={1.4} color="text-muted" style={{ marginTop: 2 }}>{sub}</KitText> : null}
    </View>
    {value ? <KitText weight={700} size={13.5} color="text-muted" style={{ paddingTop: 2 }}>{value}</KitText> : null}
  </View>;
}
const Ext = () => { const k = useKit(); return <Icon name="ext" size={16} color={k.c.ghost} />; };
const openRange = () => router.push({ pathname: '/settings/[section]', params: { section: 'delete-range' } });

/* ---------- Privacy center ---------- */
export function PrivacyCenterPage() {
  return <SetPage back={st('settingsPrivacyShort')} title={st('settingsPrivacyCenter')} testID="settings-privacy-center">
    <Hero tint icon="shield" color="success" title={st('settingsWhatWeStore')} body={st('settingsWhatWeStoreBody')} />
    <H>{st('settingsOnlyOnIphone')}</H>
    <Panel>
      <Info first icon="heart" color="danger" title={st('settingsPcHealth')} sub={st('settingsPcHealthSub')} />
      <Info icon="camera" color="accent-2" title={st('settingsPcPhotos')} sub={st('settingsPcPhotosSub')} />
      <Info icon="faceid" color="success" title={st('settingsFaceId')} sub={st('settingsPcFaceIdSub')} />
    </Panel>
    <H>{st('settingsInAccount')}</H>
    <Panel>
      <Info first icon="workouts" color="training" title={st('settingsPcWorkouts')} sub={st('settingsPcWorkoutsSub')} />
      <Info icon="food" color="food" title={st('settingsPcFood')} sub={st('settingsPcFoodSub')} />
      <Info icon="scale" color="accent" title={st('settingsPcBody')} sub={st('settingsPcBodySub')} />
      <Info icon="routines" color="sleep" title={st('settingsPcRoutines')} sub={st('settingsPcRoutinesSub')} />
      <Info icon="ring" color="recovery" title={st('settingsPcOura')} sub={st('settingsPcOuraSub')} />
    </Panel>
    <ListFooter>{st('settingsPcFoot')}</ListFooter>
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
  const going = useRef(false);
  const can = !!auth.deleteAccount && !!auth.session;
  const ok = typed.trim().toUpperCase() === 'DELETE';
  const backup = () => {
    const repo = auth.repository; if (!repo) return;
    void (auth.phoneOnly ? exportPhoneBackup(repo) : exportAccountBackup(repo)).then(() => showToast(st('settingsBackupSaved'))).catch(() => showToast(st('settingsBackupFailed'), { color: 'danger' }));
  };
  const final = () => {
    if (going.current || !ok || !auth.deleteAccount) return;
    going.current = true; setBusy(true);
    void auth.deleteAccount().then(() => { router.replace('/'); showToast(st('settingsDeletedAccount')); })
      .catch(() => { showToast(st('deleteAccountFailed'), { color: 'danger' }); })
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
        <View style={{ marginTop: 18, backgroundColor: k.c.surface, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, boxShadow: `0px 0px 0px 1.5px ${k.c['hair-2']}` }}>
          <KitText weight={600} size={12} color="text-muted">{st('settingsTypeDeleteShort')}</KitText>
          <TextInput testID="delete-type" value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} spellCheck={false} autoFocus
            accessibilityLabel={st('settingsTypeDelete')} style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, letterSpacing: 2.4, paddingTop: 4, color: k.c.text, minHeight: 36 }} />
        </View>
        {!can && <KitText weight={500} size={13} color="text-muted" style={{ marginTop: 10 }}>{st('settingsDeleteNoAccount')}</KitText>}
        <View style={{ gap: 10, marginTop: 22 }}>
          <Button testID="delete-final" label={st('settingsDeletePermanently')} variant="destructive" full disabled={!ok || !can || busy} busy={busy} onPress={final} />
          <Button label={st('settingsKeepAccount')} variant="quiet" full onPress={() => router.back()} />
        </View>
      </> : <>
        <Gap />
        <Panel>
          <Info first icon="workouts" color="training" title={st('settingsDel1')} />
          <Info icon="food" color="food" title={st('settingsDel2')} />
          <Info icon="scale" color="accent" title={st('settingsDel3')} />
          <Info icon="routines" color="sleep" title={st('settingsDel4')} />
          <Info icon="ring" color="recovery" title={st('settingsDel5')} />
        </Panel>
        <ListFooter>{st('settingsDeleteFoot')}</ListFooter>
        <View style={{ gap: 10, marginTop: 22 }}>
          <Button label={st('settingsBackupFirst')} variant="secondary" icon="download" full disabled={!auth.repository} onPress={backup} />
          <Button testID="delete-continue" label={st('settingsContinue')} variant="destructive" full onPress={() => setStep(2)} />
          <Button label={st('settingsKeepAccount')} variant="plain" full onPress={() => router.back()} />
        </View>
      </>}
    </View>
  </SetPage>;
}

/* ---------- Sheets ---------- */
const RANGES = { today: ['Today', 'Today'], week: ['This week', 'This week'], d30: ['Last 30 days', 'Last 30 days'], all: ['Since you joined', 'Since you joined'] } as const;
type RangeId = keyof typeof RANGES;
/** The days a preset covers, as the mockup labels them ("Mon, Nov 16"). */
export function rangeDays(preset: RangeId, today = new Date(), weekStart: 'mon' | 'sun' | 'sat' = 'mon', joined?: Date): [Date, Date] {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  if (preset === 'week') { const first = { sun: 0, mon: 1, sat: 6 }[weekStart]; start.setDate(end.getDate() - ((end.getDay() - first + 7) % 7)); }
  if (preset === 'd30') start.setDate(end.getDate() - 29);
  if (preset === 'all') return [joined ?? start, end];
  return [start, end];
}
const dayLabel = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export function DeleteRangePage() {
  const [p] = useSettingsPrefs();
  const [preset, setPreset] = useState<RangeId>('week');
  const [kinds, setKinds] = useState({ workouts: true, food: true, body: false, routines: false, photos: false });
  const n = Object.values(kinds).filter(Boolean).length;
  const [from, to] = rangeDays(preset, new Date(), p.units.week);
  const label = (a: Date, b: Date) => dayLabel(a) + (a.getTime() === b.getTime() ? '' : ` to ${dayLabel(b)}`);
  const opts = (Object.keys(RANGES) as RangeId[]).map(v => ({ v, l: RANGES[v][0] }));
  const tog = (key: keyof typeof kinds, title: string, icon: IconName, color: string) =>
    <ListRow key={key} icon={icon} color={color} title={title} toggle={kinds[key]} onToggle={v => setKinds(s => ({ ...s, [key]: v }))} />;
  return <Sheet testID="settings-delete-range" header={<SheetHeader title={st('settingsDeleteRange')} left={st('cancel')} />}>
    <KitText weight={500} size={14.5} lineHeight={1.5} color="text-muted" style={{ marginTop: 2, marginHorizontal: 4, marginBottom: 4 }}>{st('settingsRangeLead')}</KitText>
    <List>
      <PickRow title={st('settingsDates')} value={preset} options={opts} onPick={setPreset} />
      <ListRow title={st('settingsFrom')} value={dayLabel(from)} />
      <ListRow title={st('settingsTo')} value={dayLabel(to)} />
    </List>
    <H>{st('settingsWhatToDelete')}</H>
    <List footer={st('settingsRangeFoot')}>
      {tog('workouts', st('settingsRangeWorkouts'), 'workouts', 'training')}
      {tog('food', st('settingsRangeFood'), 'food', 'food')}
      {tog('body', st('settingsRangeBody'), 'scale', 'accent')}
      {tog('routines', st('settingsRangeRoutines'), 'routines', 'sleep')}
      {tog('photos', st('settingsRangePhotos'), 'camera', 'accent-2')}
    </List>
    <View style={{ marginTop: 8 }}>
      <Button testID="delete-range-go" label={n ? st(n > 1 ? 'settingsDeleteNTypes' : 'settingsDelete1Type', { n }) : st('settingsPickToDelete')} variant="destructive" full disabled={!n}
        onPress={() => actionSheet({ title: st('settingsDeleteRangeQ', { r: label(from, to) }), message: st('settingsDeleteRangeMsg'),
          acts: [{ label: st('settingsDelete'), destructive: true, onPress: () => showToast(st('settingsRangeUnavailable'), { color: 'warning' }) }] })} />
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
  return <Sheet testID="settings-whats-new" header={<SheetHeader title={st('settingsWhatsNew')} left={null} right={st('settingsDone')} onRight={() => router.back()} />}>
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 84, height: 84, borderRadius: 20, overflow: 'hidden', boxShadow: k.lift }}>
        <Image source={iconArt(iconId(p.look.icon), palette, mode)} style={{ width: 84, height: 84 }} accessible={false} />
      </View>
      <KitText weight={700} size={24} tracking={-0.03} style={{ marginTop: 12 }}>Insight 1.0</KitText>
      <KitText weight={600} size={13.5} color="text-muted" style={{ marginTop: 2 }}>{st('settingsFirstRelease')}</KitText>
    </View>
    <Panel style={{ marginTop: 8 }}>
      {NEWS.map(([icon, color, title, body], i) => { const c = k.tok(color);
        return <View key={title} style={{ flexDirection: 'row', gap: 14, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'flex-start', borderTopWidth: i ? 1 : 0, borderTopColor: k.c.hair }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(c, 0.16) }}><Icon name={icon} size={21} color={c} /></View>
          <View style={{ flex: 1 }}>
            <KitText weight={700} size={16} lineHeight={1.3} tracking={-0.015}>{title}</KitText>
            <KitText weight={500} size={13.5} lineHeight={1.45} color="text-muted" style={{ marginTop: 3 }}>{body}</KitText>
          </View>
        </View>; })}
    </Panel>
    <View style={{ marginTop: 8 }}><Button label={st('settingsContinue')} full onPress={() => router.back()} /></View>
  </Sheet>;
}

export function FeedbackPage() {
  const k = useKit();
  const [topic, setTopic] = useState<'idea' | 'problem' | 'other'>('idea');
  const [text, setText] = useState('');
  const [meta, setMeta] = useState(true);
  const send = () => { void openPage(LEGAL_LINKS.support); router.back(); showToast(st('settingsFeedbackSupport')); };
  return <Sheet testID="settings-feedback" header={<SheetHeader title={st('settingsSendFeedback')} left={st('cancel')} right={st('settingsSend')} rightDisabled={!text.trim()} onRight={send} />}>
    <SegmentedControl label={st('settingsFeedbackTopic')} value={topic} onChange={setTopic}
      options={[{ value: 'idea', label: st('settingsAnIdea') }, { value: 'problem', label: st('settingsAProblem') }, { value: 'other', label: st('settingsSomethingElse') }]} />
    <TextInput testID="feedback-text" value={text} onChangeText={setText} multiline placeholder={st('settingsFeedbackPlaceholder')} placeholderTextColor={k.c['text-muted']}
      accessibilityLabel={st('settingsYourFeedback')} textAlignVertical="top"
      style={{ minHeight: 150, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, backgroundColor: k.c.surface, boxShadow: k.cardEdge,
        fontFamily: 'PlusJakartaSans_500Medium', fontSize: 16, lineHeight: 23, color: k.c.text }} />
    <List footer={st('settingsFeedbackFoot')}>
      <ListRow title={st('settingsIncludeDetails')} sub={st('settingsIncludeDetailsSub', { v: APP_VERSION })} toggle={meta} onToggle={setMeta} />
    </List>
  </Sheet>;
}
