import path from 'node:path';
import fs from 'node:fs';
import ts from 'typescript';
jest.mock('expo/metro-config', () => ({ getDefaultConfig: () => ({ resolver: {} }) }));
const root = path.resolve(__dirname, '..');
function load(variant?: string) {
  const before = process.env.APP_VARIANT;
  if (variant) process.env.APP_VARIANT = variant; else delete process.env.APP_VARIANT;
  let result: any;
  try { jest.isolateModules(() => { result = require('../metro.config.js'); }); }
  finally { if (before === undefined) delete process.env.APP_VARIANT; else process.env.APP_VARIANT = before; }
  return result;
}
test('default Metro resolution remains unchanged', () => {
  expect(load().resolver.resolveRequest).toBeUndefined();
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
