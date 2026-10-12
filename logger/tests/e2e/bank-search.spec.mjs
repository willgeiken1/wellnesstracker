import { expect, openApp, test } from "./fixtures/app.mjs";

async function touchDragHandle(page, handle, endY, browserName) {
  const box = await handle.boundingBox();
  if (!box) throw new Error("drag handle is not visible");
  const x = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;
  if (browserName !== "webkit") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0, id: 1 }] });
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y0 + ((endY - y0) * i) / steps, id: 1 }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    return;
  }
  await handle.evaluate((el, y1) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y0 = r.top + r.height / 2;
    const pid = 7;
    const fire = (type, y, buttons) => el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: pid, pointerType: "touch",
      clientX: x, clientY: y, isPrimary: true, button: 0, buttons,
    }));
    fire("pointerdown", y0, 1);
    const steps = 12;
    for (let i = 1; i <= steps; i++) fire("pointermove", y0 + ((y1 - y0) * i) / steps, 1);
    fire("pointerup", y1, 0);
  }, endY);
}

async function touchSwipeRow(page, row, browserName) {
  const head = row.locator(".ex-head");
  const box = await head.boundingBox();
  if (!box) throw new Error("exercise row is not visible");
  const y = box.y + box.height / 2;
  const x0 = box.x + Math.min(box.width * 0.75, box.width - 8);
  const x1 = x0 - 140;
  if (browserName !== "webkit") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y, id: 1 }] });
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y, id: 1 }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    return;
  }
  await head.evaluate((el, x1) => {
    const r = el.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const x0 = r.left + Math.min(r.width * 0.75, r.width - 8);
    const pid = 8;
    const fire = (type, x, buttons) => el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: pid, pointerType: "touch",
      clientX: x, clientY: y, isPrimary: true, button: 0, buttons,
    }));
    fire("pointerdown", x0, 1);
    const steps = 8;
    for (let i = 1; i <= steps; i++) fire("pointermove", x0 + ((x1 - x0) * i) / steps, 1);
    fire("pointerup", x1, 0);
  }, x1);
}

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
  await expect(page.locator("#pk-body")).toContainText("Search for the movement");
  await expect(page.locator("#pk-body")).toContainText("left out");
  await expect(page.locator('#pk-body [data-action="bank-create"]')).toHaveCount(0);
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
  await expect(page.locator("#dlg-in")).toHaveValue("");
  await page.locator("#dlg-in").fill("Saturday Lift");
  await page.locator('[data-action="dlg-ok"]').click();
  await expect(page.locator("#toast")).toContainText("Saved Saturday Lift");
  await expect(page.locator("#workout .wo-title h2")).toHaveText("Saturday Lift");

  await save.click();
  await expect(page.getByRole("button", { name: "Update Saturday Lift" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as new copy" })).toBeVisible();
  await page.getByRole("button", { name: "Update Saturday Lift" }).click();
  await expect(page.locator("#toast")).toContainText("Updated Saturday Lift");

  await page.locator('[data-action="finish"]').click();
  await expect(page.locator("#dialog")).toContainText("Finish Saturday Lift?");
  await page.locator('[data-action="dlg-ok"]').click();
  await expect(page.locator("#sheet")).toContainText("Saturday Lift done");
  await expect(page.locator("#sheet")).toContainText("Save as routine");
  await page.locator("#sheet").getByRole("button", { name: "Done" }).click();

  await expect(page.locator('[data-action="open-w"][data-id="saturday-lift"]')).toHaveCount(1);
  await page.locator('[data-action="open-w"][data-id="saturday-lift"]').click();
  await expect(page.locator("#elist")).toContainText("Bench Press");
  await expect(page.locator("#elist")).toContainText("100 × 8");
  assertQuiet();
});

test("finishing an unsaved freestyle offers a name or Not now", async ({ page }) => {
  const assertQuiet = await openApp(page);
  await page.getByRole("button", { name: "Workouts" }).click();
  await page.getByRole("button", { name: "Start freestyle workout" }).click();
  await page.locator('[data-action="live-add-open"]').click();
  await page.locator("#pick-q").fill("bench");
  await expect(page.locator('#pk-body [data-name="Bench Press"]')).toBeVisible();
  await page.locator('#pk-body [data-name="Bench Press"]').click();
  await page.locator(".sheet-card.bank").getByRole("button", { name: "Done" }).click();
  await page.locator("#w-0").fill("100");
  await page.locator("#r-0").fill("8");
  await page.locator('[data-action="log"]').click();

  await page.locator('[data-action="finish"]').click();
  await expect(page.locator("#dialog")).toContainText("Finish Freestyle?");
  await page.locator('[data-action="dlg-ok"]').click();
  await expect(page.locator("#dlg-in")).toBeVisible();
  await expect(page.locator("#dlg-in")).toHaveValue("");
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.locator("#sheet")).toContainText("Freestyle done");
  await expect(page.locator("#sheet")).toContainText("Save as routine");

  await page.locator("#sheet [data-action='save-routine']").click();
  await expect(page.locator("#dialog")).toContainText("Save as routine");
  await expect(page.getByRole("button", { name: "Save as new copy" })).toHaveCount(0);
  await expect(page.locator("#dlg-in")).toHaveValue("");
  await page.locator("#dlg-in").fill("Sunday Lift");
  await page.locator('[data-action="dlg-ok"]').click();
  await expect(page.locator("#toast")).toContainText("Saved Sunday Lift");

  await page.locator("#sheet [data-action='save-routine']").click();
  await expect(page.getByRole("button", { name: "Update Sunday Lift" })).toBeVisible();
  await page.getByRole("button", { name: "Save as new copy" }).click();
  await expect(page.locator("#dlg-in")).toBeVisible();
  await expect(page.locator("#dlg-in")).toHaveValue("");
  await page.locator("#dlg-in").fill("Sunday Copy");
  await page.locator('[data-action="dlg-ok"]').click();
  await expect(page.locator("#toast")).toContainText("Saved Sunday Copy");
  await page.locator("#sheet").getByRole("button", { name: "Done" }).click();

  await page.locator('[data-action="wseg"][data-seg="routines"]').click();
  await expect(page.locator('[data-action="open-w"][data-id="sunday-lift"]')).toContainText("Sunday Lift");
  await expect(page.locator('[data-action="open-w"][data-id="sunday-copy"]')).toContainText("Sunday Copy");
  await page.locator('[data-action="open-w"][data-id="sunday-lift"]').click();
  await expect(page.locator("#elist")).toContainText("Bench Press");
  await expect(page.locator("#elist")).toContainText("100 × 8");
  await page.locator('[data-action="close-w"]').click();
  await page.locator('[data-action="wseg"][data-seg="history"]').click();
  await expect(page.locator(".hist-t")).toHaveText("Sunday Copy");
  await expect(page.locator(".hist")).not.toContainText("Freestyle");
  assertQuiet();
});

test("freestyle reorder, remove, manual rest, and reload resume", async ({ page, browserName }) => {
  const assertQuiet = await openApp(page);
  await page.getByRole("button", { name: "Workouts" }).click();
  await page.getByRole("button", { name: "Start freestyle workout" }).click();

  async function addExercise(query, name) {
    await page.locator('[data-action="live-add-open"]').click();
    await page.locator("#pick-q").fill(query);
    await expect(page.locator(`#pk-body [data-name="${name}"]`)).toBeVisible();
    await page.locator(`#pk-body [data-name="${name}"]`).click();
    await page.locator(".sheet-card.bank").getByRole("button", { name: "Done" }).click();
  }
  await addExercise("bench", "Bench Press");
  await page.locator(".ex-head", { hasText: "Bench Press" }).click();
  await addExercise("pull-up", "Pull-Up");
  await expect(page.locator("#wo-list .ex-name")).toHaveText(["Bench Press", "Pull-Up"]);

  const first = page.locator("#wo-list .handle").first();
  const target = await page.locator("#wo-list .ex").nth(1).boundingBox();
  await touchDragHandle(page, first, target.y + target.height - 4, browserName);
  await expect(page.locator("#wo-list .ex-name")).toHaveText(["Pull-Up", "Bench Press"]);

  await page.locator(".ex", { hasText: "Bench Press" }).locator(".ex-head").click();
  const open = page.locator(".ex.open");
  await open.locator("input[id^='w-']").fill("100");
  await open.locator("input[id^='r-']").first().fill("8");
  await open.locator('[data-action="log"]').click();
  await expect(open).toContainText("100 × 8");
  await expect(page.locator("#timer")).toBeHidden();

  await page.locator('[data-action="start-rest"]').click();
  await expect(page.locator("#timer")).toBeVisible();
  await expect(page.locator("#timer-lbl")).toHaveText("Rest");
  await expect(page.locator("#timer-time")).toHaveText(/^[12]:\d\d$/);

  await touchSwipeRow(page, page.locator(".ex", { hasText: "Bench Press" }), browserName);
  await expect(page.locator("#dialog")).toContainText("Remove Bench Press?");
  await page.getByRole("button", { name: "Keep" }).click();
  await expect(page.locator(".ex", { hasText: "Bench Press" })).toContainText("100 × 8");

  await page.locator('[aria-label="Remove Pull-Up"]').click();
  await expect(page.locator("#wo-list")).not.toContainText("Pull-Up");
  await expect(page.locator("#dialog")).toBeHidden();

  await page.locator('[data-action="save-routine"]').click();
  await expect(page.locator("#dlg-in")).toHaveValue("");
  await page.locator("#dlg-in").fill("Order Lift");
  await page.locator('[data-action="dlg-ok"]').click();
  await expect(page.locator("#toast")).toContainText("Saved Order Lift");

  await page.reload();
  await page.waitForFunction(() => window.app && window.app.PH && window.app.PH.ready && typeof window.app.render === "function");
  await expect(page.locator("#workout")).toBeVisible();
  await expect(page.locator("#workout .wo-title h2")).toHaveText("Order Lift");
  await expect(page.locator("#wo-list .ex-name")).toHaveText(["Bench Press"]);
  await page.locator(".ex-head", { hasText: "Bench Press" }).click();
  await expect(page.locator(".ex.open")).toContainText("100 × 8");

  await page.locator('[data-action="finish"]').click();
  await expect(page.locator("#dialog")).toContainText("Finish Order Lift?");
  await expect(page.locator("#dlg-in")).toHaveCount(0);
  await page.locator('[data-action="dlg-ok"]').click();
  await expect(page.locator("#sheet")).toContainText("Order Lift done");
  await page.locator("#sheet").getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Workouts" }).click();
  await page.locator('[data-action="wseg"][data-seg="history"]').click();
  await expect(page.locator(".hist-t")).toHaveText("Order Lift");
  await expect(page.locator(".hist")).not.toContainText("Freestyle");

  await page.locator('[data-action="wseg"][data-seg="routines"]').click();
  await page.locator('[data-action="open-w"][data-id="push"]').click();
  await page.getByRole("button", { name: "Start Push" }).click();
  await page.locator("#w-0").fill("40");
  await page.locator("#r-0").fill("8");
  await page.locator('[data-action="log"]').click();
  await expect(page.locator("#timer")).toBeVisible();
  assertQuiet();
});
