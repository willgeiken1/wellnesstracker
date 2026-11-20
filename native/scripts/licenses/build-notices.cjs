#!/usr/bin/env node
/**
 * Builds src/features/settings/licenses/notices.json: the open-source notices shown in Settings › About › Licenses.
 *
 * What ships in the iPhone app is the JavaScript bundle plus the native modules linked into the binary, so the list is
 *   1. every npm package with a file in the bundle (read from a bundle source map), and
 *   2. every package of the production dependency tree with native iOS code (a podspec or an Expo module config).
 * Each entry carries the package's own licence file, word for word. Identical texts are stored once.
 *
 * Run from native/ after a dependency change:
 *   npx expo export --platform ios --source-maps --output-dir <dir>
 *   node scripts/licenses/build-notices.cjs <dir>/_expo/static/js/ios/<entry>.hbc.map
 * tests/licenses.test.ts fails when a runtime dependency in package.json is missing from the notices.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const modules = path.join(root, 'node_modules');
const out = path.join(root, 'src/features/settings/licenses/notices.json');

// Dependencies that never reach the iPhone binary: web-only renderers and a build-time config plugin. Kept in step with tests/licenses.test.ts.
const NOT_ON_IPHONE = new Set(['react-dom', 'react-native-web', 'expo-build-properties']);

function pkgDir(name, from = root) {
  // Node resolution: nearest node_modules first, then upwards.
  let dir = from;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

// 1. Packages in the JavaScript bundle.
const bundled = new Map();
const mapFile = process.argv[2];
if (!mapFile) { console.error('Usage: build-notices.cjs <bundle source map>'); process.exit(1); }
for (const source of readJson(mapFile).sources) {
  const at = source.lastIndexOf('node_modules/');
  if (at < 0) continue;
  const rest = source.slice(at + 'node_modules/'.length).split('/');
  const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
  // Metro writes sources relative to the project root, with a leading slash.
  const dir = path.join(root, source.slice(0, at), 'node_modules', name);
  bundled.set(name, fs.existsSync(path.join(dir, 'package.json')) ? dir : pkgDir(name));
}

// 2. Production dependency closure; keep those with native iOS code.
const seen = new Map();
const queue = Object.keys(readJson(path.join(root, 'package.json')).dependencies)
  .filter(name => !NOT_ON_IPHONE.has(name)).map(name => [name, root]);
while (queue.length) {
  const [name, from] = queue.shift();
  const dir = pkgDir(name, from);
  if (!dir || seen.has(dir)) continue;
  seen.set(dir, name);
  const pkg = readJson(path.join(dir, 'package.json'));
  for (const dep of [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})]) queue.push([dep, dir]);
}
const native = new Map();
for (const [dir, name] of seen) {
  const files = fs.readdirSync(dir);
  const expoModule = files.includes('expo-module.config.json')
    && JSON.stringify(readJson(path.join(dir, 'expo-module.config.json'))).match(/"(apple|ios)"/);
  if (files.some(file => file.endsWith('.podspec')) || expoModule) native.set(name, dir);
}

const APACHE_2 = fs.readFileSync(path.join(__dirname, 'apache-2.0.txt'), 'utf8').trim();
// The standard MIT text, for packages that declare MIT and name their author in package.json but ship no file.
const MIT = fs.readFileSync(path.join(__dirname, 'mit.txt'), 'utf8').trim();
const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i;
function ownText(dir) {
  const file = fs.readdirSync(dir).find(name => LICENSE_FILE.test(name))
    ?? fs.readdirSync(dir).find(name => /^licen[cs]e/i.test(name));
  return file ? fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n').trim() : null;
}
// owner/repo on GitHub, so a monorepo package without its own file can carry its repository's licence.
function repoKey(pkg) {
  const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? '';
  const match = url.match(/github\.com[/:]([^/]+\/[^/#.]+)/i) ?? url.match(/^(?:github:)?([\w-]+\/[\w.-]+)$/);
  return match ? match[1].toLowerCase() : null;
}
const repoTexts = new Map();
function licenceText(dir, pkg) {
  const own = ownText(dir);
  if (own) return own;
  const shared = repoKey(pkg) && repoTexts.get(repoKey(pkg));
  if (shared && licenceName(pkg) === shared.license) return shared.text;
  if (licenceName(pkg) === 'Apache-2.0') return APACHE_2;
  const author = (typeof pkg.author === 'string' ? pkg.author : pkg.author?.name)?.replace(/\s*[<(][^>)]*[>)]/g, '').trim();
  if (licenceName(pkg) === 'MIT' && author) return MIT.replace('{holder}', author);
  // Otherwise say what package.json says rather than invent a text.
  return `${pkg.name} is licensed under ${licenceName(pkg)}${author ? `, copyright ${author}` : ''}. The package ships no separate licence file.`;
}
function licenceName(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map(item => item.type ?? item).join(' OR ');
  return 'see notice';
}

const all = [...bundled, ...native].filter(([, dir]) => dir);
for (const [, dir] of all) {
  const pkg = readJson(path.join(dir, 'package.json')), key = repoKey(pkg), text = ownText(dir);
  if (key && text && !repoTexts.has(key)) repoTexts.set(key, { license: licenceName(pkg), text });
}
const texts = [];
const entries = new Map();
for (const [name, dir] of all) {
  if (entries.has(name)) continue;
  const pkg = readJson(path.join(dir, 'package.json'));
  const text = licenceText(dir, pkg);
  let index = texts.indexOf(text);
  if (index < 0) index = texts.push(text) - 1;
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  entries.set(name, { name, version: pkg.version, license: licenceName(pkg), text: index,
    ...(pkg.homepage || repo ? { url: String(pkg.homepage || repo).replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://') } : {}) });
}
const packages = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
fs.mkdirSync(path.dirname(out), { recursive: true });
// The font is credited on its own: its licence (OFL 1.1, with the reserved font name) lives in assets.
const lexend = fs.readFileSync(path.join(root, 'assets/fonts/licenses/Lexend-OFL.txt'), 'utf8').replace(/\r\n/g, '\n').trim();
fs.writeFileSync(out, `${JSON.stringify({ lexend, apache: APACHE_2, packages, texts }, null, 1)}\n`);
console.log(`${packages.length} packages, ${texts.length} distinct licence texts → ${path.relative(root, out)}`);
