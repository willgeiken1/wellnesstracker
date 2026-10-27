import { Text } from 'react-native';
import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { NavigationShell } from '../src/app/_layout';
import { ThemeProvider } from '../src/design/theme-provider';
function routes(access: boolean, signedIn=false) { return {
  _layout: () => <ThemeProvider><NavigationShell access={access} signedIn={signedIn}/></ThemeProvider>,
  'auth/_layout': () => <Stack screenOptions={{headerShown:false}}/>,
  'settings/_layout': () => <Stack screenOptions={{headerShown:false}}/>,
  'workout/_layout': () => <Stack screenOptions={{headerShown:false}}/>,
  '(tabs)/_layout': () => <Stack screenOptions={{headerShown:false}}/>,
  'auth/index': () => <Text>Fixture welcome</Text>,
  '(tabs)/index': () => <Text>Fixture home</Text>,
  'settings/account': () => <Text>Fixture account</Text>,
  'workout/index': () => <Text>Fixture workout</Text>,
  'food/log': () => <Text>Fixture food</Text>,
  'sign-in': () => <Text>Fixture sign in</Text>,
  onboarding: () => <Text>Fixture onboarding</Text>,
}; }
test.each(['/','/settings/account','/workout','/food/log'])('signed-out deep link %s is gated behind welcome',async initialUrl=>{
 const result=await renderRouter(routes(false),{initialUrl});expect(result.getPathname()).toBe('/auth');
});
test.each([true])('signed-in or demo access admits private routes',async access=>{
 const result=await renderRouter(routes(access),{initialUrl:'/settings/account'});expect(result.getPathname()).toBe('/settings/account');
});

test('signed-out onboarding link is public so the age gate precedes account creation',async()=>{
 const result=await renderRouter(routes(false),{initialUrl:'/onboarding'});expect(result.getPathname()).toBe('/onboarding');
});

test.each([false,true])('demo can sign in and completed sign-in exits the public form (signedIn=%s)',async signedIn=>{
 const result=await renderRouter(routes(true,signedIn),{initialUrl:'/sign-in'});expect(result.getPathname()).toBe(signedIn?'/':'/sign-in');
});
