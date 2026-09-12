import { _electron as electron, chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const live = JSON.parse(await fs.readFile('docs/verification/homework-0.7.3/report.json', 'utf8'));
assert.equal(live.status, 'passed');
const exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe'),
  profile = live.profile;
const out = path.resolve(process.env.COSMOS_REVIEW_OUT || 'docs/verification/homework-final-0.7.3');
await fs.mkdir(out, { recursive: true });
const report = {
  status: 'running',
  exe,
  profile,
  checks: [],
  screenshots: [],
  errors: [],
  asarSha256: createHash('sha256')
    .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
    .digest('hex'),
  scope:
    'Actual EXE with restored authentic OpenAI homework dialogue, source photo and saved ink. No new model calls. Desktop and narrow screen, native PNG, exported HTML visual review.',
};
let app, page, browser;
const button = (n) => page.getByRole('button', { name: n, exact: true }),
  nav = (n) => page.locator('.studio-sidebar').getByRole('button', { name: n, exact: true });
async function shot(name) {
  const file = path.join(out, name + '.png');
  await page.screenshot({ path: file });
  report.screenshots.push(file);
}
try {
  app = await electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      COSMOS_USER_DATA: profile,
      COSMOS_OPENAI_USER_DATA: path.join(process.env.APPDATA, 'EGE Cosmos Studio'),
      COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
    },
    timeout: 45000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(25000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setIgnoreMouseEvents(true);
    w.setContentSize(1920, 1080);
  });
  await page.locator('.cosmos-studio').waitFor();
  await nav('Домашние задания').click();
  await page.getByLabel('Поиск прошлых диалогов').fill('3(x');
  await page.locator('.conversation-history-list button').first().click();
  await page.getByAltText('Исходное фото домашнего задания').waitFor();
  await page.locator('.school-message.assistant').last().scrollIntoViewIfNeeded();
  await shot('01-restored-dialogue-1920');
  await button('Лист для решения').click();
  await shot('02-pinned-assignment-1920');
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1280, 720),
  );
  await shot('03-pinned-assignment-1280');
  assert.equal(
    await page.locator('.sheet-assignment-content p').evaluate((e) => getComputedStyle(e).color),
    'rgb(48, 39, 65)',
  );
  await page.getByLabel('Масштаб листа').selectOption('2');
  const before = await page.locator('.sheet-assignment').boundingBox();
  await page.locator('.sheet-viewport').hover();
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(350);
  const after = await page.locator('.sheet-assignment').boundingBox();
  assert(Math.abs(before.y - after.y) < 1);
  report.checks.push('Pinned condition stays fixed during sheet scroll');
  await button('Увеличить фото задания').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.math-sheet').isVisible(), true);
  await page.getByLabel('Масштаб листа').selectOption('1');
  await button('Скачать PNG').click();
  await page.locator('.sheet-export-path').waitFor();
  const saved = await page.locator('.sheet-export-path').getAttribute('data-path');
  assert((await fs.stat(saved)).size > 1000);
  report.checks.push({ png: saved });
  await button('Закрыть лист').click();
  await button('Лист для вопроса Cosmos').click();
  assert.equal(await page.locator('.sheet-assignment-content img').count(), 0);
  assert.equal(await button('Проверить решение').isEnabled(), false);
  await shot('04-independent-practice');
  await button('Закрыть лист').click();
  await button('К домашним заданиям').click();
  await page.getByLabel('Предмет домашней работы').selectOption('chemistry');
  assert.deepEqual(
    await page
      .getByLabel('Класс домашней работы')
      .locator('option')
      .evaluateAll((x) => x.map((e) => e.value)),
    ['8', '9', '10', '11'],
  );
  await button('Конспекты домашних работ').click();
  assert((await page.locator('.school-document-list button').count()) > 0);
  await shot('05-homework-document-preview');
  await button('HTML').click();
  await page.waitForTimeout(1000);
  const state = await page.evaluate(() => window.cosmos.loadState());
  const doc = state.homeworkDesk.documents.at(-1);
  assert(doc?.path);
  assert((await fs.stat(doc.path)).size > 1000);
  await button('К домашним заданиям').click();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(760, 900),
  );
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('06-narrow-homework');
  assert(
    await page
      .locator('.homework-desk')
      .evaluate(
        (e) => e.getBoundingClientRect().left >= 0 && e.getBoundingClientRect().right <= innerWidth,
      ),
  );
  const originalName = state.profile.name;
  assert.equal(originalName, 'Проверка домашней работы');
  assert.equal(Object.keys(state.school?.lessons || {}).length, 0);
  assert.equal(Object.keys(state.cloudSessions || {}).length, 0);
  report.checks.push('Homework remains isolated from school and EGE after restart');
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const dp = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await dp.goto(pathToFileURL(doc.path).href);
  await dp.locator('h1').first().waitFor();
  await dp.screenshot({ path: path.join(out, '07-exported-homework-document.png') });
  report.screenshots.push(path.join(out, '07-exported-homework-document.png'));
  report.checks.push({ document: doc.path, visual: 'actual exported HTML rendered in Chromium' });
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (e) {
  report.status = 'failed';
  report.error = String(e.stack || e);
  if (page) await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser?.close().catch(() => {});
  await app?.close().catch(() => {});
  console.log(JSON.stringify(report, null, 2));
}
