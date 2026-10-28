import { Pressable } from 'react-native';
import { touchTarget } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';
export function FoodAction({label,children,disabled=false,selected=false,onPress}:{label:string;children:React.ReactNode;disabled?:boolean;selected?:boolean;onPress:()=>void}) {
 const {colors}=useTheme();
 return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled,selected}} disabled={disabled} onPress={onPress}
  style={{minHeight:touchTarget,minWidth:touchTarget,padding:4,borderRadius:8,alignItems:'center',justifyContent:'center',backgroundColor:selected?colors.accent:colors['surface-2'],opacity:disabled?0.5:1}}>
  <ThemedText style={{color:selected?colors['on-accent']:colors.text}}>{children}</ThemedText>
 </Pressable>;
}
