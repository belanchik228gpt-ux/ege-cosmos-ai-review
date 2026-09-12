import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = process.cwd(),
  out = path.resolve('docs/screenshots');
const executable = process.env.COSMOS_EXE || path.join(root, 'release/win-unpacked/EGE Cosmos.exe');
await fs.mkdir(out, { recursive: true });
await fs.mkdir('docs/verification', { recursive: true });
const checks = [],
  errors = [];
const profile = path.join(root, 'test-results/smoke-' + Date.now());
const env = {
  ...process.env,
  COSMOS_USER_DATA: profile,
  COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
};
let app, page;
async function launch(extra = {}) {
  app = await electron.launch({
    executablePath: executable,
    args: ['--disable-backgrounding-occluded-windows'],
    env: { ...env, ...extra },
    timeout: 45000,
  });
  page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('.home-intro');
}
async function check(name, fn) {
  await fn();
  checks.push({ name, status: 'pass' });
  console.log('PASS', name);
}
async function shot(name) {
  await page.waitForTimeout(1600);
  await page
    .locator('.toast button')
    .click({ timeout: 300 })
    .catch(() => {});
  await page.screenshot({
    path: path.join(out, name + '.png'),
    fullPage: true,
  });
}
async function subject(name) {
  await page
    .getByRole('navigation', { name: 'Предметы' })
    .getByRole('button', { name, exact: true })
    .click();
}
async function size(w, h) {
  await app.evaluate(
    ({ BrowserWindow }, { w, h }) => BrowserWindow.getAllWindows()[0].setSize(w, h),
    { w, h },
  );
  await page.waitForTimeout(180);
}
try {
  await launch();
  await check('packaged-executable', async () => {
    assert.equal((await page.evaluate(() => window.cosmos.getAppInfo())).packaged, true);
  });
  await check('onboarding-and-home', async () => {
    await page.getByPlaceholder('Твоё имя').fill('Алексей');
    await page.getByRole('button', { name: 'Начнём знакомство' }).click();
    await page.getByRole('heading', { name: 'Привет, Алексей!' }).waitFor();
  });
  await size(1440, 1000);
  await shot('01-home-desktop');
  await check('math-new-lesson-autoplay', async () => {
    await subject('Математика');
    await page.locator('.topic-card').filter({ hasText: 'Площадь прямоугольника' }).click();
    await page.getByRole('button', { name: 'Пауза', exact: true }).waitFor();
    const first = await page.locator('.sc-counter').innerText();
    await page.bringToFront();
    await page.waitForFunction(
      (value) => document.querySelector('.sc-counter')?.textContent !== value,
      first,
      { timeout: 12000 },
    );
  });
  await check('pause-back-next-replay-speed', async () => {
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    const paused = await page.locator('.sc-counter').innerText();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.sc-counter').innerText(), paused);
    await page.getByRole('button', { name: 'Следующий шаг', exact: true }).click();
    assert.notEqual(await page.locator('.sc-counter').innerText(), paused);
    await page.getByRole('button', { name: 'Предыдущий шаг', exact: true }).click();
    assert.equal(await page.locator('.sc-counter').innerText(), paused);
    await page.getByRole('combobox', { name: 'Скорость воспроизведения' }).selectOption('2');
    await page.getByRole('button', { name: 'Повторить сцену' }).click();
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    assert.match(await page.locator('.sc-counter').innerText(), /^01/);
  });
  await page.getByRole('button', { name: /Шаг 8:/ }).click();
  await shot('02-math-lesson');
  await check('hint-and-scaffold-no-premature-answer', async () => {
    await page.getByRole('button', { name: 'Не знаю, с чего начать' }).click();
    const last = await page.locator('.message.cosmos').last().innerText();
    assert(last.includes('Сколько'));
    assert(!last.includes('21'));
    await page.getByRole('textbox', { name: 'Сообщение Cosmos' }).fill('7');
    await page.getByRole('button', { name: 'Отправить сообщение' }).click();
    assert.match(await page.locator('.message.cosmos').last().innerText(), /умножение/);
  });
  await check('assisted-answer-recorded-not-mastered', async () => {
    await page.getByRole('textbox', { name: 'Сообщение Cosmos' }).fill('21');
    await page.getByRole('button', { name: 'Отправить сообщение' }).click();
    await page.waitForTimeout(500);
    const data = await page.evaluate(() => window.cosmos.loadState());
    assert.equal(data.progress['math-rectangle'].attempts.at(-1).assisted, true);
    assert.notEqual(data.progress['math-rectangle'].mastery, 'mastered');
  });
  await check('finish-and-restart-same-topic', async () => {
    await page.getByRole('button', { name: 'Завершить занятие', exact: true }).click();
    await subject('Математика');
    await page.locator('.topic-card').filter({ hasText: 'Площадь прямоугольника' }).click();
    assert.match(await page.locator('.sc-counter').innerText(), /^01/);
  });
  for (const [name, title, step, file] of [
    ['Русский язык', 'Основа предложения', 4, '03-russian-lesson'],
    ['История', 'Крещение Руси', 5, '04-history-lesson'],
    ['Обществознание', 'Спрос и предложение', 5, '05-social-lesson'],
  ]) {
    await check(`subject-room-${name}`, async () => {
      await subject(name);
      await page.locator('.topic-card').filter({ hasText: title }).click();
      await page.getByRole('button', { name: new RegExp(`Шаг ${step}:`) }).click();
      await shot(file);
    });
  }
  await check('subject-isolation', async () => {
    await page.waitForTimeout(400);
    const data = await page.evaluate(() => window.cosmos.loadState());
    const all = Object.values(data.sessions);
    assert(all.some((s) => s.subject === 'history'));
    assert.equal(
      all
        .filter((s) => s.subject !== 'math')
        .some((s) => s.messages.some((m) => m.role === 'student' && m.text === '21')),
      false,
    );
  });
  await page.getByRole('button', { name: 'Штаб подготовки', exact: true }).click();
  await shot('06-headquarters');
  await check('real-document-ui-export', async () => {
    await page.getByRole('button', { name: 'Мои документы', exact: true }).click();
    await page.getByRole('button', { name: 'Создать документ', exact: true }).click();
    await page.getByRole('button', { name: 'Редактирование', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Название документа' })
      .fill('Проверенный конспект Cosmos');
    await page
      .getByRole('textbox', { name: 'Содержание документа' })
      .fill(
        '# Площадь прямоугольника\n\n## Формула\nS = a · b\n\nДлина 6 см, ширина 4 см.\nS = 6 · 4 = 24 см².\n\n## Проверка\nЧто получится при длине 7 см и ширине 3 см?',
      );
    await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
    await shot('07-document-preview');
    await page.getByRole('combobox', { name: 'Формат', exact: true }).selectOption('pdf');
    await page.getByRole('button', { name: 'Сохранить и экспортировать', exact: true }).click();
    await page.locator('.toast').filter({ hasText: 'PDF' }).waitFor();
    await page.waitForTimeout(400);
    const data = await page.evaluate(() => window.cosmos.loadState());
    const doc = data.documents[0];
    assert(doc.path.endsWith('.pdf'));
    const file = await fs.readFile(doc.path);
    assert.equal(file.subarray(0, 5).toString(), '%PDF-');
    assert(file.length > 1000);
    await page.getByRole('button', { name: 'Закрыть документ', exact: true }).click();
  });
  await check('memory-edit-persistence', async () => {
    await page
      .getByRole('button', {
        name: 'Что приложение помнит обо мне?',
        exact: true,
      })
      .click();
    await page.getByPlaceholder('Добавить учебное предпочтение').fill('Объяснять короткими шагами');
    await page.locator('.inline-input button').click();
    assert.equal(
      await page.getByRole('textbox', { name: 'Учебный факт', exact: true }).inputValue(),
      'Объяснять короткими шагами',
    );
    await page.waitForTimeout(400);
  });
  await check('settings-low-and-reduced-motion', async () => {
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await page.getByRole('button', { name: 'Низкое Без тяжёлых эффектов' }).click();
    await page.getByLabel('Уменьшить движение').check();
    await subject('Математика');
    await page.locator('.topic-card').filter({ hasText: 'Медиана треугольника' }).click();
    assert.equal(await page.getByRole('button', { name: 'Пауза', exact: true }).count(), 0);
    assert(
      await page
        .locator('.scene-player')
        .getAttribute('class')
        .then((s) => s.includes('sc-quality-low')),
    );
    await page.getByRole('button', { name: /Шаг 9:/ }).click();
    await shot('08-median-low-motion');
  });
  await check('1280x720-no-horizontal-overflow', async () => {
    await size(1280, 720);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await shot('09-lesson-1280');
  });
  await check('narrow-no-horizontal-overflow', async () => {
    await size(640, 800);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await shot('10-lesson-narrow');
  });
  await app.close();
  await check('restore-after-executable-relaunch', async () => {
    await launch();
    await page.getByRole('heading', { name: 'Привет, Алексей!' }).waitFor();
    const data = await page.evaluate(() => window.cosmos.loadState());
    assert(data.documents.length > 0);
    assert(data.facts.some((f) => f.text === 'Объяснять короткими шагами'));
    assert.equal(data.settings.quality, 'low');
    assert.equal(data.settings.reducedMotion, true);
  });
  await app.close();
  await check('software-rendering-no-gpu', async () => {
    await launch({ COSMOS_DISABLE_GPU: '1' });
    await subject('История');
    await page.locator('.topic-card').filter({ hasText: 'Отмена крепостного права' }).click();
    await page.getByRole('button', { name: /Шаг 6:/ }).click();
    await shot('11-software-rendering');
  });
  assert.deepEqual(errors, []);
  checks.push({ name: 'no-renderer-exceptions', status: 'pass' });
} catch (e) {
  checks.push({ name: 'smoke-interruption', status: 'fail', error: e.message });
  console.error(e);
  if (page)
    await page
      .screenshot({ path: path.join(out, 'smoke-failure.png'), fullPage: true })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
  await fs.writeFile(
    'docs/verification/native-smoke.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        executable,
        appAsarSha256: createHash('sha256')
          .update(await fs.readFile(path.join(path.dirname(executable), 'resources/app.asar')))
          .digest('hex'),
        harnessArguments: ['--disable-backgrounding-occluded-windows'],
        checks,
        errors,
      },
      null,
      2,
    ),
  );
}
