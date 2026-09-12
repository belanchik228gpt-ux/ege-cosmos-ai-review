import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const out = path.resolve(process.env.COSMOS_QA_OUT || 'docs/verification/studio-native-0.5');
const profile = path.resolve(`test-results/studio-native-${Date.now()}`);
const exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const disableGpu = process.env.COSMOS_DISABLE_GPU === '1';
await fs.mkdir(out, { recursive: true });
const result = {
  kind: 'packaged-executable',
  exe,
  profile,
  at: new Date().toISOString(),
  status: 'running',
  scriptSha256: createHash('sha256')
    .update(await fs.readFile(new URL(import.meta.url)))
    .digest('hex'),
  checks: [],
  screenshots: [],
  pageErrors: [],
  disableGpuRequested: disableGpu,
  limits: [
    'No signed-in model response: native UI and actual signed-out runtime only.',
    'No injected learning state or fake model transport.',
  ],
  asarSha256: createHash('sha256')
    .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
    .digest('hex'),
};
if (process.env.COSMOS_EXPECTED_ASAR)
  assert.equal(result.asarSha256, process.env.COSMOS_EXPECTED_ASAR.toLowerCase());
let app, page;
async function launch() {
  app = await electron.launch({
    executablePath: exe,
    args: disableGpu ? ['--disable-gpu'] : [],
    env: {
      ...process.env,
      COSMOS_USER_DATA: profile,
      COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
      COSMOS_OPENAI_USER_DATA: path.join(profile, 'isolated-auth'),
    },
    timeout: 45000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => result.pageErrors.push(e.message));
  await page.locator('.cosmos-studio').waitFor();
  result.gpuFeatureStatus = await app.evaluate(({ app }) => app.getGPUFeatureStatus());
  if (disableGpu) assert.notEqual(result.gpuFeatureStatus.gpu_compositing, 'enabled');
}
async function size(w, h) {
  await app.evaluate(
    ({ BrowserWindow }, { w, h }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setContentSize(w, h);
      win.show();
      win.focus();
    },
    { w, h },
  );
  await page.waitForTimeout(400);
}
async function shot(name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  const p = path.join(out, name + '.png');
  await page.screenshot({ path: p });
  result.screenshots.push(p);
}
const btn = (n) => page.getByRole('button', { name: n, exact: true });
const nav = (n) => page.locator('.studio-sidebar').getByRole('button', { name: n, exact: true });
try {
  await launch();
  await page.locator('.welcome-modal input').fill('Вовчик');
  await btn('Начнём знакомство').click();
  await page.locator('.studio-home').waitFor();
  await size(1600, 1000);
  await shot('01-home');
  result.checks.push('opens-without-model');
  await nav('Математика').click();
  await page.locator('.studio-chat').waitFor();
  assert.match(await page.locator('.studio-route h2').innerText(), /Модуль/);
  await shot('02-room-math');
  await btn('Начнём вместе').click();
  await page.getByRole('dialog', { name: 'Преподаватель с OpenAI' }).waitFor();
  await page.waitForTimeout(1200);
  await shot('03-sign-in');
  const status = await page.evaluate(() => window.cosmos.getOpenAIStatus());
  assert.equal(status.authenticated, false);
  assert.equal(status.runtimeAvailable, true);
  assert(status.models.length);
  result.checks.push('real-runtime-signed-out-no-fake-response');
  await btn('Закрыть подключение').click();
  await page
    .getByLabel('Сообщение Cosmos', { exact: true })
    .fill('Не понимаю модуль. Объясни на другом примере.');
  assert.equal(await page.locator('.studio-message').count(), 0);
  result.checks.push('draft-not-graded-as-wrong');
  await nav('Русский язык').click();
  await shot('04-room-russian');
  await nav('История').click();
  assert(!/988/.test(await page.locator('.studio-route h2').innerText()));
  await shot('05-room-history');
  await nav('Обществознание').click();
  await shot('06-room-social');
  await nav('Все темы ЕГЭ').click();
  if (await btn('Общий каталог тем').isVisible()) await btn('Общий каталог тем').click();
  await page.getByLabel('Предмет каталога', { exact: true }).selectOption('math');
  await btn('Общий каталог тем').click();
  await page.getByLabel('Поиск тем', { exact: true }).fill('модуль');
  await page
    .locator('.studio-topic-card')
    .filter({ has: page.getByText('1.7', { exact: true }) })
    .click();
  await page.locator('.studio-topic-detail').waitFor();
  await shot('07-topic-detail');
  assert.match(await page.locator('.studio-topic-detail .studio-tag').innerText(), /1[.]7/);
  await btn('Разобрать с Cosmos').click();
  await page.locator('.studio-chat').waitFor();
  assert.equal(await page.locator('.studio-route h2').innerText(), 'Модуль числа и расстояние');
  await page.waitForFunction(async () => {
    const s = await window.cosmos.loadState();
    return (
      Object.values(s.cloudSessions)
        .filter((l) => l.subject === 'math')
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.topicId === 'school-math-1-7'
    );
  });
  result.checks.push('search-opens-exact-topic-in-wide-chat');
  await nav('Все темы ЕГЭ').click();
  if (await btn('Общий каталог тем').isVisible()) await btn('Общий каталог тем').click();
  await page.getByLabel('Класс каталога').selectOption('11');
  await shot('08-catalog-grade11');
  assert((await page.locator('.studio-topic-card').count()) > 0);
  await page.getByLabel('Поиск тем', { exact: true }).fill('неттакойтемыzz');
  await btn('Сбросить фильтры').click();
  assert((await page.locator('.studio-topic-card').count()) > 0);
  result.checks.push('catalog-filter-and-empty-recovery');
  await nav('Настройки').click();
  if (disableGpu) {
    await btn('Учебные сцены').click();
    await page
      .locator('.quality-options')
      .getByRole('button', { name: /^Низкое/ })
      .click();
    await page
      .locator('.setting-toggle')
      .filter({ hasText: 'Уменьшить движение' })
      .locator('input')
      .check();
    await page.waitForFunction(async () => {
      const s = await window.cosmos.loadState();
      return s.settings.quality === 'low' && s.settings.reducedMotion === true;
    });
    result.preferences = { quality: 'low', reducedMotion: true, changedThroughSettings: true };
  }
  await shot('09-settings');
  await nav('Мои конспекты').click();
  await shot('10-documents');
  await nav('План подготовки').click();
  await shot('11-plan');
  await nav('Математика').click();
  await size(1280, 720);
  await shot('12-room-1280');
  await size(700, 900);
  await shot('13-room-narrow');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  await nav('Главная').click();
  assert(await page.locator('.studio-home').isVisible());
  result.checks.push('700px-no-horizontal-overflow-mobile-menu');
  await page.waitForFunction(() => !localStorage.getItem('ege-cosmos-v1-pending'));
  const before = await page.evaluate(() => window.cosmos.loadState());
  assert(Object.values(before.cloudSessions).length >= 4);
  assert.equal(new Set(Object.values(before.cloudSessions).map((l) => l.subject)).size, 4);
  await app.close();
  app = undefined;
  await launch();
  const after = await page.evaluate(() => window.cosmos.loadState());
  assert.deepEqual(after.cloudSessions, before.cloudSessions);
  if (disableGpu) {
    assert.equal(after.settings.quality, 'low');
    assert.equal(after.settings.reducedMotion, true);
    result.preferences.restoredAfterRestart = true;
  }
  result.checks.push('four-subject-isolation-and-real-restart-persistence');
  await size(1600, 1000);
  await shot('14-restored');
  assert.deepEqual(result.pageErrors, []);
  result.status = 'pass';
} catch (e) {
  result.status = 'fail';
  result.error = String(e.stack || e);
  if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
  await app?.close();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'pass') process.exitCode = 1;
}
