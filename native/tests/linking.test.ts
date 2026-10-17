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
