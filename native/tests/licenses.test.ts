import { readFileSync } from 'fs';
import { join } from 'path';
import notices from '../src/features/settings/licenses/notices.json';
import { PACKAGES, reflow } from '../src/features/settings/licenses/screen';

const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
// Same list as scripts/licenses/build-notices.cjs: dependencies that never reach the iPhone binary (web-only, build-time).
const NOT_ON_IPHONE = ['react-dom', 'react-native-web', 'expo-build-properties'];

describe('About › Licenses notices', () => {
  test('every runtime dependency that ships on iPhone has a notice (rerun scripts/licenses/build-notices.cjs after adding one)', () => {
    const listed = new Set(PACKAGES.map(item => item.name));
    const missing = Object.keys(pkg.dependencies).filter(name => !NOT_ON_IPHONE.includes(name) && !listed.has(name));
    expect(missing).toEqual([]);
  });
  test('each notice names its version and licence and carries a real licence text', () => {
    for (const item of PACKAGES) {
      expect(item.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(item.license.length).toBeGreaterThan(1);
      const text = notices.texts[item.text];
      expect(text).toBeTruthy();
      // A full licence, never just a sentence saying where one could be found.
      expect(text).toMatch(/permission|licensed under|apache license|copyright/i);
      expect(text.length).toBeGreaterThan(300);
    }
  });
  test('installed versions match the notices, so the list is not stale', () => {
    for (const item of PACKAGES.filter(entry => entry.name in pkg.dependencies)) {
      const installed = JSON.parse(readFileSync(join(root, 'node_modules', item.name, 'package.json'), 'utf8')) as { version: string };
      expect(`${item.name}@${item.version}`).toBe(`${item.name}@${installed.version}`);
    }
  });
  test('the font notice is the full OFL 1.1 with the copyright and reserved font name, word for word from assets', () => {
    const asset = readFileSync(join(root, 'assets/fonts/licenses/Lexend-OFL.txt'), 'utf8').replace(/\r\n/g, '\n').trim();
    expect(notices.lexend).toBe(asset);
    expect(notices.lexend).toMatch(/Copyright 2018 The Lexend Project Authors/);
    expect(notices.lexend).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/);
    expect(notices.lexend).toMatch(/Reserved Font Name/);
  });
  test('the Apache 2.0 text is complete', () => {
    expect(notices.apache).toMatch(/^Apache License/);
    expect(notices.apache).toMatch(/END OF TERMS AND CONDITIONS/);
  });
});

describe('reflow', () => {
  test('joins hard-wrapped lines into paragraphs and keeps blank-line breaks', () => {
    expect(reflow('Permission is hereby granted,\nfree of charge.\n\nTHE SOFTWARE IS PROVIDED\n"AS IS".')).toEqual([
      'Permission is hereby granted, free of charge.', 'THE SOFTWARE IS PROVIDED "AS IS".',
    ]);
  });
  test('keeps list items and rules on their own lines', () => {
    expect(reflow('Conditions:\n1) Keep the notice.\n2) Do not sell\nalone.\n-----\nEnd')).toEqual([
      'Conditions:\n1) Keep the notice.\n2) Do not sell alone.\n-----\nEnd',
    ]);
  });
  test('drops empty paragraphs and trims indentation', () => {
    expect(reflow('\n\n   Indented\n   text\n\n\n')).toEqual(['Indented text']);
  });
});
