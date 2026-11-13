import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { tokens } from '@/design/tokens';
import { t } from '@/i18n/en';
import { Group, InfoRow, NavRow, SectionLabel, semibold } from '../parts';
import { openPage, REPDB_URL } from '../links';
import notices from './notices.json';

/** One open-source package the iPhone app ships, as scripts/licenses/build-notices.cjs recorded it. */
export type PackageNotice = { name: string; version: string; license: string; url?: string; text: number };
export const PACKAGES: readonly PackageNotice[] = notices.packages;

/** The notice ids a detail page can open: the font, the body map colours, or a package name. */
export const FONT_NOTICE = 'lexend', COLOUR_NOTICE = 'colorbrewer';

/** Licence files are wrapped at about 80 characters for a terminal. On a phone that leaves ragged half-lines,
 * so lines inside a paragraph are joined. Blank lines, and lines that start a list item or a rule, still break. */
const RULE = /^[-=_*]{3,}$/;
const ITEM = /^([-*•]\s|\(?[0-9a-z]{1,3}[.)]\s)/i;
export function reflow(text: string): string[] {
  return text.split(/\n[ \t]*\n/).map(paragraph => {
    const lines: string[] = [];
    for (const raw of paragraph.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const last = lines.at(-1);
      if (last === undefined || RULE.test(last) || RULE.test(line) || ITEM.test(line)) lines.push(line);
      else lines[lines.length - 1] = `${last} ${line}`;
    }
    return lines.join('\n');
  }).filter(Boolean);
}

const openNotice = (notice: string) => router.push({ pathname: '/settings/[section]', params: { section: 'licenses', notice } });

/** About › Licenses: the font, the data and colour credits, and every open-source package in the app. */
export function Licenses() {
  const [failed, setFailed] = useState(false);
  return <>
    <ThemedText muted>{t('licensesIntro')}</ThemedText>
    <SectionLabel>{t('licensesFont')}</SectionLabel>
    <Group testID="licenses-font">
      <NavRow label="Lexend" value={t('licenseOfl')} onPress={() => openNotice(FONT_NOTICE)} />
    </Group>
    <SectionLabel>{t('licensesCredits')}</SectionLabel>
    <Group testID="licenses-credits">
      <NavRow label={t('licensesRepdb')} value="repdb.co" onPress={() => {
        setFailed(false);
        void openPage(REPDB_URL).then(opened => { if (!opened) setFailed(true); });
      }} />
      <NavRow label={t('licensesColours')} value="Apache 2.0" onPress={() => openNotice(COLOUR_NOTICE)} />
    </Group>
    {failed && <ThemedText testID="licenses-link-failed" muted accessibilityRole="alert" accessibilityLiveRegion="polite">{t('linkFailed')}</ThemedText>}
    <SectionLabel>{t('licensesSoftware').replace('{n}', String(PACKAGES.length))}</SectionLabel>
    <Group testID="licenses-packages">
      {PACKAGES.map(item => <NavRow key={item.name} label={item.name} value={item.license} onPress={() => openNotice(item.name)} />)}
    </Group>
  </>;
}

function Body({ text }: { text: string }) {
  return <Card style={{ borderRadius: 18, padding: tokens.spacing[3], gap: tokens.spacing[2] }}>
    {reflow(text).map((paragraph, index) => <ThemedText key={index} selectable variant="caption" style={{ lineHeight: 19 }}>{paragraph}</ThemedText>)}
  </Card>;
}

/** The full text of one notice. An id the app does not know shows the whole list instead. */
export function LicenseNotice({ notice }: { notice: string }) {
  if (notice === FONT_NOTICE) return <>
    <Group><InfoRow label="Lexend" hint={t('licenseFontHint')} value={t('licenseOfl')} /></Group>
    <Body text={notices.lexend} />
  </>;
  if (notice === COLOUR_NOTICE) return <>
    <Card style={{ borderRadius: 18, padding: tokens.spacing[3] }}><ThemedText>{t('atlasPaletteCredit')}</ThemedText></Card>
    <Body text={notices.apache} />
  </>;
  const item = PACKAGES.find(entry => entry.name === notice);
  if (!item) return <Licenses />;
  return <>
    <View style={{ gap: 2 }}>
      <ThemedText variant="headline" style={semibold}>{`${item.name} ${item.version}`}</ThemedText>
      <ThemedText muted variant="caption">{item.license}</ThemedText>
      {!!item.url && <ThemedText muted variant="caption" selectable>{item.url}</ThemedText>}
    </View>
    <Body text={notices.texts[item.text]} />
  </>;
}

/** The page title for a notice id: the font or package name. */
export function noticeTitle(notice: string): string {
  if (notice === FONT_NOTICE) return 'Lexend';
  if (notice === COLOUR_NOTICE) return t('licensesColours');
  return PACKAGES.some(entry => entry.name === notice) ? notice : t('licenses');
}
