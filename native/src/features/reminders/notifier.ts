/* The phone's local notifications (no push, plan Q67), behind one small seam so Settings never talks to the native
 * module directly and tests can stand in for it.
 *
 * expo-notifications is loaded only if it is in the build: until it is installed, every reminder choice is still saved
 * and shown, `permission()` reads 'unavailable', and nothing is asked or scheduled. iOS is only ever asked by
 * `request()`, which only the Reminders page calls, when the person turns a reminder on (never at launch or during setup). */
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
  scheduleNotificationAsync(r: { identifier: string; content: { title: string; body: string; sound?: boolean }; trigger: { type: 'weekly'; weekday: number; hour: number; minute: number } }): Promise<string>;
}

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
      for (const r of list) {
        await N.scheduleNotificationAsync({ identifier: REMINDER_ID_PREFIX + r.id, content: { title: r.title, body: r.body, sound: true },
          trigger: { type: 'weekly', weekday: expoWeekday(r.weekday), hour: r.hour, minute: r.minute } });
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

/** Puts the planned reminders on the phone, only if iOS already allows notifications. Never asks. */
export async function syncReminders(list: readonly PlannedReminder[], n: Notifier = notifier()): Promise<boolean> {
  try {
    if (await n.permission() !== 'granted') return false;
    await n.replace(list);
    return true;
  } catch { return false; }
}
