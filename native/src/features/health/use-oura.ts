import { useEffect, useMemo, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { addHealthTiles, type TileStorage } from '../home/tiles';
import { oura } from './oura-client';
import { FIRST_SYNC_DAYS, LATER_SYNC_DAYS, syncOura, type OuraSource, type OuraStatus } from './oura';

const stateOf = (status: OuraStatus | null): OuraState['state'] => !status ? 'unavailable' : !status.connected ? 'off' : status.expired ? 'expired' : 'on';

export type OuraState = { state: 'unavailable' | 'off' | 'on' | 'expired'; busy: boolean; failed: boolean; connect: () => void; refresh: () => void; disconnect: () => void };

/** The Oura connection for the signed-in account: whether it is on, and connecting, refreshing and disconnecting it.
 * It holds no Oura values; those are read where they are shown. */
export function useOura(storage: TileStorage | null | undefined, injected?: OuraSource | null): OuraState {
  const source = useMemo(() => injected !== undefined ? injected : oura(), [injected]);
  const [state, setState] = useState<OuraState['state']>('unavailable');
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  // Nothing may land after the page closes, and a second press before the first one draws "busy" is ignored.
  const live = useRef(false), working = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    if (!source) return;
    let mine = true;
    (async () => {
      const status = await source.status();
      if (mine) setState(stateOf(status));
    })().catch(() => { if (mine) setFailed(true); });
    return () => { mine = false; };
  }, [source]);
  // Runs one action at a time. It is only ever called from a press, never while drawing.
  const run = (work: (source: OuraSource) => Promise<void>) => {
    if (working.current || !source) return;
    working.current = true; setBusy(true); setFailed(false);
    work(source).catch(() => { if (live.current) setFailed(true); }).finally(() => { working.current = false; if (live.current) setBusy(false); });
  };
  const check = async (from: OuraSource) => {
    const next = stateOf(await from.status());
    if (live.current) setState(next);
    return next === 'on';
  };
  const connect = () => run(async from => {
    // Oura's own page opens in the in-app browser. Closing it comes back here, and the account is checked again.
    // Reconnecting after Oura signed Insight out is the same path.
    await WebBrowser.openBrowserAsync(await from.connectUrl());
    if (!await check(from)) return;
    // Connecting puts the Steps and Sleep tiles on Home. They can be removed again from Home's Edit.
    if (live.current) addHealthTiles(storage);
    await syncOura(from, FIRST_SYNC_DAYS);
  });
  const refresh = () => run(async from => { if (await check(from)) await syncOura(from, LATER_SYNC_DAYS); });
  const disconnect = () => run(async from => { await from.disconnect(); await check(from); });
  return { state: source ? state : 'unavailable', busy, failed, connect, refresh, disconnect };
}
