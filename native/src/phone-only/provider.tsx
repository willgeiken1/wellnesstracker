import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import type { AuthState } from '../auth/provider';
import { openLocalDatabase } from '../data/database';
import type { Repository } from '../data/repository';
import { seedDemo } from '../../fixtures/demo';
const AuthContext = createContext<AuthState | null>(null);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is required.');
  return value;
}
/** Guest is the existing local-only namespace: no account, credentials or outbox. */
export function AuthProvider({ children }: PropsWithChildren) {
  const [demo, setDemo] = useState(false);
  const [repository, setRepository] = useState<Repository | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const owner = demo ? 'demo' : 'guest';
  useEffect(() => {
    let active = true;
    void openLocalDatabase().then(database => {
      const repo = database.forOwner(owner);
      if (!active) return;
      if (demo) seedDemo(repo);
      setError(null); setRepository(repo);
    }).catch(() => { if (active) setError('Local data is unavailable.'); });
    return () => { active = false; };
  }, [owner, demo, attempt]);
  const current = repository?.owner === owner ? repository : null;
  const value: AuthState = {
    phoneOnly: true, session: null, demo, ready: !!current && !error,
    configured: false, configError: error, repository: current,
    pending: 0, conflicts: 0, syncStatus: 'idle',
    lookAround: () => setDemo(true),
    signIn: async () => 'authUnavailable', createAccount: async () => 'authUnavailable',
    signOut: async () => { setDemo(false); }, syncNow: async () => {},
    retryBoot: () => { setRepository(null); setError(null); setAttempt(value => value + 1); },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
