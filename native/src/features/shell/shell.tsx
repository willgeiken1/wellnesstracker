import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/provider';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import { selectionTick } from '@/components/selection-haptic';
import { DockFade } from './fade';
import { CustomizeSheet } from './customize-sheet';
import { Dock } from './dock';
import { Fan, Scrim, type FanAction } from './fan';
import { dockBottom, fadeHeight, layoutDock } from './geometry';
import { holdBuzz } from './haptics';
import { ACTIONS, chosenActions, defaultHint, PAGES, pageForRoute, pageLabel, visiblePages, type PageKey } from './pages';
import { useShellPrefs, withActions } from './prefs';
import { pageHandlers, useShellEdit } from './registry';
import { ShellToast, showToast } from './toast';

function useOptionalRepository() { try { return useAuth().repository ?? null; } catch { return null; } }

export interface ShellChromeProps {
  /** The tab navigator's state: the open route's name. */
  route: string | undefined;
  /** Opens a tab by page; the navigator emits tabPress and switches if it is not already open. */
  goTo: (page: PageKey) => void;
}

/** Everything the shell draws over the tab pages: the fade behind the bar, the bar, the + button's quick actions and their
 * Customize sheet, and the toast. */
export function ShellChrome({ route, goTo }: ShellChromeProps) {
  const window = useWindowDimensions();
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useTheme();
  const repository = useOptionalRepository();
  const [prefs, save] = useShellPrefs();
  const pageKey = pageForRoute(route) ?? 'home';
  const active = PAGES.findIndex(p => p.key === pageKey);
  const edit = useShellEdit();
  const editing = !!edit && edit.page === pageKey;
  const [open, setOpen] = useState(false);
  const [customize, setCustomize] = useState<PageKey | null>(null);
  // A new tab closes the actions at once.
  const [openOn, setOpenOn] = useState(pageKey);
  if (openOn !== pageKey) { setOpenOn(pageKey); if (open) setOpen(false); }
  if (editing && open) setOpen(false);

  const bottom = dockBottom(insets.bottom);
  const visible = useMemo(() => visiblePages(prefs.hidden, active), [prefs.hidden, active]);
  const layout = useMemo(() => layoutDock(size.width, size.height, insets.bottom, PAGES.length, visible, active), [size, insets.bottom, visible, active]);

  // What the + shows here, with the page's own live names and hints where it gave them.
  const labelOf = useCallback((page: PageKey, id: string) => {
    const own = pageHandlers(page)[id]?.label, action = ACTIONS[page].find(a => a.id === id)!;
    return own ?? t(action.label);
  }, []);
  const hintOf = useCallback((page: PageKey, id: string) => {
    const own = pageHandlers(page)[id]?.hint, action = ACTIONS[page].find(a => a.id === id)!;
    return own ?? defaultHint(action, new Date());
  }, []);
  const [fanActions, setFanActions] = useState<FanAction[]>([]);
  // `ids` is a set just saved, which this draw's prefs do not have yet.
  const openFan = (ids: readonly string[] | undefined = prefs.actions[pageKey]) => {
    setFanActions(chosenActions(pageKey, ids).map(a => ({ id: a.id, icon: a.icon, label: labelOf(pageKey, a.id), hint: hintOf(pageKey, a.id) })));
    setOpen(true);
  };
  const run = (action: FanAction) => {
    setOpen(false);
    const page = pageKey, def = ACTIONS[page].find(a => a.id === action.id);
    setTimeout(() => {
      const own = pageHandlers(page)[action.id]?.run;
      if (own) own();
      else if (def?.go) router.push(def.go.route as never);
      else showToast(t('shellNotYet'), { color: PAGES[active].color });
    }, reduceMotion ? 0 : 140);
  };
  const commit = (ids: string[], reopen: boolean) => {
    if (customize) save(withActions(prefs, customize, ids));
    setCustomize(null);
    if (reopen) setTimeout(() => openFan(ids), reduceMotion ? 0 : 280);
  };

  useEffect(() => {
    if (!open && !customize) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (customize) commit(prefs.actions[customize] ?? [], false); else setOpen(false); return true; });
    return () => sub.remove();
  });

  return <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    onLayout={e => { const { width, height } = e.nativeEvent.layout; if (width !== size.width || height !== size.height) setSize({ width, height }); }}>
    <DockFade height={fadeHeight(insets.bottom)} />
    <Scrim open={open} onClose={() => setOpen(false)} />
    <Fan open={open} width={size.width} height={size.height} plus={layout.plusCenter} pageLabel={pageLabel(pageKey)} color={PAGES[active].color}
      actions={fanActions} onRun={run} onClose={() => setOpen(false)}
      onCustomize={() => { setOpen(false); setCustomize(pageKey); }} />
    <Dock layout={layout} bottom={bottom} active={active} open={open} editing={editing}
      onTab={index => {
        const page = PAGES[index].key;
        if (index !== active) selectionTick(repository);
        goTo(page);
      }}
      onHold={() => { holdBuzz(repository); setOpen(false); router.push({ pathname: '/tab-bar', params: { from: pageKey } } as never); }}
      onPlus={() => { if (editing) edit?.onDone(); else if (open) setOpen(false); else openFan(); }} />
    <CustomizeSheet page={customize} height={size.height} insetBottom={insets.bottom}
      initial={customize ? chosenActions(customize, prefs.actions[customize]).map(a => a.id) : []}
      labelOf={labelOf} hintOf={hintOf} onCommit={commit} />
    <ShellToast bottom={bottom} />
  </View>;
}
