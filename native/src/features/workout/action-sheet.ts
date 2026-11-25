import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { t } from '@/i18n/en';

export interface SheetAction { label: string; destructive?: boolean; run: () => void }
/** The system action sheet (iOS) or alert, with Cancel last. */
export function actionSheet({ title, message, actions, cancel = t('cancel') }: { title: string; message?: string; actions: SheetAction[]; cancel?: string }) {
  if (Platform.OS === 'ios') {
    const options = [...actions.map(a => a.label), cancel];
    const destructiveButtonIndex = actions.map((a, i) => a.destructive ? i : -1).filter(i => i >= 0);
    ActionSheetIOS.showActionSheetWithOptions({ title, message, options, cancelButtonIndex: actions.length, destructiveButtonIndex }, i => { if (i < actions.length) actions[i].run(); });
    return;
  }
  Alert.alert(title, message, [...actions.map(a => ({ text: a.label, style: a.destructive ? 'destructive' as const : 'default' as const, onPress: a.run })), { text: cancel, style: 'cancel' as const }]);
}
