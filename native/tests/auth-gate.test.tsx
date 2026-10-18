import { Text } from 'react-native';
import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { NavigationShell } from '../src/app/_layout';
import { ThemeProvider } from '../src/design/theme-provider';
function routes(access: boolean) { return {
  _layout: () => <ThemeProvider><NavigationShell access={access}/></ThemeProvider>,
  'auth/_layout': () => <Stack screenOptions={{headerShown:false}}/>,
  'settings/_layout': () => <Stack screenOptions={{headerShown:false}}/>,
  'workout/_layout': () => <Stack screenOptions={{headerShown:false}}/>,
  '(tabs)/_layout': () => <Stack screenOptions={{headerShown:false}}/>,
  'auth/index': () => <Text>Fixture welcome</Text>,
  '(tabs)/index': () => <Text>Fixture home</Text>,
  'settings/account': () => <Text>Fixture account</Text>,
  'workout/index': () => <Text>Fixture workout</Text>,
  'food/log': () => <Text>Fixture food</Text>,
  onboarding: () => <Text>Fixture onboarding</Text>,
}; }
test.each(['/','/settings/account','/workout','/food/log','/onboarding'])('signed-out deep link %s is gated behind welcome',async initialUrl=>{
 const result=await renderRouter(routes(false),{initialUrl});expect(result.getPathname()).toBe('/auth');
});
test.each([true])('signed-in or demo access admits private routes',async access=>{
 const result=await renderRouter(routes(access),{initialUrl:'/settings/account'});expect(result.getPathname()).toBe('/settings/account');
});
