// Insight app icon, E0 "original eye lens" from design/07-app-icon: Will's pick (2026-11-14). A small eye set high and
// right over the terrain, with the terrain's own contour lines magnified inside it. Accent from the default palette (Sea Glass Tide).
// Run from native/: node scripts/app-icon.ts   -> writes the SVG sources to assets/brand/.
// The PNGs in assets/images (icon, splash, Android layers, favicon) are rendered from these SVGs at the sizes
// app.json expects; tests/app-icon.test.ts checks the sources stay in step with this script.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const S = 1024, U = S / 100; // the design draws the icon on a 100-unit tile
const tokens = JSON.parse(readFileSync(path.join(process.cwd(), 'src/design/tokens.json'), 'utf8')) // run from native/, like the tests;
const sea = tokens.palettes.seaGlassTide.dark;
// The neutrals are the design's own, measured from the E0 tile; only the accent follows the palette.
export const ICON_COLORS = { top: '#1A1B20', bottom: '#0B0B0D', terrain: '#4A4D54', lens: '#17181D', accent: sea.accent, rim: '#ECEDEA', pupil: '#0B0B0D' } as const;

// The E0 terrain, traced from the design tile: one summit low and left, its rings running out to the edges, and one
// line crossing the outermost ring at the top. Each entry is one contour line as x,y points (Z = closed ring); open
// lines run on past the tile so the Android layers have terrain to show when they shift.
const TERRAIN = [
  'Z 289,589 315,588 340,591 365,599 386,613 402,633 413,656 422,680 432,703 445,726 455,749 459,774 453,799 440,820 420,836 397,848 374,858 350,867 325,873 299,875 274,870 250,862 226,852 203,841 182,827 165,808 157,784 157,759 165,735 177,712 189,689 198,665 208,642 221,620 241,604 264,594',
  'Z 289,486 265,479 240,477 214,480 190,488 169,502 151,520 137,541 126,564 117,588 110,613 103,637 95,661 87,685 79,709 73,734 70,759 70,785 75,810 82,834 92,858 104,880 118,902 133,922 149,942 167,959 188,974 211,986 235,992 261,993 286,990 310,982 333,971 355,958 377,945 399,933 423,924 447,916 471,908 494,897 516,883 534,866 549,845 559,822 565,797 567,772 565,746 560,721 554,697 546,672 537,649 523,627 509,607 494,586 475,569 454,555 431,545 407,535 383,525 360,516 336,506 313,496',
  '-253,847 -167,743 -83,642 1,540 17,521 33,501 50,482 68,465 88,448 108,433 130,420 153,409 177,401 202,396 228,394 253,395 278,400 303,406 327,414 350,423 374,432 398,441 423,448 447,454 472,459 497,464 522,471 543,484 565,497 587,511 609,524 630,537 647,555 659,578 664,603 669,628 671,653 669,678 665,703 659,728 652,753 644,777 636,801 628,825 619,849 609,872 599,895 587,918 573,939 557,959 539,977 520,994 499,1009 478,1023 370,1098 263,1173 152,1251',
  '-350,583 -227,528 -107,475 13,421 37,411 60,401 83,390 106,379 128,367 151,355 173,343 196,331 219,321 243,312 267,304 292,298 317,294 342,292 368,293 393,295 418,300 443,306 467,313 491,321 514,331 538,341 561,352 583,364 606,376 627,390 648,404 668,421 686,438 703,457 718,477 732,499 743,522 751,546 755,571 757,596 759,622 756,647 751,672 745,697 736,721 727,744 718,768 708,792 699,815 691,839 684,864 679,889 674,914 670,939 666,964 661,989 654,1014 625,1142 595,1270 565,1402',
  '-334,541 -217,473 -104,406 10,340 32,328 54,314 75,300 96,285 116,270 136,254 156,239 177,223 197,208 218,194 240,181 263,168 286,158 310,149 334,142 359,137 385,135 410,135 435,138 461,142 485,150 508,160 531,172 552,186 572,202 591,219 609,237 625,256 641,276 656,297 670,318 684,340 697,362 710,384 723,406 736,428 748,450 760,472 772,495 784,518 794,541 804,565 814,588 821,612 828,637 832,662 836,687 837,713 838,738 836,764 834,789 830,815 826,840 821,865 816,890 810,915 804,939 798,964 792,989 785,1013 751,1140 717,1267 682,1398',
  '-329,318 -208,256 -91,197 26,137 49,125 72,114 95,103 119,93 143,83 167,74 191,66 216,59 240,51 265,46 291,41 316,37 342,36 367,34 393,37 417,43 442,50 467,56 492,62 517,68 540,80 562,94 582,109 602,125 620,144 638,162 653,183 668,204 682,225 695,247 708,270 719,292 731,315 743,338 755,361 768,383 780,406 794,427 809,448 825,468 841,488 857,508 874,528 890,548 906,568 921,588 936,609 951,631 963,653 975,675 985,699 994,723 1001,748 1005,773 1009,799 1009,824 1009,850 1004,875 996,900 963,1027 930,1154 896,1285',
  '-133,-60 1,-40 131,-22 261,-3 287,0 312,4 337,11 362,16 387,22 412,28 437,34 463,39 488,45 513,50 538,56 563,64 587,72 611,81 635,91 658,102 681,114 703,128 725,141 746,157 766,172 786,189 804,207 823,225 840,244 858,263 874,283 890,303 906,323 921,344 937,365 952,386 967,407 982,428 996,449 1011,470 1025,492 1098,601 1172,710 1247,822',
  '-189,467 -124,587 -62,702 0,818 11,839 22,860 33,881 42,903 51,925 62,946 116,1065 170,1185 225,1309',
] as const;
/** A smooth curve through the points (Catmull-Rom, written as cubic Béziers). */
function curve(line: string) {
  const closed = line.startsWith('Z '), p = line.replace('Z ', '').split(' ').map(q => q.split(',').map(Number)), n = p.length;
  const at = (i: number) => closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))];
  let d = `M${p[0][0]} ${p[0][1]}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [a, b, c, e] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += `C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)} ${(b[1] + (c[1] - a[1]) / 6).toFixed(1)} ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)} ${(c[1] - (e[1] - b[1]) / 6).toFixed(1)} ${c[0]} ${c[1]}`;
  }
  return closed ? `${d}Z` : d;
}
const contours = TERRAIN.map(curve);
const stroke = (d: string, color: string, width: number, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const terrainPaths = contours.map(d => stroke(d, ICON_COLORS.terrain, 12.3, ' stroke-opacity="0.6"')).join('');

// The eye: small, high and right (E0). On the design's 100-unit tile it runs from 30 to 86 across, centred on 58, 46.
export const EYE = { cx: 58 * U, cy: 46 * U, half: 28 * U } as const;
const { cx, cy, half } = EYE, inset = 12 * U, lift = 20 * U, rimWidth = 2.6 * U, pupilR = 6 * U, dotR = 2.6 * U;
const n = (v: number) => +v.toFixed(1);
const left = n(cx - half), right = n(cx + half), inL = n(cx - half + inset), inR = n(cx + half - inset);
const eye = `M${left} ${n(cy)} C${inL} ${n(cy - lift)} ${inR} ${n(cy - lift)} ${right} ${n(cy)} C${inR} ${n(cy + lift)} ${inL} ${n(cy + lift)} ${left} ${n(cy)}Z`;
// Magnified contour lines inside the lens: the same terrain lines that pass under it, drawn heavier in the accent.
const lensLines = (color: string) => contours.slice(1, 6).map(d => stroke(d, color, 22.7)).join('');
const pupil = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(pupilR)}" fill="${ICON_COLORS.pupil}"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(dotR)}" fill="${ICON_COLORS.rim}"/>`;
// The eye sits off centre, so the layers shrink about the middle of the tile and it keeps its place over the terrain.
const about = (scale: number) => `translate(${S / 2} ${S / 2}) scale(${scale}) translate(${-S / 2} ${-S / 2})`;

/** The lens on its own: rim, lines and pupil, on a transparent ground. `scale` shrinks it about the middle of the tile. */
export function lens(scale = 1, mono = false) {
  const clip = `<clipPath id="lens"><path d="${eye}"/></clipPath>`, rim = (color: string) => `<path d="${eye}" fill="none" stroke="${color}" stroke-width="${n(rimWidth)}" stroke-linejoin="round"/>`;
  if (mono) return `<g transform="${about(scale)}">${clip}<mask id="pupil"><rect width="${S}" height="${S}" fill="#FFFFFF"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(pupilR)}" fill="#000000"/></mask>`
    + `<g clip-path="url(#lens)"><g mask="url(#pupil)">${lensLines('#FFFFFF')}</g></g><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(dotR)}" fill="#FFFFFF"/>${rim('#FFFFFF')}</g>`;
  return `<g transform="${about(scale)}">${clip}<path d="${eye}" fill="${ICON_COLORS.lens}"/><g clip-path="url(#lens)">${lensLines(ICON_COLORS.accent)}</g>${pupil}${rim(ICON_COLORS.rim)}</g>`;
}
export function ground1024(scale = 1) {
  return `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ICON_COLORS.top}"/><stop offset="1" stop-color="${ICON_COLORS.bottom}"/></linearGradient></defs>`
    + `<rect width="${S}" height="${S}" fill="url(#bg)"/>${scale === 1 ? terrainPaths : `<g transform="${about(scale)}">${terrainPaths}</g>`}`;
}
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${body}</svg>\n`;

/** How far the Android layers shrink, so the off-centre lens stays inside the 66% safe zone of the foreground. */
export const ANDROID_SCALE = 0.7;
export const SOURCES = {
  // Full icon: iOS (Apple rounds the corners itself), favicon and the splash tile.
  'icon.svg': svg(ground1024() + lens()),
  // Android adaptive layers: terrain and lens shrink together, so the eye stays high and right over the summit.
  'android-background.svg': svg(ground1024(ANDROID_SCALE)),
  'android-foreground.svg': svg(lens(ANDROID_SCALE)),
  'android-monochrome.svg': svg(lens(ANDROID_SCALE, true)),
  // iOS 26 layered icon (assets/expo.icon): the system fills the ground colour, then the terrain, then the lens.
  'ios-terrain.svg': svg(terrainPaths),
  'ios-lens.svg': svg(lens()),
} as const;

if (process.argv[1]?.endsWith('app-icon.ts')) {
  mkdirSync('assets/brand', { recursive: true });
  for (const [name, body] of Object.entries(SOURCES)) writeFileSync(`assets/brand/${name}`, body);
}
