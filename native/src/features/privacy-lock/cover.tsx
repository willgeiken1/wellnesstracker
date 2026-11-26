import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Image, Platform, StyleSheet, View, type AppStateStatus } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';
import { BarBackdrop } from '@/components/blur-bar';
import { Button } from '@/components/button';
import { useKit } from '@/components/kit-style';
import { KitText } from '@/components/themed-text';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import { iconArt, iconId } from '@/features/settings/app-icon';
import { useSettingsPrefs } from '@/features/settings/prefs';
import { authenticate, isPrompting, lockAvailable } from './biometrics';
import { lockAtLaunch, nextLock, type AppPhase, type LockPrefs } from './timing';

/** Whether this phone can use Face ID lock: null until known. Always false on the web. */
export function useLockAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(Platform.OS === 'web' ? false : null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let live = true;
    void lockAvailable().then(v => { if (live) setAvailable(v); });
    return () => { live = false; };
  }, []);
  return available;
}

let launched = false;
/** Test hook: start as if Insight had just opened. */
export function resetLaunchForTests() { launched = false; }

/** Over everything, sheets included: iOS draws it in a window of its own above the app. */
function Above({ children }: { children: ReactNode }) {
  return Platform.OS === 'ios' ? <FullWindowOverlay>{children}</FullWindowOverlay>
    : <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>{children}</View>;
}

/**
 * Face ID lock and Blur in app switcher (Settings, Privacy), mounted once over the app. The lock covers Insight on
 * opening and after the chosen time away, and asks for Face ID (the iPhone passcode is the system's fallback); the
 * blur hides the screen while Insight is inactive in the app switcher. Nothing locks on the web, on a phone without
 * Face ID or Touch ID set up, or before someone is in the app (`access`).
 */
export function PrivacyCover({ access, clock = Date.now }: { access: boolean; /** Test hook: the time now. */ clock?: () => number }) {
  const [p] = useSettingsPrefs();
  const available = useLockAvailable();
  const prefs: LockPrefs = { enabled: access && p.priv.lock, after: p.priv.after };
  // Only the first cover after Insight opens asks at launch: signing in or out redraws the app, and that isn't opening it.
  const [lock, setLock] = useState(() => launched ? { locked: false, awayAt: null } : lockAtLaunch(prefs, available !== false));
  useEffect(() => { launched = true; }, []);
  const [away, setAway] = useState(() => AppState.currentState === 'background');
  const [failed, setFailed] = useState(false);
  const live = useRef({ prefs, available, clock });
  useEffect(() => { live.current = { prefs, available, clock }; });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (phase: AppStateStatus) => {
      const { prefs: now, available: can } = live.current;
      setLock(s => nextLock(s, phase as AppPhase, now, can !== false, live.current.clock()));
      setAway(phase === 'background' || (phase === 'inactive' && !isPrompting()));
    });
    return () => sub.remove();
  }, []);

  const locked = lock.locked && prefs.enabled && available !== false;
  const asking = useRef(false);
  const unlock = () => {
    if (asking.current) return;
    asking.current = true;
    void authenticate(t('privacyLockReason')).then(result => {
      asking.current = false;
      // A phone that can't ask any more (Face ID removed, no passcode) never keeps anyone out.
      if (result === 'ok' || result === 'unavailable') { setFailed(false); setLock({ locked: false, awayAt: null }); }
      else setFailed(true);
    });
  };
  // Ask as soon as the cover shows, once the phone is known to have Face ID and Insight is in front.
  useEffect(() => {
    if (locked && available === true && AppState.currentState === 'active') unlock();
  }, [locked, available]);

  const blur = p.priv.blur && away && !locked;
  if (!locked && !blur) return null;
  return <Above>{locked ? <LockScreen failed={failed} onUnlock={unlock} /> : <SwitcherBlur />}</Above>;
}

/** The lock cover: the app icon, a short line and Unlock, on the page colour. */
function LockScreen({ failed, onUnlock }: { failed: boolean; onUnlock: () => void }) {
  const k = useKit(), insets = useSafeAreaInsets(), { palette, mode } = useTheme();
  const [p] = useSettingsPrefs();
  return <View testID="privacy-lock" accessibilityViewIsModal style={[StyleSheet.absoluteFill, { backgroundColor: k.c.bg }]}>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <View style={{ width: 84, height: 84, borderRadius: 20, overflow: 'hidden', boxShadow: k.lift }}>
        <Image source={iconArt(iconId(p.look.icon), palette, mode)} style={{ width: 84, height: 84 }} accessible={false} />
      </View>
      <KitText weight={700} size={24} tracking={-0.03} accessibilityRole="header" style={{ marginTop: 18, textAlign: 'center' }}>{t('privacyLockTitle')}</KitText>
      <KitText weight={500} size={15} lineHeight={1.4} color="text-muted" style={{ marginTop: 6, textAlign: 'center' }}>{t('privacyLockBody')}</KitText>
      {failed ? <KitText weight={500} size={13.5} color="danger" accessibilityRole="alert" style={{ marginTop: 12, textAlign: 'center' }}>{t('privacyLockFailed')}</KitText> : null}
    </View>
    <View style={{ paddingHorizontal: 16, paddingBottom: Math.max(16, insets.bottom + 8) }}>
      <Button testID="privacy-unlock" label={t('privacyLockUnlock')} icon="faceid" full onPress={onUnlock} />
    </View>
  </View>;
}

/** The app switcher cover: a heavy blur of the page, solid with Reduce Transparency on or where the system can't blur. */
function SwitcherBlur() {
  const k = useKit();
  return <View testID="privacy-blur" accessible accessibilityLabel={t('privacyCoverLabel')} style={StyleSheet.absoluteFill}>
    {Platform.OS === 'ios' ? <BarBackdrop color={k.c.bg} amount={0.4} blur={30} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: k.c.bg }]} />}
  </View>;
}
