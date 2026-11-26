import { ActionSheetIOS, Alert, Platform } from 'react-native';

export interface SheetAct { label: string; destructive?: boolean; onPress?: () => void }
/** The mockup's action sheet (UIAlertController .actionSheet): a title, a message, actions and Cancel. */
export function actionSheet({ title, message, acts, cancel = 'Cancel' }: { title?: string; message?: string; acts: SheetAct[]; cancel?: string }) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions({
      title, message, options: [...acts.map(a => a.label), cancel], cancelButtonIndex: acts.length,
      destructiveButtonIndex: acts.map((a, i) => (a.destructive ? i : -1)).filter(i => i >= 0),
    }, index => { if (index < acts.length) acts[index].onPress?.(); });
    return;
  }
  Alert.alert(title ?? '', message, [...acts.map(a => ({ text: a.label, style: a.destructive ? 'destructive' as const : 'default' as const, onPress: a.onPress })),
    { text: cancel, style: 'cancel' as const }]);
}
