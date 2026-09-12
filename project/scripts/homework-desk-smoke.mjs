import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const profile = path.resolve(
  process.env.COSMOS_QA_PROFILE || `test-results/homework-${Date.now()}`,
);
const out = path.resolve(process.env.COSMOS_REVIEW_OUT || 'docs/verification/homework-0.7.3');
await fs.mkdir(out, { recursive: true });
const report = {
  status: 'running',
  exe,
  profile,
  checks: [],
  turns: [],
  errors: [],
  screenshots: [],
  asarSha256: createHash('sha256')
    .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
    .digest('hex'),
};
let app, page;
const button = (name) => page.getByRole('button', { name, exact: true });
const nav = (name) => page.locator('.studio-sidebar').getByRole('button', { name, exact: true });
async function poll(fn, ms = 150000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error('Timed out');
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
      COSMOS_OPENAI_USER_DATA: path.join(process.env.APPDATA, 'EGE Cosmos Studio'),
      COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
    },
    timeout: 45000,
  });
  page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setIgnoreMouseEvents(true);
    w.setContentSize(1280, 720);
  });
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.locator('.cosmos-studio').waitFor();
}
async function send(text) {
  const count = await page.locator('.school-message.assistant').count(),
    t = Date.now();
  await page.getByLabel('Сообщение школьному преподавателю', { exact: true }).fill(text);
  await button('Отправить').click();
  await poll(
    async () =>
      !(await button('Остановить').isVisible()) &&
      (await page.locator('.school-message.assistant').count()) > count,
  );
  const s = await page.evaluate(() => window.cosmos.loadState());
  const l = s.homeworkDesk.lessons[s.homeworkDesk.activeLessonId];
  const m = l.messages.filter((m) => m.kind === 'openai').at(-1);
  assert(m?.verification);
  report.turns.push({
    elapsedMs: Date.now() - t,
    text: m.text,
    question: m.question,
    verification: m.verification,
    drawing: !!m.drawing,
  });
  return m;
}
try {
  await launch();
  await page.locator('.welcome-modal input').waitFor();
  {
    await page.locator('.welcome-modal input').fill('Проверка домашней работы');
    await button('Начнём знакомство').click();
  }
  await nav('Домашние задания').click();
  await shot('01-homework-desktop');
  assert.equal(await page.getByLabel('Предмет домашней работы').locator('option').count(), 12);
  await page
    .getByLabel('Условие домашнего задания')
    .fill('Реши уравнение 3(x − 2) = 15. Объясняй по шагам, без готового ответа.');
  const source = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1100;
    c.height = 260;
    const x = c.getContext('2d');
    x.fillStyle = 'white';
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#181325';
    x.font = '38px Arial';
    x.fillText('Домашнее задание · уравнение', 60, 75);
    x.font = '54px Arial';
    x.fillText('3(x − 2) = 15', 60, 165);
    return c.toDataURL('image/png');
  });
  const fixture = path.join(profile, 'assignment.png');
  await fs.mkdir(profile, { recursive: true });
  await fs.writeFile(fixture, Buffer.from(source.split(',')[1], 'base64'));
  await page.locator('.homework-new input[type=file]').setInputFiles(fixture);
  await page.getByAltText('Фото новой домашней работы').waitFor();
  await button('Открыть разбор').click();
  await page.getByAltText('Исходное фото домашнего задания').waitFor();
  await poll(
    async () => (await page.evaluate(() => window.cosmos.getOpenAIStatus())).authenticated === true,
    45000,
  );
  await send(
    'Прочитай моё условие с фото. Не раскрывай ответ. Объясни первый шаг с простой анимацией и спроси, что нужно сделать.',
  );
  await page.locator('.school-message.assistant').last().scrollIntoViewIfNeeded();
  await shot('02-real-tutor');
  await button('Лист для решения').click();
  await page.getByRole('region', { name: 'Условие над листом' }).waitFor();
  const canvas = page.getByLabel('Белый лист для рисования');
  await button('Надпись').click();
  await page.getByLabel('Текст надписи').fill('3x - 6 = 15');
  await canvas.click({ position: { x: 100, y: 55 } });
  await page.getByLabel('Текст надписи').fill('3x = 21');
  await canvas.click({ position: { x: 100, y: 105 } });
  await page.getByLabel('Текст надписи').fill('x = 7');
  await canvas.click({ position: { x: 100, y: 155 } });
  await button('Карандаш').click();
  await canvas.hover({ position: { x: 80, y: 175 } });
  await page.mouse.down();
  await page.mouse.move(
    (await canvas.boundingBox()).x + 380,
    (await canvas.boundingBox()).y + 175,
    { steps: 12 },
  );
  await page.mouse.up();
  await button('Увеличить фото задания').click();
  await shot('03-enlarged-task');
  await page.keyboard.press('Escape');
  await shot('04-assignment-and-sheet');
  await button('Скачать PNG').click();
  await page.locator('.sheet-export-path').waitFor();
  const png = await page.locator('.sheet-export-path').getAttribute('data-path');
  const bytes = await fs.readFile(png);
  assert.equal(bytes.readUInt32BE(16), 1400);
  assert(bytes.readUInt32BE(20) > 900);
  report.checks.push({
    name: 'real-file-condition-plus-solution',
    path: png,
    width: 1400,
    height: bytes.readUInt32BE(20),
  });
  const before = await page.locator('.school-message.assistant').count(),
    t = Date.now();
  await button('Проверить решение').click();
  await poll(
    async () =>
      !(await button('Остановить').isVisible()) &&
      (await page.locator('.school-message.assistant').count()) > before,
  );
  const state = await page.evaluate(() => window.cosmos.loadState());
  let lesson = state.homeworkDesk.lessons[state.homeworkDesk.activeLessonId];
  let reply = lesson.messages.filter((m) => m.kind === 'openai').at(-1);
  assert(reply.verification);
  assert.match(reply.text, /верн|правильн|получил|сходится/i);
  report.turns.push({
    elapsedMs: Date.now() - t,
    text: reply.text,
    question: reply.question,
    verification: reply.verification,
  });
  await page.locator('.school-message.assistant').last().scrollIntoViewIfNeeded();
  await shot('05-real-solution-review');
  await button('Лист для вопроса Cosmos').click();
  const questionCondition = await page.locator('.sheet-assignment-content').innerText();
  assert(questionCondition.includes(reply.question));
  assert.equal(await page.locator('.sheet-assignment-content img').count(), 0);
  assert.equal(await button('Проверить решение').isEnabled(), false);
  await shot('05b-separate-practice-sheet');
  await button('Закрыть лист').click();
  report.checks.push({ name: 'separate-new-question-condition-and-empty-draft', passed: true });
  await button('Конспект').click();
  await button('HTML').click();
  await poll(
    async () =>
      !!(await page.evaluate(() => window.cosmos.loadState())).homeworkDesk.documents.at(-1)?.path,
    30000,
  );
  const doc = (await page.evaluate(() => window.cosmos.loadState())).homeworkDesk.documents.at(-1);
  assert((await fs.stat(doc.path)).size > 1000);
  report.checks.push({ name: 'real-homework-document', path: doc.path });
  await button('К домашним заданиям').click();
  await page.getByLabel('Предмет домашней работы').selectOption('chemistry');
  await page
    .getByLabel('Условие домашнего задания')
    .fill('Почему нельзя менять индексы при подборе коэффициентов в уравнении реакции?');
  await button('Открыть разбор').click();
  assert.equal(await button('Лист для решения').count(), 0);
  await send('Объясни мой вопрос на маленьком примере, одним шагом и спроси меня.');
  await nav('Школа').click();
  const independent = await page.evaluate(() => window.cosmos.loadState());
  assert.equal(Object.keys(independent.school?.lessons || {}).length, 0);
  assert.equal(Object.keys(independent.cloudSessions || {}).length, 0);
  report.checks.push({ name: 'separate-homework-history-and-school-progress', passed: true });
  await app.close();
  await launch();
  await nav('Домашние задания').click();
  await page.getByLabel('Поиск прошлых диалогов').fill('3(x');
  await page.locator('.conversation-history-list button').first().click();
  await page.getByAltText('Исходное фото домашнего задания').waitFor();
  await button('Лист для решения').click();
  assert(
    await page.getByLabel('Белый лист для рисования').evaluate((c) => {
      const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      return p.some((v, i) => i % 4 === 0 && v < 80);
    }),
  );
  await shot('06-restored-sheet');
  await button('Закрыть лист').click();
  await button('Завершить без подключения').click();
  await page.getByText('ИТОГ СОХРАНЁН', { exact: true }).waitFor();
  report.checks.push({ name: 'restart-photo-chat-ink-summary', passed: true });
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (e) {
  report.status = 'failed';
  report.error = String(e.stack || e);
  if (page) await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  await app?.close().catch(() => {});
  console.log(JSON.stringify(report, null, 2));
}
