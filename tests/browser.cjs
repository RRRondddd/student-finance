// Optional browser checks: Playwright is a development tool, not an app dependency.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ locale: 'ru-RU', viewport: { width: 1280, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = process.env.TEST_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href;
    await page.goto(url);
    const text = id => page.locator('#' + id).innerText();
    const count = () => page.locator('#operations > li').count();
    const submit = async (type, amount, category, date = '2026-10-20') => {
      await page.locator(`input[name=type][value=${type}]`).check();
      await page.locator('#amount').fill(amount);
      await page.locator('#category').fill(category);
      await page.locator('#date').fill(date);
      await page.locator('#submit-button').click();
    };
    assert.equal(await count(), 0);
    await submit('income', '1000,30', 'Стипендия');
    await submit('expense', '0.10', 'Продукты');
    assert.equal(await text('balance'), '1 000,20 ₽');
    assert.equal(await text('income'), '1 000,30 ₽');
    assert.equal(await text('expense'), '0,10 ₽');
    await page.reload();
    assert.equal(await count(), 2);
    assert.equal(await text('balance'), '1 000,20 ₽');
    // Reopening a tab in the same browser profile preserves the budget.
    const secondPage = await context.newPage();
    await secondPage.goto(url);
    assert.equal(await secondPage.locator('#operations > li').count(), 2);
    await secondPage.close();
    const first = page.locator('#operations > li').first();
    await first.getByRole('button', { name: /Редактировать/ }).click();
    await page.locator('#amount').fill('0,20');
    await page.locator('#submit-button').click();
    assert.equal(await count(), 2);
    assert.equal(await text('balance'), '1 000,10 ₽');
    await first.getByRole('button', { name: /Редактировать/ }).click();
    await page.locator('#amount').fill('500');
    await page.locator('#cancel-edit').click();
    assert.equal(await text('balance'), '1 000,10 ₽');
    for (const bad of ['', 'abc', '-100', '0', '1,001']) {
      await submit('expense', bad, 'Ошибка');
      assert.equal(await page.locator('#form-error').isVisible(), true);
      assert.equal(await count(), 2);
      assert.equal(await text('balance'), '1 000,10 ₽');
    }
    await submit('expense', '1', '');
    assert.equal(await page.locator('#form-error').isVisible(), true);
    await first.getByRole('button', { name: /Удалить/ }).click();
    await page.locator('#cancel-delete').click();
    assert.equal(await count(), 2);
    await first.getByRole('button', { name: /Удалить/ }).click();
    await page.locator('#confirm-delete').click();
    assert.equal(await count(), 1);
    assert.equal(await text('balance'), '1 000,30 ₽');
    await page.reload();
    assert.equal(await count(), 1);
    // A category is text, never executable markup.
    await submit('expense', '0,01', '<img src=x onerror=alert(1)>');
    assert.equal(await page.locator('#operations img').count(), 0);
    assert.equal(await text('balance'), '1 000,29 ₽');
    await page.screenshot({path:'/tmp/student-finance-desktop.png', fullPage:true});
    await page.setViewportSize({width:375,height:812});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('#submit-button').isVisible(), true);
    await page.screenshot({path:'/tmp/student-finance-mobile.png', fullPage:true});
    // Storage failure must never update visible state or claim success.
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
    await submit('income', '900', 'Не сохранено');
    assert.equal(await page.locator('#form-error').isVisible(), true);
    assert.equal(await count(), 2);
    assert.equal(await text('balance'), '1 000,29 ₽');
    await page.reload();
    assert.equal(await count(), 2);
    // Corrupt storage is preserved; editing is disabled.
    await page.evaluate(() => localStorage.setItem('student-finance:v1', '{broken'));
    await page.reload();
    assert.equal(await page.locator('#storage-error').isVisible(), true);
    assert.equal(await page.locator('#submit-button').isDisabled(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('student-finance:v1')), '{broken');
    assert.deepEqual(errors, []);
    console.log('PASS: startup, add, edit, cancel, delete, exact balance, reload, reopen tab, input validation, safe category rendering, mobile layout, storage failure, corrupt data; no browser errors.');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
