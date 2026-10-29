import { Host } from '@expo/ui';
import { Button, ContextMenu, RNHostView } from '@expo/ui/swift-ui';
import { useTheme } from '@/design/theme-provider';
import type { RoutineMenuProps } from './routine-menu';
export function RoutineMenu({children, edit, duplicate, remove}: RoutineMenuProps) {
 const {colors, mode}=useTheme();
 return <Host matchContents={{vertical:true}} colorScheme={mode} seedColor={colors.accent}>
  <ContextMenu><ContextMenu.Trigger><RNHostView matchContents={{vertical:true}}>{children()}</RNHostView></ContextMenu.Trigger>
   <ContextMenu.Items><Button label="Edit" systemImage="pencil" onPress={edit}/><Button label="Duplicate" systemImage="plus.square.on.square" onPress={duplicate}/><Button label="Delete" role="destructive" systemImage="trash" onPress={remove}/></ContextMenu.Items>
  </ContextMenu>
 </Host>;
}
