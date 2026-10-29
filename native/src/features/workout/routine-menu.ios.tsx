import { Host } from '@expo/ui';
import { Button, ContextMenu, RNHostView } from '@expo/ui/swift-ui';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import type { RoutineMenuProps } from './routine-menu';
export function RoutineMenu({children, edit, duplicate, remove, moveUp, moveDown}: RoutineMenuProps) {
 const {colors, mode}=useTheme();
 return <Host matchContents={{vertical:true}} colorScheme={mode} seedColor={colors.accent}>
  <ContextMenu><ContextMenu.Trigger><RNHostView matchContents={{vertical:true}}>{children()}</RNHostView></ContextMenu.Trigger>
   <ContextMenu.Items><Button label={t('edit')} systemImage="pencil" onPress={edit}/><Button label={t('duplicate')} systemImage="plus.square.on.square" onPress={duplicate}/>{moveUp && <Button label={t('moveUp')} systemImage="arrow.up" onPress={moveUp}/>}
    {moveDown && <Button label={t('moveDown')} systemImage="arrow.down" onPress={moveDown}/>}
    <Button label={t('delete')} role="destructive" systemImage="trash" onPress={remove}/></ContextMenu.Items>
  </ContextMenu>
 </Host>;
}
