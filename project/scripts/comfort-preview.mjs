import { chromium, _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const native = !!process.env.COSMOS_EXE,
  out = native ? 'docs/comfort-review/native' : 'docs/comfort-review';
await fs.mkdir(out, { recursive: true });
const profile = path.resolve('test-results/comfort-' + Date.now());
const app = native
  ? await electron.launch({
      executablePath: process.env.COSMOS_EXE,
      args: [],
      env: {
        ...process.env,
        COSMOS_USER_DATA: profile,
        COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
      },
      timeout: 45000,
    })
  : null;
const browser = !native
  ? await chromium.launch({
      executablePath:
        process.env.COSMOS_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
    })
  : null;
const page = app
    ? await app.firstWindow()
    : await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  checks = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
async function check(name, fn) {
  await fn();
  checks.push({ name, status: 'pass' });
  console.log('PASS', name);
}
async function shot(name) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
async function size(width, height) {
  if (app)
    await app.evaluate(
      ({ BrowserWindow }, { width, height }) =>
        BrowserWindow.getAllWindows()[0].setSize(width, height),
      { width, height },
    );
  else await page.setViewportSize({ width, height });
  await page.waitForTimeout(120);
}
try {
  if (!native) await page.goto('http://127.0.0.1:5180');
  else
    await check('actual-packaged-executable', async () =>
      assert.equal((await page.evaluate(() => window.cosmos.getAppInfo())).packaged, true),
    );
  await page.getByPlaceholder('Твоё имя').fill('Алексей');
  await page.getByRole('button', { name: 'Начнём знакомство' }).click();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  const colors = [];
  await check('five-live-palettes', async () => {
    for (const title of [
      'Тихая орбита',
      'Северное сияние',
      'Далёкий океан',
      'Золотая пыль',
      'Розовая туманность',
    ]) {
      await page.locator('.palette-choice').filter({ hasText: title }).click();
      await page.waitForTimeout(70);
      colors.push(
        await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent'),
        ),
      );
    }
    assert.equal(new Set(colors).size, 5);
  });
  await page.locator('.palette-choice').filter({ hasText: 'Далёкий океан' }).click();
  await page.getByRole('combobox', { name: 'Размер текста', exact: true }).selectOption('large');
  await page
    .getByText('Повышенный контраст', { exact: true })
    .locator('..')
    .locator('..')
    .getByRole('checkbox')
    .check();
  await shot('01-palette-settings');
  await check('command-jump-to-median', async () => {
    await page.keyboard.press('Control+k');
    await page.getByRole('textbox', { name: 'Поиск темы или действия' }).fill('медиана');
    await page.keyboard.press('Enter');
    await page.locator('.scene-player').waitFor();
  });
  await check('focus-bookmark-notebook', async () => {
    await page.getByRole('button', { name: 'Закрепить тему', exact: true }).click();
    await page.getByRole('button', { name: 'Сосредоточиться', exact: true }).click();
    assert.equal(await page.locator('.app-header').isVisible(), false);
    await page
      .getByText('Мой черновик', { exact: false })
      .locator('summary')
      .count()
      .catch(() => 0);
    await page.locator('.lesson-notebook summary').click();
    await page
      .getByRole('textbox', { name: 'Черновик занятия' })
      .fill('BM = MC. Проверить середину стороны.');
  });
  await shot('02-focus-median');
  await check('narrow-large-font-no-overflow', async () => {
    await size(640, 850);
    await page.waitForTimeout(120);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await shot('03-focus-narrow');
    await page.getByRole('button', { name: 'Выйти из фокуса', exact: true }).click();
    await size(native ? 620 : 390, 850);
    await page.waitForTimeout(100);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await shot('04-narrow-large');
  });
  await size(1440, 1000);
  await check('knowledge-and-FIPI-source-distinction', async () => {
    await page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('button', { name: 'База знаний', exact: true })
      .click();
    await page.getByRole('heading', { name: 'База знаний', exact: true }).waitFor();
    await page.locator('.knowledge-sources .source-links').first().locator('summary').click();
    const links = await page
      .locator('.knowledge-sources .source-links')
      .first()
      .locator('a')
      .evaluateAll((a) => a.map((x) => x.href));
    assert(links.every((url) => new URL(url).hostname.endsWith('fipi.ru')));
    assert(links.length >= 2);
    await shot('05-knowledge-library');
  });
  await check('knowledge-checkpoint-waits-for-attempt', async () => {
    const reveal = page.getByRole('button', { name: 'Свериться с разбором' });
    assert(await reveal.isDisabled());
    await page.getByRole('button', { name: 'Маленькая подсказка' }).click();
    assert(await page.locator('.checkpoint-hint').isVisible());
    assert.equal(await page.locator('.checkpoint-answer').count(), 0);
    await page
      .getByRole('textbox', { name: 'Моя версия ответа' })
      .fill('Попробую вычислить по шагам');
    await reveal.click();
    assert(await page.locator('.checkpoint-answer').isVisible());
  });
  if (app) {
    await check('offline-FIPI-PDF-inside-application', async () => {
      const references = await page.evaluate(() => window.cosmos.listReferences());
      assert.equal(references.length, 22);
      const nextWindow = app.waitForEvent('window');
      await page.locator('.reference-buttons button').first().click();
      const pdf = await nextWindow;
      await pdf.waitForLoadState('domcontentloaded');
      await pdf.waitForTimeout(1800);
      await pdf.screenshot({ path: `${out}/06-offline-FIPI-PDF.png` });
      assert.deepEqual(
        await pdf.evaluate(() => ({ bridge: typeof window.cosmos, node: typeof require })),
        { bridge: 'undefined', node: 'undefined' },
      );
      await pdf.close();
      assert.equal(
        (await page.evaluate(() => window.cosmos.openReference('../not-a-source'))).ok,
        false,
      );
    });
    await check('FIPI-question-uses-registered-sources', async () => {
      await page.keyboard.press('Control+k');
      await page.getByRole('textbox', { name: 'Поиск темы или действия' }).fill('медиана');
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Спросить Cosmos', exact: true }).click();
      await page
        .getByRole('textbox', { name: 'Сообщение Cosmos' })
        .fill('Где официальные КИМ и критерии ФИПИ на 2027 год?');
      await page.getByRole('button', { name: 'Отправить сообщение' }).click();
      const message = page.locator('.message').last();
      await message.getByText('Материалы для сверки', { exact: false }).click();
      const urls = await message.locator('a').evaluateAll((links) => links.map((a) => a.href));
      assert(urls.length >= 2);
      assert(urls.every((url) => new URL(url).hostname.endsWith('fipi.ru')));
      assert((await message.innerText()).includes('УЧЕБНЫЙ МАТЕРИАЛ'));
      await shot('07-FIPI-references-in-lesson');
    });
    await check('appearance-note-bookmark-persisted-on-disk', async () => {
      const state = await page.evaluate(() => window.cosmos.loadState());
      assert.equal(state.settings.palette, 'ocean');
      assert.equal(state.settings.textScale, 'large');
      assert(state.bookmarks.includes('math-median'));
      const session = Object.values(state.sessions).find((s) => s.topicId === 'math-median');
      assert(session.note.includes('BM = MC'));
      assert.equal(state.progress['math-median'].attempts.length, 0);
      assert(session.messages.some((m) => m.sourceIds?.length > 0));
    });
  }
  await check('no-renderer-exceptions', async () => assert.deepEqual(errors, []));
} catch (error) {
  checks.push({ name: 'failure', message: error.message });
  await shot('failure');
  throw error;
} finally {
  await fs.writeFile(
    `${out}/results.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        kind: native ? 'packaged Windows EXE' : 'development browser, not packaged EXE acceptance',
        appAsarSha256: native
          ? createHash('sha256')
              .update(
                await fs.readFile(
                  path.join(path.dirname(process.env.COSMOS_EXE), 'resources/app.asar'),
                ),
              )
              .digest('hex')
          : null,
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  await app?.close();
  await browser?.close();
}
