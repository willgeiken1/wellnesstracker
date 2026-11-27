import { createContext, useContext, useEffect, useState, type Dispatch, type PropsWithChildren, type SetStateAction } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, KitText, useKit } from '@/components/kit';
import { useAuth } from '../../auth/provider';
import { t } from '../../i18n/en';
import { loadSettingsPrefs } from '../settings/prefs';
import { Flow, startState, type FlowState } from './flow/flow';
import { isSetUp, readSkipped } from './flow/save';

interface Draft {
  blocked: boolean; block: () => void;
  /** Where setup stands, or null before it starts. Kept here so it survives the route being drawn again. */
  flow: FlowState | null; setFlow: Dispatch<SetStateAction<FlowState | null>>;
  reset: () => void;
}
const DraftContext = createContext<Draft | null>(null);
/** Outside owner-keyed theme/navigation: only memory. */
export function OnboardingDraftProvider({ children }: PropsWithChildren) {
  // Session-only: the under-13 block survives route unmounts; reset discards what was typed, not the block.
  const [blocked, setBlocked] = useState(false);
  const [flow, setFlow] = useState<FlowState | null>(null);
  return <DraftContext.Provider value={{ blocked, block: () => setBlocked(true), flow, setFlow, reset: () => setFlow(null) }}>{children}</DraftContext.Provider>;
}

/**
 * The /onboarding route. An account that has been set up is never sent through again: it goes Home. `?resume=1`
 * (Home's nudge) reopens only the sections that were skipped.
 */
export function Onboarding() {
  const draft = useContext(DraftContext); if (!draft) throw new Error('OnboardingDraftProvider required.');
  const auth = useAuth(), repo = auth.repository;
  const params = useLocalSearchParams<{ resume?: string }>();
  const resume = params.resume === '1';
  // Before the first pull an account's profile may not be on this phone yet, so "set up" can't be told, unless this
  // phone already has it (sync turned off afterwards never pulls again).
  const known = !!repo && (!auth.session || !!auth.initialPullComplete || isSetUp(repo));
  const skipped = known && repo ? readSkipped(repo) : null;
  const leave = !repo ? null
    // A guest (Skip for now, Start as a guest) sets up on this phone like a phone-only profile; the demo has no setup.
    : !auth.session && !auth.phoneOnly && (auth.demo || !auth.guest) ? (auth.demo ? '/sign-in' : '/auth')
    : !known ? null
    : resume ? (skipped && (skipped.about || skipped.goals) ? null : '/')
    : isSetUp(repo) ? '/' : null;
  useEffect(() => { if (leave && !draft.blocked) router.replace(leave); }, [leave, draft.blocked]);

  const { flow, setFlow } = draft;
  const unit = loadSettingsPrefs(repo).units.weight;
  const wantsStart = !flow || flow.resume !== resume;
  useEffect(() => { if (wantsStart && known) setFlow(startState(repo, unit, resume)); }, [wantsStart, known, repo, unit, resume, setFlow]);

  if (draft.blocked) return <Blocked onBack={() => { draft.reset(); router.replace('/auth'); }} />;
  const state = flow && !wantsStart ? flow : startState(repo, unit, resume);
  if (leave) return null;
  return <Flow state={state} resume={resume}
    setState={update => setFlow(f => typeof update === 'function' ? update(f ?? state) : update)}
    onBlocked={() => { draft.reset(); draft.block(); auth.blockOnboarding?.(); }} onDone={draft.reset} />;
}

/** Under 13: nothing was saved, and setup stops. */
function Blocked({ onBack }: { onBack: () => void }) {
  const k = useKit(), insets = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: k.c.bg, paddingTop: insets.top + 84, paddingHorizontal: 20, paddingBottom: 34 }}>
    <View style={{ flex: 1 }}>
      <KitText accessibilityRole="header" weight={700} size={30} lineHeight={1.1} tracking={-0.035}>{t('ages13Title')}</KitText>
      <KitText weight={500} size={15.5} lineHeight={1.5} color="text-muted" style={{ marginTop: 10 }}>{t('ages13Body')}</KitText>
    </View>
    <Button full testID="onboarding-blocked-back" label={t('backWelcome')} onPress={onBack} />
  </View>;
}
