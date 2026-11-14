import { useEffect, useMemo, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { addHealthTiles, type TileStorage } from '../home/tiles';
import { oura } from './oura-client';
import { syncNow, type OuraSource, type OuraStatus } from './oura';

const stateOf = (status: OuraStatus | null): OuraState['state'] => !status ? 'unavailable' : !status.connected ? 'off' : status.expired ? 'expired' : 'on';

export type OuraState = { state: 'unavailable' | 'unreachable' | 'off' | 'on' | 'expired'; busy: boolean; failed: boolean; connect: () => void; refresh: () => void; disconnect: () => void };

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
      // Not knowing is not the same as not connected: the card stays, says so, and offers to try again.
    })().catch(() => { if (mine) { setState('unreachable'); setFailed(true); } });
    return () => { mine = false; };
  }, [source]);
  // Runs one action at a time. It is only ever called from a press, never while drawing.
  const run = (work: (source: OuraSource) => Promise<void>) => {
    if (working.current || !source) return;
    working.current = true; setBusy(true); setFailed(false);
    work(source).catch(() => { if (live.current) setFailed(true); }).finally(() => { working.current = false; if (live.current) setBusy(false); });
  };
  /** Reads the connection again and shows it. The status, or null when nobody is signed in. */
  const check = async (from: OuraSource) => {
    const status = await from.status();
    if (live.current) setState(stateOf(status));
    return status;
  };
  const connect = () => run(async from => {
    // Oura's own page opens in the in-app browser. Closing it comes back here, and the account is checked again.
    // Reconnecting after Oura signed Insight out is the same path.
    await WebBrowser.openBrowserAsync(await from.connectUrl());
    const status = await check(from);
    if (!status?.connected || status.expired) return;
    // Connecting puts the Steps and Sleep tiles on Home. They can be removed again from Home's Edit.
    if (live.current) addHealthTiles(storage);
    await syncNow(from, status);
  });
  // Check again also tries a refused sign-in: a brief outage at Oura looks the same, and a refresh that works clears it.
  const refresh = () => run(async from => {
    const status = await check(from);
    if (!status?.connected) return;
    await syncNow(from, status);
    if (status.expired) await check(from);
  });
  const disconnect = () => run(async from => { await from.disconnect(); await check(from); });
  return { state: source ? state : 'unavailable', busy, failed, connect, refresh, disconnect };
}
