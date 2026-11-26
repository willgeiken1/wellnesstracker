import { router } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { showToast } from '@/features/shell/toast';
import { exportAccountBackup, exportPhoneBackup } from '@/phone-only/export';
import { st } from './copy';
import { useSettingsPrefs } from './prefs';

/** Your data's actions on the app's real data layer: a backup file through the share sheet, and restore through the importer. */
export function useDataActions() {
  const auth = useAuth();
  const [, set] = useSettingsPrefs();
  const repo = auth.repository;
  const backup = repo && !auth.demo ? () => {
    void (auth.phoneOnly ? exportPhoneBackup(repo) : exportAccountBackup(repo))
      .then(() => { set('data.lastBackup', Date.now()); showToast(st('settingsBackupSaved')); })
      .catch(() => showToast(st('settingsBackupFailed'), { color: 'warning' }));
  } : undefined;
  const restore = repo && !auth.demo ? () => router.push('/import') : undefined;
  return { backup, restore };
}

/** "today, 9:41 AM", "yesterday, 9:41 AM" or "Nov 20", as the mockup's Last backup line reads. */
export function backupWhen(ms: number, now = new Date()): string {
  const d = new Date(ms), day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return `today, ${time}`;
  if (diff === 1) return `yesterday, ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
