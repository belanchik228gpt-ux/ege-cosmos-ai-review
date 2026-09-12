import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const out = path.resolve(process.env.COSMOS_REVIEW_OUT || 'docs/verification/overnight-ui-0.7.5');
const profile = path.resolve(`test-results/overnight-ui-${Date.now()}`);
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
};
let app, page;
const button = (name) => page.getByRole('button', { name, exact: true });
const nav = (name) => page.locator('.studio-sidebar').getByRole('button', { name, exact: true });
async function state() {
  return page.evaluate(() => window.cosmos.loadState());
}
async function shot(name) {
  const file = path.join(out, name + '.png');
  await page.screenshot({ path: file });
  report.screenshots.push(file);
}
async function launch() {
  app = await electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      COSMOS_USER_DATA: profile,
      COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
    },
    timeout: 45000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setIgnoreMouseEvents(true);
    w.setContentSize(1280, 720);
  });
  await page.locator('.cosmos-studio').waitFor();
}
async function subjects(grade) {
  await nav('Все школьные предметы').click();
  await page.getByLabel('Школьный класс', { exact: true }).selectOption(String(grade));
  if (await button('Все предметы').isVisible()) await button('Все предметы').click();
}
async function math() {
  await subjects(10);
  await page
    .locator('.school-subject-card')
    .filter({ has: page.getByRole('heading', { name: 'Математика', exact: true }) })
    .click();
}
try {
  await launch();
  await page.locator('.welcome-modal input').waitFor();
  await page.locator('.welcome-modal input').fill('Проверка удобства');
  await button('Начнём знакомство').click();
  await page
    .locator('.school-mode-switch')
    .getByRole('button', { name: 'Школа', exact: true })
    .click();
  for (const grade of [7, 8, 9, 10, 11]) {
    await subjects(grade);
    const names = await page.locator('.school-subject-card h2').allTextContents();
    assert(!names.some((n) => /Музыка|Физическая культура|ОБЗР/.test(n)));
    report.checks.push({ grade, subjects: names });
  }
  await math();
  await page.getByRole('navigation', { name: 'Курсы предмета' }).waitFor();
  await shot('01-parallel-courses');
  await page.locator('.school-track-picker button').filter({ hasText: 'Геометрия' }).click();
  assert.equal(await page.locator('.school-unit-index').first().innerText(), '01');
  await page.locator('.school-topic-title').first().click();
  const first = page.locator('.school-subtopic-row').first();
  await first.locator('.school-skip-topic').click();
  assert.match(await first.innerText(), /100%/);
  assert.match(await page.locator('.school-subtopic-row').nth(1).innerText(), /0%/);
  await shot('02-topic-skip');
  await first.locator('.school-skip-topic').click();
  assert.match(await first.innerText(), /0%/);
  await page.getByLabel('Поиск школьных тем', { exact: true }).fill('принадлежит');
  const results = await page.locator('.school-subtopic-copy').allTextContents();
  assert(results.length > 0);
  await shot('03-topic-search');
  await page.getByLabel('Поиск школьных тем', { exact: true }).fill('');
  await button('Начать с аксиом →').click();
  await page.locator('.school-room').waitFor();
  await shot('04-clean-conversation');
  const input = await page
    .getByLabel('Сообщение школьному преподавателю', { exact: true })
    .boundingBox();
  assert(
    input && input.y >= 0 && input.y + input.height <= 720,
    'Composer visible without scrolling',
  );
  const send = await button('Отправить').boundingBox();
  assert(send && send.y >= 0 && send.y + send.height <= 720, 'Send button visible without scrolling');
  await button('Лист для решения').click();
  await page.getByRole('region', { name: 'Условие над листом' }).waitFor();
  const canvas = page.getByLabel('Белый лист для рисования');
  const initial = await canvas.evaluate((c) => c.toDataURL());
  await button('Надпись').click();
  await page.getByLabel('Текст надписи').fill('A ∈ α');
  await canvas.click({ position: { x: 110, y: 90 } });
  await page.waitForTimeout(200);
  assert.notEqual(await canvas.evaluate((c) => c.toDataURL()), initial);
  await button('Скачать PNG').click();
  await page.locator('.sheet-export-path').waitFor();
  const png = await page.locator('.sheet-export-path').getAttribute('data-path');
  assert((await fs.stat(png)).size > 1000);
  await fs.copyFile(png, path.join(out, 'sheet-export.png'));
  await shot('05-math-sheet');
  await button('Закрыть лист').click();
  await page.locator('.school-materials-menu > summary').click();
  await page.locator('#school-local-material > summary').click();
  const scene = page.locator('#school-local-material .dialogue-scene');
  await scene.scrollIntoViewIfNeeded();
  await scene.getByRole('button', { name: 'Повторить рисунок', exact: true }).click();
  await page.waitForTimeout(500);
  const pause = scene.getByRole('button', { name: 'Пауза', exact: true });
  if (await pause.isEnabled()) await pause.click();
  await scene.getByRole('button', { name: 'Следующий кадр', exact: true }).click();
  const caption = await scene.locator('.ds-caption').innerText();
  await scene.getByRole('button', { name: 'Предыдущий кадр', exact: true }).click();
  assert.notEqual(await scene.locator('.ds-caption').innerText(), caption);
  await scene.getByRole('button', { name: 'Рисунок целиком', exact: true }).click();
  await page.waitForTimeout(400);
  await shot('06-stereometry-animation');
  await scene.locator('.ds-dots button').last().click();
  await shot('07-stereometry-last-frame');
  await scene.getByRole('button', { name: 'Вернуться к переписке', exact: true }).click();
  await button('Завершить без подключения').click();
  await page.waitForTimeout(700);
  const before = await state();
  assert(Object.values(before.school.lessons).some((l) => l.completedAt));
  await app.close();
  app = null;
  await launch();
  await page.locator('.conversation-history-list button').first().waitFor();
  await page.locator('.conversation-history-list button').first().click();
  await page.locator('.school-room').waitFor();
  await button('Лист для решения').click();
  assert.notEqual(
    await page.getByLabel('Белый лист для рисования').evaluate((c) => c.toDataURL()),
    initial,
  );
  await shot('08-restored-sheet');
  await button('Закрыть лист').click();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(960, 720),
  );
  await page.waitForTimeout(600);
  await shot('09-narrow-dialogue');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  report.checks.push(
    'UI-only real EXE: five grades, course-local numbering, skip/undo/neighbour isolation, search, visible composer, ink export/restoration, scene replay/pause/next/back, restart and 960px layout. No invented model responses.',
  );
  assert.deepEqual(report.errors, []);
  report.status = 'pass';
} catch (e) {
  report.status = 'failed';
  report.failure = String(e.stack || e);
  if (page) await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  if (app) await app.close();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, failure: report.failure, profile, out }));
}
