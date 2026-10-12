import { expect, openApp, test } from "./fixtures/app.mjs";

test("exercise search stays put while typing and then filters in place", async ({ page }) => {
  const assertQuiet = await openApp(page);
  await page.getByRole("button", { name: "Workouts" }).click();
  await page.locator('[data-action="open-w"][data-id="push"]').click();
  await page.getByRole("button", { name: "Add exercises" }).click();
  const input = page.locator("#pick-q");
  const card = page.locator(".sheet-card.bank");
  await expect(input).toBeVisible();
  await expect(card).toBeVisible();

  const tall = await card.evaluate((el) => el.getBoundingClientRect().height);
  expect(tall).toBeGreaterThan(300);

  await page.evaluate(() => {
    window.__sheetRenders = 0;
    window.__scrolls = 0;
    window.__listWrites = 0;
    const sheet = window.app.renderSheet;
    window.app.renderSheet = function (...args) {
      window.__sheetRenders += 1;
      return sheet.apply(this, args);
    };
    const scroll = window.scrollTo.bind(window);
    window.scrollTo = function (...args) {
      window.__scrolls += 1;
      return scroll(...args);
    };
    // noteBankQuery calls the module's refreshBankList directly, so count DOM writes.
    const body = document.getElementById("pk-body");
    new MutationObserver(() => { window.__listWrites += 1; }).observe(body, { childList: true });
  });

  const inputHandle = await input.elementHandle();
  const cardHandle = await card.elementHandle();
  await input.pressSequentially("bensh", { delay: 20 });
  const early = await page.evaluate(() => ({
    filtered: !!document.querySelector("#pk-body [data-filter]"),
    writes: window.__listWrites,
    renders: window.__sheetRenders,
  }));
  expect(early.filtered).toBe(false);
  expect(early.writes).toBe(0);
  expect(early.renders).toBe(0);

  await expect(page.locator('#pk-body [data-filter="1"]')).toBeVisible();
  await expect(page.locator("#pk-body")).toContainText("Bench Press");

  const stable = await page.evaluate(({ field, sheetCard }) => ({
    renders: window.__sheetRenders,
    scrolls: window.__scrolls,
    writes: window.__listWrites,
    sameInput: document.getElementById("pick-q") === field,
    sameCard: document.querySelector(".sheet-card") === sheetCard,
    active: document.activeElement === document.getElementById("pick-q"),
    scrollY: window.scrollY,
    cardTop: document.querySelector(".sheet-card").scrollTop,
    position: getComputedStyle(document.getElementById("pick-q")).position,
    height: document.querySelector(".sheet-card").getBoundingClientRect().height,
  }), { field: inputHandle, sheetCard: cardHandle });
  expect(stable.renders).toBe(0);
  expect(stable.scrolls).toBe(0);
  expect(stable.writes).toBe(1);
  expect(stable.sameInput).toBe(true);
  expect(stable.sameCard).toBe(true);
  expect(stable.active).toBe(true);
  expect(stable.scrollY).toBe(0);
  expect(stable.cardTop).toBe(0);
  expect(stable.position).not.toBe("sticky");
  expect(stable.position).not.toBe("fixed");
  expect(Math.abs(stable.height - tall)).toBeLessThan(2);

  await input.fill("barbell");
  await expect(page.locator("#pk-body")).toContainText("No matches");
  await expect(page.locator('#pk-body [data-action="bank-create"]')).toHaveAttribute("data-name", "barbell");
  const short = await card.evaluate((el) => el.getBoundingClientRect().height);
  expect(Math.abs(short - tall)).toBeLessThan(2);
  const afterEquipment = await page.evaluate(() => window.__sheetRenders);
  expect(afterEquipment).toBe(0);

  await input.fill("chest");
  await expect(page.locator('#pk-body [data-name="Bench Press"]')).toBeVisible();

  await input.fill("zzzzqq");
  await expect(page.locator('#pk-body [data-action="bank-create"]')).toContainText("Create zzzzqq");
  await page.locator('[data-action="bank-create"]').click();
  await page.locator('[data-action="sheet-close"]').last().click();
  await expect(page.locator("#elist")).toContainText("zzzzqq");
  assertQuiet();
});

test("a freestyle workout can log a set and be saved as a routine", async ({ page }) => {
  const assertQuiet = await openApp(page);
  await expect(page.getByRole("button", { name: "Empty workout" })).toBeVisible();
  await page.locator(".wk.today").click();
  await expect(page.locator("#sheet").getByRole("button", { name: "Empty workout" })).toBeVisible();
  await page.locator("#sheet [data-action='sheet-close']").last().click();

  await page.getByRole("button", { name: "Workouts" }).click();
  const start = page.getByRole("button", { name: "Start freestyle workout" });
  await expect(start).toBeVisible();
  const startBox = await start.boundingBox();
  const cardBox = await page.locator(".wcard").first().boundingBox();
  expect(startBox.y).toBeLessThan(cardBox.y);
  await start.click();
  await expect(page.locator("#workout .wo-title h2")).toHaveText("Freestyle");
  const save = page.locator(".wo-top [data-action='save-routine']");
  await expect(save).toBeVisible();
  await expect(save).toHaveText("Save as routine");
  await page.locator('[data-action="live-add-open"]').click();
  await expect(page.locator("#add-routine")).toHaveCount(0);
  const input = page.locator("#pick-q");
  await input.pressSequentially("bench", { delay: 15 });
  await expect(page.locator('#pk-body [data-name="Bench Press"]')).toBeVisible();
  await page.locator('#pk-body [data-name="Bench Press"]').click();
  await page.locator(".sheet-card.bank").getByRole("button", { name: "Done" }).click();
  await expect(page.locator("#w-0")).toBeVisible();
  await page.locator("#w-0").fill("100");
  await page.locator("#r-0").fill("8");
  await page.locator('[data-action="log"]').click();
  await expect(page.locator("#workout .set-v").first()).toContainText("100");

  await expect(save).toBeVisible();
  await save.click();
  await expect(page.locator("#dlg-in")).toBeVisible();
  await page.locator("#dlg-in").fill("Saturday Lift");
  await page.locator('[data-action="dlg-ok"]').click();
  await expect(page.locator("#toast")).toContainText("Saved Saturday Lift");
  await expect(page.locator("#workout .wo-title h2")).toHaveText("Saturday Lift");

  await page.locator('[data-action="finish"]').click();
  await expect(page.locator("#dialog")).toContainText("Finish Saturday Lift?");
  await page.locator('[data-action="dlg-ok"]').click();
  await expect(page.locator("#sheet")).toContainText("Saturday Lift done");
  await expect(page.locator("#sheet")).toContainText("Save as routine");
  await page.locator("#sheet").getByRole("button", { name: "Done" }).click();

  await expect(page.locator('[data-action="open-w"][data-id="saturday-lift"]')).toContainText("Saturday Lift");
  await page.locator('[data-action="open-w"][data-id="saturday-lift"]').click();
  await expect(page.locator("#elist")).toContainText("Bench Press");
  await expect(page.locator("#elist")).toContainText("100 × 8");
  assertQuiet();
});
