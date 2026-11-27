import { welcomeArt, WELCOME_PEAKS } from '../src/features/onboarding/welcome-art';

describe('Welcome map', () => {
  it('traces lines for every strand in three bands and marks the three peaks on screen', () => {
    const art = welcomeArt(393, 430);
    expect(new Set(art.paths.map(p => p.c))).toEqual(new Set(WELCOME_PEAKS.map(p => p.c)));
    expect(new Set(art.paths.map(p => p.band))).toEqual(new Set([0, 1, 2]));
    expect(art.paths.every(p => /^M[\d.]+ [\d.]+L/.test(p.d))).toBe(true);
    expect(art.marks.map(m => m.mk)).toEqual(['c', 's', 't']);
  });
  it('draws the same map every time', () => {
    expect(welcomeArt(393, 430)).toEqual(welcomeArt(393, 430));
  });
});
