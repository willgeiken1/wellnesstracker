import { Stack } from 'expo-router';
import { AUTH_ROUTES } from '@/features/navigation/presentation';
export default function AuthLayout(){return <Stack screenOptions={{headerShown:false}}>
  {Object.entries(AUTH_ROUTES).map(([name,route])=><Stack.Screen key={name} name={name} options={route.options}/>)}
</Stack>;}
