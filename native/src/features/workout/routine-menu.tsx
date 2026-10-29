import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { t } from '@/i18n/en';
export type RoutineActions = {edit: () => void; duplicate: () => void; remove: () => void; moveUp?: () => void; moveDown?: () => void};
export type RoutineMenuProps = RoutineActions & {children: (onLongPress?: () => void) => ReactElement};
/** Android/web fallback until Expo UI exposes a context menu on those platforms. */
export function RoutineMenu({children, edit, duplicate, remove, moveUp, moveDown}: RoutineMenuProps) {
 return children(() => Alert.alert(t('routineMenu'), undefined, [
  {text:t('edit'), onPress:edit}, {text:t('duplicate'), onPress:duplicate},
  ...(moveUp ? [{text:t('moveUp'), onPress:moveUp}] : []),
  ...(moveDown ? [{text:t('moveDown'), onPress:moveDown}] : []),
  {text:t('delete'), style:'destructive', onPress:remove}, {text:t('cancel'), style:'cancel'},
 ]));
}
