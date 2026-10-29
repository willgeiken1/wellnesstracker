import { BottomSheet, Host, RNHostView } from '@expo/ui';
import { ScrollView } from 'react-native';
import type { Repository } from '../../data/repository';
import { useTheme } from '../../design/theme-provider';
import { Button } from '../../components/button';
import { FoodTargets } from './targets';

export function FoodTargetsSheet({repo,day,revision,open,onClose}:{repo:Repository;day:string;revision:number;open:boolean;onClose:()=>void}) {
 const {colors,mode}=useTheme();
 return <Host colorScheme={mode} seedColor={colors.accent} style={{position:'absolute'}}>
  <BottomSheet isPresented={open} onDismiss={onClose} snapPoints={['half','full']}>
   <RNHostView matchContents>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:8}}>
     <FoodTargets key={day} repo={repo} day={day} revision={revision}/>
     <Button label="Done" variant="secondary" onPress={onClose}/>
    </ScrollView>
   </RNHostView>
  </BottomSheet>
 </Host>;
}
