import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Appearance, useColorScheme } from 'react-native';
import { createTheme, tokens, type Accent, type ThemeOverride } from './tokens';

function useThemeState() {
  // TODO(P2c): hydrate/persist override and accent in the SQLite settings table.
  const [override, setOverride] = useState<ThemeOverride>('system');
  const [accent, setAccent] = useState<Accent>('citrus');
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
  return { override, setOverride, accent, setAccent, mode, colors: createTheme(mode, accent),
    reduceMotion, motion: reduceMotion ? { micro: 0, sheet: 0 } : tokens.motion };
}
const ThemeContext = createContext<ReturnType<typeof useThemeState> | null>(null);
export function ThemeProvider({ children }: PropsWithChildren) {
  const value = useThemeState();
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('ThemeProvider is required');
  return theme;
}
