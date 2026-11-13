import { useEffect, useMemo, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { addHealthTiles, type TileStorage } from '../home/tiles';
import { FIRST_SYNC_DAYS, LATER_SYNC_DAYS, oura, type OuraSource } from './oura';

export type OuraState = { state: 'unavailable' | 'off' | 'on'; busy: boolean; failed: boolean; connect: () => void; refresh: () => void; disconnect: () => void };

/** The Oura connection for the signed-in account: whether it is on, and connecting, refreshing and disconnecting it.
 * It holds no Oura values; those are read where they are shown. */
export function useOura(storage: TileStorage | null | undefined, injected?: OuraSource | null): OuraState {
  const source = useMemo(() => injected !== undefined ? injected : oura(), [injected]);
  const [state, setState] = useState<OuraState['state']>('unavailable');
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  // Nothing may land after the page closes.
  const live = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    if (!source) return;
    let mine = true;
    (async () => {
      const status = await source.status();
      if (mine) setState(!status ? 'unavailable' : status.connected ? 'on' : 'off');
    })().catch(() => { if (mine) setFailed(true); });
    return () => { mine = false; };
  }, [source]);
  // Runs one action at a time. It is only ever called from a press, never while drawing.
  const run = (work: (source: OuraSource) => Promise<void>) => {
    if (busy || !source) return;
    setBusy(true); setFailed(false);
    work(source).catch(() => { if (live.current) setFailed(true); }).finally(() => { if (live.current) setBusy(false); });
  };
  const check = async (from: OuraSource) => {
    const status = await from.status(), on = !!status?.connected;
    if (live.current) setState(!status ? 'unavailable' : on ? 'on' : 'off');
    return on;
  };
  const connect = () => run(async from => {
    // Oura's own page opens in the in-app browser. Closing it comes back here, and the account is checked again.
    await WebBrowser.openBrowserAsync(await from.connectUrl());
    if (!await check(from)) return;
    // Connecting puts the Steps and Sleep tiles on Home. They can be removed again from Home's Edit.
    if (live.current) addHealthTiles(storage);
    await from.sync(FIRST_SYNC_DAYS);
  });
  const refresh = () => run(async from => { if (await check(from)) await from.sync(LATER_SYNC_DAYS); });
  const disconnect = () => run(async from => { await from.disconnect(); await check(from); });
  return { state: source ? state : 'unavailable', busy, failed, connect, refresh, disconnect };
}
