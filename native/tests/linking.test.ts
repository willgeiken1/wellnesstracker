import { redirectSystemPath } from '../src/app/+native-intent';
test.each([true, false])('native intent handles cold/warm links (initial=%s)', initial => {
  expect(redirectSystemPath({ path: 'insight://food/log', initial })).toBe('/food/log');
  expect(redirectSystemPath({ path: 'insight://workout/start', initial })).toBe('/workout/start');
  expect(redirectSystemPath({ path: 'insight:///food/log', initial })).toBe('/food/log');
  expect(redirectSystemPath({ path: '/food/log', initial })).toBe('/food/log');
  expect(redirectSystemPath({ path: 'insight://unknown', initial })).toBe('/');
  expect(redirectSystemPath({ path: 'insight://[', initial })).toBe('/');
});
