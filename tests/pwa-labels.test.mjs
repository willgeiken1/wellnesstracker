import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const cssDir = new URL('../logger/css/', import.meta.url);
const labelSelector = /(?:\.brief-k|\.week-k|\.wk-stand\s+b|\.mc-g|\.side-l|\.aff-out|\.hw-k|\.rpe-l|\.tab(?:\b|\[)|\.week-stat\s+span|\.wk-row-t\s+span|\.brief-l)(?![\w-])/;

// Reintroducing uppercase, tracking, or a tiny override must fail even when
// another stylesheet later masks it. Scan every CSS file, including media rules.
for (const file of readdirSync(cssDir).filter((name) => name.endsWith('.css'))) {
  const css = readFileSync(new URL(file, cssDir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  test(`${file}: sentence-case labels without tiny or tracked overrides`, () => {
    assert.doesNotMatch(css, /text-transform\s*:\s*uppercase\b/i, 'labels must use sentence case');
    for (const [, selector, declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!labelSelector.test(selector)) continue;
      const context = `${file}: ${selector.trim()}`;
      for (const [, size] of declarations.matchAll(/font-size\s*:\s*([\d.]+)px/gi)) {
        assert.ok(Number(size) >= 13 && Number(size) <= 15, `${context}: label size ${size}px`);
      }
      for (const [, weight] of declarations.matchAll(/font-weight\s*:\s*(\d+)/gi)) {
        assert.equal(Number(weight), 600, `${context}: labels must be semibold`);
      }
      for (const [, spacing] of declarations.matchAll(/letter-spacing\s*:\s*([^;]+)/gi)) {
        assert.match(spacing.trim(), /^(?:normal|0(?:px|em|rem)?)$/i, `${context}: no label tracking`);
      }
    }
  });
}
