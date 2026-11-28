import { Stack } from 'expo-router';
import { AUTH_ROUTES } from '@/features/navigation/presentation';
import { sheetScreenLayout } from '@/features/navigation/sheet-frame';
export default function AuthLayout(){return <Stack screenLayout={sheetScreenLayout} screenOptions={{headerShown:false}}>
  {Object.entries(AUTH_ROUTES).map(([name,route])=><Stack.Screen key={name} name={name} options={route.options}/>)}
</Stack>;}
