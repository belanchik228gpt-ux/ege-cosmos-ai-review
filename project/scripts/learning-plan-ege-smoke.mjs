import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const exe = path.resolve('release/win-unpacked/EGE Cosmos.exe');
const profile = path.resolve(
  process.env.COSMOS_QA_PROFILE || `test-results/learning-plan-ege-${Date.now()}`,
);
const out = path.resolve('docs/verification/learning-plan-ege-0.7.4');
await fs.mkdir(out, { recursive: true });
const report = {
  status: 'running',
  exe,
  profile,
  checks: [],
  screenshots: [],
  errors: [],
  modelCalls: 0,
  asarSha256: createHash('sha256')
    .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
    .digest('hex'),
};
let app, page;
const button = (name) => page.getByRole('button', { name, exact: true });
const nav = (name) => page.locator('.studio-sidebar').getByRole('button', { name, exact: true });
const shot = async (name) => {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file });
  report.screenshots.push(file);
};
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
    w.setContentSize(1280, 720);
  });
  await page.locator('.cosmos-studio').waitFor();
  if (!process.env.COSMOS_QA_PROFILE) {
    await page.locator('.welcome-modal input').waitFor();
    await page.locator('.welcome-modal input').fill('Проверка ЕГЭ');
    await button('Начнём знакомство').click();
  }
  await page.getByText('OpenAI подключён', { exact: true }).waitFor({ timeout: 45000 });
  await nav('ЕГЭ').click();
  await nav('Математика').click();
  if (await button('Начать занятие').isVisible()) await button('Начать занятие').click();
  await page
    .getByLabel('Сообщение Cosmos', { exact: true })
    .fill(
      'Хочу разобраться с квадратным уравнением x² − 4x + 3 = 0 через дискриминант. Объясни смысл первого шага без готового ответа, составь план решения и дай одно небольшое действие для моего листа.',
    );
  const started = Date.now();
  await button('Отправить сообщение').click();
  await page.locator('.studio-message.user').waitFor();
  report.modelCalls++;
  await page.locator('.studio-message.assistant:not(.streaming)').waitFor({ timeout: 160000 });
  await page.locator('.learning-plan').waitFor({ timeout: 15000 });
  report.elapsedMs = Date.now() - started;
  await page.waitForTimeout(1200);
  const state = await page.evaluate(() => window.cosmos.loadState());
  const lessons = Object.values(state.cloudSessions || {});
  const lesson = lessons.find((l) => l.messages.some((m) => m.role === 'assistant'));
  assert(lesson);
  const answer = lesson.messages.filter((m) => m.role === 'assistant').at(-1);
  assert(answer.learningStep);
  assert.notEqual(answer.verification?.status, 'conflict');
  report.reply = answer;
  report.checks.push(
    'Real EGE OpenAI response persists learningStep and avoids false arithmetic conflict',
  );
  await page.locator('.learning-plan summary').click();
  await shot('01-ege-learning-plan-1280');
  assert((await page.locator('.learning-plan').innerText()).includes('ТВОЁ СЛЕДУЮЩЕЕ ДЕЙСТВИЕ'));
  await page.locator('.learning-plan summary').click();
  await button('Решить на листе').click();
  const reference = page.getByRole('region', { name: 'Условие над листом' });
  await reference.waitFor();
  assert(await reference.locator('.tutor-markdown').count());
  assert((await reference.innerText()).includes('Сейчас:'));
  await shot('02-ege-current-sheet-1280');
  report.checks.push(
    'Primary EGE writing sheet shows current task and next instruction using formatted mathematics',
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1920, 1080),
  );
  await shot('03-ege-current-sheet-1920');
  assert.equal(report.errors.length, 0);
  report.status = 'passed';
} catch (e) {
  report.status = 'failed';
  report.error = e.stack || String(e);
  if (page) await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      status: report.status,
      out,
      error: report.error,
      modelCalls: report.modelCalls,
    }),
  );
}
