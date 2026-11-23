import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import * as Router from 'expo-router';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setDockAction } from '@/components/floating-tabs';
import { useLayoutMotion } from '@/components/layout-motion';
import { Screen } from '@/components/screen';
import { SectionTabs } from '@/components/section-tabs';
import { useTheme } from '@/design/theme-provider';
import { useFocused } from '@/features/home/use-focused';
import { undoLog } from '@/features/routines/model/actions';
import { longRoutineDay } from '@/features/routines/model/history';
import { routineTypeName, routineTypeTabs } from '@/features/routines/model/types';
import { routinesText } from '@/i18n/en';
import { DayView, LoggedToast, type LoggedAll } from './day-view';
import { ROUTINES_DAY_VIEW, routineRoutes, type RoutineLinkTarget } from './entry-points';
import { RoundButton } from './parts';
import { TypeView } from './type-view';
import { useMinuteClock, useRoutines } from './use-routines';

const DAY_TAB = ROUTINES_DAY_VIEW;
type Param = string | string[] | undefined;
type Link = { view?: Param; blockId?: Param; itemId?: Param };
const NO_LINK: Link = {};
const one = (value: Param) => (Array.isArray(value) ? value[0] : value) || '';
/** What a link asks for (a Home tile opens Routines on the tab that holds its item, and names the routine
 * and item to open there). Drawn outside a navigator there is no link to read. */
function useLink(): Link {
  try { return Router.useLocalSearchParams<Link>(); } catch { return NO_LINK; }
}
type LinkNavigation = { setParams: (params: Record<string, undefined>) => void };
function useLinkNavigation(): LinkNavigation | null {
  try { return Router.useNavigation() as unknown as LinkNavigation; } catch { return null; }
}

/** The Routines tab: today's routines first, then a tab for each item type in use. */
export function RoutinesScreen() {
  const { barLook } = useTheme();
  const focused = useFocused(), insets = useSafeAreaInsets();
  const routines = useRoutines(), now = useMinuteClock(focused), glide = useLayoutMotion();
  const [tab, setTab] = useState(DAY_TAB);
  // A link is used once: it picks the tab, then comes off the route so a later choice by hand is not undone.
  const link = useLink(), navigation = useLinkNavigation();
  const asked = one(link.view), askedBlock = one(link.blockId), askedItem = one(link.itemId);
  const linked = [asked, askedBlock, askedItem].join(' ').trim();
  const [used, setUsed] = useState('');
  // The routine and item a link named. The day view opens them; it is a new object for each link, so the
  // same tile tapped again is followed again. A tab picked by hand lets it go.
  const [jump, setJump] = useState<RoutineLinkTarget | null>(null);
  if (linked !== used) {
    setUsed(linked);
    if (asked) setTab(asked);
    if (askedBlock || askedItem) setJump({ blockId: askedBlock, itemId: askedItem });
  }
  useEffect(() => { if (linked) navigation?.setParams({ view: undefined, blockId: undefined, itemId: undefined }); }, [linked, navigation]);
  const pick = (value: string) => { setTab(value); setJump(null); };
  const [logged, setLogged] = useState<LoggedAll | null>(null);
  const types = routineTypeTabs(routines.view).filter(type => !!routineTypeName(type, routines.view.prefs));
  // A type tab that went away (its last item was removed) falls back to the day.
  const current = tab === DAY_TAB || types.includes(tab) ? tab : DAY_TAB;
  const options = [{ value: DAY_TAB, label: routinesText('title') }, ...types.map(type => ({ value: type, label: routineTypeName(type, routines.view.prefs) }))];
  const add = useCallback(() => router.push(routineRoutes.addItem(current === DAY_TAB ? {} : { type: current })), [current]);
  // With the floating bar, Add item rides beside the tabs while Routines is open. The other bars get a + in the header.
  const floating = barLook === 'floating';
  useEffect(() => {
    if (!floating || !focused) return;
    setDockAction({ label: routinesText('addItem'), expanded: false, onPress: add });
    return () => setDockAction(null);
  }, [floating, focused, add]);
  const clear = useCallback(() => setLogged(null), []);
  const takeBack = (done: LoggedAll) => {
    glide();
    routines.apply((store, clock) => {
      let next = store, changed = false;
      for (const id of done.logIds) { const undone = undoLog(next, id, clock); if (undone) { next = undone; changed = true; } }
      return changed ? next : null;
    });
    setLogged(null);
  };
  return <Screen tabHeader title={routinesText('title')} subtitle={longRoutineDay(routines.dayOf(now))}
    action={<View style={{ flexDirection: 'row' }}>
      {!floating && <RoundButton testID="routines-add" glyph="plus" label={routinesText('addItem')} onPress={add} />}
      <RoundButton testID="routines-settings" glyph="gear" label={routinesText('settings')} onPress={() => router.push(routineRoutes.settings())} />
    </View>}
    overlay={<LoggedToast logged={logged} bottom={insets.bottom} onUndo={takeBack} onDone={clear} />}>
    {options.length > 1 && <SectionTabs testID="routine-tabs" label={routinesText('views')} options={options} value={current} onChange={pick} />}
    {current === DAY_TAB ? <DayView routines={routines} now={now} jump={jump} onLoggedAll={setLogged} /> : <TypeView routines={routines} type={current} now={now} />}
  </Screen>;
}
