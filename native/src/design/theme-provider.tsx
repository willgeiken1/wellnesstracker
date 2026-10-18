import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Appearance, useColorScheme } from 'react-native';
import type { Repository } from '../data/repository';
import { compareRows } from '../data/rows';
import { createTheme, tokens, type Accent, type ThemeOverride } from './tokens';

function useThemeState(repository?: Repository | null) {
  const [override, updateOverride] = useState<ThemeOverride>('system');
  const [accent, updateAccent] = useState<Accent>('citrus');
  const [persistenceError, setPersistenceError] = useState(false);
  useEffect(() => {
    const hydrate = () => {
      try {
        const row = repository?.list('settings').sort(compareRows).at(-1);
        const theme = row?.data.theme_override, color = row?.data.accent;
        updateOverride(theme === 'light' || theme === 'dark' ? theme : 'system');
        updateAccent(color === 'sea' || color === 'dusk' || color === 'sand' ? color : 'citrus');
        setPersistenceError(false);
      } catch { setPersistenceError(true); }
    };
    hydrate();
    return repository?.subscribe(hydrate);
  }, [repository]);
  const persist = (theme: ThemeOverride, color: Accent) => {
    try {
      const current = repository?.list('settings').sort(compareRows).at(-1);
      repository?.save('settings', { ...current?.data, theme_override: theme, accent: color }, current?.id);
      updateOverride(theme); updateAccent(color); setPersistenceError(false);
    } catch { setPersistenceError(true); }
  };
  const setOverride = (theme: ThemeOverride) => persist(theme, accent);
  const setAccent = (color: Accent) => persist(override, color);
  useEffect(() => {
    Appearance.setColorScheme(override === 'system' ? 'auto' : override);
    return () => Appearance.setColorScheme('auto');
  }, [override]);
  const system = useColorScheme();
  const mode = override === 'system' ? (system ?? 'dark') : override;
  // Fail closed until the OS preference arrives; no initial animation flash.
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      receivedEvent = true;
      setReduceMotion(value);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active && !receivedEvent) setReduceMotion(value);
    }).catch(() => {});
    return () => { active = false; subscription.remove(); };
  }, []);
  return { persistenceError, override, setOverride, accent, setAccent, mode, colors: createTheme(mode, accent),
    reduceMotion, motion: reduceMotion ? { micro: 0, sheet: 0 } : tokens.motion };
}
const ThemeContext = createContext<ReturnType<typeof useThemeState> | null>(null);
export function ThemeProvider({ children, repository }: PropsWithChildren<{repository?: Repository | null}>) {
  const value = useThemeState(repository);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('ThemeProvider is required');
  return theme;
}
