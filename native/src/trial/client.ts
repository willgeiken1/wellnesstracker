import type { SupabaseClient } from '@supabase/supabase-js';

type TrialUser = { id: string; email: string; aud: 'authenticated'; app_metadata: Record<string, never>; user_metadata: Record<string, never> };
type TrialSession = { access_token: string; refresh_token: string; token_type: string; expires_in: number; user: TrialUser };

const listeners = new Set<(event: string, session: TrialSession | null) => void>();
let current: TrialUser | null = null;

function exampleEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@example\.com$/i.test(value.trim());
}

function accountId(email: string): string {
  let hash = 2166136261;
  const text = email.trim().toLowerCase();
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `trial-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function sessionFor(user: TrialUser | null): TrialSession | null {
  if (!user) return null;
  return { access_token: 'local', refresh_token: 'local', token_type: 'bearer', expires_in: 3600, user };
}

function emit(event: string) {
  const session = sessionFor(current);
  listeners.forEach(listener => { try { listener(event, session); } catch { /* listener */ } });
}

function accept(email: unknown, password: unknown) {
  if (!exampleEmail(email) || typeof password !== 'string' || password.length < 6) {
    return { data: { user: null, session: null }, error: { message: 'invalid login credentials', status: 400 } };
  }
  current = { id: accountId(email), email: email.trim().toLowerCase(), aud: 'authenticated', app_metadata: {}, user_metadata: {} };
  const session = sessionFor(current);
  emit('SIGNED_IN');
  return { data: { user: current, session }, error: null };
}

function query() {
  const builder = {
    select() { return builder; },
    eq() { return builder; },
    gt() { return builder; },
    gte() { return builder; },
    lte() { return builder; },
    order() { return builder; },
    limit() { return builder; },
    maybeSingle: () => Promise.resolve({ data: null, error: null, status: 200 }),
    upsert: () => Promise.resolve({ data: null, error: null, status: 200 }),
    then(resolve: (value: { data: never[]; error: null; status: number }) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: [], error: null, status: 200 }).then(resolve, reject);
    },
  };
  return builder;
}

/** In-memory account client. Pulls are empty. Sign-in accepts only @example.com. */
export function trialAuthClient(): SupabaseClient {
  const auth = {
    getSession: async () => ({ data: { session: sessionFor(current) }, error: null }),
    getUser: async () => ({ data: { user: current }, error: null }),
    onAuthStateChange(callback: (event: string, session: TrialSession | null) => void) {
      listeners.add(callback);
      try { callback('INITIAL_SESSION', sessionFor(current)); } catch { /* listener */ }
      return { data: { subscription: { unsubscribe: () => { listeners.delete(callback); } } } };
    },
    signUp: async (body: { email?: string; password?: string }) => accept(body?.email, body?.password),
    signInWithPassword: async (body: { email?: string; password?: string }) => accept(body?.email, body?.password),
    signOut: async () => { current = null; emit('SIGNED_OUT'); return { error: null }; },
    startAutoRefresh() {},
    stopAutoRefresh() {},
  };
  const client = {
    auth,
    from: () => query(),
    rpc: async (name: string, args?: { rows?: unknown[] }) => name === 'sync_push'
      ? { data: Array.isArray(args?.rows) ? args.rows : [], error: null, status: 200 }
      : { data: null, error: { message: 'unavailable', code: 'PGRST202' }, status: 404 },
    functions: { invoke: async () => ({ data: null, error: { message: 'unavailable' } }) },
  };
  return client as unknown as SupabaseClient;
}
