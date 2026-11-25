// The app icon set for expo-alternate-app-icons: three styles (Lit Peaks, Dusk Glow, Clear Night), each drawn for every
// palette in Dark and Light (assets/icon, from the App Icons studio export, manifest.json). Each alternate puts the same
// art in its light and dark slots, so iOS never swaps it with the Home Screen look, and the style's tinted art in tinted.
// The primary icon is Lit Peaks in the default palette, Dark; it is ios.icon and never an alternate.
const STYLES = { lit: 'LitPeaks', dusk: 'DuskGlow', clear: 'ClearNight' };
const PALETTES = Object.keys(require('../src/design/tokens.json').palettes);
const DEFAULT_PALETTE = 'orchidEvening';
const cap = s => s[0].toUpperCase() + s.slice(1);
const PRIMARY_NAME = `LitPeaks${cap(DEFAULT_PALETTE)}Dark`;
const PRIMARY_ART = `./assets/icon/lit/${DEFAULT_PALETTE}-dark.png`;
const icons = Object.entries(STYLES).flatMap(([style, key]) => PALETTES.flatMap(id => ['dark', 'light'].flatMap(look => {
  const name = key + cap(id) + (look === 'dark' ? 'Dark' : 'Light');
  const art = `./assets/icon/${style}/${id}-${look}.png`;
  return name === PRIMARY_NAME ? [] : [{ name, ios: { light: art, dark: art, tinted: `./assets/icon/${style}/tinted.png` } }];
})));
module.exports = { icons, plugin: ['expo-alternate-app-icons', icons], PRIMARY_NAME, PRIMARY_ART };
