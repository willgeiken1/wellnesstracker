import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { BodyAtlas } from '@/features/atlas/body-atlas';
import { atlasSessions } from '@/features/atlas/read-logs';
import { useOuraRecovery } from '@/features/health/use-oura-recovery';
import { useRecovery } from '@/features/health/use-recovery';
import { useFocused } from '@/features/home/use-focused';
import { useWorkout } from '@/features/workout/use-workout';
import { track } from '@/telemetry/sdk';
import { Recovery } from './recovery';
import { Trends, Weekly } from './trends';

export const INSIGHT_SECTIONS = ['trends', 'recovery', 'muscles', 'weekly'] as const;
export type InsightSection = (typeof INSIGHT_SECTIONS)[number];

/** The Insights view of Progress: the section in front, with its own clock. Progress draws this only while its
 * Insights view is shown, so the clock, the foreground refresh and the health reads all stop on Tracking. */
export function Insights({ section }: { section: InsightSection }) {
  const { store } = useWorkout();
  const [now, setNow] = useState(Date.now);
  // useWorkout returns a new facade on repository revisions, including history edits.
  const sessions = useMemo(() => atlasSessions(store), [store]);
  // Read only while Recovery is the section in front and Progress is the tab in front, so no other section,
  // and nothing on Tracking, ever touches Apple Health or Oura.
  const focused = useFocused();
  const reading = focused && section === 'recovery';
  const recovery = useRecovery(reading);
  const ring = useOuraRecovery(reading);
  // Insights has no tab of its own to count, so say when it comes to the front. The event carries nothing.
  useEffect(() => { if (focused) track('insights_opened'); }, [focused]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') setNow(Date.now()); });
    return () => { clearInterval(timer); sub.remove(); };
  }, []);
  const today = useMemo(() => new Date(now), [now]);
  return <>
    {section === 'trends' && store && <Trends store={store} now={today} />}
    {section === 'weekly' && store && <Weekly store={store} now={today} />}
    {section === 'muscles' && <BodyAtlas sessions={sessions} now={now} haptics={store?.repo.localGet<boolean>('haptics') !== false} />}
    {section === 'recovery' && <Recovery access={recovery.access} recovery={recovery.recovery} oura={ring} now={today} />}
  </>;
}
