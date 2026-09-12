import { chromium, _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const preview = process.env.COSMOS_DEV_APP === '1';
const native = !!process.env.COSMOS_EXE,
  profile = path.resolve('test-results/preferences-' + Date.now());
const out = path.resolve(
  'docs/verification/preferences-' + (preview ? 'electron-preview' : native ? 'native' : 'browser'),
);
await fs.mkdir(out, { recursive: true });
const app = native
  ? await electron.launch({
      executablePath: process.env.COSMOS_EXE,
      args: [...(preview ? ['.'] : []), '--disable-backgrounding-occluded-windows'],
      env: {
        ...process.env,
        COSMOS_USER_DATA: profile,
        COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
      },
      timeout: 45000,
    })
  : null;
const browser = app
  ? null
  : await chromium.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
    });
const page = app
    ? await app.firstWindow()
    : await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  checks = [],
  errors = [];
page.on('pageerror', (error) => errors.push(error.message));
async function check(name, fn) {
  await fn();
  checks.push({ name, status: 'pass' });
  console.log('PASS', name);
}
async function state() {
  // UI updates are journaled synchronously, then serialized through the disk queue.
  // Wait for that real save boundary; an IPC read can otherwise overtake queued saves.
  await page.waitForFunction(
    () => !localStorage.getItem('ege-cosmos-v1-pending'),
    {},
    { timeout: 10000 },
  );
  return page.evaluate(async () =>
    window.cosmos
      ? await window.cosmos.loadState()
      : JSON.parse(localStorage.getItem('ege-cosmos-v1')),
  );
}
async function shot(name) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
}
async function tab(name) {
  await page.locator('.settings-tabs').getByRole('button', { name, exact: true }).click();
}
async function size(w, h) {
  if (app)
    await app.evaluate(
      ({ BrowserWindow }, { w, h }) => BrowserWindow.getAllWindows()[0].setSize(w, h),
      { w, h },
    );
  else await page.setViewportSize({ width: w, height: h });
}
try {
  if (!app) await page.goto(process.env.COSMOS_QA_URL || 'http://127.0.0.1:5173');
  else assert.equal((await page.evaluate(() => window.cosmos.getAppInfo())).packaged, !preview);
  await page.getByPlaceholder('Твоё имя').fill('Алексей');
  await page.getByRole('button', { name: 'Начнём знакомство', exact: true }).click();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await check('all-configuration-sections-available', async () =>
    assert.equal(await page.locator('.settings-tabs button').count(), 9),
  );
  await tab('Неон и движение');
  await check('independent-glow-motion-scene-parameters', async () => {
    await page.getByRole('combobox', { name: 'Сила неона', exact: true }).selectOption('vivid');
    await page
      .getByRole('combobox', { name: 'Движение интерфейса', exact: true })
      .selectOption('gentle');
    await page.getByRole('combobox', { name: 'Темп интерфейса', exact: true }).selectOption('slow');
    await page
      .getByRole('checkbox', { name: 'Автоматически запускать сцены', exact: true })
      .uncheck();
    await page
      .getByRole('combobox', { name: 'Начальная скорость сцены', exact: true })
      .selectOption('1.5');
    assert.deepEqual(
      await page.evaluate(() => ({
        glow: document.documentElement.dataset.glow,
        motion: document.documentElement.dataset.uiMotion,
        speed: document.documentElement.dataset.motionSpeed,
      })),
      { glow: 'vivid', motion: 'gentle', speed: 'slow' },
    );
  });
  await shot('01-neon-motion');
  await tab('Рабочее место');
  await check('layout-corners-density-live', async () => {
    await page
      .getByRole('combobox', { name: 'Плотность карточек', exact: true })
      .selectOption('compact');
    await page
      .getByRole('combobox', { name: 'Форма элементов', exact: true })
      .selectOption('rounded');
    await page
      .getByRole('combobox', { name: 'Ширина рабочего пространства', exact: true })
      .selectOption('comfortable');
    await page
      .getByRole('combobox', { name: 'Расположение урока', exact: true })
      .selectOption('dialogue');
    await page
      .getByRole('combobox', { name: 'Характер шрифта', exact: true })
      .selectOption('humanist');
    assert(
      (
        await page
          .locator('.panel')
          .first()
          .evaluate((element) => getComputedStyle(element).borderRadius)
      ).includes('26px'),
    );
  });
  await shot('02-workspace');
  await tab('Учебный ритм');
  await check('voice-range-retains-focus-and-keyboard-control', async () => {
    const range = page.getByRole('slider', { name: 'Скорость голоса', exact: true });
    await range.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    assert.equal(await range.inputValue(), '1.2');
    assert(await range.evaluate((element) => element === document.activeElement));
    await page.getByRole('checkbox', { name: 'Enter отправляет ответ', exact: true }).uncheck();
    await page.getByRole('combobox', { name: 'Время на день', exact: true }).selectOption('45');
  });
  await shot('03-study-rhythm');
  await tab('Конспекты');
  await page
    .getByRole('combobox', { name: 'Размер текста в конспекте', exact: true })
    .selectOption('large');
  await tab('Мои сочетания');
  await check('save-change-restore-preference-combination', async () => {
    await page
      .getByRole('textbox', { name: 'Название сочетания настроек', exact: true })
      .fill('Моя неоновая учёба');
    await page.getByRole('button', { name: 'Сохранить сочетание', exact: true }).click();
    await page.locator('.preference-preset').filter({ hasText: 'Лёгкий Cosmos' }).click();
    assert.equal(await page.locator('.ui-ambient').count(), 0);
    await page
      .locator('.saved-preference')
      .getByRole('button', { name: /Моя неоновая учёба/ })
      .first()
      .click();
    const data = await state();
    assert.equal(data.settings.glow, 'vivid');
    assert.equal(data.settings.sceneSpeed, 1.5);
    assert.equal(data.profile.dailyMinutes, 45);
    assert.equal(data.settings.voiceRate, 1.2);
  });
  await shot('04-saved-combinations');
  await page.reload();
  await page.locator('.home-intro').waitFor();
  await check('preferences-restored-after-reload', async () => {
    const data = await state();
    assert.equal(data.preferenceProfiles.length, 1);
    assert.equal(data.settings.documentScale, 'large');
    assert.equal(data.settings.enterToSend, false);
  });
  await page
    .getByRole('navigation', { name: 'Предметы' })
    .getByRole('button', { name: 'Математика', exact: true })
    .click();
  await page.locator('.topic-card').filter({ hasText: 'Площадь прямоугольника' }).click();
  if (app)
    await check('active-lesson-time-pauses-when-window-is-hidden', async () => {
      await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.show();
        window.focus();
      });
      await page.bringToFront();
      await page.getByRole('textbox', { name: 'Сообщение Cosmos', exact: true }).click();
      await page.waitForTimeout(6000);
      const visible = Object.values((await state()).sessions)[0].activeMs;
      assert(visible > 0);
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
      assert.equal(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
        false,
      );
      const hiddenBefore = Object.values((await state()).sessions)[0].activeMs;
      const visibility = await page.evaluate(() => ({
        hidden: document.hidden,
        focused: document.hasFocus(),
      }));
      await page.waitForTimeout(5500);
      const hiddenAfter = Object.values((await state()).sessions)[0].activeMs;
      console.log(
        'HIDDEN WINDOW',
        JSON.stringify({ visible, hiddenBefore, hiddenAfter, visibility }),
      );
      assert.equal(hiddenAfter, hiddenBefore);
      await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.show();
        window.focus();
      });
    });
  await check('scene-start-preference-does-not-disable-manual-play', async () => {
    assert.equal(
      await page
        .getByRole('combobox', { name: 'Скорость воспроизведения', exact: true })
        .inputValue(),
      '1.5',
    );
    await page.getByRole('button', { name: 'Воспроизвести', exact: true }).waitFor();
    const before = await page.locator('.sc-counter').innerText();
    await page.waitForTimeout(550);
    assert.equal(await page.locator('.sc-counter').innerText(), before);
  });
  await check('configured-enter-newline-and-control-enter-submits', async () => {
    const count = await page.locator('.message').count();
    const input = page.getByRole('textbox', { name: 'Сообщение Cosmos', exact: true });
    await input.fill('21');
    await input.press('Enter');
    assert.equal(await page.locator('.message').count(), count);
    assert((await input.inputValue()).includes('\n'));
    await input.press('Control+Enter');
    await page.waitForFunction(
      (value) => document.querySelectorAll('.message').length > value,
      count,
    );
    const data = await state();
    assert.equal(data.progress['math-rectangle'].attempts.length, 1);
  });
  await shot('05-configured-lesson');
  await check('narrow-settings-and-large-text-do-not-overflow', async () => {
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await tab('Изображение и звук');
    await page.getByRole('combobox', { name: 'Размер текста', exact: true }).selectOption('large');
    await tab('Мои сочетания');
    await size(native ? 640 : 390, 900);
    await page.waitForTimeout(400);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await shot('06-narrow-combinations');
  });
  await check('no-renderer-errors', async () => assert.deepEqual(errors, []));
} catch (error) {
  checks.push({ name: 'failure', status: 'fail', message: error.message });
  if (app)
    await app
      .evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.show();
        window.focus();
      })
      .catch(() => {});
  await shot('failure').catch(() => {});
  throw error;
} finally {
  await fs.writeFile(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        kind: preview
          ? 'development Electron with production bundle, not packaged acceptance'
          : native
            ? 'actual packaged Windows EXE'
            : 'development Chrome, not EXE acceptance',
        executable: native ? process.env.COSMOS_EXE : null,
        appAsarSha256:
          native && !preview
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
