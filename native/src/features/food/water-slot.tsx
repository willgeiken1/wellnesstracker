import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../design/theme-provider';
import { ThemedText } from '../../components/themed-text';
import { Button } from '../../components/button';
import { FoodLabel } from './presentation';

// M3, I10: presentation reservation only. Container actions and persistence ship in M3.
export const WATER_ROW_ENABLED = false;
export function WaterSlot() {
 const {colors}=useTheme();
 // TODO: pillar.water token pending, Q-C. Use a neutral glyph until INS-01.
 return <View testID="food-water-slot" style={{minHeight:88,justifyContent:'center'}}>
  {WATER_ROW_ENABLED&&<View style={{gap:8}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
    <Svg width={24} height={28} accessibilityLabel="Water vessel"><Path d="M4 2 L7 26 H17 L20 2 M6 12 H18" fill="none" stroke={colors['text-muted']} strokeWidth={2}/></Svg>
    <FoodLabel>Water</FoodLabel><ThemedText numeric>750 of 2,500 ml</ThemedText>
   </View>
   <View style={{flexDirection:'row',gap:8}}>
    <Button label="Glass" disabled variant="secondary" onPress={()=>{}}/>
    <Button label="Bottle" disabled variant="secondary" onPress={()=>{}}/>
   </View>
  </View>}
 </View>;
}
