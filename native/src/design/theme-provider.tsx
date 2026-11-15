import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Appearance, useColorScheme } from 'react-native';
import type { Repository } from '../data/repository';
import { compareRows } from '../data/rows';
import { createTheme, paletteLocked, tokens, type Palette, type ThemeOverride } from './tokens';
import { formatAppearance, parseAppearance, PRESETS, presetOf, type BarLook, type Intensity, type KeypadLook, type Looks, type Motion, type Preset, type RingLook, type SelectorLook } from './looks';

type Saved = { theme: ThemeOverride; accent: string | null };
const READ_FAILED = 'read-failed';
const NO_REPOSITORY = (): void => {};
/**
 * The saved theme and looks as one line of text. Every write anywhere in the app wakes the provider, but a write
 * that leaves these two settings alone gives back the very same text, so nothing that uses the theme draws again.
 * The try/catch lives out here, not in the hook, so the React Compiler can still compile the hook.
 */
function readSaved(repository?: Repository | null): string {
  try {
    const row = repository?.list('settings').sort(compareRows).at(-1);
    const theme = row?.data.theme_override, accent = row?.data.accent;
    const saved: Saved = { theme: theme === 'light' || theme === 'dark' ? theme : 'system', accent: typeof accent === 'string' ? accent : null };
    return JSON.stringify(saved);
  } catch { return READ_FAILED; }
}
const DEFAULT_TEXT = JSON.stringify({ theme: 'system', accent: null } satisfies Saved);
const decode = (text: string) => JSON.parse(text) as Saved;
/** Saves both settings into the one settings row, keeping its other fields. False when the local write failed. */
function writeSaved(repository: Repository | null | undefined, theme: ThemeOverride, next: Looks): boolean {
  try {
    const current = repository?.list('settings').sort(compareRows).at(-1);
    repository?.save('settings', { ...current?.data, theme_override: theme, accent: formatAppearance(next) }, current?.id);
    return true;
  } catch { return false; }
}

function useThemeState(repository?: Repository | null) {
  // Like the saved settings, a failed save and a just-made pick last until the next change to the data: any
  // write re-reads what is saved, as the provider always has. Both belong to the repository they were made with.
  const owner = repository ?? null;
  const [failedFor, setFailedFor] = useState<Repository | null | undefined>(undefined);
  const [picked, setPicked] = useState<{ owner: Repository | null; text: string } | null>(null);
  const subscribe = useCallback((notify: () => void) => repository
    ? repository.subscribe(() => { setFailedFor(undefined); setPicked(null); notify(); })
    : NO_REPOSITORY, [repository]);
  const read = useCallback(() => readSaved(repository), [repository]);
  const stored = useSyncExternalStore(subscribe, read, read);
  // A read that fails keeps the last theme that read well, and says so.
  const [lastRead, setLastRead] = useState(DEFAULT_TEXT);
  if (stored !== READ_FAILED && stored !== lastRead) setLastRead(stored);
  const fresh = picked && picked.owner === owner ? picked : null;
  const text = fresh ? fresh.text : stored === READ_FAILED ? lastRead : stored;
  const persistenceError = (!fresh && stored === READ_FAILED) || failedFor === owner;
  const { theme: override, accent } = useMemo(() => decode(text), [text]);
  // Palette and looks live in the existing `accent` setting, so older saved accents still resolve.
  const appearance = useMemo(() => parseAppearance(accent ?? undefined), [accent]);
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
  // One value per change to what the theme is made of, so consumers keep the same object across unrelated writes.
  return useMemo(() => {
    const palette = appearance.palette;
    const persist = (theme: ThemeOverride, next: Looks) => {
      if (!writeSaved(repository, theme, next)) { setFailedFor(owner); return; }
      setPicked({ owner, text: JSON.stringify({ theme, accent: formatAppearance(next) } satisfies Saved) }); setFailedFor(undefined);
    };
    return { persistenceError, override, setOverride: (theme: ThemeOverride) => persist(theme, appearance),
      palette, setPalette: (color: Palette) => { if (!paletteLocked(color)) persist(override, { ...appearance, palette: color }); },
      ringLook: appearance.ring, setRingLook: (ring: RingLook) => persist(override, { ...appearance, ring }),
      // The saved choice, and what actually plays: iOS Reduce Motion always wins.
      motionStyle: appearance.motion, setMotionStyle: (motion: Motion) => persist(override, { ...appearance, motion }),
      ringMotion: (reduceMotion ? 'basic' : appearance.motion) as Motion,
      intensity: appearance.intensity, setIntensity: (intensity: Intensity) => persist(override, { ...appearance, intensity }),
      barLook: appearance.bar, setBarLook: (bar: BarLook) => persist(override, { ...appearance, bar }),
      keypadLook: appearance.keypad, setKeypadLook: (keypad: KeypadLook) => persist(override, { ...appearance, keypad }),
      selectorLook: appearance.selector, setSelectorLook: (selector: SelectorLook) => persist(override, { ...appearance, selector }),
      preset: presetOf(appearance), applyPreset: (preset: Preset) => persist(override, { ...appearance, ...PRESETS[preset] }),
      mode, colors: createTheme(mode, palette),
      reduceMotion, reduceMotionReady, motion: reduceMotion ? { micro: 0, sheet: 0 } : tokens.motion };
  }, [repository, owner, persistenceError, override, appearance, mode, reduceMotion, reduceMotionReady]);
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
