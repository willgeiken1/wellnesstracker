import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, KitText, useKit, useSelectionHaptic } from '@/components/kit';
import { useAuth } from '@/auth/provider';
import { isHealthSource } from '@/data/health-store';
import type { Repository } from '@/data/repository';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { lastWeight } from '@/features/body/model';
import { goalsFor } from '@/features/food/day';
import { useAppleHealth } from '@/features/health/use-apple-health';
import { useOura } from '@/features/health/use-oura';
import { ROUTINES_KEY, routinesStoreFor } from '@/features/routines/store';
import { applyAppIcon } from '@/features/settings/app-icon';
import { useSettingsPrefs } from '@/features/settings/prefs';
import { showToast } from '@/features/shell/toast';
import { t, type MessageKey } from '@/i18n/en';
import { today } from '../model';
import {
  KCAL_STEP, KG, LIT, blankDraft, canContinue, markDone, markSkip, nextOf, prevOf, skipTarget, suggest, switchUnit, withKcal, withMacro,
  type FlowDraft, type Plan, type Step,
} from './model';
import { Frame } from './parts';
import { addSuggestedRoutines, readSkipped, saveOnboarding, saveResumed, underThirteen } from './save';
import { BodyStep, ConnectStep, FinaleStep, GoalsStep, HabitQuiz, NameStep, RoutineStep, TargetsStep, TimeQuiz, type Link } from './steps';

/** Where the flow stands. Kept above the route, so it survives the screen being drawn again. */
export interface FlowState {
  step: Step; d: FlowDraft; was: { about: boolean; goals: boolean }; resume: boolean;
  /** Apple Health had no weight to fill: the row goes away. */
  noFill?: boolean;
}

export function startState(repo: Repository | null, unit: FlowDraft['unit'], resume: boolean): FlowState {
  const was = resume && repo ? readSkipped(repo) : { about: false, goals: false };
  const d = { ...blankDraft(unit), skipped: { ...was } };
  return { step: resume ? (was.about ? 'name' : 'goals') : 'name', d, was, resume };
}

const EYEBROW: Record<Step, MessageKey> = { name: 'obbEbAbout', body: 'obbEbAbout', goals: 'obbEbGoals', targets: 'obbEbGoals', connect: 'obbEbConnect',
  quiz: 'obbEbQuiz', 'quiz-2': 'obbEbQuiz', 'quiz-3': 'obbEbQuiz', routine: 'obbEbRoutines', finale: 'obbEbFinish' };
const eyebrowOf = (step: Step) => t(EYEBROW[step]).replace('{n}', step === 'quiz' ? '1' : step === 'quiz-2' ? '2' : '3');

/**
 * The setup flow from the first name to the finale. One screen draws every step: the top bar stays while the body and
 * the buttons fade in. `resume` reopens only the sections skipped earlier (Home's nudge), then returns to Home.
 */
export function Flow({ state, setState, resume, onBlocked, onDone }: {
  state: FlowState; setState: Dispatch<SetStateAction<FlowState>>; resume: boolean; onBlocked: () => void; onDone: () => void;
}) {
  const auth = useAuth(), repo = auth.repository, k = useKit(), theme = useTheme(), tick = useSelectionHaptic();
  const [prefs, setPref] = useSettingsPrefs();
  const apple = useAppleHealth(repo), ring = useOura(repo);
  const clock24 = prefs.units.clock === '24';
  const { step, d } = state;
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const ready = !!repo && (!auth.session || !!auth.initialPullComplete);

  const set = (patch: Partial<FlowDraft>) => setState(s => ({ ...s, d: { ...s.d, ...patch } }));
  // Choosing among tiles ticks, as the app's segments do.
  const pick = (patch: Partial<FlowDraft>) => { tick(); set(patch); };
  const fallback = () => {
    const g = repo ? goalsFor(repo, today()) : null;
    return g?.set ? { kcal: g.kcal, p: g.p } : { kcal: prefs.goals.kcal, p: prefs.goals.protein };
  };
  const go = (next: Step, dd: FlowDraft = d) => {
    setFailed(false);
    setState(s => ({ ...s, step: next, d: next === 'targets' && !dd.t ? { ...dd, t: suggest(dd, dd.plan, fallback()) } : dd }));
  };
  const endResume = (dd: FlowDraft) => {
    if (!repo || !ready) return;
    try { saveResumed(repo, dd, state.was); } catch { setFailed(true); return; }
    showToast(t('obbResumeDone'), { color: 'accent' });
    onDone(); router.replace('/');
  };
  const advance = (from: Step) => {
    const dd = markDone(from, d);
    if (from === 'body' && underThirteen(dd)) { onBlocked(); return; }
    const n = nextOf(from, dd, resume);
    if (n) go(n, dd); else endResume(dd);
  };
  const skip = (from: Step) => {
    const dd = markSkip(from, d), n = skipTarget(from, dd, resume);
    if (n) go(n, dd); else endResume(dd);
  };
  const back = () => {
    const p = prevOf(step, d, resume);
    if (p) { go(p); return; }
    if (router.canGoBack()) { router.back(); return; }
    // Welcome is closed while in guest mode, so a guest going back leaves it first.
    if (!resume && auth.guest) auth.exitGuest?.();
    router.replace(resume ? '/' : '/auth');
  };

  // Fill from Apple Health: connecting reads body weight into the Health store; the newest Health reading fills the field.
  const fill = useRef<'idle' | 'asked' | 'busy'>('idle');
  useEffect(() => {
    if (fill.current === 'asked' && apple.busy) fill.current = 'busy';
    else if (fill.current === 'busy' && !apple.busy) {
      fill.current = 'idle';
      if (apple.access !== 'asked' || !repo) return;
      const kg = lastWeight(repo.list('weigh_ins').filter(r => isHealthSource(r.data.source)));
      if (!kg) { setState(s => ({ ...s, noFill: true })); return; }
      setState(s => ({ ...s, d: { ...s.d, filled: true, healthKg: kg, t: null, weight: (s.d.unit === 'kg' ? kg : kg * KG).toFixed(1) } }));
    }
  }, [apple.busy, apple.access, repo, setState]);

  // Connect: a short toast once a service is on after they tap Connect.
  const asked = useRef({ health: false, oura: false });
  useEffect(() => {
    if (asked.current.health && !apple.busy && apple.access === 'asked') { asked.current.health = false; showToast(t('obbHealthConnected'), { color: 'accent' }); }
  }, [apple.busy, apple.access]);
  useEffect(() => {
    if (asked.current.oura && !ring.busy && ring.state === 'on') { asked.current.oura = false; showToast(t('obbOuraConnected'), { color: 'success' }); }
  }, [ring.busy, ring.state]);
  const healthLink: Link = apple.access === 'unavailable' ? 'unavailable' : apple.busy ? 'busy' : apple.access === 'asked' ? 'on' : 'connect';
  const ouraLink: Link = ring.state === 'unavailable' || ring.state === 'unreachable' ? 'unavailable' : ring.busy ? 'busy' : ring.state === 'on' ? 'on' : 'connect';

  const addRoutines = async () => {
    if (!repo || busy) return;
    setBusy(true);
    try {
      await addSuggestedRoutines(routinesStoreFor(repo), d.quiz, { morning: t('obbMorning'), night: t('obbNight'), water: t('obbItemWater'), stretch: t('obbItemStretch'),
        outside: t('obbItemOutside'), read: t('obbItemRead'), screens: t('obbItemScreens') }, next => repo.localSave(ROUTINES_KEY, next));
      go('finale', { ...d, routine: true });
    } catch { setFailed(true); } finally { setBusy(false); }
  };
  const finish = () => {
    if (!repo || !ready || busy) return;
    try { saveOnboarding(repo, d); } catch { setFailed(true); return; }
    void applyAppIcon(prefs.look.icon, theme.palette, theme.mode).catch(() => undefined);
    onDone(); router.replace('/');
  };

  const primary = (label: MessageKey, onPress: () => void, opts: { disabled?: boolean; testID?: string } = {}) =>
    <Button full testID={opts.testID ?? 'onboarding-continue'} label={t(label)} disabled={opts.disabled} busy={busy && (step === 'routine' || step === 'finale')} onPress={onPress} />;
  const ghost = (label: MessageKey, onPress: () => void, testID = 'onboarding-skip') =>
    <Button full variant="ghost" testID={testID} label={t(label)} onPress={onPress} style={{ minHeight: 44 }} />;
  const cont = (label: MessageKey = 'obbContinue') => primary(label, () => advance(step), { disabled: !canContinue(step, d) });

  const eyebrow = eyebrowOf(step);
  let body: React.ReactNode, cta: React.ReactNode;
  switch (step) {
    case 'name':
      body = <NameStep eyebrow={eyebrow} d={d} set={set} onSubmit={() => { if (canContinue('name', d)) advance('name'); }} />;
      cta = <>{cont()}{ghost('obbNotNow', () => skip('name'))}</>; break;
    case 'body':
      body = <BodyStep eyebrow={eyebrow} d={d} set={set} health={apple.access === 'unavailable' || state.noFill ? 'hidden' : apple.busy ? 'busy' : 'fill'}
        onFill={() => { fill.current = 'asked'; apple.connect(); }} onUnit={u => setState(s => ({ ...s, d: switchUnit(s.d, u) }))} />;
      cta = <>{cont()}{ghost('obbNotNow', () => skip('body'))}</>; break;
    case 'goals':
      body = <GoalsStep eyebrow={eyebrow} d={d} set={pick} />;
      cta = <>{cont()}{ghost('obbNotNow', () => skip('goals'))}</>; break;
    case 'targets': {
      const tl = d.t ?? suggest(d, d.plan, fallback());
      const setT = (n: typeof tl) => set({ t: n, edited: true });
      body = <TargetsStep eyebrow={eyebrow} d={{ ...d, t: tl }} est={tl.est}
        onPlan={(p: Plan) => { tick(); set({ plan: p, t: suggest(d, p, fallback()), edited: false }); }}
        onKcal={dir => { const kcal = Math.min(KCAL_STEP.max, Math.max(KCAL_STEP.min, Math.round(tl.kcal / KCAL_STEP.step) * KCAL_STEP.step + dir * KCAL_STEP.step)); if (kcal !== tl.kcal) { tick(); setT(withKcal(tl, kcal)); } }}
        onMacro={(key, g) => setT(withMacro(tl, key, g))}
        onReset={() => set({ t: suggest(d, d.plan, fallback()), edited: false })} />;
      cta = <>{cont()}{ghost('obbNotNow', () => skip('targets'))}</>; break;
    }
    case 'connect':
      body = <ConnectStep eyebrow={eyebrow} health={healthLink} oura={ouraLink}
        onHealth={() => { asked.current.health = true; apple.connect(); }} onOura={() => { asked.current.oura = true; ring.connect(); }} />;
      cta = cont(); break;
    case 'quiz':
      body = <TimeQuiz eyebrow={eyebrow} kind="wake" d={d} set={pick} clock24={clock24} />;
      cta = <>{cont()}{ghost('obbNotNow', () => skip('quiz'))}</>; break;
    case 'quiz-2':
      body = <HabitQuiz eyebrow={eyebrow} d={d} set={pick} />;
      cta = <>{cont()}{ghost('obbSkipRoutines', () => skip('quiz-2'))}</>; break;
    case 'quiz-3':
      body = <TimeQuiz eyebrow={eyebrow} kind="wind" d={d} set={pick} clock24={clock24} />;
      cta = <>{cont('obbSeeRoutine')}{ghost('obbSkipRoutines', () => skip('quiz-3'))}</>; break;
    case 'routine':
      body = <RoutineStep eyebrow={eyebrow} d={d} clock24={clock24} />;
      cta = <>{primary('obbAddRoutines', () => { void addRoutines(); }, { disabled: !repo })}{ghost('obbNotNow', () => skip('routine'))}</>; break;
    case 'finale':
      body = <FinaleStep eyebrow={eyebrow} palette={theme.palette} icon={prefs.look.icon}
        onPalette={p => { if (p !== theme.palette) { tick(); theme.setPalette(p); } }} onIcon={i => { if (i !== prefs.look.icon) { tick(); setPref('look.icon', i); } }} />;
      cta = <>
        {!ready ? <KitText testID="onboarding-preparing" weight={500} size={13} color="text-muted" accessibilityLiveRegion="polite" style={{ textAlign: 'center', marginBottom: 8 }}>{t('onboardingPreparing')}</KitText> : null}
        {primary('obbOpen', finish, { disabled: !ready, testID: 'onboarding-finish' })}
      </>; break;
  }
  const backLabel = step === 'name' && !resume ? (auth.session || auth.demo ? t('obbBackWelcome') : t('obbBackSkip')) : t('obbBack');
  return <Frame stepKey={step} back={backLabel} onBack={back} frac={LIT[step]} screenLabel={t('obbScreen').replace('{eyebrow}', eyebrow)}
    glow={step === 'finale' ? k.c.accent : tokens.palettes.orchidEvening[theme.mode].accent}
    cta={<>
      {failed ? <View accessible accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ marginBottom: 8 }}><KitText testID="onboarding-save-error" weight={500} size={13} color="danger" style={{ textAlign: 'center' }}>{t('workoutSaveError')}</KitText></View> : null}
      {cta}
    </>}>
    {body}
  </Frame>;
}
