import { expect, openApp, signIn, test } from "./fixtures/app.mjs";

// Synthetic values only. The name, the amount, the unit and the time below are
// typed by the test. The sheet must never fill one in by itself.
const MORNING = "block_default_morning";
const ITEM_NAME = "Synthetic item";

// The sun path's own mapping (ARC in daily-routines-sheet-parts.js): 05:00 to
// 23:00 over a 300-wide view, centre 150, radius 130, in 5 minute steps.
function clockAt(clientX, rect) {
  const x = ((clientX - rect.left) / rect.width) * 300;
  const cos = Math.max(-1, Math.min(1, (x - 150) / 130));
  const raw = 300 + 1080 * (1 - Math.acos(cos) / Math.PI);
  const minutes = Math.max(300, Math.min(1380, Math.round(raw / 5) * 5));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function onFiveMinuteGrid(clock) {
  const match = /^(\d{2}):(\d{2})$/.exec(clock);
  return !!match && Number(match[2]) % 5 === 0;
}

// The nodes that must survive an update in place. A full redraw of the sheet
// would replace every one of them.
async function keepNodes(page) {
  await page.evaluate(() => {
    window.__e2eKept = {
      sheet: document.querySelector("#dr-item-sheet"),
      name: document.querySelector("#dr-item-name"),
      amount: document.querySelector("#dr-item-amount"),
      arc: document.querySelector("#dr-item-arc"),
    };
  });
}

async function keptNodes(page) {
  return page.evaluate(() => {
    const kept = window.__e2eKept || {};
    return {
      sheet: kept.sheet === document.querySelector("#dr-item-sheet"),
      name: kept.name === document.querySelector("#dr-item-name"),
      amount: kept.amount === document.querySelector("#dr-item-amount"),
      arc: kept.arc === document.querySelector("#dr-item-arc"),
    };
  });
}

const ALL_KEPT = { sheet: true, name: true, amount: true, arc: true };

test("Add item updates in place: focus, steps, the sun path and the calculator's Back", async ({ page }) => {
  const assertQuiet = await openApp(page);
  await signIn(page);

  // The first visit offers the setup quiz in a sheet. This test is about the
  // item sheet, so the quiz is put off the same way "Not now" puts it off.
  await page.evaluate(() => { window.app.ui.routineSetupLater = true; });
  await page.locator('[data-action="tab"][data-tab="daily-routines"]').click();
  await expect(page.locator('#pane-daily-routines .dr-page[data-routines-shell="signed-in"]')).toBeVisible();
  await page.waitForFunction((blockId) => {
    const app = window.app;
    const store = app && app.state && app.state.dailyRoutines;
    return !!app && app.cloudPullOk === true && !!store && Array.isArray(store.blocks) && store.blocks.some((block) => block.id === blockId);
  }, MORNING);

  // Open Add item from the Morning routine's own button when the page shows
  // one, and through the same entry point the button calls when it does not.
  const addButton = page.locator(`#pane-daily-routines [data-action="routines-add-item"][data-block-id="${MORNING}"]`);
  if (await addButton.count()) await addButton.first().dispatchEvent("click");
  else await page.evaluate((blockId) => { window.app.openRoutineItemEditor(blockId); }, MORNING);

  const sheet = page.locator("#dr-item-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("h3")).toHaveText("Add item");
  const name = page.locator("#dr-item-name");
  const amount = page.locator("#dr-item-amount");
  const time = page.locator("#dr-item-time");
  const sum = page.locator("#dr-item-sum");
  const doseCard = page.locator("#dr-item-dose");

  // A new item starts empty: nothing is prefilled.
  await expect(name).toHaveValue("");
  await expect(amount).toHaveValue("");
  await expect(time).toHaveValue("");
  await expect(doseCard).toHaveAttribute("data-open", "false");
  await expect(doseCard.locator('[data-action="routines-item-unit"][aria-pressed="true"]')).toHaveCount(0);

  // Picking Dose while the name is being typed. On a phone a tap on a button
  // leaves the keyboard up, so the click is sent without moving focus. The
  // name field must be the same node, still focused, with its text.
  await name.fill(ITEM_NAME);
  await expect(name).toBeFocused();
  await keepNodes(page);
  await page.locator('[data-action="routines-item-kind"][data-kind="dose"]').dispatchEvent("click");
  await expect(doseCard).toHaveAttribute("data-open", "true");
  await expect(page.locator('[data-action="routines-item-kind"][data-kind="dose"]')).toHaveAttribute("aria-checked", "true");
  expect(await keptNodes(page)).toEqual(ALL_KEPT);
  await expect(name).toBeFocused();
  await expect(name).toHaveValue(ITEM_NAME);
  await expect(sum).toHaveText("Type an amount or use the steps.");
  await expect(sum).toHaveClass(/dr-is-sum-wait/);

  // A unit and a typed 0 still ask for an amount, and still look like it.
  const mcg = doseCard.locator('[data-action="routines-item-unit"][data-unit="mcg"]');
  await mcg.click();
  await expect(mcg).toHaveAttribute("aria-pressed", "true");
  await amount.fill("0");
  await expect(sum).toHaveText("Type an amount or use the steps.");
  await expect(sum).toHaveClass(/dr-is-sum-wait/);

  // A step from the keyboard: the row of steps is redrawn in place and focus
  // stays on the step that was pressed.
  const addQuarter = doseCard.locator('[data-action="routines-item-step"][data-delta="0.25"]');
  await expect(addQuarter).toBeVisible();
  await addQuarter.focus();
  await expect(addQuarter).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(amount).toHaveValue("¼");
  await expect(addQuarter).toBeFocused();
  expect(await keptNodes(page)).toEqual(ALL_KEPT);
  await page.keyboard.press("Enter");
  await expect(amount).toHaveValue("½");
  await expect(addQuarter).toBeFocused();
  await expect(sum).toHaveText("Logs ½ mcg each time.");
  await expect(sum).not.toHaveClass(/dr-is-sum-wait/);
  expect(await keptNodes(page)).toEqual(ALL_KEPT);
  await expect(name).toHaveValue(ITEM_NAME);

  // The sun path: a press, a drag and a tap each set the Time field, always
  // on the 5 minute grid.
  const arc = page.locator("#dr-item-arc");
  await arc.scrollIntoViewIfNeeded();
  const rect = await arc.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  });
  expect(rect.width).toBeGreaterThan(200);
  const y = Math.round(rect.top + rect.height * 0.5);
  const pressX = Math.round(rect.left + rect.width * 0.5);
  const dragX = Math.round(rect.left + rect.width * 0.75);
  const tapX = Math.round(rect.left + rect.width * 0.3);
  const pressed = clockAt(pressX, rect);
  const dragged = clockAt(dragX, rect);
  const tapped = clockAt(tapX, rect);
  for (const clock of [pressed, dragged, tapped]) expect(onFiveMinuteGrid(clock)).toBe(true);
  expect(new Set([pressed, dragged, tapped]).size).toBe(3);

  await page.mouse.move(pressX, y);
  await page.mouse.down();
  await expect(time).toHaveValue(pressed);
  await page.mouse.move(dragX, y, { steps: 8 });
  await expect(time).toHaveValue(dragged);
  await page.mouse.up();
  await expect(time).toHaveValue(dragged);
  await expect(arc.locator('[data-live="arc-big"]')).toHaveText(dragged);
  await expect(arc).toHaveAttribute("aria-valuetext", dragged);

  await page.mouse.click(tapX, y);
  await expect(time).toHaveValue(tapped);
  await expect(arc.locator('[data-live="arc-big"]')).toHaveText(tapped);
  expect(await keptNodes(page)).toEqual(ALL_KEPT);
  expect(await page.evaluate(() => window.app.ui.sd.time)).toBe(tapped);

  // The calculator opens from a peptide dose and Back returns to the draft.
  const peptide = page.locator('[data-action="routines-item-type"][data-type="peptide"]');
  await peptide.click();
  await expect(peptide).toHaveAttribute("aria-pressed", "true");
  const calcLink = page.locator('[data-action="routines-item-calc"]');
  await expect(calcLink).toBeVisible();
  await calcLink.click();
  await expect(page.locator("#dr-calc-sheet")).toBeVisible();
  await expect(page.locator("#dr-item-sheet")).toHaveCount(0);
  await expect(page.locator("#dr-calc-dose")).toHaveValue("½");
  await expect(page.locator('[data-action="routines-calc-dose-unit"][data-unit="mcg"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#dr-calc-vial")).toHaveValue("");
  await expect(page.locator("#dr-calc-water")).toHaveValue("");
  await expect(page.locator("#dr-calc-sheet [aria-live]")).toHaveCount(1);
  await page.locator("#dr-calc-vial").fill("5");

  const back = page.locator('[data-action="routines-calc-back"]');
  await expect(back).toContainText("Add item");
  await back.click();
  await expect(page.locator("#dr-calc-sheet")).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("h3")).toHaveText("Add item");
  await expect(name).toHaveValue(ITEM_NAME);
  await expect(amount).toHaveValue("½");
  await expect(mcg).toHaveAttribute("aria-pressed", "true");
  await expect(time).toHaveValue(tapped);
  await expect(peptide).toHaveAttribute("aria-pressed", "true");
  await expect(doseCard).toHaveAttribute("data-open", "true");
  await expect(sum).toHaveText("Logs ½ mcg each time.");
  await expect(page.locator(`[data-action="routines-item-block"][data-block-id="${MORNING}"]`)).toHaveAttribute("aria-pressed", "true");
  const draft = await page.evaluate(() => {
    const ui = window.app.ui;
    return { sheet: ui.sheet, name: ui.sd.name, kind: ui.sd.kind, amount: ui.sd.amount, unit: ui.sd.unit, time: ui.sd.time, type: ui.sd.type, itemId: ui.sd.itemId, blockIds: ui.sd.blockIds };
  });
  expect(draft).toEqual({ sheet: "routines-item", name: ITEM_NAME, kind: "dose", amount: "0.5", unit: "mcg", time: tapped, type: "peptide", itemId: null, blockIds: [MORNING] });

  // Nothing was saved: the item only exists once Add item is pressed.
  const saved = await page.evaluate((itemName) => {
    const store = window.app.state.dailyRoutines;
    return (store.items || []).filter((item) => item.name === itemName).length;
  }, ITEM_NAME);
  expect(saved).toBe(0);
  assertQuiet();
});
