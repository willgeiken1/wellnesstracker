import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { attributedDay } from './model';

/**
 * The day the Food screens show. It follows the food day (the 4 a.m. rule) until the person picks another day,
 * and a pick only lasts while that food day lasts: after a night away, opening the app shows today again
 * instead of filing breakfast under yesterday.
 */
export function useFoodDay(): [string, (day: string) => void] {
  // The answer depends on the clock, which the compiler cannot see as an input.
  'use no memo';
  const [pick, setPick] = useState<{ day: string; from: string } | null>(null);
  const [, wake] = useState(0);
  useEffect(() => {
    const app = AppState.addEventListener('change', state => { if (state === 'active') wake(n => n + 1); });
    return () => app.remove();
  }, []);
  const current = attributedDay();
  const day = pick && pick.from === current ? pick.day : current;
  return [day, value => setPick({ day: value, from: attributedDay() })];
}
