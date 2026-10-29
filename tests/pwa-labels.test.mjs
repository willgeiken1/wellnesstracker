import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { app } from '../logger/js/runtime.js';
import { addDays, correlate } from '../logger/js/shared/correlate.js';
import '../logger/js/pages/insights.js';
import '../logger/js/shared/weekly.js';

const cssDir = new URL('../logger/css/', import.meta.url);
// Add new label classes to this selector list so their styles stay covered.
const labelSelector = /(?:\.brief-k|\.week-k|\.wk-stand\s+b|\.mc-g|\.side-l|\.aff-out|\.hw-k|\.rpe-l|\.tab(?:\b|\[)|\.week-stat\s+span|\.wk-row-t\s+span|\.brief-l)(?![\w-])/;

// Reintroducing case transforms, tracking, or a tiny override must fail even when
// another stylesheet later masks it. Scan every CSS file, including media rules.
for (const file of readdirSync(cssDir).filter((name) => name.endsWith('.css'))) {
  const css = readFileSync(new URL(file, cssDir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  test(`${file}: sentence-case labels without tiny or tracked overrides`, () => {
    assert.doesNotMatch(css, /text-transform\s*:\s*(?:uppercase|capitalize|lowercase)\b/i, 'labels must use sentence case');
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

test('Insights and weekly outcome labels start with a capital letter', () => {
  const days = {};
  for (let i = 0; i < 40; i++) {
    days[addDays('2026-01-05', i)] = {
      workedOut: i % 2 === 0,
      ...(i > 0 ? { readiness: i % 2 ? 80 : 60, sleepScore: i % 2 ? 85 : 65 } : {}),
    };
  }
  const rows = correlate({ days });
  assert.ok(rows.some((r) => r.outcomeLabel === 'readiness'));
  assert.ok(rows.some((r) => r.outcomeLabel === 'sleep score'));
  const previous = { ...app };
  try {
    Object.assign(app, {
      state: { demo: true }, ui: { affectsAll: true },
      correlations: () => rows, correlationSource: () => ({ days }),
      src: () => ({ oura: days, sessions: [] }),
      today: () => '2026-01-12', esc: (s) => String(s ?? ''),
      pl: (n, word) => `${n} ${word}`, fmtDate: (date) => date,
      pageHead: () => '', demoBanner: () => '', I: { chevL: '' },
    });
    for (const [name, html] of [
      ['Insights', app.affectsHTML()],
      ['Weekly report', app.weekReportHTML('2026-01-05')],
    ]) {
      const labels = [...html.matchAll(/class="aff-out">([^<]*)<\/span>/g)].map((m) => m[1]);
      assert.ok(labels.length > 0, `${name}: expected outcome labels`);
      for (const label of labels) assert.match(label, /^[A-Z]/, `${name}: ${label}`);
      assert.ok(labels.includes('Readiness'), `${name}: Readiness`);
      assert.ok(labels.includes('Sleep score'), `${name}: Sleep score`);
    }
    assert.ok(rows.some((r) => r.outcomeLabel === 'readiness'), 'source labels stay lowercase');
  } finally {
    for (const key of Object.keys(app)) if (!(key in previous)) delete app[key];
    Object.assign(app, previous);
  }
});
