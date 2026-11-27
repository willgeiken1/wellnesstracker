/* The phone's local notifications (no push, plan Q67), behind one small seam so Settings never talks to the native
 * module directly and tests can stand in for it.
 *
 * expo-notifications is loaded only if it is in the build: until it is installed, every reminder choice is still saved
 * and shown, `permission()` reads 'unavailable', and nothing is asked or scheduled. iOS is only ever asked by
 * `request()`, through `askForReminders()`, when the person turns a reminder on: on the Reminders page or a routine's
 * Remind me (never at launch or during setup). The app-wide sync only reads what iOS allows. */
import type { PlannedReminder } from './plan';

export type NotifyPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';
export interface Notifier {
  /** What iOS allows now. Never shows a prompt. */
  permission(): Promise<NotifyPermission>;
  /** Asks iOS once (the system prompt); later calls read the answer the person gave. */
  request(): Promise<NotifyPermission>;
  /** Makes Insight's scheduled reminders exactly `list`: ours not in it are cancelled, nobody else's are touched. */
  replace(list: readonly PlannedReminder[]): Promise<void>;
}

/** Every reminder Insight schedules starts with this, so a replace only cancels its own. */
export const REMINDER_ID_PREFIX = 'insight-reminder-';

/** The parts of expo-notifications used here (its API in SDK 58). */
interface ExpoNotifications {
  getPermissionsAsync(): Promise<{ status: string; granted: boolean; ios?: { status?: number } }>;
  requestPermissionsAsync(p?: { ios?: { allowAlert?: boolean; allowSound?: boolean; allowBadge?: boolean } }): Promise<{ status: string; granted: boolean; ios?: { status?: number } }>;
  getAllScheduledNotificationsAsync(): Promise<{ identifier: string }[]>;
  cancelScheduledNotificationAsync(identifier: string): Promise<void>;
  scheduleNotificationAsync(r: { identifier: string; content: { title: string; body: string; sound?: boolean }; trigger: WeeklyTrigger | DateTrigger }): Promise<string>;
}
/** SDK 58's SchedulableTriggerInputTypes.WEEKLY ('weekly') and .DATE ('date') trigger inputs. */
type WeeklyTrigger = { type: 'weekly'; weekday: number; hour: number; minute: number };
type DateTrigger = { type: 'date'; date: number };

const unavailable: Notifier = {
  permission: async () => 'unavailable',
  request: async () => 'unavailable',
  replace: async () => {},
};

// iOS provisional (3) and ephemeral (4) authorisations deliver quietly, which is still allowed.
const read = (r: { status: string; granted: boolean; ios?: { status?: number } }): NotifyPermission =>
  r.granted || r.ios?.status === 3 || r.ios?.status === 4 ? 'granted' : r.status === 'denied' ? 'denied' : 'undetermined';
/** expo-notifications counts weekdays from Sunday 1; the plan counts from Monday 0. */
const expoWeekday = (monday0: number) => ((monday0 + 1) % 7) + 1;

function expoNotifier(N: ExpoNotifications): Notifier {
  return {
    permission: async () => { try { return read(await N.getPermissionsAsync()); } catch { return 'unavailable'; } },
    request: async () => {
      try { return read(await N.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })); } catch { return 'unavailable'; }
    },
    replace: async list => {
      const scheduled = await N.getAllScheduledNotificationsAsync();
      for (const s of scheduled) if (s.identifier.startsWith(REMINDER_ID_PREFIX)) await N.cancelScheduledNotificationAsync(s.identifier);
      const now = Date.now();
      for (const r of list) {
        // A one-off whose moment has passed has nothing left to say.
        if (r.at != null && !(r.at > now)) continue;
        await N.scheduleNotificationAsync({ identifier: REMINDER_ID_PREFIX + r.id, content: { title: r.title, body: r.body, sound: true },
          trigger: r.at != null ? { type: 'date', date: r.at } : { type: 'weekly', weekday: expoWeekday(r.weekday), hour: r.hour, minute: r.minute } });
      }
    },
  };
}

let override: Notifier | null = null, loaded: Notifier | null = null;
function load(): Notifier {
  try {
    // Optional: Metro skips a require in try/catch that does not resolve, so the build works with or without the module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const N = require('expo-notifications') as ExpoNotifications;
    return N && typeof N.scheduleNotificationAsync === 'function' ? expoNotifier(N) : unavailable;
  } catch { return unavailable; }
}
/** The notifier in use. */
export function notifier(): Notifier { return override ?? (loaded ??= load()); }
/** Test hook: stand in for the phone's notifications (null goes back to the real one). */
export function setNotifierForTests(n: Notifier | null) { override = n; }

/* Someone answered the iOS prompt: the app-wide sync listens, so what was turned on before the answer goes on now. */
let asked = 0;
const askedListeners = new Set<() => void>();
export const askedCount = () => asked;
export function subscribeAsked(l: () => void) { askedListeners.add(l); return () => { askedListeners.delete(l); }; }

/**
 * For a switch the person just turned on: what iOS allows, asking once (the system prompt) only if it has never been
 * asked. 'denied' means the reminder can never arrive, so the caller turns it back off and says where to allow it.
 */
export async function askForReminders(n: Notifier = notifier()): Promise<NotifyPermission> {
  let s: NotifyPermission;
  try {
    s = await n.permission();
    if (s === 'undetermined') { s = await n.request(); asked++; askedListeners.forEach(l => l()); }
  } catch { s = 'unavailable'; }
  return s;
}

/** What each notifier was last given, so a plan that has not changed is not put on the phone again. */
const lastSynced = new WeakMap<Notifier, string>();
let queue: Promise<unknown> = Promise.resolve();
/** Puts the planned reminders on the phone, only if iOS already allows notifications. Never asks. Calls run one after
 * another, so two screens syncing at once cannot cross. */
export function syncReminders(list: readonly PlannedReminder[], n: Notifier = notifier()): Promise<boolean> {
  const key = JSON.stringify(list);
  const run = async () => {
    try {
      if (await n.permission() !== 'granted') { lastSynced.delete(n); return false; }
      if (lastSynced.get(n) === key) return true;
      await n.replace(list);
      lastSynced.set(n, key);
      return true;
    } catch { lastSynced.delete(n); return false; }
  };
  const next = queue.then(run, run);
  queue = next;
  return next;
}
