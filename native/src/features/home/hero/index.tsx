import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { capitals } from '@/components/kit-style';
import { KitText } from '@/components/themed-text';
import { t } from '@/i18n/en';

/** The hero's height from the top of the page to the first tile: date, greeting, today's map and the week strip. */
export const HOME_HERO_HEIGHT = 578;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const greeting = (hour: number) => t(hour >= 5 && hour < 12 ? 'goodMorning' : hour >= 12 && hour < 18 ? 'goodAfternoon' : 'goodEvening');
export const dateLine = (d: Date) => t('homeDateLine').replace('{weekday}', WEEKDAYS[d.getDay()]).replace('{month}', MONTHS[d.getMonth()]).replace('{day}', String(d.getDate()));

/**
 * Home's hero slot: the date and greeting at the top, and the room the hero's map and week strip fill.
 * The hero itself is built separately and replaces this file; the page keeps its size so the tiles start where they will.
 */
export function HomeHero() {
  // The date and greeting follow the clock: each minute, and at once when the app is reopened the next morning.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 60_000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') tick(); });
    return () => { clearInterval(timer); sub?.remove(); };
  }, []);
  return <View testID="home-hero" style={{ height: HOME_HERO_HEIGHT, paddingTop: 6, paddingRight: 56 }}>
    <KitText weight={600} size={11.5} lineHeight={1.2} tracking={0.14} color="text-muted" style={capitals}>{dateLine(now)}</KitText>
    <KitText weight={700} size={29} lineHeight={1.1} tracking={-0.035} accessibilityRole="header" style={{ marginTop: 5 }}>{greeting(now.getHours())}</KitText>
  </View>;
}
