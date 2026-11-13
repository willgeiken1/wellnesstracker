import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Appearance, useColorScheme } from 'react-native';
import type { Repository } from '../data/repository';
import { compareRows } from '../data/rows';
import { createTheme, paletteLocked, tokens, type Palette, type ThemeOverride } from './tokens';
import { DEFAULT_APPEARANCE, formatAppearance, parseAppearance, PRESETS, presetOf, type BarLook, type Intensity, type KeypadLook, type Looks, type Motion, type Preset, type RingLook, type SelectorLook } from './looks';

function useThemeState(repository?: Repository | null) {
  const [override, updateOverride] = useState<ThemeOverride>('system');
  const [appearance, updateAppearance] = useState<Looks>(DEFAULT_APPEARANCE);
  const palette = appearance.palette;
  const [persistenceError, setPersistenceError] = useState(false);
  useEffect(() => {
    const hydrate = () => {
      try {
        const row = repository?.list('settings').sort(compareRows).at(-1);
        const theme = row?.data.theme_override, color = row?.data.accent;
        updateOverride(theme === 'light' || theme === 'dark' ? theme : 'system');
        // Palette and looks live in the existing `accent` setting, so older saved accents still resolve.
        updateAppearance(parseAppearance(color));
        setPersistenceError(false);
      } catch { setPersistenceError(true); }
    };
    hydrate();
    return repository?.subscribe(hydrate);
  }, [repository]);
  const persist = (theme: ThemeOverride, next: Looks) => {
    try {
      const current = repository?.list('settings').sort(compareRows).at(-1);
      repository?.save('settings', { ...current?.data, theme_override: theme, accent: formatAppearance(next) }, current?.id);
      updateOverride(theme); updateAppearance(next); setPersistenceError(false);
    } catch { setPersistenceError(true); }
  };
  const setOverride = (theme: ThemeOverride) => persist(theme, appearance);
  const setPalette = (color: Palette) => { if (!paletteLocked(color)) persist(override, { ...appearance, palette: color }); };
  const setRingLook = (ring: RingLook) => persist(override, { ...appearance, ring });
  const setMotionStyle = (motion: Motion) => persist(override, { ...appearance, motion });
  const setIntensity = (intensity: Intensity) => persist(override, { ...appearance, intensity });
  const setBarLook = (bar: BarLook) => persist(override, { ...appearance, bar });
  const setKeypadLook = (keypad: KeypadLook) => persist(override, { ...appearance, keypad });
  const setSelectorLook = (selector: SelectorLook) => persist(override, { ...appearance, selector });
  const applyPreset = (preset: Preset) => persist(override, { ...appearance, ...PRESETS[preset] });
  useEffect(() => {
    Appearance.setColorScheme(override === 'system' ? 'auto' : override);
    return () => Appearance.setColorScheme('auto');
  }, [override]);
  const system = useColorScheme();
  const mode = override === 'system' ? (system ?? 'dark') : override;
  // Fail closed until the OS preference arrives; no initial animation flash.
  const [reduceMotion, setReduceMotion] = useState(true);
  const [reduceMotionReady,setReduceMotionReady] = useState(false);
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      receivedEvent = true;
      setReduceMotion(value); setReduceMotionReady(true);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active && !receivedEvent) {setReduceMotion(value);setReduceMotionReady(true);}
    }).catch(() => {if(active)setReduceMotionReady(true);});
    return () => { active = false; subscription.remove(); };
  }, []);
  return { persistenceError, override, setOverride, palette, setPalette, ringLook: appearance.ring, setRingLook,
    // The saved choice, and what actually plays: iOS Reduce Motion always wins.
    motionStyle: appearance.motion, setMotionStyle, ringMotion: (reduceMotion ? 'basic' : appearance.motion) as Motion,
    intensity: appearance.intensity, setIntensity, barLook: appearance.bar, setBarLook, keypadLook: appearance.keypad, setKeypadLook, selectorLook: appearance.selector, setSelectorLook, preset: presetOf(appearance), applyPreset, mode, colors: createTheme(mode, palette),
    reduceMotion, reduceMotionReady, motion: reduceMotion ? { micro: 0, sheet: 0 } : tokens.motion };
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
