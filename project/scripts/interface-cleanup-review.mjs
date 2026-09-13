import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { preview } from 'vite';
import { chromium, _electron as electron } from 'playwright';
const native = process.env.COSMOS_NATIVE_REVIEW === '1';
const out = `docs/interface-review/2026-09-13${native ? '/electron' : ''}`;
const profile = path.resolve('test-results/interface-native-' + Date.now());
await fs.mkdir(out, { recursive: true });
const report = {
  scope: 'Isolated browser profile; real UI and local lesson materials. No live model requests.',
  checks: [],
  screenshots: [],
  errors: [],
  overflow: [],
  unnamedButtons: [],
};
const server = await preview({ preview: { port: 5197, strictPort: true }, logLevel: 'error' });
const app = native
  ? await electron.launch({
      executablePath: process.env.COSMOS_ELECTRON || path.resolve('node_modules/electron/dist/electron.exe'),
      args: [process.cwd()],
      env: {
        ...process.env,
        COSMOS_USER_DATA: profile,
        COSMOS_OPENAI_USER_DATA: path.join(profile, 'openai'),
        COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
      },
      timeout: 45000,
    })
  : null;
const browser = native
  ? null
  : await chromium.launch({
      executablePath: process.env.COSMOS_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
    });
const page = app
  ? await app.firstWindow()
  : await browser.newPage({ viewport: { width: 1440, height: 1000 } });
if (app) {
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setSize(1440, 1000);
    w.hide();
  });
  report.scope =
    'Real Electron from built dist, hidden window to exclude unrelated desktop clicks, isolated profile and export folder; no live model requests.';
}
page.setDefaultTimeout(10000);
page.on('pageerror', (e) => report.errors.push(e.message));
async function check(name, fn) {
  await fn();
  report.checks.push(name);
  console.log('PASS', name);
}
const nav = (name) =>
  page.locator('.studio-sidebar').getByRole('button', { name, exact: true }).click();
async function shot(name) {
  const dismiss = page.getByRole('button', { name: 'Закрыть уведомление', exact: true });
  if (await dismiss.count()) await dismiss.click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  report.screenshots.push(name);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) report.overflow.push(name);
  const unnamed = await page
    .locator('button:visible')
    .evaluateAll((els) =>
      els
        .filter(
          (el) =>
            !el.textContent.trim() &&
            !el.getAttribute('aria-label') &&
            !el.getAttribute('aria-labelledby'),
        )
        .map((el) => el.outerHTML.slice(0, 240)),
    );
  if (unnamed.length) report.unnamedButtons.push({ screen: name, buttons: unnamed });
}
try {
  if (!native) await page.goto('http://127.0.0.1:5197');
  await page.getByPlaceholder('Твоё имя').fill('Ученик');
  await page.getByRole('button', { name: 'Начнём знакомство', exact: true }).click();
  await nav('ЕГЭ');
  await nav('Главная');
  await check('clean-home', async () => {
    assert.equal(await page.locator('.ton618-controls').count(), 0);
    assert.equal(await page.locator('.studio-connection-pill').count(), 0);
    assert.equal(await page.locator('.app-footer').count(), 1);
    assert.equal(
      await page.getByRole('button', { name: 'Продолжить занятие', exact: true }).count(),
      1,
    );
  });
  await check('hero-text-contrast', async () => {
    const style = await page
      .locator('.studio-hero-content')
      .evaluate((el) => ({
        overlay: getComputedStyle(el).backgroundColor,
        underlay: getComputedStyle(el.parentElement, '::before').backgroundColor,
        text: getComputedStyle(el.querySelector('p')).color,
      }));
    const parse = (x) => x.match(/[\d.]+/g).map(Number),
      over = (fg, bg) =>
        fg.slice(0, 3).map((v, i) => v * (fg[3] ?? 1) + bg[i] * (1 - (fg[3] ?? 1)));
    const bg = over(parse(style.overlay), over(parse(style.underlay), [255, 255, 255]));
    const luminance = (rgb) =>
      rgb
        .slice(0, 3)
        .map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
    report.heroContrast = (luminance(parse(style.text)) + 0.05) / (luminance(bg) + 0.05);
    assert(report.heroContrast >= 4.5, JSON.stringify({ style, ratio: report.heroContrast }));
  });
  await shot('01-home');
  await nav('Настройки');
  await page.getByRole('button', { name: 'Подключение', exact: true }).click();
  await page.getByRole('heading', { name: 'Подключение OpenAI' }).waitFor();
  await check('connection-settings', async () =>
    assert(await page.getByText('OpenAI не подключён', { exact: true }).isVisible()),
  );
  await page.getByRole('button', { name: 'Учёба', exact: true }).click();
  await page.getByRole('combobox', { name: 'Школьный класс' }).selectOption('10');
  await page.getByRole('button', { name: 'Внешний вид', exact: true }).click();
  await page.getByRole('button', { name: 'Фон', exact: true }).click();
  await check('background-settings', async () =>
    assert(await page.locator('.ton618-controls').isVisible()),
  );
  await nav('Школа');
  await nav('Все школьные предметы');
  await shot('02-school-subjects');
  await page.locator('.school-subject-card').filter({ hasText: 'Математика' }).first().click();
  await page.locator('.school-topic-title').first().click();
  await check('zero-progress-hidden', async () => {
    assert.equal(await page.locator('.school-subtopic-copy progress').count(), 0);
    assert.equal(await page.locator('.app-footer').count(), 0);
  });
  await page.locator('.school-subtopic-row > button').first().click();
  await page.locator('.school-lesson-welcome').waitFor();
  await shot('03-school-lesson');
  await page.getByRole('button', { name: 'Лист для решения', exact: true }).click();
  const canvas = page.getByLabel('Белый лист для рисования');
  const bounds = await canvas.boundingBox();
  assert(bounds);
  await page.mouse.move(bounds.x + 80, bounds.y + 80);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 140, bounds.y + 120, { steps: 8 });
  await page.mouse.up();
  await check('math-sheet-draw-undo', async () => {
    const undo = page.getByRole('button', { name: 'Отменить штрих' });
    assert(await undo.isEnabled());
    await undo.click();
    assert(await page.getByRole('button', { name: 'Вернуть штрих' }).isEnabled());
  });
  await page.getByRole('button', { name: 'Закрыть лист', exact: true }).click();
  await page.getByRole('link', { name: 'Учебная карточка', exact: true }).click();
  await check('local-scene-and-answer', async () => {
    assert((await page.locator('#school-local-material svg').count()) > 0);
    const reveal = page.getByRole('button', { name: 'Показать разбор для самопроверки' });
    if (await reveal.count()) {
      await reveal.click();
      assert(await page.getByRole('button', { name: 'Скрыть разбор' }).isVisible());
    }
  });
  await nav('Мой школьный план');
  await page.getByRole('textbox', { name: 'Тема для школьного плана' }).fill('Аксиомы');
  await page.locator('.school-plan-search button').first().click();
  await page
    .getByRole('textbox', { name: /Заметка к/ })
    .first()
    .fill('Повторить аксиомы и упражнение 6');
  await nav('Сегодня');
  await nav('Мой школьный план');
  await check('plan-edit-persists', async () =>
    assert.equal(
      await page
        .getByRole('textbox', { name: /Заметка к/ })
        .first()
        .inputValue(),
      'Повторить аксиомы и упражнение 6',
    ),
  );
  await shot('04-plan');
  await nav('Школьная память');
  await page
    .getByLabel('Добавить учебную заметку')
    .fill('Разобрал знаки выражений. Хочу повторить аксиомы.');
  await page.getByRole('button', { name: 'Сохранить заметку', exact: true }).click();
  await nav('Сегодня');
  await nav('Школьная память');
  await check('memory-persists', async () =>
    assert((await page.getByRole('textbox', { name: 'Сохранённый школьный факт' }).count()) > 0),
  );
  await nav('ЕГЭ');
  await nav('Все темы ЕГЭ');
  await check('known-topic-toggle', async () => {
    const card = page.locator('.studio-topic-card').first();
    await card.locator('.topic-known-icon').click();
    assert.equal(await card.locator('progress').getAttribute('value'), '100');
    await card.locator('.topic-known-icon').click();
    assert.equal(await card.locator('progress').count(), 0);
  });
  await shot('05-curriculum');
  await nav('Как решать ЕГЭ');
  await shot('06-exam-workshop');
  await nav('Мои конспекты');
  await page.getByRole('button', { name: 'Новый документ', exact: true }).click();
  await page.getByRole('button', { name: 'Создать документ', exact: true }).click();
  await page.getByRole('textbox', { name: 'Название документа' }).fill('Модули: памятка');
  await page.getByRole('button', { name: 'Редактирование', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Содержание документа' })
    .fill('# Модуль числа\n\nМодуль — расстояние до нуля.\n\n\\( |{-4}|=4 \\)');
  await check('document-editor', async () =>
    assert.equal(
      await page.getByRole('textbox', { name: 'Название документа' }).inputValue(),
      'Модули: памятка',
    ),
  );
  if (native) {
    await page.getByRole('combobox', { name: 'Формат', exact: true }).selectOption('pdf');
    await page.getByRole('button', { name: 'Сохранить и экспортировать', exact: true }).click();
    await page
      .getByRole('button', { name: 'Открыть сохранённый файл', exact: true })
      .waitFor({ timeout: 30000 });
    const files = await fs.readdir(path.join(profile, 'documents'), { recursive: true });
    await check('native-pdf-export', async () => assert(files.some((f) => f.endsWith('.pdf'))));
    report.exportFolder = path.join(profile, 'documents');
  }
  await page.getByRole('button', { name: 'Закрыть документ', exact: true }).click();
  await shot('07-documents');
  await nav('Память Cosmos');
  await check('keyboard-info-and-focus', async () => {
    const button = page.getByRole('button', { name: 'Подробнее', exact: true }).first();
    await button.focus();
    await page.keyboard.press('Enter');
    assert.equal(await button.getAttribute('aria-expanded'), 'true');
    const outline = await button.evaluate((el) => getComputedStyle(el).outlineWidth);
    assert.equal(outline, '2px');
    await page.keyboard.press('Escape');
    assert.equal(await button.getAttribute('aria-expanded'), 'false');
  });
  await shot('08-memory');
  await check('internal-chrome-hidden', async () => {
    assert.equal(await page.locator('.app-footer').count(), 0);
    assert.equal(await page.locator('.study-banner').count(), 0);
  });
  await page.getByRole('button', { name: 'Поиск (Ctrl+K)' }).click();
  await check('search-opens', async () =>
    assert((await page.locator('input:visible').count()) > 0),
  );
  await page.keyboard.press('Escape');
  if (app)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(620, 900));
  else await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  report.narrowViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  await shot('09-memory-mobile');
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  report.menuAfterClick = await page
    .locator('.studio-sidebar')
    .evaluate((el) => ({
      class: el.className,
      transform: getComputedStyle(el).transform,
      rect: el.getBoundingClientRect().toJSON(),
    }));
  console.log('MENU', JSON.stringify(report.menuAfterClick));
  await nav('Главная');
  await page.locator('.studio-home').waitFor();
  await shot('10-home-mobile');
  await check('mobile-search-visible', async () =>
    assert(await page.getByRole('button', { name: 'Поиск (Ctrl+K)' }).isVisible()),
  );
  report.pass =
    report.errors.length === 0 &&
    report.overflow.length === 0 &&
    report.unnamedButtons.length === 0;
  if (!report.pass) process.exitCode = 1;
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = String(error.stack);
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true });
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await fs.writeFile(`${out}/browser-checks.json`, JSON.stringify(report, null, 2));
  if (app) await app.close();
  if (browser) await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
