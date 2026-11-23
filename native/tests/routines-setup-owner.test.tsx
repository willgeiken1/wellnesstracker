import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { AuthProvider, useAuth, type AuthState } from '../src/auth/provider';
import { clearSessionMemory } from '../src/core/session-memory';
import { OWNER_A, OWNER_B } from '../fixtures/sync';
import { openLocalDatabase } from '../src/data/database';
import type { Repository } from '../src/data/repository';
import { syncTables } from '../src/data/sync/flags';
import { ThemeProvider } from '../src/design/theme-provider';
import { SetupSheet } from '../src/features/routines-ui/setup';
import { keepSetupDraft, keptSetupDraft } from '../src/features/routines-ui/setup-draft';
import { openSetupDraft } from '../src/features/routines/model/setup';
import { seedDefaultRoutines } from '../src/features/routines/store';
import { sheetRepository } from './routines-sheets-kit';

/* The setup quiz asks what a person takes and whether they inject it. Answers given by one account must never
   show for the next account on the same phone. These tests run the real sign-out and account deletion. */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn(), push: jest.fn() },
  useNavigation: () => ({ setOptions: jest.fn() }),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6 }));
jest.mock('../src/auth/client', () => ({ getAuthClient: jest.fn(() => null), clearLocalSession: jest.fn(async () => {}) }));
jest.mock('../src/auth/sign-out-storage', () => ({ signOutStorage: { read: jest.fn(async () => null), write: jest.fn(async () => {}), remove: jest.fn(async () => {}) } }));
jest.mock('../src/data/database', () => ({ openLocalDatabase: jest.fn() }));
jest.mock('../fixtures/demo', () => ({ seedDemo: jest.fn() }));
jest.mock('../src/features/onboarding/demo-transfer', () => ({ assertDemoTransferSafe: jest.fn(), promoteDemo: jest.fn() }));
jest.mock('../src/data/sync/supabase', () => ({ SupabaseTransport: class {
  owner: string;
  constructor(_client: unknown, owner: string) { this.owner = owner; }
  async pull() { return []; }
  async push() {}
} }));
jest.mock('expo-network', () => ({ addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })) }));

const session = (owner: string) => ({ user: { id: owner, email: 'fixture@example.test' } }) as Session;

/** A phone's data for one owner, with the two default routines and nothing waiting to sync. */
function ownerRepository(owner: string): Repository {
  const repo = Object.assign(sheetRepository(), {
    owner, syncFlags: { syncedV1Columns: false }, syncTables: () => syncTables(), pending: () => [], conflicts: () => [], ack: jest.fn(), wipe: jest.fn(),
    hasUnsynced: () => false, unsyncedCount: () => 0, cursor: () => '0', applyPage: jest.fn(),
  }) as unknown as Repository;
  seedDefaultRoutines(repo);
  return repo;
}

let observed: AuthState;
function Probe() { observed = useAuth(); return null; }
/* The quiz draws only for the repository that belongs to whoever is signed in right now. */
function Quiz() { const auth = useAuth(); return auth.repository ? <SetupSheet /> : null; }

async function mount(invoke: jest.Mock = jest.fn()) {
  const repos = new Map<string, Repository>();
  const forOwner = (owner: string) => { if (!repos.has(owner)) repos.set(owner, ownerRepository(owner)); return repos.get(owner) as Repository; };
  jest.mocked(openLocalDatabase).mockResolvedValue({ wipeAll: jest.fn(), forOwner } as never);
  let emit!: (event: string, value: Session | null) => void;
  const auth = {
    getUser: jest.fn(async () => { throw new Error('offline fixture'); }),
    getSession: jest.fn(async () => ({ data: { session: session(OWNER_A) }, error: null })),
    onAuthStateChange: jest.fn((callback) => { emit = callback; return { data: { subscription: { unsubscribe: jest.fn() } } }; }),
    startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn(), signOut: jest.fn(async () => ({ error: null })),
  };
  const client = { auth, functions: { invoke } } as unknown as SupabaseClient;
  const view = await render(<ThemeProvider><AuthProvider client={client}><Probe /><Quiz /></AuthProvider></ThemeProvider>);
  await waitFor(() => expect(observed.repository?.owner).toBe(OWNER_A));
  return { view, signIn: (owner: string) => emit('SIGNED_IN', session(owner)) };
}

const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const question = () => screen.getByTestId('setup-question').props.children;
const picked = () => screen.queryAllByRole('checkbox').filter(choice => choice.props.accessibilityState.checked).length;

/** Account A answers the first question and moves to the second, then closes nothing: the draft is kept. */
async function startSetupAsA() {
  await waitFor(() => expect(question()).toBe('What brings you to Routines?'));
  await press('setup-choice-habits');
  await press('setup-choice-supplements');
  await press('setup-next');
  expect(question()).toBe('How much have you tracked before?');
  expect(keptSetupDraft(OWNER_A)).not.toBeNull();
}

function expectBlankQuiz() {
  expect(question()).toBe('What brings you to Routines?');
  expect(screen.getByTestId('setup-step').props.children).toMatch(/^1 of \d+$/);
  expect(picked()).toBe(0);
  expect(screen.getByTestId('setup-next').props.accessibilityState.disabled).toBe(true);
}

beforeEach(() => {
  clearSessionMemory();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
});

test('account A starts setup and signs out; account B opens a blank quiz', async () => {
  const { view, signIn } = await mount();
  await startSetupAsA();

  await act(async () => { await observed.signOut(); });
  await waitFor(() => expect(observed.repository?.owner).toBe('guest'));
  // Sign-out dropped the answers, for A as well as for anyone else.
  expect(keptSetupDraft(OWNER_A)).toBeNull();
  expectBlankQuiz();

  await act(async () => { signIn(OWNER_B); });
  await waitFor(() => expect(observed.repository?.owner).toBe(OWNER_B));
  expect(keptSetupDraft(OWNER_B)).toBeNull();
  expectBlankQuiz();
  await view.unmount();
});

test('deleting the account drops the setup answers too', async () => {
  const { view } = await mount(jest.fn(async () => ({ data: { ok: true }, error: null })));
  await startSetupAsA();
  await act(async () => { await observed.deleteAccount!(); });
  await waitFor(() => expect(observed.repository?.owner).toBe('guest'));
  expect(keptSetupDraft(OWNER_A)).toBeNull();
  expectBlankQuiz();
  await view.unmount();
});

test('a kept draft is handed back to the owner who gave it and to no one else', () => {
  const draft = openSetupDraft({ lastBlockId: null, updatedAt: 0 }, 'quiz', null);
  keepSetupDraft(OWNER_A, { ...draft, answers: { goal: ['habits'] } });
  expect(keptSetupDraft(OWNER_A)?.answers).toEqual({ goal: ['habits'] });
  expect(keptSetupDraft(OWNER_B)).toBeNull();
  expect(keptSetupDraft('guest')).toBeNull();
  expect(keptSetupDraft(undefined)).toBeNull();
  // An account switch with no sign-out between: B's own draft replaces A's, and A's is not handed back later.
  keepSetupDraft(OWNER_B, draft);
  expect(keptSetupDraft(OWNER_A)).toBeNull();
  keepSetupDraft(undefined, draft);
  expect(keptSetupDraft(OWNER_B)).toBeNull();
});
