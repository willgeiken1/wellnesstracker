// Every spec under logger/tests/e2e, including subfolders, must take `test`
// from fixtures/app.mjs. Helper re-exports are followed. guard.spec.mjs is the
// exception: it is the file allowed to call newContext() to prove the wrapper.
// A newContext( call anywhere else outside fixtures/ fails this check.
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

const FROM_RE = /\b(?:import|export)\s+([\s\S]*?)\sfrom\s*["']([^"']+)["']/g;
const NEW_CONTEXT_RE = /\bnewContext\s*\(/;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

function mentionsRemoteTest(clause) {
  const brace = clause.match(/\{([^}]*)\}/);
  if (brace) {
    for (const part of brace[1].split(",")) {
      const match = part.trim().match(/^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+[A-Za-z_$][\w$]*)?$/);
      if (match && match[1] === "test") return true;
    }
  }
  const withoutBrace = clause.replace(/\{[^}]*\}/g, " ");
  return /(?:^|[^\w$])test\s*(?:,|$)/.test(withoutBrace);
}

function namespaceBinding(clause) {
  const match = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
  return match ? match[1] : null;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    // This file embeds sample import text for its self-test. It is not a spec.
    else if (name !== "check-imports.mjs" && /\.(mjs|js|cjs)$/.test(name)) out.push(path);
  }
  return out;
}

function resolveSpec(fromFile, spec) {
  if (!spec.startsWith(".")) return { kind: "package", spec };
  let target = resolve(dirname(fromFile), spec);
  if (!existsSync(target)) {
    if (existsSync(target + ".mjs")) target += ".mjs";
    else if (existsSync(target + ".js")) target += ".js";
    else if (existsSync(join(target, "index.mjs"))) target = join(target, "index.mjs");
  }
  return { kind: "file", path: target };
}

function statements(text) {
  const found = [];
  FROM_RE.lastIndex = 0;
  let match;
  while ((match = FROM_RE.exec(text))) found.push({ clause: match[1], spec: match[2] });
  return found;
}

function isAppFixture(path) {
  return path.endsWith(`${sep}fixtures${sep}app.mjs`);
}

function isGuardSpec(path) {
  return path.endsWith(`${sep}guard.spec.mjs`) || path === "guard.spec.mjs";
}

function underFixtures(root, path) {
  const rel = relative(root, path);
  return rel === "fixtures" || rel.startsWith(`fixtures${sep}`);
}

function testSource(path, read, seen) {
  if (seen.has(path)) return { kind: "cycle", path };
  seen.add(path);
  if (isAppFixture(path)) return { kind: "app", path };
  const text = stripComments(read(path));
  const found = [];
  for (const stmt of statements(text)) {
    if (!mentionsRemoteTest(stmt.clause)) continue;
    const resolved = resolveSpec(path, stmt.spec);
    if (resolved.kind === "package") {
      found.push(resolved.spec === "@playwright/test"
        ? { kind: "playwright", path, spec: resolved.spec }
        : { kind: "other", path, spec: resolved.spec });
    } else if (!existsSync(resolved.path)) {
      found.push({ kind: "missing", path, spec: stmt.spec });
    } else {
      found.push(testSource(resolved.path, read, seen));
    }
  }
  for (const stmt of statements(text)) {
    if (stmt.spec !== "@playwright/test") continue;
    const name = namespaceBinding(stmt.clause);
    if (name && new RegExp(`(?:^|[^\\w$])${name}\\.test\\b`).test(text)) {
      found.push({ kind: "playwright", path, spec: "@playwright/test" });
    }
  }
  return found.find((source) => source.kind !== "app") || found[0] || { kind: "none", path };
}

export function auditImports(root, read = (path) => readFileSync(path, "utf8"), list = () => walk(root)) {
  const violations = [];
  for (const path of list()) {
    const rel = relative(root, path);
    const text = stripComments(read(path));
    if (!isGuardSpec(path) && !underFixtures(root, path) && NEW_CONTEXT_RE.test(text)) {
      violations.push(`${rel}: newContext( is only allowed in fixtures/ and guard.spec.mjs. Use the app fixture's browser so the service-worker check and network guard always apply.`);
    }
    if (isAppFixture(path) || isGuardSpec(path)) continue;
    const source = testSource(path, read, new Set());
    const spec = path.endsWith(".spec.mjs");
    if (source.kind === "none") {
      if (spec) violations.push(`${rel}: must import test from fixtures/app.mjs (directly or through a helper that re-exports it).`);
      continue;
    }
    if (source.kind !== "app") {
      violations.push(`${rel}: test must come from fixtures/app.mjs, not ${source.kind}${source.spec ? ` (${source.spec})` : ""}.`);
    }
  }
  return violations;
}

export function selfTestImportAudit() {
  const root = mkdtempSync(join(tmpdir(), "insight-import-audit-"));
  const write = (rel, body) => {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  };
  try {
    write("fixtures/app.mjs", 'import { test as base } from "@playwright/test";\nexport const test = base;\n');
    write("good.spec.mjs", 'import { test } from "./fixtures/app.mjs";\n');
    write("helper.mjs", 'export { test } from "./fixtures/app.mjs";\n');
    write("nested/deep.spec.mjs", 'import { test } from "../helper.mjs";\n');
    write("guard.spec.mjs", 'import { test } from "@playwright/test";\nawait browser.newContext();\n');
    write("expect-only.mjs", 'import { expect } from "@playwright/test";\n');
    const clean = auditImports(root);
    if (clean.length) throw new Error("import audit self-test flagged a good tree:\n" + clean.join("\n"));

    write("bad.spec.mjs", 'import { test } from "@playwright/test";\n');
    write("nested/raw.spec.mjs", 'import { test } from "../fixtures/app.mjs";\nawait browser.newContext();\n');
    write("reexport.mjs", 'export { test } from "@playwright/test";\n');
    write("uses-reexport.spec.mjs", 'import { test } from "./reexport.mjs";\n');
    write("expect-only.spec.mjs", 'import { expect } from "@playwright/test";\n');
    const bad = auditImports(root).join("\n");
    const flagged = (name) => bad.split("\n").some((line) => line.startsWith(name + ":"));
    for (const needle of ["bad.spec.mjs", "nested/raw.spec.mjs", "reexport.mjs", "uses-reexport.spec.mjs", "expect-only.spec.mjs"]) {
      if (!flagged(needle)) throw new Error(`import audit self-test missed ${needle}:\n${bad}`);
    }
    for (const good of ["good.spec.mjs", "nested/deep.spec.mjs", "guard.spec.mjs", "helper.mjs", "expect-only.mjs", "fixtures/app.mjs"]) {
      if (flagged(good)) throw new Error("import audit self-test flagged a good file:\n" + bad);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function assertSpecsUseAppFixture(root) {
  selfTestImportAudit();
  const violations = auditImports(root);
  if (!violations.length) return;
  const error = new Error("pw:smoke import check failed:\n" + violations.join("\n"));
  error.violations = violations;
  throw error;
}
