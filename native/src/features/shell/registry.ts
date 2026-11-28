import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { PageKey } from './pages';

/**
 * How a page plugs into the shell.
 *
 * Quick actions: the shell owns which actions the + shows (the person's choice, or the defaults in pages.ts) and their icons.
 * A page gives each action what it does, and may give a live name and hint, with `useQuickActions(page, { id: { run, label, hint } })`.
 * `hints` may add shorter forms of a live hint, longest first, for a row of the arc with less room.
 * An action with no `run` opens its default route if it has one (pages.ts), otherwise the shell says it isn't available yet.
 *
 * Edit mode: while a page edits its tiles it calls `useShellEditMode(page, true, onDone)`. The + turns into the accent Done check,
 * pressing it calls onDone, and the bar's touch and hold is off. The page ends edit mode itself when onDone runs.
 */
export interface QuickActionHandler { run?: () => void; label?: string; hint?: string; hints?: readonly string[] }
export type QuickActionHandlers = Partial<Record<string, QuickActionHandler>>;

const handlers = new Map<PageKey, () => QuickActionHandlers>();
/** The handlers a page has given, read when the + opens and when an action runs. */
export const pageHandlers = (page: PageKey): QuickActionHandlers => handlers.get(page)?.() ?? {};

/** A page's quick action handlers, kept while the page is mounted. Handlers are read when used, so they may change every draw. */
export function useQuickActions(page: PageKey, own: QuickActionHandlers) {
  const ref = useRef(own);
  useEffect(() => { ref.current = own; });
  useEffect(() => {
    const read = () => ref.current;
    handlers.set(page, read);
    return () => { if (handlers.get(page) === read) handlers.delete(page); };
  }, [page]);
}
/** Set directly, outside React (tests, or a page module that registers once). Pass null to clear. */
export function setQuickActions(page: PageKey, own: QuickActionHandlers | null) { if (own) handlers.set(page, () => own); else handlers.delete(page); }

export interface EditState { page: PageKey; onDone: () => void }
let edit: EditState | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
/** Turn a page's edit mode on or off in the shell. */
export function setShellEditMode(next: EditState | null) {
  if (next === edit || (next && edit && next.page === edit.page && next.onDone === edit.onDone)) return;
  edit = next; emit();
}
export const useShellEdit = () => useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => edit, () => edit);
/** While `editing`, the + on this page is the Done button and calls onDone. */
export function useShellEditMode(page: PageKey, editing: boolean, onDone: () => void) {
  const ref = useRef(onDone);
  useEffect(() => { ref.current = onDone; });
  useEffect(() => {
    if (!editing) return;
    const state: EditState = { page, onDone: () => ref.current() };
    setShellEditMode(state);
    return () => { if (edit === state) setShellEditMode(null); };
  }, [page, editing]);
}
