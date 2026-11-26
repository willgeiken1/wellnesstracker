import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSelectionHaptic } from '@/components/selection-haptic';
import { Tappable } from '@/components/tappable';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { tokens } from '@/design/tokens';
import { rs } from '@/i18n/en';
import {
  askedQuestions, backSetupStep, finishSetup, nextSetupStep, openSetupDraft, pickSetupAnswer, saveSetup, SETUP_MESSAGES, setupChoices, setupQuestion, skipSetupQuestion,
  type SetupDraft,
} from '@/features/routines/model/setup';
import type { RoutineView } from '@/features/routines/model/shape';
import { removedDefaultRoutines } from '@/features/routines/data/sqlite';
import { commitRoutines, routineClockNow, useRoutines, type RoutinesData } from './add-item-data';
import { announce, ErrorLine, OutlineButton, PrimaryButton, SheetFrame, SheetUnavailable, useSheetClose } from './add-item-frame';
import { Glyph } from './add-item-glyphs';
import { keepSetupDraft, keptSetupDraft } from './setup-draft';

function SetupForm({ data, view, mode }: { data: RoutinesData; view: RoutineView; mode: 'quiz' | 'retake' }) {
  const { colors } = useTheme();
  const tick = useSelectionHaptic();
  const owner = data.repository?.owner;
  const [opened] = useState(() => openSetupDraft(view.prefs, mode, keptSetupDraft(owner)));
  const [draft, setDraftState] = useState<SetupDraft>(opened);
  const [error, setError] = useState('');
  /* A first setup keeps its place when it is closed, so closing asks nothing. A retake asks before it drops changed answers. */
  const { close, leave } = useSheetClose(mode === 'retake' && JSON.stringify(draft.answers) !== JSON.stringify(opened.answers));
  const setDraft = (next: SetupDraft) => { if (mode === 'quiz') keepSetupDraft(owner, next); setDraftState(next); setError(''); };

  const asked = askedQuestions(draft.answers);
  const index = Math.max(0, asked.indexOf(draft.step));
  const question = setupQuestion(draft.step);
  const last = index === asked.length - 1;
  const answer = draft.answers[draft.step];
  const answered = Array.isArray(answer) ? answer.length > 0 : typeof answer === 'string' && !!answer;
  const stepText = rs('setupStep', { step: index + 1, count: asked.length });
  const heading = question ? question.title : '';

  useEffect(() => { if (heading) announce(`${stepText}. ${heading}`); }, [stepText, heading]);

  const finish = (from: SetupDraft, status: 'done' | 'skipped') => {
    const clock = routineClockNow(data.store);
    const save = finishSetup(from, view.prefs, status);
    const removed = data.repository ? removedDefaultRoutines(data.repository) : [];
    const next = saveSetup(data.store, { ...save, removed }, clock, new Date(clock.now));
    if (!next || !commitRoutines(data.repository, next)) { setError(SETUP_MESSAGES.failed); announce(SETUP_MESSAGES.failed); return; }
    keepSetupDraft(owner, null);
    announce(status === 'skipped' ? SETUP_MESSAGES.skipped : mode === 'retake' ? SETUP_MESSAGES.retaken : SETUP_MESSAGES.done);
    leave();
  };

  if (!question) return <SheetUnavailable testID="setup" title={rs('setupTitle')} onClose={close} />;

  const pick = (value: string) => {
    const result = pickSetupAnswer(draft, question.id, value);
    if (!result) return;
    // Tapping the answer already chosen moves on without a tick: nothing was chosen anew.
    if (question.multi || draft.answers[question.id] !== value) tick();
    /* A single answer moves to the next question. The last answer stays put and waits for Finish, so the sheet never closes on a tap that only chose something. */
    setDraft(result.draft);
  };
  const next = () => {
    const result = question.multi ? nextSetupStep(draft) : typeof answer === 'string' ? pickSetupAnswer(draft, question.id, answer) : null;
    if (!result) return;
    if (result.finished) finish(result.draft, 'done');
    else setDraft(result.draft);
  };
  const skipQuestion = () => {
    const result = skipSetupQuestion(draft);
    if (!result) return;
    if (result.finished) finish(result.draft, 'done');
    else setDraft(result.draft);
  };
  const back = () => { const prior = backSetupStep(draft); if (prior) setDraft(prior); };

  return <SheetFrame testID="setup" title={rs('setupTitle')} onClose={close} back={index > 0 ? { label: rs('back'), onPress: back } : undefined}>
    <View style={{ gap: tokens.spacing[1] }}>
      <ThemedText testID="setup-step" variant="caption" numeric muted style={{ fontWeight: '600' }}>{stepText}</ThemedText>
      <ThemedText testID="setup-question" variant="title" accessibilityRole="header" style={{ fontWeight: '600' }}>{question.title}</ThemedText>
      {!!question.hint && <ThemedText muted>{question.hint}</ThemedText>}
      {index === 0 && mode === 'quiz' && <ThemedText testID="setup-intro" muted>{rs('setupIntro')}</ThemedText>}
    </View>

    <View accessibilityRole={question.multi ? undefined : 'radiogroup'} accessibilityLabel={question.title} style={{ gap: tokens.spacing[1] }}>
      {setupChoices(question.id, draft.answers).map((choice) => {
        const on = Array.isArray(answer) ? answer.includes(choice.value) : answer === choice.value;
        return <Tappable dim="fill" key={choice.value} testID={`setup-choice-${choice.value}`} accessibilityRole={question.multi ? 'checkbox' : 'radio'} accessibilityLabel={choice.label} accessibilityState={{ checked: on }}
          onPress={() => pick(choice.value)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2], minHeight: 56, borderRadius: 18, paddingHorizontal: tokens.spacing[3], paddingVertical: tokens.spacing[1],
            backgroundColor: colors.surface, borderWidth: 2, borderColor: on ? colors.accent : colors.surface }}>
          <ThemedText style={{ flex: 1, fontWeight: on ? '600' : '400' }}>{choice.label}</ThemedText>
          <View style={{ width: 24, height: 24, borderRadius: question.multi ? 7 : 12, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 0 : 1.5, borderColor: colors['text-muted'], backgroundColor: on ? colors.accent : 'transparent' }}>
            {on && <Glyph name="check" size={20} color={colors['on-accent']} weight={2.6} />}
          </View>
        </Tappable>;
      })}
    </View>

    {last && <ThemedText testID="setup-doctor" variant="caption" muted>{rs('doctor')}</ThemedText>}

    <View style={{ gap: tokens.spacing[1] }}>
      <PrimaryButton testID="setup-next" label={last ? rs('finish') : rs('next')} disabled={!answered} onPress={next} />
      {!!error && <ErrorLine testID="setup-error">{error}</ErrorLine>}
      <OutlineButton testID="setup-skip-question" label={rs('setupSkipQuestion')} tone="muted" onPress={skipQuestion} />
      {index === 0 && mode === 'quiz' && <OutlineButton testID="setup-skip" label={rs('setupSkip')} tone="muted" onPress={() => finish(draft, 'skipped')} />}
    </View>
  </SheetFrame>;
}

/**
 * The setup quiz: one question a step. A single answer moves to the next
 * question, except on the last one, which waits for Finish. A pick-any
 * question waits for Next. Only Finish or Skip setup saves answers. Closing
 * a first setup keeps its place for the same account until the app closes
 * or the account leaves; closing a retake asks before it drops changes.
 */
export function SetupSheet({ mode = 'quiz' }: { mode?: 'quiz' | 'retake' }) {
  const data = useRoutines();
  const { close } = useSheetClose(false);
  if (!data.view) return <SheetUnavailable testID="setup" title={rs('setupTitle')} onClose={close} />;
  /* A new owner gets a new form, so nothing the last one picked is still on screen. */
  return <SetupForm key={`${mode}:${data.repository?.owner ?? ''}`} data={data} view={data.view} mode={mode} />;
}
