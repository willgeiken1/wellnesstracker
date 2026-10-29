import type { ReactElement } from 'react';
import { Alert } from 'react-native';
export type RoutineActions = {edit: () => void; duplicate: () => void; remove: () => void};
export type RoutineMenuProps = RoutineActions & {children: (onLongPress?: () => void) => ReactElement};
/** Android/web fallback until Expo UI exposes a context menu on those platforms. */
export function RoutineMenu({children, edit, duplicate, remove}: RoutineMenuProps) {
 return children(() => Alert.alert('Routine', undefined, [
  {text:'Edit', onPress:edit}, {text:'Duplicate', onPress:duplicate},
  {text:'Delete', style:'destructive', onPress:remove}, {text:'Cancel', style:'cancel'},
 ]));
}
