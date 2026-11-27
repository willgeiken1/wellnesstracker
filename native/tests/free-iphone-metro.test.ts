import path from 'node:path';
import fs from 'node:fs';
import ts from 'typescript';
jest.mock('expo/metro-config', () => ({ getDefaultConfig: () => ({ resolver: {} }) }));
jest.mock('@sentry/react-native/metro', () => ({ getSentryExpoConfig: jest.fn(() => ({ resolver: {}, sentry: true })) }));
const root = path.resolve(__dirname, '..');
function load(variant?: string) {
  const before = process.env.APP_VARIANT;
  if (variant) process.env.APP_VARIANT = variant; else delete process.env.APP_VARIANT;
  let result: any;
  try { jest.isolateModules(() => { result = require('../metro.config.js'); }); }
  finally { if (before === undefined) delete process.env.APP_VARIANT; else process.env.APP_VARIANT = before; }
  return result;
}
test('store builds use Sentry\'s Metro config with default resolution; the phone-only build never loads it', () => {
  const { getSentryExpoConfig } = jest.requireMock('@sentry/react-native/metro');
  getSentryExpoConfig.mockClear();
  const config = load();
  expect(config.sentry).toBe(true);
  expect(config.resolver.resolveRequest).toBeUndefined();
  expect(getSentryExpoConfig).toHaveBeenCalledWith(root, { enableSourceContextInDevelopment: false });
  getSentryExpoConfig.mockClear();
  expect(load('freeiphone').sentry).toBeUndefined();
  expect(getSentryExpoConfig).not.toHaveBeenCalled();
});
test('freeiphone resolves the real repository runtime import graph, including pure flags', () => {
  const config = load('freeiphone');
  const visited = new Set<string>();
  function visit(filePath: string) {
    if (visited.has(filePath)) return;
    visited.add(filePath);
    const source = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      if (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly) continue;
      if (ts.isExportDeclaration(statement) && statement.isTypeOnly) continue;
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const name = statement.moduleSpecifier.text;
      const target = name.startsWith('.')
        ? ts.resolveModuleName(name, filePath, {}, ts.sys).resolvedModule?.resolvedFileName
        : path.join(root, 'node_modules', name, 'index.js');
      expect(target).toBeDefined();
      const context = { resolveRequest: () => ({ type: 'sourceFile', filePath: target }) };
      const resolved = config.resolver.resolveRequest(context, name, 'ios');
      if (name.startsWith('.')) visit(resolved.filePath);
    }
  }
  visit(path.join(root, 'src/data/repository.ts'));
  expect(visited.has(path.join(root, 'src/data/sync/flags.ts'))).toBe(true);
});
test.each(['@sentry/react-native', '@sentry/core', 'sentry-expo', 'posthog-js', 'posthog-react-native'])('freeiphone rejects telemetry package %s before resolution', name => {
  const context = { resolveRequest: jest.fn(() => ({ type: 'sourceFile', filePath: path.join(root, 'node_modules', name, 'index.js') })) };
  expect(() => load('freeiphone').resolver.resolveRequest(context, name, 'ios')).toThrow();
  expect(context.resolveRequest).not.toHaveBeenCalled();
});
test('freeiphone substitutes provider and screens across import styles, blocks backend modules', () => {
  const config = load('freeiphone');
  for (const file of ['provider.tsx', 'screens.tsx']) {
    const context = { resolveRequest: () => ({ type: 'sourceFile', filePath: path.join(root, 'src/auth', file) }) };
    expect(config.resolver.resolveRequest(context, '@/auth/provider', 'ios').filePath).toBe(path.join(root, 'src/phone-only', file));
  }
  for (const file of ['src/auth/client.ts', 'src/auth/config.ts', 'src/data/sync/supabase.ts', 'src/data/sync/engine.ts', 'src/data/sync/flags.tsx', 'src/data/sync/flags.ts/helper.ts', 'node_modules/@supabase/supabase-js/index.js']) {
    const context = { resolveRequest: () => ({ type: 'sourceFile', filePath: path.join(root, file) }) };
    expect(() => config.resolver.resolveRequest(context, file.includes('node_modules') ? '@supabase/supabase-js' : './backend', 'ios')).toThrow('Backend modules are unavailable');
  }
});
test('freeiphone loads the kept photo files from core, not from auth', () => {
  const context = { resolveRequest: () => ({ type: 'sourceFile', filePath: path.join(root, 'src/auth/owner-files.ts') }) };
  expect(load('freeiphone').resolver.resolveRequest(context, '@/auth/owner-files', 'ios').filePath)
    .toBe(path.join(root, 'src/core/owner-files.ts'));
  expect(load('freeiphone').resolver.resolveRequest(context, './owner-files', 'ios').filePath)
    .toBe(path.join(root, 'src/core/owner-files.ts'));
});
test('freeiphone substitutes workout AI transport before it can load auth or backend modules', () => {
  const context = { resolveRequest: () => ({ type: 'sourceFile', filePath: path.join(root, 'src/features/workout/ai/client.ts') }) };
  expect(load('freeiphone').resolver.resolveRequest(context, './client', 'ios').filePath)
    .toBe(path.join(root, 'src/phone-only/workout-ai-client.ts'));
});
