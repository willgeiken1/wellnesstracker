import { useState } from 'react';
import { Image, TextInput, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { Button, Icon, KitText, PressScale, SegmentedControl, alpha, font, mix, tabular, useKit, type IconName } from '@/components/kit';
import { capitals } from '@/components/kit-style';
import { palettes, tokens, type Palette } from '@/design/tokens';
import { APP_ICONS, iconArt } from '@/features/settings/app-icon';
import type { AppIconId } from '@/features/settings/prefs';
import { t, type MessageKey } from '@/i18n/en';
import type { Activity } from '../model';
import { ObIcon, type ObIconName } from './icons';
import {
  HABITS, WAKE, WIND, clockTime, heightLabel, heightMenuValue, heightOptions, macroShare, routinePlan, slotLabel,
  type FlowDraft, type GoalId, type HabitId, type Macros, type Plan, type RoutineItemKey, type SexChoice,
} from './model';
import { BoxField, Head, KcalStepper, Label, Mark, MenuField, NumberInput, Option, useSurface } from './parts';

type Set = (patch: Partial<FlowDraft>) => void;
const HEALTH_RED = '#FF375F';

/* ---------- name ---------- */
export function NameStep({ eyebrow, d, set, onSubmit }: { eyebrow: string; d: FlowDraft; set: Set; onSubmit: () => void }) {
  const k = useKit(), base = useSurface(14);
  const [focused, setFocused] = useState(false);
  return <View>
    <Head eyebrow={eyebrow} title={t('obbNameTitle')} lede={t('obbNameLede')} />
    <View style={[base, { marginTop: 24, paddingVertical: 10, paddingHorizontal: 14 }, focused ? { boxShadow: `0px 0px 0px 1.5px ${k.c.accent}` } : null]}>
      <KitText weight={600} size={12.5} color="text-muted">{t('obbFirstName')}</KitText>
      <TextInput testID="onboarding-name" accessibilityLabel={t('obbFirstName')} value={d.name} onChangeText={name => set({ name })}
        autoComplete="given-name" textContentType="givenName" autoCapitalize="words" autoCorrect={false} returnKeyType="next" onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} allowFontScaling maxFontSizeMultiplier={1.4}
        selectionColor={k.c.accent} cursorColor={k.c.accent}
        style={[font(700, 24, undefined, -0.02), { color: k.c.text, paddingTop: 4, paddingBottom: 0, paddingHorizontal: 0, minHeight: 34 }]} />
    </View>
  </View>;
}

/* ---------- body ---------- */
const ACT: readonly [Activity, MessageKey, MessageKey][] = [['sitting', 'obbActSitting', 'obbActSittingSub'], ['light', 'obbActLight', 'obbActLightSub'],
  ['active', 'obbActActive', 'obbActActiveSub'], ['very', 'obbActVery', 'obbActVerySub']];
const SEX: readonly { v: Exclude<SexChoice, ''>; l: string }[] = [{ v: 'female', l: t('obbFemale') }, { v: 'male', l: t('obbMale') }, { v: 'none', l: t('obbSexNone') }];

/** One of the 2x2 body fields: equal halves whatever they hold (the padding sits inside, so it does not tip the split). */
const CELL = { flex: 1, flexBasis: 0, minWidth: 0 } as const;

export function BodyStep({ eyebrow, d, set, health, onFill, onUnit }: {
  eyebrow: string; d: FlowDraft; set: Set; health: 'fill' | 'busy' | 'hidden'; onFill: () => void; onUnit: (u: FlowDraft['unit']) => void;
}) {
  const k = useKit(), base = useSurface(16);
  const us = d.unit !== 'kg', hl = heightLabel(d.heightIn, d.unit);
  const sexText = d.sex === 'female' ? t('obbFemale') : d.sex === 'male' ? t('obbMale') : d.sex === 'none' ? t('obbSexNotGiven') : '';
  const hkIcon = <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', boxShadow: `0px 0px 0px 1px ${k.c['hair-2']}` }}>
    <ObIcon name="ob-heart" size={19} color={HEALTH_RED} /></View>;
  return <View>
    <Head eyebrow={eyebrow} title={t('obbBodyTitle')} lede={t('obbBodyLede')} />
    {d.filled ? <View accessibilityRole="text" accessibilityLiveRegion="polite" style={[base, { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, marginTop: 18, paddingVertical: 10, paddingHorizontal: 14 }]}>
      {hkIcon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <KitText weight={600} size={15.5} lineHeight={1.25}>{t('obbHkFilled')}</KitText>
        <KitText weight={500} size={13} lineHeight={1.35} color="text-muted">{t('obbHkFilledSub')}</KitText>
      </View>
      <Icon name="check" size={20} color={k.c.success} />
    </View> : health !== 'hidden' ? <PressScale testID="onboarding-health-fill" accessibilityRole="button" accessibilityLabel={`${t('obbHkFill')}, ${t('obbHkFillSub')}`}
      accessibilityState={{ busy: health === 'busy' }} disabled={health === 'busy'} onPress={onFill}
      style={[base, { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, marginTop: 18, paddingVertical: 10, paddingHorizontal: 14 }]}>
      {hkIcon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <KitText weight={600} size={15.5} lineHeight={1.25}>{t('obbHkFill')}</KitText>
        <KitText weight={500} size={13} lineHeight={1.35} color="text-muted">{t('obbHkFillSub')}</KitText>
      </View>
      <KitText weight={700} size={14} color="accent">{t('obbHkFillGo')}</KitText>
    </PressScale> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 18, marginHorizontal: 4, marginBottom: 8 }}>
      <KitText weight={600} size={13} color="text-muted">{t('obbUnits')}</KitText>
      <View style={{ width: 188 }}>
        <SegmentedControl testID="onboarding-units" label={t('obbUnits')} height={32} value={d.unit} onChange={onUnit}
          options={[{ value: 'lb', label: t('obbImperial') }, { value: 'kg', label: t('obbMetric') }]} />
      </View>
    </View>
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <MenuField testID="onboarding-height" label={t('obbHeight')} a11y={t('obbHeightA11y').replace('{v}', hl || t('obbNotSet'))} value={hl} placeholder={us ? t('obbFtIn') : t('obbCm')}
          options={heightOptions(d.unit)} current={heightMenuValue(d.heightIn, d.unit)} onPick={v => set({ heightIn: Number(v), t: null })} />
        <View style={CELL}><BoxField label={t('obbWeight')}>
          <NumberInput testID="onboarding-weight" unit={us ? 'lb' : 'kg'} accessibilityLabel={us ? t('obbWeightLb') : t('obbWeightKg')} keyboardType="decimal-pad"
            value={d.weight} onChangeText={weight => set({ weight, t: null })} />
        </BoxField></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={CELL}><BoxField label={t('obbAge')}>
          <NumberInput testID="onboarding-age" unit={t('obbYears')} accessibilityLabel={t('obbAgeYears')} keyboardType="number-pad" maxLength={3}
            value={d.age} onChangeText={age => set({ age: age.replace(/\D/g, ''), t: null })} />
        </BoxField></View>
        <MenuField testID="onboarding-sex" label={t('obbSex')} a11y={t('obbSexA11y').replace('{v}', sexText || t('obbSexOptionalA11y'))} value={sexText} placeholder={t('obbOptional')}
          options={SEX} current={d.sex || ''} onPick={v => set({ sex: v as SexChoice, t: null })} />
      </View>
    </View>
    <Label nativeID="onboarding-activity" style={{ marginTop: 18 }}>{t('obbActivity')}</Label>
    <View accessibilityRole="radiogroup" accessibilityLabel={t('obbActivity')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {ACT.map(([v, title, sub]) => <View key={v} style={{ width: '48.6%', flexGrow: 1, flexBasis: '45%' }}>
        <Option testID={`onboarding-activity-${v}`} title={t(title)} sub={t(sub)} on={d.activity === v} height={58} pad={8} onPress={() => set({ activity: v, t: null })} />
      </View>)}
    </View>
  </View>;
}

/* ---------- goals ---------- */
const GOALS: readonly [GoalId, MessageKey, MessageKey, IconName, string][] = [
  ['train', 'obbGoalTrain', 'obbGoalTrainSub', 'workouts', 'training'], ['eat', 'obbGoalEat', 'obbGoalEatSub', 'food', 'food'],
  ['sleep', 'obbGoalSleep', 'obbGoalSleepSub', 'moon', 'recovery'], ['routines', 'obbGoalRoutines', 'obbGoalRoutinesSub', 'routines', 'sleep']];

export function GoalsStep({ eyebrow, d, set }: { eyebrow: string; d: FlowDraft; set: Set }) {
  const k = useKit();
  return <View>
    <Head eyebrow={eyebrow} title={t('obbGoalsTitle')} lede={t('obbGoalsLede')} />
    <View accessibilityLabel={t('obbEbGoals')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>
      {GOALS.map(([id, title, sub, icon, tone]) => {
        const on = !!d.goals[id], c = k.c[tone];
        return <PressScale key={id} testID={`onboarding-goal-${id}`} accessibilityRole="togglebutton" accessibilityLabel={`${t(title)}, ${t(sub)}`} accessibilityState={{ checked: on }}
          onPress={() => set({ goals: { ...d.goals, [id]: !on } })}
          style={{ flexBasis: '45%', flexGrow: 1, minHeight: 148, padding: 14, borderRadius: 20, gap: 8, alignItems: 'flex-start',
            backgroundColor: on ? mix(c, k.c.surface, 0.12) : k.c.surface,
            // Dark draws a ring in the goal's colour; light keeps the card edge and the tint, as the design does.
            boxShadow: k.dark ? (on ? `0px 0px 0px 2px ${c}` : undefined) : k.cardEdge }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(c, 0.16) }}>
            <Icon name={icon} size={22} color={c} />
          </View>
          <View style={{ position: 'absolute', right: 12, top: 12 }}><Mark on={on} color={c} size={24} /></View>
          <View style={{ marginTop: 'auto', gap: 8 }}>
            <KitText weight={700} size={16} lineHeight={1.2} tracking={-0.015}>{t(title)}</KitText>
            <KitText weight={500} size={12.5} lineHeight={1.35} color="text-muted">{t(sub)}</KitText>
          </View>
        </PressScale>;
      })}
    </View>
  </View>;
}

/* ---------- targets ---------- */
const PLANS: readonly [Plan, MessageKey, MessageKey][] = [['cut', 'obbCut', 'obbCutSub'], ['maintain', 'obbMaintain', 'obbMaintainSub'], ['bulk', 'obbBulk', 'obbBulkSub']];
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function TargetsStep({ eyebrow, d, est, onPlan, onKcal, onMacro, onReset }: {
  eyebrow: string; d: FlowDraft; est: boolean; onPlan: (p: Plan) => void; onKcal: (dir: -1 | 1) => void; onMacro: (key: 'p' | 'c' | 'f', grams: number) => void; onReset: () => void;
}) {
  const k = useKit(), card = useSurface(20), tl = d.t as Macros, share = macroShare(tl);
  const macro = (key: 'p' | 'c' | 'f', label: MessageKey, tone: string) => <MacroField key={key} keyName={key} label={t(label)} color={k.tok(tone)} value={tl[key]} onChange={g => onMacro(key, g)} />;
  return <View>
    <Head eyebrow={eyebrow} title={t('obbTargetsTitle')} lede={est ? t('obbTargetsLede') : t('obbTargetsLedeNone')} />
    <View accessibilityRole="radiogroup" accessibilityLabel={t('obbPlan')} style={{ flexDirection: 'row', gap: 8, marginTop: 22 }}>
      {PLANS.map(([p, title, sub]) => {
        const on = d.plan === p;
        return <PressScale key={p} testID={`onboarding-plan-${p}`} accessibilityRole="radio" accessibilityLabel={`${t(title)}, ${t(sub)}`} accessibilityState={{ checked: on }} onPress={() => onPlan(p)}
          style={[surfaceOf(k, 16), { flex: 1, minHeight: 68, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', gap: 3 },
            on ? { backgroundColor: mix(k.c.accent, k.c.surface, 0.1), ...(k.dark ? { boxShadow: `0px 0px 0px 2px ${k.c.accent}` } : null) } : null]}>
          <KitText weight={700} size={16} tracking={-0.015}>{t(title)}</KitText>
          <KitText weight={500} size={12} color="text-muted">{t(sub)}</KitText>
        </PressScale>;
      })}
    </View>
    <View style={[card, { marginTop: 12, padding: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View>
          <KitText weight={700} size={11} lineHeight={1} tracking={0.14} color="text-muted" style={[capitals, { marginBottom: 8 }]}>{t('obbCalories')}</KitText>
          <View accessible accessibilityLabel={`${t('obbCalories')}, ${fmt(tl.kcal)} ${t('obbKcal')}`} accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <KitText testID="onboarding-kcal" weight={700} size={40} lineHeight={1} tracking={-0.04} numeric>{fmt(tl.kcal)}</KitText>
            <KitText weight={600} size={15} color="text-muted" style={{ marginLeft: 5 }}>{t('obbKcal')}</KitText>
          </View>
        </View>
        <KcalStepper label={t('obbCalories')} onStep={onKcal} />
      </View>
      <View accessible accessibilityRole="image" accessibilityLabel={t('obbMacroBar').replace('{p}', String(share.p)).replace('{c}', String(share.c)).replace('{f}', String(share.f))}
        style={{ flexDirection: 'row', gap: 3, height: 8, marginTop: 18, marginBottom: 14 }}>
        {(['food', 'accent', 'sleep'] as const).map((tone, i) => <View key={tone} style={{ flexGrow: share.weights[i] || 0.0001, flexBasis: 0, borderRadius: 4, backgroundColor: k.c[tone] }} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {macro('p', 'obbProtein', 'food')}{macro('c', 'obbCarbs', 'accent')}{macro('f', 'obbFat', 'sleep')}
      </View>
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 12, marginHorizontal: 4 }}>
      <KitText weight={500} size={13} lineHeight={1.4} color="text-muted" style={{ flexShrink: 1 }}>{d.edited ? t('obbNoteYours') : est ? t('obbNoteEst') : t('obbNoteTypical')}</KitText>
      {d.edited ? <PressScale accessibilityRole="button" accessibilityLabel={t('obbUseSuggestion')} onPress={onReset} hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
        style={{ minHeight: 32, justifyContent: 'center' }}><KitText weight={600} size={13} color="accent">{t('obbUseSuggestion')}</KitText></PressScale> : null}
    </View>
  </View>;
}
function surfaceOf(k: ReturnType<typeof useKit>, radius: number) { return { backgroundColor: k.c.surface, borderRadius: radius, boxShadow: k.cardEdge }; }

function MacroField({ keyName, label, color, value, onChange }: { keyName: string; label: string; color: string; value: number; onChange: (g: number) => void }) {
  const k = useKit();
  const [text, setText] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  return <View style={{ flex: 1, paddingTop: 8, paddingHorizontal: 12, paddingBottom: 9, borderRadius: 12, backgroundColor: k.dark ? k.c['surface-2'] : k.fill,
    boxShadow: focused ? `0px 0px 0px 1.5px ${k.c.accent}` : undefined }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <KitText weight={600} size={12} color="text-muted">{label}</KitText>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
      <TextInput testID={`onboarding-macro-${keyName}`} accessibilityLabel={t('obbGrams').replace('{m}', label)} keyboardType="number-pad" maxLength={4}
        value={text ?? String(value)} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); setText(null); }}
        onChangeText={v => { const clean = v.replace(/\D/g, ''); setText(clean); onChange(Number(clean) || 0); }}
        allowFontScaling maxFontSizeMultiplier={1.4} selectionColor={k.c.accent} cursorColor={k.c.accent}
        style={[font(700, 19, undefined, -0.015), tabular, { flex: 1, minWidth: 0, color: k.c.text, paddingTop: 3, paddingBottom: 0, paddingHorizontal: 0 }]} />
      <KitText weight={600} size={13} color="text-muted">{t('obbG')}</KitText>
    </View>
  </View>;
}

/* ---------- connect ---------- */
export type Link = 'connect' | 'busy' | 'on' | 'unavailable';
export function ConnectStep({ eyebrow, health, oura, onHealth, onOura }: { eyebrow: string; health: Link; oura: Link; onHealth: () => void; onOura: () => void }) {
  const k = useKit(), card = useSurface(20);
  const svc = (id: 'health' | 'oura', name: string, sub: string, state: Link, onPress: () => void) => <View key={id} style={[card, { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }]}>
    <View style={{ width: 48, height: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: id === 'health' ? '#FFFFFF' : '#101114', boxShadow: `0px 0px 0px 1px ${k.c['hair-2']}` }}>
      {id === 'health' ? <ObIcon name="ob-heart" size={28} color={HEALTH_RED} /> : <Icon name="ring" size={26} color="#E8E8EA" />}
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <KitText weight={700} size={16.5} lineHeight={1.2} tracking={-0.015}>{name}</KitText>
      <KitText weight={500} size={13} lineHeight={1.35} color="text-muted" style={{ marginTop: 3 }}>{state === 'unavailable' ? t(id === 'health' ? 'obbHealthUnavailable' : 'obbOuraUnavailable') : sub}</KitText>
    </View>
    {state === 'on' ? <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36 }}>
      <Icon name="check" size={16} color={k.c.success} /><KitText weight={700} size={13.5} color="success">{t('obbConnected')}</KitText>
    </View> : state === 'unavailable' ? null : <Button testID={`onboarding-connect-${id}`} label={t('obbConnect')} accessibilityLabel={t('obbConnectA11y').replace('{name}', name)}
      size="sm" variant="secondary" busy={state === 'busy'} onPress={onPress} />}
  </View>;
  return <View>
    <Head eyebrow={eyebrow} title={t('obbConnectTitle')} lede={t('obbConnectLede')} />
    {/* The grid's 12 pt gap plus the kit's 12 pt between cards. */}
    <View style={{ gap: 24, marginTop: 24 }}>
      {svc('health', t('obbHealth'), t('obbHealthSub'), health, onHealth)}
      {svc('oura', t('obbOura'), t('obbOuraSub'), oura, onOura)}
    </View>
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 14, marginHorizontal: 4 }}>
      <View style={{ marginTop: 1 }}><Icon name="lock" size={16} color={k.c['text-muted']} /></View>
      <KitText weight={500} size={13} lineHeight={1.45} color="text-muted" style={{ flex: 1 }}>{t('obbLock')}</KitText>
    </View>
  </View>;
}

/* ---------- routines quiz ---------- */
const HABIT: Record<HabitId, [MessageKey, ObIconName, string]> = {
  water: ['obbHabitWater', 'ob-water', 'water'], stretch: ['obbHabitStretch', 'ob-stretch', 'training'], outside: ['obbHabitOutside', 'ob-sun', 'warning'],
  read: ['obbHabitRead', 'ob-book', 'sleep'], screens: ['obbHabitScreens', 'ob-phone', 'recovery'], supps: ['obbHabitSupps', 'ob-pill', 'food'],
};
export function TimeQuiz({ eyebrow, kind, d, set, clock24 }: { eyebrow: string; kind: 'wake' | 'wind'; d: FlowDraft; set: Set; clock24: boolean }) {
  const k = useKit(), wake = kind === 'wake', cur = wake ? d.quiz.wake : d.quiz.wind;
  return <View>
    <Head eyebrow={eyebrow} title={t(wake ? 'obbQuiz1Title' : 'obbQuiz3Title')} lede={t(wake ? 'obbQuiz1Lede' : 'obbQuiz3Lede')} />
    <View accessibilityRole="radiogroup" accessibilityLabel={t(wake ? 'obbWakeTime' : 'obbWindTime')} style={{ gap: 8, marginTop: 22 }}>
      {(wake ? WAKE : WIND).map(v => <Option key={v} testID={`onboarding-${kind}-${v}`} title={slotLabel(kind, v, clock24)} on={cur === v} height={56}
        icon={wake ? { ob: 'ob-sun' } : { kit: 'moon' }} iconColor={k.c[wake ? 'warning' : 'sleep']}
        onPress={() => set({ quiz: { ...d.quiz, [kind]: v } })} />)}
    </View>
  </View>;
}
export function HabitQuiz({ eyebrow, d, set }: { eyebrow: string; d: FlowDraft; set: Set }) {
  const k = useKit();
  return <View>
    <Head eyebrow={eyebrow} title={t('obbQuiz2Title')} lede={t('obbQuiz2Lede')} />
    <View accessibilityLabel={t('obbHabits')} style={{ gap: 8, marginTop: 22 }}>
      {HABITS.map(h => { const [label, icon, tone] = HABIT[h]; const on = !!d.quiz.keep[h];
        return <Option key={h} testID={`onboarding-habit-${h}`} kind="toggle" title={t(label)} on={on} height={56} icon={{ ob: icon }} iconColor={k.c[tone]}
          onPress={() => set({ quiz: { ...d.quiz, keep: { ...d.quiz.keep, [h]: !on } } })} />; })}
    </View>
  </View>;
}

/* ---------- suggested routine ---------- */
export const ITEM: Record<RoutineItemKey, [MessageKey, ObIconName]> = {
  water: ['obbItemWater', 'ob-water'], stretch: ['obbItemStretch', 'ob-stretch'], outside: ['obbItemOutside', 'ob-sun'], read: ['obbItemRead', 'ob-book'], screens: ['obbItemScreens', 'ob-phone'],
};
export function RoutineStep({ eyebrow, d, clock24 }: { eyebrow: string; d: FlowDraft; clock24: boolean }) {
  const k = useKit(), card = useSurface(20), plan = routinePlan(d.quiz);
  const block = (name: string, tone: 'warning' | 'sleep', w: { from: number; items: RoutineItemKey[] }) => <View style={[card, { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 4 }]}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: k.c[tone] }} />
      <KitText weight={700} size={16} tracking={-0.015} style={{ flex: 1 }}>{name}</KitText>
      <KitText weight={600} size={13} numeric color="text-muted">{clockTime(w.from, clock24)}</KitText>
    </View>
    {w.items.map((key, i) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40, borderTopWidth: i ? 1 : 0, borderTopColor: k.c.hair }}>
      <ObIcon name={ITEM[key][1]} size={18} color={k.c[tone]} /><KitText weight={600} size={15}>{t(ITEM[key][0])}</KitText>
    </View>)}
  </View>;
  return <View>
    <Head eyebrow={eyebrow} title={t('obbRoutineTitle')} lede={t('obbRoutineLede')} />
    <SunPath am={plan.am} pm={plan.pm} clock24={clock24} />
    <View style={{ gap: 10, marginTop: 10 }}>
      {block(t('obbMorning'), 'warning', plan.am)}
      {block(t('obbNight'), 'sleep', plan.pm)}
    </View>
    {plan.supps ? <View style={{ marginTop: 12, marginHorizontal: 4 }}><KitText weight={500} size={13} lineHeight={1.4} color="text-muted">{t('obbSupps')}</KitText></View> : null}
  </View>;
}
/** The Routines tab's sun path (5 AM to 11 PM), cropped, with the morning and night windows. */
function SunPath({ am, pm, clock24 }: { am: { from: number; to: number }; pm: { from: number; to: number }; clock24: boolean }) {
  const k = useKit(), card = useSurface(22);
  const P = (h: number) => { const x = 16 + (h - 5) * 228 / 18, dd = (x - 130) / 114; return [x, 112 - 84 * Math.sqrt(Math.max(0, 1 - dd * dd))] as const; };
  const seg = (a: number, b: number) => { const p = P(a), q = P(b); return `M${p[0].toFixed(1)} ${p[1].toFixed(1)} A114 84 0 0 1 ${q[0].toFixed(1)} ${q[1].toFixed(1)}`; };
  const hax = (h: number) => clock24 ? String(h % 24) : `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
  const [w, setW] = useState(0);
  const inner = Math.max(0, w - 44), height = inner * 114 / 260;
  return <View accessible accessibilityRole="image" accessibilityLabel={t('obbSunA11y').replace('{am}', clockTime(am.from, clock24)).replace('{pm}', clockTime(pm.from, clock24))}
    onLayout={e => setW(e.nativeEvent.layout.width)} style={[card, { marginTop: 18, paddingTop: 10, paddingHorizontal: 22, paddingBottom: 6 }]}>
    {inner > 0 ? <Svg width={inner} height={height} viewBox="0 18 260 114">
      <Path d="M16 112 A114 84 0 0 1 244 112" fill="none" stroke={k.c['hair-2']} strokeWidth={1.6} strokeDasharray={[1, 5]} strokeLinecap="round" />
      {([[am, k.c.warning], [pm, k.c.sleep]] as const).map(([win, c], i) => { const p = P(win.from); return <G key={i}>
        <Path d={seg(win.from, Math.min(23, win.to))} fill="none" stroke={c} strokeWidth={9} strokeLinecap="round" />
        <Circle cx={p[0]} cy={p[1]} r={5} fill={k.c.surface} stroke={c} strokeWidth={2.5} />
      </G>; })}
      <Line x1={16} y1={112} x2={244} y2={112} stroke={k.c['hair-2']} strokeWidth={1.2} />
      {[5, 8, 11, 14, 17, 20, 23].map(h => <SvgText key={h} x={P(h)[0]} y={128} fontSize={10.5} fontFamily={tokens.font.bodyStrong} fill={k.c['text-muted']} textAnchor="middle">{hax(h)}</SvgText>)}
    </Svg> : <View style={{ height: 140 }} />}
  </View>;
}

/* ---------- finale ---------- */
const PILLARS = ['training', 'food', 'recovery', 'sleep', 'water'] as const;
export function FinaleStep({ eyebrow, palette, icon, onPalette, onIcon }: { eyebrow: string; palette: Palette; icon: AppIconId; onPalette: (p: Palette) => void; onIcon: (i: AppIconId) => void }) {
  const k = useKit(), list = useSurface(20), mode = k.mode, pal = tokens.palettes[palette][mode];
  return <View>
    <Head eyebrow={eyebrow} title={t('obbFinaleTitle')} lede={t('obbFinaleLede')} />
    <Label nativeID="onboarding-palette">{t('obbPalette')}</Label>
    <View style={[list, { overflow: 'hidden' }]}>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('obbPalette')} style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, paddingVertical: 14, paddingHorizontal: 8 }}>
        {palettes.map(id => { const a = tokens.palettes[id][mode].accent, on = id === palette;
          return <View key={id} style={{ width: `${100 / 6}%`, alignItems: 'center' }}>
            <PressScale testID={`onboarding-palette-${id}`} accessibilityRole="radio" accessibilityLabel={tokens.palettes[id].name} accessibilityState={{ checked: on }} onPress={() => onPalette(id)}
              style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: a,
                boxShadow: on ? `0px 0px 0px 2px ${k.c.surface}, 0px 0px 0px 4px ${a}` : `inset 0px 0px 0px 1px ${alpha(k.c.text, 0.1)}` }} />
            </PressScale>
          </View>; })}
      </View>
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: k.c.hair }}>
        <KitText weight={600} size={15}>{tokens.palettes[palette].name}</KitText>
        <View style={{ flexDirection: 'row', gap: 5 }}>{PILLARS.map(p => <View key={p} style={{ width: 16, height: 6, borderRadius: 3, backgroundColor: pal[p] }} />)}</View>
      </View>
    </View>
    <Label nativeID="onboarding-icon">{t('obbAppIcon')}</Label>
    <View style={[list, { overflow: 'hidden' }]}>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('obbAppIcon')} style={{ flexDirection: 'row', gap: 8, paddingTop: 16, paddingHorizontal: 10, paddingBottom: 14 }}>
        {APP_ICONS.map(item => { const on = icon === item.id;
          return <PressScale key={item.id} testID={`onboarding-icon-${item.id}`} accessibilityRole="radio" accessibilityLabel={item.name} accessibilityState={{ checked: on }} onPress={() => onIcon(item.id)}
            style={{ flex: 1, alignItems: 'center', gap: 9, paddingVertical: 4, borderRadius: 14 }}>
            <View style={{ width: 62, height: 62, borderRadius: 15, overflow: on ? 'visible' : 'hidden',
              boxShadow: on ? `0px 0px 0px 2.5px ${k.c.surface}, 0px 0px 0px 5px ${k.c.accent}` : `0px 0px 0px 1px ${k.c['hair-2']}` }}>
              <Image source={iconArt(item.id, palette, mode)} style={{ width: 62, height: 62, borderRadius: 15 }} accessible={false} />
            </View>
            <KitText weight={600} size={13} color={on ? 'text' : 'text-muted'}>{item.name}</KitText>
          </PressScale>; })}
      </View>
    </View>
  </View>;
}
