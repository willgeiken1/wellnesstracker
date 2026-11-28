import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Appearance, useColorScheme } from 'react-native';
import type { Repository } from '../data/repository';
import { compareRows } from '../data/rows';
import { createTheme, paletteLocked, tokens, type Palette, type ThemeOverride } from './tokens';
import { DEFAULT_APPEARANCE, formatAppearance, parseAppearance, PRESETS, presetOf, type BarLook, type Intensity, type KeypadLook, type Looks, type Motion, type Preset, type RingLook, type SelectorLook } from './looks';

function useThemeState(repository?: Repository | null) {
  const [override, updateOverride] = useState<ThemeOverride>('dark');
  const [appearance, updateAppearance] = useState<Looks>(DEFAULT_APPEARANCE);
  const palette = appearance.palette;
  const [persistenceError, setPersistenceError] = useState(false);
  // True black rides along in the `accent` setting as `;black=1`, beside the palette and looks.
  const [trueBlack, updateTrueBlack] = useState(false);
  useEffect(() => {
    const hydrate = () => {
      try {
        const row = repository?.list('settings').sort(compareRows).at(-1);
        const theme = row?.data.theme_override, color = row?.data.accent;
        // A new install starts dark, as Insight is designed; choosing System follows the iPhone.
        updateOverride(theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'dark');
        // Palette and looks live in the existing `accent` setting, so older saved accents still resolve.
        // Every save anywhere runs this; only a real change of look may redraw the app.
        const looks = parseAppearance(color);
        updateAppearance(current => JSON.stringify(current) === JSON.stringify(looks) ? current : looks);
        updateTrueBlack(typeof color === 'string' && color.split(';').includes('black=1'));
        setPersistenceError(false);
      } catch { setPersistenceError(true); }
    };
    hydrate();
    return repository?.subscribe(hydrate);
  }, [repository]);
  useEffect(() => {
    // react-native-web has no setColorScheme; the design-check web build skips it.
    const set = Appearance?.setColorScheme;
    if (typeof set !== 'function') return;
    set(override === 'system' ? 'auto' : override);
    return () => { try { set('auto'); } catch { /* Already torn down. */ } };
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
  // One value for as long as nothing it holds changes, so a save elsewhere does not redraw every themed view.
  return useMemo(() => {
    const persist = (theme: ThemeOverride, next: Looks, black = trueBlack) => {
      try {
        const current = repository?.list('settings').sort(compareRows).at(-1);
        repository?.save('settings', { ...current?.data, theme_override: theme, accent: formatAppearance(next) + (black ? ';black=1' : '') }, current?.id);
        updateOverride(theme); updateAppearance(next); updateTrueBlack(black); setPersistenceError(false);
      } catch { setPersistenceError(true); }
    };
    const setTrueBlack = (black: boolean) => persist(override, appearance, black);
    const setOverride = (theme: ThemeOverride) => persist(theme, appearance);
    const setPalette = (color: Palette) => { if (!paletteLocked(color)) persist(override, { ...appearance, palette: color }); };
    const setRingLook = (ring: RingLook) => persist(override, { ...appearance, ring });
    const setMotionStyle = (motion: Motion) => persist(override, { ...appearance, motion });
    const setIntensity = (intensity: Intensity) => persist(override, { ...appearance, intensity });
    const setBarLook = (bar: BarLook) => persist(override, { ...appearance, bar });
    const setKeypadLook = (keypad: KeypadLook) => persist(override, { ...appearance, keypad });
    const setSelectorLook = (selector: SelectorLook) => persist(override, { ...appearance, selector });
    const applyPreset = (preset: Preset) => persist(override, { ...appearance, ...PRESETS[preset] });
    return { persistenceError, override, setOverride, palette, setPalette, ringLook: appearance.ring, setRingLook,
      // The saved choice, and what actually plays: iOS Reduce Motion always wins.
      motionStyle: appearance.motion, setMotionStyle, ringMotion: (reduceMotion ? 'basic' : appearance.motion) as Motion,
      intensity: appearance.intensity, setIntensity, barLook: appearance.bar, setBarLook, keypadLook: appearance.keypad, setKeypadLook, selectorLook: appearance.selector, setSelectorLook, preset: presetOf(appearance), applyPreset, mode, trueBlack, setTrueBlack, colors: createTheme(mode, palette, trueBlack),
      reduceMotion, reduceMotionReady, motion: reduceMotion ? { micro: 0, sheet: 0 } : tokens.motion };
  }, [repository, override, appearance, palette, trueBlack, persistenceError, mode, reduceMotion, reduceMotionReady]);
}
const ThemeContext = createContext<ReturnType<typeof useThemeState> | null>(null);
export function ThemeProvider({ children, repository }: PropsWithChildren<{repository?: Repository | null}>) {
  const value = useThemeState(repository);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
/** Draws its children in the dark colours whatever the app's appearance: the barcode camera sheet stays dark in light mode. */
export function ForceDark({ children }: PropsWithChildren) {
  const theme = useTheme();
  const value = useMemo(() => theme.mode === 'dark' ? theme
    : { ...theme, mode: 'dark' as const, colors: createTheme('dark', theme.palette, theme.trueBlack) }, [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
/** Draws its children with these colours in place of the theme's: a tile with a colour of its own. */
export function WithColors({ colors, children }: PropsWithChildren<{ colors: ReturnType<typeof useThemeState>['colors'] }>) {
  const theme = useTheme();
  const value = useMemo(() => theme.colors === colors ? theme : { ...theme, colors }, [theme, colors]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('ThemeProvider is required');
  return theme;
}
