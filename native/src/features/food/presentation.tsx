import { Component, useEffect, useState, type PropsWithChildren } from 'react';
import { View, type TextProps } from 'react-native';
import { ThemedText } from '../../components/themed-text';
import { Button } from '../../components/button';
import { useTheme } from '../../design/theme-provider';
import { tokens } from '../../design/tokens';

// surface-2 is the current native name for surface.panel (INS-01 rename pending).
export function FoodPanel({children}:PropsWithChildren) {
 const {colors}=useTheme();
 return <View style={{backgroundColor:colors['surface-2'],padding:tokens.spacing[3],gap:tokens.spacing[2],borderRadius:tokens.radii.card,borderCurve:'continuous'}}>{children}</View>;
}
export function FoodLabel(props:TextProps & {numeric?:boolean}) {
 return <ThemedText {...props} style={[{fontSize:tokens.type.caption,fontWeight:'600',fontFamily:undefined},props.style]}/>;
}
export function FoodLoading() {
 const [visible,setVisible]=useState(false);
 const {colors}=useTheme();
 useEffect(()=>{const timer=setTimeout(()=>setVisible(true),300);return ()=>clearTimeout(timer);},[]);
 return <View accessibilityLabel="Loading food log" accessibilityState={{busy:true}}>{visible&&<View testID="food-skeleton" style={{gap:tokens.spacing[3]}}>{[128,88,176].map((height,i)=><View key={i} style={{height,backgroundColor:colors['surface-2'],borderRadius:tokens.radii.card}}/>)}</View>}</View>;
}
export class FoodReadBoundary extends Component<PropsWithChildren,{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<FoodPanel><ThemedText accessibilityRole="alert">Food log could not be loaded.</ThemedText><Button label="Try again" variant="secondary" onPress={()=>this.setState({failed:false})}/></FoodPanel>:this.props.children;}
}
