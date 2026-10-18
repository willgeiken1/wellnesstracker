import { redirectSystemPath } from '../src/app/+native-intent';

const cases = [
  ['insight://food/log', '/food/log'],
  ['insight://workout/start', '/workout/start'],
  ['INSIGHT://FOOD/LOG', '/food/log'],
  ['insight://food/log?x=1', '/food/log'],
  ['insight://food/log#fragment', '/food/log'],
  ['insight:///food/log', '/food/log'],
  ['insight://workout/start/', '/workout/start'],
  ['com.insightwellness.app://settings/privacy?x=1', '/'],
  ['exp+insight-daily://settings/data', '/'],
  ['exp+insight-daily://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081', '/'],
  ['INSIGHT://settings/privacy', '/'],
  ['/settings/privacy?x=1', '/'], ['settings/privacy', '/'],
  ['/food/log', '/'], ['food/log', '/'],
  ['com.insightwellness.app://food/log', '/'],
  ['exp+insight-daily://food/log', '/'],
  ['https://evil.example/food/log', '/'], ['javascript:alert(1)', '/'],
  ['', '/'], ['insight://%zz', '/'], ['insight://[', '/'],
  ['insight://unknown', '/'],
] as const;

describe.each([true, false])('native intent initial=%s', initial => {
  test.each(cases)('%s -> %s', (path, expected) => {
    expect(redirectSystemPath({ path, initial })).toBe(expected);
  });
});

test.each([true,false])('template deep link preserves only a valid routine id, initial=%s',initial=>{
  const id='40000000-0000-4000-8000-000000000001';
  expect(redirectSystemPath({path:`insight://workout/start?routine=${id}&other=discard`,initial})).toBe(`/workout/start?routine=${id}`);
  expect(redirectSystemPath({path:'insight://workout/start?routine=bad',initial})).toBe('/workout/start');
});

test.each(['logger','keypad','rest','summary'])('development fixture intent preserves only allowed state %s',state=>{
 expect(redirectSystemPath({path:`insight://dev/logger-fixture?state=${state}&offline=0&other=discard`,initial:true})).toMatch(new RegExp(`^/dev/logger-fixture\\?state=${state}&offline=0&request=\\d+$`));
});
test('fixture intent rejects malformed states and all release links',()=>{
 expect(redirectSystemPath({path:'insight://dev/logger-fixture?state=invalid',initial:true})).toBe('/');
 const original=__DEV__;
 try {Object.defineProperty(globalThis,'__DEV__',{value:false,configurable:true,writable:true});
 expect(redirectSystemPath({path:'insight://dev/logger-fixture?state=logger',initial:true})).toBe('/');
 } finally {Object.defineProperty(globalThis,'__DEV__',{value:original,configurable:true,writable:true});}
});


test('identical development fixture links receive distinct presentation requests', () => {
 const input={path:'insight://dev/logger-fixture?state=logger',initial:false};
 expect(redirectSystemPath(input)).not.toBe(redirectSystemPath(input));
});
