import { router } from 'expo-router';
import { useAuth } from '@/auth/provider';
import { showToast } from '@/features/shell/toast';
import { exportAccountBackup, exportPhoneBackup } from '@/phone-only/export';
import { st } from './copy';

/** Your data's actions on the app's real data layer: a backup file through the share sheet, and restore through the importer. */
export function useDataActions() {
  const auth = useAuth();
  const repo = auth.repository;
  const backup = repo && !auth.demo ? () => {
    void (auth.phoneOnly ? exportPhoneBackup(repo) : exportAccountBackup(repo))
      .then(() => showToast(st('settingsBackupSaved')))
      .catch(() => showToast(st('settingsBackupFailed'), { color: 'danger' }));
  } : undefined;
  const restore = repo && !auth.demo ? () => router.push('/import') : undefined;
  return { backup, restore };
}
