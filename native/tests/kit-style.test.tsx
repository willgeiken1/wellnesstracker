import { alpha, font, mix, MIN_TEXT, slopFor } from '../src/components/kit-style';
import { formatNumber, stepValue } from '../src/components/stepper';
import { DISTANCES, FADES, SPRINGS } from '../src/components/kit-motion';

test('colour mixing follows CSS color-mix in srgb', () => {
  expect(mix('#FFFFFF', '#000000', 0.5)).toBe('#808080');
  expect(mix('#FF0000', '#0000FF', 0.1)).toBe('#1A00E6');
  // A tint over transparent keeps the colour and only lowers its opacity.
  expect(alpha('#D693D8', 0.16)).toBe('rgba(214, 147, 216, 0.16)');
  expect(mix('#D693D8', 'transparent', 1)).toBe('#D693D8');
});

test('kit type: weights map to the three Plus Jakarta Sans files, em tracking turns into points, nothing under 11 pt', () => {
  expect(font(700, 34, 1.05, -0.035)).toEqual({ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 34, lineHeight: 35.7, letterSpacing: -1.19 });
  expect(font(600, 15.5)).toEqual({ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15.5 });
  expect(font(500, 13).fontFamily).toBe('PlusJakartaSans_500Medium');
  expect(MIN_TEXT).toBe(11);
  expect(font(700, 10.5, 1, 0.14).fontSize).toBe(11);
});

test('a control drawn smaller than 44 pt grows to 44 with hitSlop, and a big one gets none', () => {
  expect(slopFor(36, 36)).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
  expect(slopFor(51, 31)).toEqual({ top: 7, bottom: 7, left: 0, right: 0 });
  expect(slopFor(48, 48)).toBeUndefined();
});

test('the stepper steps, stays in bounds, keeps its decimals and snaps to its grid like the mockup', () => {
  expect(stepValue(5, 1)).toBe(6);
  expect(stepValue(0, -1)).toBe(0);
  expect(stepValue(10, 1, { max: 10 })).toBe(10);
  expect(stepValue(182.1, 1, { step: 0.1, dec: 1 })).toBe(182.2);
  // 9,200 then 9,250 and 9,500, not 9,450.
  expect(stepValue(9200, 1, { step: 250, max: 20000, snap: true })).toBe(9250);
  expect(stepValue(9250, 1, { step: 250, max: 20000, snap: true })).toBe(9500);
  expect(stepValue(9200, -1, { step: 250, snap: true })).toBe(9000);
  expect(formatNumber(9250)).toBe('9,250');
  expect(formatNumber(1364.4, 1)).toBe('1,364.4');
});

test('the motion tokens are the mockup springs and fades', () => {
  expect(SPRINGS.push).toEqual({ mass: 1, stiffness: 300, damping: 35, ms: 530 });
  expect(SPRINGS.sheet).toEqual({ mass: 1, stiffness: 260, damping: 32, ms: 540 });
  expect(SPRINGS.press).toMatchObject({ stiffness: 700, damping: 32 });
  expect(SPRINGS.switch).toMatchObject({ stiffness: 620, damping: 38 });
  expect(FADES).toMatchObject({ tab: 180, tabOut: 110, scrim: 300, reduced: 200, pressIn: 90 });
  expect(DISTANCES).toMatchObject({ pressScale: 0.97, tabRise: 8, sheetTrail: 18, toastRise: 16, cardScale: 0.94 });
});

test('a tracking of 0 is written out, so a nested unit drops its number\'s tighter tracking', () => {
  expect(font(600, 13, undefined, 0)).toMatchObject({ letterSpacing: 0 });
  expect(font(600, 13)).not.toHaveProperty('letterSpacing');
  expect(font(700, 24, 1.1, -0.03).letterSpacing).toBeCloseTo(-0.72);
});
