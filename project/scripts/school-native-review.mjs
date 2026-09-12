import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const out = path.resolve(process.env.COSMOS_QA_OUT || 'docs/verification/school-native-0.6.0');
const profile = path.resolve(
  process.env.COSMOS_QA_PROFILE || `test-results/school-native-${Date.now()}`,
);
const live = process.env.COSMOS_QA_LIVE === '1',
  report = {
    at: new Date().toISOString(),
    status: 'running',
    exe,
    profile,
    live,
    checks: [],
    screenshots: [],
    turns: [],
    documents: [],
    errors: [],
    limits: [
      'Actual packaged Electron EXE driven through Playwright; no model responses or learning data injected. New isolated QA profile. Existing Cosmos sign-in reused by runtime, credentials not read or copied. External OS AutoClicker excluded only from this QA window.',
    ],
  };
await fs.mkdir(out, { recursive: true });
report.asarSha256 = createHash('sha256')
  .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
  .digest('hex');
let app, page;
async function poll(fn, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Poll timed out');
}
const nav = (name) => page.locator('.studio-sidebar').getByRole('button', { name, exact: true });
const button = (name) => page.getByRole('button', { name, exact: true });
async function shot(name) {
  const p = path.join(out, `${name}.png`);
  await page.screenshot({ path: p });
  report.screenshots.push(p);
}
async function launch() {
  app = await electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      COSMOS_USER_DATA: profile,
      COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
      COSMOS_OPENAI_USER_DATA: path.join(process.env.APPDATA, 'EGE Cosmos Studio'),
    },
    timeout: 45000,
  });
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setIgnoreMouseEvents(true);
    w.setContentSize(1600, 1000);
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(25000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.locator('.cosmos-studio').waitFor();
}
async function course(name) {
  await nav('Все школьные предметы').click();
  const all = button('Все предметы');
  if (await all.isVisible()) await all.click();
  await page.getByLabel('Поиск школьных тем', { exact: true }).fill('');
  await page
    .locator('.school-subject-card')
    .filter({ has: page.getByRole('heading', { name, exact: true }) })
    .click();
  await page.locator('.school-topic-title').first().click();
  await button('Изучать раздел').click();
  await page.locator('.school-room').waitFor();
}
async function send(text, name) {
  const before = await page.locator('.school-message.assistant').count(),
    start = Date.now();
  await page
    .getByRole('textbox', { name: 'Сообщение школьному преподавателю', exact: true })
    .fill(text);
  await button('Отправить').click();
  await poll(
    async () =>
      !(await button('Остановить').isVisible()) &&
      ((await page.locator('.school-message.assistant').count()) > before ||
        (await page.locator('.school-feedback').count()) > 0),
    170000,
  );
  assert.equal(
    await page.locator('.school-feedback').count(),
    0,
    await page.locator('.school-feedback').allTextContents(),
  );
  const answer = await page.locator('.school-message.assistant').last().innerText();
  report.turns.push({
    name,
    prompt: text,
    answer,
    elapsedMs: Date.now() - start,
    drawings: await page
      .locator('.school-message.assistant')
      .last()
      .locator('.dialogue-scene')
      .count(),
  });
  await page.locator('.school-message.assistant').last().scrollIntoViewIfNeeded();
  await shot(name);
  console.log('LIVE', name, Date.now() - start);
  return answer;
}
try {
  await launch();
  if (!process.env.COSMOS_QA_PROFILE || (await page.locator('.welcome-modal').isVisible())) {
    await page.locator('.welcome-modal').waitFor();
    await page.locator('.welcome-modal input').fill('Проверка школы');
    await button('Начнём знакомство').click();
  }
  await nav('Школа').click();
  await page.locator('.school-workspace').waitFor();
  await shot('school-today');
  const egeBefore = (await page.evaluate(() => window.cosmos.loadState())).cloudSessions || {};
  await nav('Все школьные предметы').click();
  await shot('subjects-10');
  report.subjects10 = await page.locator('.school-subject-card h2').allTextContents();
  assert(report.subjects10.includes('Физика'));
  assert(report.subjects10.includes('Химия'));
  assert(report.subjects10.includes('Английский язык'));
  for (const grade of ['8', '9', '10', '11']) {
    await page.getByLabel('Школьный класс', { exact: true }).selectOption(grade);
    const names = await page.locator('.school-subject-card h2').allTextContents();
    report.checks.push({ grade, subjects: names });
    assert(!names.some((n) => /технология|изо|немецкий|французский/i.test(n)));
    if (grade === '8') assert(!names.includes('Обществознание'));
  }
  await page.getByLabel('Школьный класс', { exact: true }).selectOption('10');
  await page.getByLabel('Поиск школьных тем', { exact: true }).fill('Ньютон');
  assert((await page.locator('.school-topic-card').count()) > 0);
  await page.locator('.school-topic-title').first().click();
  await shot('searched-newton');
  await page.getByLabel('Поиск школьных тем', { exact: true }).fill('');
  await nav('Мой школьный план').click();
  await button('Неделя').click();
  assert((await page.locator('.school-plan-items article').count()) > 0);
  await page
    .locator('.school-plan-items input[placeholder]')
    .first()
    .fill('Моё школьное упражнение: проверить единицы');
  await shot('weekly-plan');
  await course('Физика');
  await page.locator('#school-local-material summary').click();
  await button('Показать разбор для самопроверки').click();
  await shot('physics-offline-card');
  const library = await page.evaluate(() => window.cosmos.listSchoolSources());
  assert.equal(library.length, 27);
  const f = await page.evaluate(() =>
    window.cosmos.readSchoolSource({
      id: 'edsoo-program-physics-10-11-2025',
      page: 8,
      maxChars: 3500,
    }),
  );
  assert(f.ok && f.fragments?.length);
  report.checks.push({
    library: library.length,
    readFragmentPage: f.fragments[0].page,
    fragmentChars: f.fragments[0].text.length,
  });
  if (live) {
    await poll(() =>
      page.evaluate(async () => (await window.cosmos.getOpenAIStatus()).authenticated === true),
    );
    await send(
      'Объясни второй закон Ньютона на одном примере: тело массой 2 кг, результирующая сила 6 Н. Сначала покажи рисунок с силами и формулу, затем спроси меня об ускорении, не выдавая ответ.',
      'physics-live',
    );
    await send(
      'Получается 3 метра в секунду в квадрате. Почему единица именно такая?',
      'physics-check',
    );
    await button('Завершить с отчётом Cosmos').click();
    await poll(
      async () =>
        await page.getByRole('heading', { name: 'Занятие разобрано', exact: true }).isVisible(),
      170000,
    );
    await shot('physics-summary');
  } else await button('Завершить без подключения').click();
  await button('Конспект').click();
  await page.locator('.school-document-preview').waitFor();
  await shot('school-document-preview');
  for (const format of ['HTML', 'PDF']) {
    await button(format).click();
    await poll(() =>
      page.evaluate(
        async (f) =>
          (await window.cosmos.loadState()).school.documents.some((d) =>
            d.path?.endsWith('.' + f.toLowerCase()),
          ),
        format,
      ),
    );
    const d = (await page.evaluate(() => window.cosmos.loadState())).school.documents.find((d) =>
      d.path?.endsWith('.' + format.toLowerCase()),
    );
    const bytes = await fs.readFile(d.path);
    assert(bytes.length > 1000);
    assert(d.path.includes('Школа'));
    if (format === 'PDF') assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    const dest = path.join(out, 'physics-lesson.' + format.toLowerCase());
    await fs.copyFile(d.path, dest);
    report.documents.push({
      path: d.path,
      artifact: dest,
      bytes: bytes.length,
      drawings: d.drawings.length,
    });
  }
  if (live) {
    await course('Химия');
    await send(
      'Объясни на примере CH₄, почему у углерода четыре связи. Небольшой рисунок и один вопрос мне, без готовой длинной лекции.',
      'chemistry-live',
    );
    await course('Английский язык');
    await send(
      'Помоги различить I have lost my key и I lost my key yesterday. Объясни коротко по-русски и дай один новый английский пример с пропуском для моей попытки.',
      'english-live',
    );
  }
  await course('Математика');
  await button('Лист для решения').click();
  await page.getByRole('dialog', { name: 'Лист для решения', exact: true }).waitFor();
  const canvas = page.getByLabel('Белый лист для рисования', { exact: true }),
    b = await canvas.boundingBox();
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.4, { steps: 15 });
  await page.mouse.up();
  await shot('school-math-sheet');
  await button('Закрыть лист').click();
  await nav('Школьная память').click();
  await page.getByLabel('Предмет', { exact: true }).selectOption('physics');
  await page
    .getByLabel('Добавить учебную заметку', { exact: true })
    .fill('QA: в школе разбирали второй закон Ньютона');
  await button('Сохранить заметку').click();
  await shot('school-memory');
  await nav('ЕГЭ').click();
  await nav('Все темы ЕГЭ').click();
  await page.locator('.studio-catalog').waitFor();
  await shot('ege-preserved');
  assert.deepEqual(
    (await page.evaluate(() => window.cosmos.loadState())).cloudSessions || {},
    egeBefore,
  );
  await nav('Школа').click();
  await nav('Все школьные предметы').click();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1280, 720),
  );
  await shot('school-1280x720');
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(850, 820),
  );
  await shot('school-narrow');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  await app.close();
  await launch();
  await page.locator('.school-workspace').waitFor();
  const restored = await page.evaluate(() => window.cosmos.loadState());
  assert(restored.school.enabled);
  assert(restored.school.facts.some((f) => f.text.includes('QA: в школе')));
  assert(restored.school.documents.some((d) => d.path?.endsWith('.pdf')));
  await shot('school-restored');
  report.checks.push(
    'school-mode-restored-after-process-restart',
    'EGE-conversations-preserved',
    'plan-note-edited-through-UI',
    'math-actual-pointer-stroke',
    'real-PDF-export',
    'responsive-window-resize',
  );
  assert.deepEqual(report.errors, []);
  report.status = 'pass';
} catch (e) {
  report.status = 'fail';
  report.error = e.stack;
  console.error(e);
  await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await app?.close().catch(() => {});
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
