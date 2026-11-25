import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DISTANCES, FADES, springConfig } from './kit-motion';
import { mix, useKit } from './kit-style';
import { KitText } from './themed-text';
import { Tappable } from './tappable';

export type ToastOptions = {
  /** The dot's colour, a theme token: `success` unless given. */ color?: string;
  /** A button at the end, such as Undo. */ action?: string; onAction?: () => void;
  /** How long it stays, 2.6 s unless given. */ ms?: number;
};
type Shown = { id: number; text: string } & ToastOptions;
type Api = { show: (text: string, options?: ToastOptions) => void; hide: () => void };

const ToastContext = createContext<Api | null>(null);
/** The dock's gap from the bottom edge (shell.css `--dock-b`): 24 pt, or the home indicator's inset less 6 when larger. */
export const dockBottom = (insetBottom: number) => Math.max(24, insetBottom - 6);

/** `show(text, { color, action, onAction, ms })` for the kit's toast (`INS.toast`). Without a ToastProvider it does nothing. */
export function useToast(): Api {
  return useContext(ToastContext) ?? { show: () => {}, hide: () => {} };
}

/** Holds the one toast the app shows at a time and draws it over everything inside. Mount once near the root. */
export function ToastProvider({ children, bottomOffset }: PropsWithChildren<{ /** Distance from the bottom edge; above the tab dock unless given. */ bottomOffset?: number }>) {
  const [toast, setToast] = useState<Shown | null>(null);
  const next = useRef(0);
  const [api] = useState<Api>(() => ({
    show: (text, options) => setToast({ id: ++next.current, text, ...options }),
    hide: () => setToast(null),
  }));
  return <ToastContext.Provider value={api}>
    {children}
    <ToastView toast={toast} onDone={() => setToast(null)} bottomOffset={bottomOffset} />
  </ToastContext.Provider>;
}

/**
 * The kit's `.ins-toast`: a pill 16 pt from each side, above the dock, with a coloured dot, 600 14 pt text and an
 * optional accent action. It springs up 16 pt from 96 percent and leaves quickly; Reduce Motion only fades it.
 * VoiceOver reads it as it appears.
 */
function ToastView({ toast, onDone, bottomOffset }: { toast: Shown | null; onDone: () => void; bottomOffset?: number }) {
  const k = useKit();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<Shown | null>(toast);
  const [p] = useState(() => new Animated.Value(0));
  const [o] = useState(() => new Animated.Value(0));
  if (toast && toast !== shown) setShown(toast);
  const id = toast?.id;
  useEffect(() => {
    if (id == null) {
      const out = k.reduceMotion
        ? Animated.timing(o, { toValue: 0, duration: FADES.reduced, easing: Easing.linear, useNativeDriver: true })
        : Animated.parallel([
          Animated.timing(o, { toValue: 0, duration: 160, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(p, { toValue: 0, duration: 220, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: true }),
        ]);
      out.start(({ finished }) => { if (finished) setShown(null); });
      return () => out.stop();
    }
    p.setValue(k.reduceMotion ? 1 : 0); o.setValue(0);
    const enter = k.reduceMotion
      ? Animated.timing(o, { toValue: 1, duration: FADES.reduced, easing: Easing.linear, useNativeDriver: true })
      : Animated.parallel([Animated.timing(o, { toValue: 1, duration: 180, easing: Easing.linear, useNativeDriver: true }), Animated.spring(p, springConfig('toast', 1))]);
    enter.start();
    return () => enter.stop();
  }, [id, k.reduceMotion, o, p]);
  useEffect(() => {
    if (!toast) return;
    AccessibilityInfo.announceForAccessibility(toast.text);
    const timer = setTimeout(onDone, toast.ms ?? 2600);
    return () => clearTimeout(timer);
  }, [toast, onDone]);
  if (!shown) return null;
  const dot = k.tok(shown.color ?? 'success');
  return <Animated.View pointerEvents={toast ? 'box-none' : 'none'} accessibilityRole="alert"
    style={{ position: 'absolute', left: 16, right: 16, bottom: bottomOffset ?? 92 + dockBottom(insets.bottom), zIndex: 70,
      opacity: o, transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [DISTANCES.toastRise, 0] }) },
        { scale: p.interpolate({ inputRange: [0, 1], outputRange: [DISTANCES.toastScale, 1] }) }] }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 18,
      backgroundColor: mix(k.pillInk, k.pill, 0.06), boxShadow: `${k.lift}, inset 0px 0px 0px 1px ${k.tint(k.pillInk, 0.12)}` }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: k.dark ? dot : mix(dot, k.pillInk, 0.6) }} />
      <KitText weight={600} size={14} lineHeight={1.3} tracking={-0.005} color={k.pillInk} style={{ flex: 1, minWidth: 0 }}>{shown.text}</KitText>
      {shown.action ? <Tappable dim="text" accessibilityRole="button" accessibilityLabel={shown.action} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        onPress={() => { onDone(); shown.onAction?.(); }}
        style={{ minHeight: 36, marginVertical: -2, marginRight: -8, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center' }}>
        <KitText weight={700} size={14} color={k.dark ? k.c.accent : mix(k.c.accent, k.pillInk, 0.45)}>{shown.action}</KitText>
      </Tappable> : null}
    </View>
  </Animated.View>;
}
