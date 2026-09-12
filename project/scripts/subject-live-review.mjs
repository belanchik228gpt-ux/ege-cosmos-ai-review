import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const exe = path.resolve('release/win-unpacked/EGE Cosmos.exe'),
  profile = path.resolve(`test-results/subject-live-${Date.now()}`),
  out = path.resolve('docs/verification/subject-live-0.7.1');
await fs.mkdir(out, { recursive: true });
const report = {
  status: 'running',
  exe,
  profile,
  turns: [],
  errors: [],
  scope:
    'Two actual OpenAI turns with new circuit renderer, real packaged EXE. Isolated learning profile; shared sign-in used by runtime only.',
};
report.asarSha256 = createHash('sha256')
  .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
  .digest('hex');
let app, page;
async function poll(fn, ms = 150000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error('Timed out');
}
const button = (name) => page.getByRole('button', { name, exact: true });
const nav = (name) => page.locator('.studio-sidebar').getByRole('button', { name, exact: true });
try {
  app = await electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      COSMOS_USER_DATA: profile,
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
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.locator('.welcome-modal input').fill('Проверка 7 класса');
  await button('Начнём знакомство').click();
  await nav('Школа').click();
  await nav('Все школьные предметы').click();
  await page.getByLabel('Школьный класс', { exact: true }).selectOption('8');
  await page
    .locator('.school-subject-card')
    .filter({ has: page.getByRole('heading', { name: 'Физика', exact: true }) })
    .click();
  await page.getByLabel('Поиск школьных тем', { exact: true }).fill('электрическ');
  await page.locator('.school-topic-title').first().click();
  await button('Изучать раздел').click();
  await poll(
    async () => (await page.evaluate(() => window.cosmos.getOpenAIStatus())).authenticated === true,
    45000,
  );
  for (const prompt of [
    'Объясни на рисунке простой электрической цепи с одним резистором: источник 6 В, сопротивление 3 Ом. Покажи саму цепь. Пока не называй силу тока: спроси, какую формулу использовать.',
    'Нужно I = U / R, получается 2 А. Проверь мой ответ и перерисуй цепь для напряжения 12 В при том же сопротивлении. Пока не называй новый ток: спроси следующий шаг.',
  ]) {
    const before = await page.locator('.school-message.assistant').count(),
      start = Date.now();
    await page.getByLabel('Сообщение школьному преподавателю', { exact: true }).fill(prompt);
    await button('Отправить').click();
    await poll(
      async () =>
        !(await button('Остановить').isVisible()) &&
        (await page.locator('.school-message.assistant').count()) > before,
    );
    assert.equal(await page.locator('.school-feedback').count(), 0);
    const answer = page.locator('.school-message.assistant').last();
    await answer.scrollIntoViewIfNeeded();
    const scene = answer.locator('.dialogue-scene');
    await scene.getByRole('button', { name: 'Кадр 2', exact: true }).click();
    report.turns.push({
      prompt,
      figure: await scene.locator('[data-subject-figure]').getAttribute('data-subject-figure'),
      answer: await answer.innerText(),
      drawings: await answer.locator('.dialogue-scene').count(),
      elapsedMs: Date.now() - start,
    });
    assert.equal(report.turns.at(-1).drawings, 1);
    await page.screenshot({ path: path.join(out, `turn-${report.turns.length}.png`) });
  }
  await nav('Мой школьный план').click();
  await page.getByLabel('Поиск прошлых диалогов').fill('электрическ');
  await page.locator('.conversation-history-list button').first().click();
  assert.equal(await page.locator('.school-message.assistant').count(), 2);
  report.historyRestoredActualReplies = true;
  const sources = await page.evaluate(() => window.cosmos.listSchoolSources());
  assert.equal(sources.length, 22);
  report.gradeSevenSources = sources.filter((s) => s.grades.includes(7)).map((s) => s.id);
  assert.deepEqual(report.errors, []);
  report.status = 'pass';
} catch (e) {
  report.status = 'failed';
  report.failure = String(e.stack || e);
  process.exitCode = 1;
  if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
  if (app) await app.close();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
