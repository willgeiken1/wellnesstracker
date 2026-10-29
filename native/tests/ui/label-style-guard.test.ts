import fs from "fs";
import path from "path";
import { en } from "../../src/i18n/en";
import { tokens } from "../../src/design/tokens";

/**
 * INS-03 guard test:
 * Scans native/src for textTransform: 'uppercase' in style objects and fails if any appear.
 *
 * Allowlist policy: only true acronyms if needed, documented with rationale.
 * Currently, all UI labels are sentence-case semibold (13-15 pt) with 0 uppercase styles.
 */
const ALLOWLIST: { file: string; line: number; reason: string }[] = [];

function findSourceFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSourceFiles(fullPath));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("label style guard (INS-03)", () => {
  const srcRoot = path.resolve(__dirname, "../../src");
  const sourceFiles = findSourceFiles(srcRoot);

  test("0 textTransform: 'uppercase' in native/src style objects", () => {
    const violations: { file: string; line: number; text: string }[] = [];

    // Match textTransform with single or double quotes for uppercase
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
