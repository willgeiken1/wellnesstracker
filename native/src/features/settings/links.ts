import { openBrowserAsync } from 'expo-web-browser';
import { Linking } from 'react-native';

/** The public pages the App Store listing points to. They are the Markdown files at the repository root,
 * published by GitHub Pages, so the app, the listing and the pages all name the same addresses. */
const SITE = 'https://willgeiken1.github.io/wellnesstracker';
export const LEGAL_LINKS = {
  privacy: `${SITE}/insight-daily-privacy`,
  terms: `${SITE}/insight-daily-terms`,
  support: `${SITE}/insight-daily-support`,
} as const;
export const REPDB_URL = 'https://repdb.co';

/** Opens a web page in the in-app browser, falling back to Safari. Resolves false when neither could open it. */
export async function openPage(url: string): Promise<boolean> {
  try { await openBrowserAsync(url); return true; }
  catch {
    try { await Linking.openURL(url); return true; }
    catch { return false; }
  }
}
