import { t, pluralize, workingSetsPhrase } from "../src/i18n/en";
test.each([
  [0, "0 sets"],
  [1, "1 set"],
  [3, "3 sets"],
])("pluralizes set count %s", (count, expected) =>
  expect(pluralize(Number(count), "set")).toBe(expected),
);
test("count copy covers tokens, exercises, reps and invariant left", () => {
  expect(pluralize(1, "token")).toBe("1 token");
  expect(pluralize(7, "token")).toBe("7 tokens");
  expect(pluralize(1, "exercise")).toBe("1 exercise");
  expect(pluralize(2, "rep")).toBe("2 reps");
  expect(pluralize(1, "left")).toBe("1 left");
  expect(pluralize(2, "left")).toBe("2 left");
  expect(workingSetsPhrase(1)).toBe("on your 1 working set");
  expect(workingSetsPhrase(2)).toBe("on both sets");
  expect(workingSetsPhrase(3)).toBe("on all 3 working sets");
});

test('summary limit hint explains charged cancellations and regenerations', () => {
  expect(t('workoutAiLimitHint')).toBe('5 summaries per day. Each regeneration uses one summary. A cancelled summary still counts toward the daily limit.');
});
