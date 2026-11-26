import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import { useShellPrefs } from '@/features/shell/prefs';
import { showToast } from '@/features/shell/toast';
import { Coach, type Hole } from '../tips/coach';
import { tabHole } from '../tips/targets';
import { tourSteps } from './steps';
import { onTourRequest, takeTour, tourPending } from './store';

/** How long each stop waits for its tab to open before the spotlight moves to it. */
export const TOUR_WAIT = 380;
/** The tour starts this long after sample data's Home appears. */
export const TOUR_DELAY = 450;

/**
 * The sample-data tour (ob-tour to ob-tour-4): after Explore with sample data, four stops open Home, Training, Food and
 * Progress in turn and spotlight each tab on the bar. Skip tour or Start exploring returns to Home with a toast.
 * It plays only on sample data, once for each request.
 */
export function SampleTour({ demo }: { demo: boolean }) {
  const { reduceMotion } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [prefs] = useShellPrefs();
  const steps = useMemo(() => tourSteps(), []);
  const [step, setStep] = useState(-1);
  const [hole, setHole] = useState<Hole | null>(null);
  // Read when the request is taken, so a change to Reduce Motion doesn't restart the wait and lose the request.
  const reduced = useRef(reduceMotion);
  useEffect(() => { reduced.current = reduceMotion; }, [reduceMotion]);

  useEffect(() => {
    if (!demo) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The request is taken only when the tour starts, so a Home that closes before then leaves it for the next one.
    const start = () => { if (tourPending()) timer = setTimeout(() => { if (takeTour()) setStep(0); }, reduced.current ? 60 : TOUR_DELAY); };
    start();
    const off = onTourRequest(start);
    return () => { off(); if (timer) clearTimeout(timer); };
  }, [demo]);

  useEffect(() => {
    if (step < 0) return;
    const s = steps[step];
    router.navigate(s.href as Href);
    const id = setTimeout(() => setHole(tabHole({ width, height, insetBottom: insets.bottom }, s.page, prefs.hidden)), TOUR_WAIT);
    return () => clearTimeout(id);
  }, [step, steps, width, height, insets.bottom, prefs.hidden]);

  if (step < 0) return null;
  const s = steps[step];
  const end = () => {
    setStep(-1); setHole(null);
    router.navigate('/' as Href);
    setTimeout(() => showToast(t('obaTourDone')), 300);
  };
  const next = () => { if (step < steps.length - 1) setStep(step + 1); else end(); };
  return <Coach kind="tour" hole={hole} side="above" eyebrow={s.eyebrow} title={s.title} body={s.body}
    index={step} count={steps.length} color={s.color} onNext={next} onSkip={end} />;
}
