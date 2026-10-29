import fs from "fs";
import path from "path";
import { en } from "../src/i18n/en";
import { tokens } from "../src/design/tokens";

/**
 * INS-03 guard test (F2):
 * Scans native/src for:
 * 1. 0 textTransform: 'uppercase' in style objects.
 * 2. 0 letterSpacing in style objects.
 * 3. Fail on any raw fontSize < 13 in native/src.
 * 4. Require label styles to be semibold (600).
 * 5. Flag .toUpperCase() used in JSX.
 * 6. ALL-CAPS sweep test of en.ts strings.
 *
 * Allowlist policy: only true acronyms if needed, documented with rationale.
 */
const ALLOWLIST: { file: string; line: number; reason: string }[] = [];

function findSourceFiles(dir: string, extensions = /\.(tsx?|jsx?)$/): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSourceFiles(fullPath, extensions));
    } else if (extensions.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("label style guard (INS-03)", () => {
  const srcRoot = path.resolve(__dirname, "../src");
  const sourceFiles = findSourceFiles(srcRoot);

  test("0 textTransform: 'uppercase' in native/src style objects", () => {
    const violations: { file: string; line: number; text: string }[] = [];
    const uppercaseStyleRegex = /textTransform\s*:\s*['"]uppercase['"]/i;

    for (const filePath of sourceFiles) {
      const relPath = path.relative(srcRoot, filePath);
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        if (uppercaseStyleRegex.test(line)) {
          const lineNumber = index + 1;
          const isAllowlisted = ALLOWLIST.some(
            (item) => item.file === relPath && item.line === lineNumber
          );
          if (!isAllowlisted) {
            violations.push({
              file: `native/src/${relPath}`,
              line: lineNumber,
              text: line.trim(),
            });
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });

  test("0 letterSpacing in native/src style objects (no tracked uppercase labels)", () => {
    const violations: { file: string; line: number; text: string }[] = [];
    const letterSpacingRegex = /letterSpacing\s*:\s*[\d.]+/;

    for (const filePath of sourceFiles) {
      const relPath = path.relative(srcRoot, filePath);
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        if (letterSpacingRegex.test(line)) {
          violations.push({
            file: `native/src/${relPath}`,
            line: index + 1,
            text: line.trim(),
          });
        }
      });
    }

    expect(violations).toEqual([]);
  });

  test("fail on any raw fontSize < 13 in native/src", () => {
    const violations: { file: string; line: number; text: string; size: number }[] = [];
    const fontSizeRegex = /fontSize\s*:\s*([^,}\n;]+)/g;

    for (const filePath of sourceFiles) {
      const relPath = path.relative(srcRoot, filePath);
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        // Strip single-line comments
        const codeLine = line.replace(/\/\/.*$/, "");
        let match: RegExpExecArray | null;
        while ((match = fontSizeRegex.exec(codeLine)) !== null) {
          const valExpr = match[1].trim();
          // Find any numeric literals in the value expression (e.g. 12, 11, or ternary 11 : 14)
          const numberMatches = valExpr.match(/(?<![a-zA-Z0-9_$.])(\d+(?:\.\d+)?)/g);
          if (numberMatches) {
            for (const numStr of numberMatches) {
              const size = parseFloat(numStr);
              if (size < 13) {
                violations.push({
                  file: `native/src/${relPath}`,
                  line: index + 1,
                  text: line.trim(),
                  size,
                });
              }
            }
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });

  test("require label styles to be semibold (600)", () => {
    // 1. Check Eyebrow in primitives.tsx specifies semibold (600)
    const primitivesPath = path.join(srcRoot, "features/workout/primitives.tsx");
    const primitivesContent = fs.readFileSync(primitivesPath, "utf-8");
    const eyebrowMatch = primitivesContent.match(/export function Eyebrow[\s\S]*?return\s*\([\s\S]*?<\/ThemedText>/);
    expect(eyebrowMatch).toBeTruthy();
    expect(eyebrowMatch![0]).toMatch(/fontWeight\s*:\s*['"]600['"]/);
    expect(eyebrowMatch![0]).toMatch(/fontSize\s*:\s*tokens\.type\.caption/);

    // 2. Check active.tsx column header labels specify semibold (600)
    const activePath = path.join(srcRoot, "features/workout/active.tsx");
    const activeContent = fs.readFileSync(activePath, "utf-8");
    const headerRowStart = activeContent.indexOf('{t("setHeader")}');
    const headerRowEnd = activeContent.indexOf('{t("repsHeader")}') + 200;
    expect(headerRowStart).toBeGreaterThan(-1);
    expect(headerRowEnd).toBeGreaterThan(headerRowStart);
    const headerRowBlock = activeContent.slice(headerRowStart - 300, headerRowEnd);

    const headers = ['{t("setHeader")}', '{t("previous")}', "{store.unit(e.id)}", '{t("repsHeader")}'];
    for (const header of headers) {
      const headerPos = headerRowBlock.indexOf(header);
      expect(headerPos).toBeGreaterThan(-1);
      const precedingBlock = headerRowBlock.slice(Math.max(0, headerPos - 300), headerPos);
      expect(precedingBlock).toMatch(/fontWeight\s*:\s*['"]600['"]/);
      expect(precedingBlock).toMatch(/fontSize\s*:\s*tokens\.type\.caption/);
    }

    // 3. Check summary.tsx stat labels specify semibold (600)
    const summaryPath = path.join(srcRoot, "features/workout/summary.tsx");
    const summaryContent = fs.readFileSync(summaryPath, "utf-8");
    const statLabelsBlock = summaryContent.slice(
      summaryContent.indexOf('t("time")'),
      summaryContent.indexOf('</Panel>')
    );
    expect(statLabelsBlock).toMatch(/fontWeight\s*:\s*['"]600['"]/);
    expect(statLabelsBlock).toMatch(/fontSize\s*:\s*tokens\.type\.caption/);
  });

  test("flag .toUpperCase() used in JSX", () => {
    const jsxFiles = findSourceFiles(srcRoot, /\.(tsx|jsx)$/);
    const violations: { file: string; line: number; text: string }[] = [];

    // Match .toUpperCase() inside JSX expressions: { ... .toUpperCase() ... }
    const jsxToUpperRegex = /\{[^}]*\.toUpperCase\(\)[^}]*\}/;

    for (const filePath of jsxFiles) {
      const relPath = path.relative(srcRoot, filePath);
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, index) => {
        const codeLine = line.replace(/\/\/.*$/, "");
        if (jsxToUpperRegex.test(codeLine)) {
          violations.push({
            file: `native/src/${relPath}`,
            line: index + 1,
            text: line.trim(),
          });
        }
      });
    }

    expect(violations).toEqual([]);
  });

  test("ALL-CAPS sweep test of en.ts strings", () => {
    // True acronyms are preserved (e.g. PR for Personal Record)
    const ALLOWLIST_KEYS = new Set(["prs", "insightsHrv"]);
    expect(en.insightsHrv).toBe("HRV"); // Heart rate variability is a true acronym.
    const violations: { key: string; value: string }[] = [];

    for (const [key, value] of Object.entries(en)) {
      if (typeof value === "string") {
        // Strip non-letter characters
        const letters = value.replace(/[^a-zA-Z]/g, "");
        // If string contains at least 2 letters and all letters are uppercase
        if (letters.length >= 2 && letters === letters.toUpperCase()) {
          if (!ALLOWLIST_KEYS.has(key)) {
            violations.push({ key, value });
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("source label strings in en.ts are sentence case", () => {
    expect(en.setHeader).toBe("Set");
    expect(en.previous).toBe("Previous");
    expect(en.repsHeader).toBe("Reps");
    expect(en.lastTime).toBe("Last time");
    expect(en.template).toBe("Template");
    expect(en.workoutComplete).toBe("Workout complete");
    // True acronyms are preserved
    expect(en.prs).toBe("PR");
  });

  test("tokens.type.caption step is 13-15 pt", () => {
    expect(tokens.type.caption).toBeGreaterThanOrEqual(13);
    expect(tokens.type.caption).toBeLessThanOrEqual(15);
  });
});
