import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const disableGpu = process.env.COSMOS_DISABLE_GPU === '1';
const out = path.resolve(process.env.COSMOS_QA_OUT || 'docs/verification/studio-day-native-0.5');
const profile = path.resolve(`test-results/studio-day-native-${Date.now()}`);
const documentsDir = path.join(profile, 'documents');
const asarSha256 = createHash('sha256')
  .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
  .digest('hex');
if (process.env.COSMOS_EXPECTED_ASAR)
  assert.equal(
    asarSha256,
    process.env.COSMOS_EXPECTED_ASAR.toLowerCase(),
    'Run only the designated build.',
  );
await fs.mkdir(out, { recursive: true });
const result = {
  kind: 'actual-packaged-studio-day-no-model',
  startedAt: new Date().toISOString(),
  status: 'running',
  exe,
  profile,
  asarSha256,
  scriptSha256: createHash('sha256')
    .update(await fs.readFile(new URL(import.meta.url)))
    .digest('hex'),
  checks: [],
  screenshots: [],
  pageErrors: [],
  disableGpuRequested: disableGpu,
  limits: [
    'All learning actions performed through UI in a fresh unsigned-in profile. No generated or injected model answers.',
    'Completing a plan block is not mastery; zero independently correct answers are expected.',
    'Pause preserves an in-memory unsent draft; restart verification covers saved runs, sessions and the exported document.',
    '720p screenshot is application content size, not a Windows DPI or 200% scaling test.',
  ],
};
let app, page, runId;
const button = (name) => page.getByRole('button', { name, exact: true });
const nav = (name) => page.locator('.studio-sidebar').getByRole('button', { name, exact: true });
const readState = () => page.evaluate(() => window.cosmos.loadState());
const readRun = async () => (await readState()).planning.runs[runId];
async function settled() {
  await page.waitForFunction(() => !localStorage.getItem('ege-cosmos-v1-pending'));
  await page.waitForTimeout(250);
}
async function screenshot(name, target = page) {
  await target.evaluate(() => window.scrollTo(0, 0));
  await target.waitForTimeout(350);
  const file = path.join(out, name + '.png');
  await target.screenshot({ path: file });
  result.screenshots.push(file);
}
async function launch() {
  const env = {
    ...process.env,
    COSMOS_USER_DATA: profile,
    COSMOS_DOCUMENTS_DIR: documentsDir,
    COSMOS_OPENAI_USER_DATA: path.join(profile, 'isolated-auth'),
  };
  // A signed-in workspace override must never leak into this no-model scenario.
  delete env.COSMOS_RUNTIME_DIR;
  app = await electron.launch({
    executablePath: exe,
    args: disableGpu ? ['--disable-gpu'] : [],
    env,
    timeout: 45000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => result.pageErrors.push(e.message));
  await page.locator('.cosmos-studio').waitFor();
  result.gpuFeatureStatus = await app.evaluate(({ app }) => app.getGPUFeatureStatus());
  if (disableGpu) assert.notEqual(result.gpuFeatureStatus.gpu_compositing, 'enabled');
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setContentSize(1280, 720);
    w.show();
    w.focus();
  });
}
async function waitRun(predicate, description) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    const run = await readRun();
    if (predicate(run)) return run;
    await page.waitForTimeout(150);
  }
  assert.fail(description);
}
try {
  await launch();
  await page.locator('.welcome-modal input').fill('Проверка дня');
  await button('Начнём знакомство').click();
  await page.locator('.studio-home').waitFor();
  const auth = await page.evaluate(() => window.cosmos.getOpenAIStatus());
  assert.notEqual(auth.authenticated, true, 'Fresh QA profile must not reuse a signed-in account.');
  result.checks.push('fresh-unsigned-profile-no-model-generation');
  if (disableGpu) {
    await nav('Настройки').click();
    await button('Учебные сцены').click();
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

  await nav('План подготовки').click();
  await page.getByLabel('Бюджет выбранного дня', { exact: true }).fill('120');
  await page
    .locator('.study-day-budget')
    .getByRole('button', { name: 'Применить', exact: true })
    .click();
  await settled();
  const today = await page.evaluate(() => {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
  });
  const planned = (await readState()).planning.days[today];
  assert.equal(planned.budgetMinutes, 120);
  assert.equal(
    planned.entries.reduce((sum, b) => sum + b.minutes, 0),
    120,
    '120 minutes must actually be allocated.',
  );
  assert(planned.entries.filter((b) => b.kind !== 'break').length >= 3);
  await screenshot('01-plan-120min');
  await button('Заниматься сегодня').click();
  await page.locator('.studio-day').waitFor();
  await settled();
  let state = await readState();
  runId = state.planning.activeRunId;
  assert(runId);
  let run = state.planning.runs[runId];
  assert.equal(run.status, 'active');
  assert.equal(
    run.blocks.reduce((sum, b) => sum + b.minutes, 0),
    120,
  );
  const first = run.blocks.find((b) => b.id === run.activeBlockId);
  assert(first?.subject && first.kind !== 'break');
  assert((await page.locator('.studio-day-header').innerText()).includes(first.title));
  assert.match(await page.locator('.studio-day-header').innerText(), /120 МИНУТ/);
  assert.equal(await page.locator('.studio-day-strip > button').count(), run.blocks.length);
  assert(
    (await page.locator('.studio-day-strip > button.active').innerText()).includes(
      `${first.minutes} мин`,
    ),
  );
  result.checks.push('actual-120-minute-plan-current-topic-and-block-count');
  await screenshot('02-active-day-1280');

  const draft = 'Я пока думаю: модуль — расстояние от числа до нуля.';
  const input = page.getByRole('textbox', { name: 'Сообщение Cosmos', exact: true });
  await input.fill(draft);
  await screenshot('02b-day-composer-1280');
  result.dayComposerBounds = await input.evaluate((el) => ({
    ...el.getBoundingClientRect().toJSON(),
    fontSize: getComputedStyle(el).fontSize,
  }));
  assert(
    result.dayComposerBounds.top >= 0 && result.dayComposerBounds.bottom <= 720,
    'The day-plan composer must also fit in the 1280×720 viewport.',
  );
  assert(
    result.dayComposerBounds.width >= 240 && parseFloat(result.dayComposerBounds.fontSize) >= 12,
  );
  result.checks.push('day-plan-composer-visible-and-readable-at-1280x720');
  assert.equal(await page.locator('.studio-message').count(), 0);
  await waitRun(
    (r) => r.blocks.find((b) => b.id === first.id).activeMs > 0,
    'Focused day activity was not recorded.',
  );
  await page
    .locator('.studio-day-header')
    .getByRole('button', { name: 'Пауза', exact: true })
    .click();
  run = await waitRun((r) => r.status === 'paused', 'Day did not pause.');
  assert.equal(run.blocks.find((b) => b.id === first.id).status, 'paused');
  const pausedMs = run.blocks.find((b) => b.id === first.id).activeMs;
  assert.equal(
    await input.isVisible(),
    false,
    'Paused conversation must be unavailable for input.',
  );
  await screenshot('03-day-paused');
  await page.waitForTimeout(5300);
  assert.equal(
    (await readRun()).blocks.find((b) => b.id === first.id).activeMs,
    pausedMs,
    'Paused time must not count as activity.',
  );
  await button('Продолжить занятие').click();
  await input.waitFor({ state: 'visible' });
  assert.equal(await input.inputValue(), draft, 'Pausing must retain the unsent draft.');
  assert.equal(
    await page.locator('.studio-message').count(),
    0,
    'A retained draft must not create an attempt or message.',
  );
  result.checks.push('pause-freezes-active-time-and-resume-retains-draft');
  await screenshot('04-day-resumed');

  await button('Следующий блок').click();
  run = await waitRun((r) => r.activeBlockId !== first.id, 'Next block did not activate.');
  assert.equal(run.blocks.find((b) => b.id === first.id).status, 'completed');
  assert.equal(run.blocks.find((b) => b.id === first.id).evidence.independentCorrect, 0);
  while (run.blocks.find((b) => b.id === run.activeBlockId)?.kind === 'break') {
    const rest = run.activeBlockId;
    await button('Я отдохнул, продолжаем').click();
    run = await waitRun((r) => r.activeBlockId !== rest, 'Rest did not finish.');
    assert.equal(run.blocks.find((b) => b.id === rest).status, 'completed');
  }
  const skippedId = run.activeBlockId;
  assert(skippedId && skippedId !== first.id);
  await button('Отложить этот блок').click();
  run = await waitRun(
    (r) => r.blocks.find((b) => b.id === skippedId).status === 'skipped',
    'Block was not marked skipped.',
  );
  assert.notEqual(run.activeBlockId, skippedId);
  result.checks.push('next-and-skip-have-distinct-statuses-without-fake-mastery');
  await screenshot('05-after-next-and-skip');
  await page
    .locator('.studio-day-header')
    .getByRole('button', { name: 'Завершить сегодня', exact: true })
    .click();
  await page.locator('.studio-day-report').waitFor();
  run = await readRun();
  assert.equal(run.status, 'finished-early');
  assert.equal(run.report.endedEarly, true);
  assert.equal(run.report.independentCorrect, 0);
  assert.equal(run.report.attempts, 0);
  assert.equal(run.report.completedBlocks, 1);
  assert.equal(run.report.skippedBlocks, 1);
  assert(run.report.unfinishedBlocks > 0);
  assert(run.report.activeMs > 0);
  assert(!run.activeBlockId);
  result.dayReport = run.report;
  result.checks.push('early-report-honestly-retains-unfinished-work-and-zero-independent-answers');
  await screenshot('06-early-report');

  await button('Сохранить отчёт').click();
  await page.locator('.toast').filter({ hasText: 'Отчёт сохранён в файл' }).waitFor();
  await page.waitForFunction(async () =>
    (await window.cosmos.loadState()).documents.some(
      (d) => d.type === 'Отчёт о прогрессе' && d.path?.endsWith('.html'),
    ),
  );
  await settled();
  state = await readState();
  const document = state.documents
    .filter((d) => d.type === 'Отчёт о прогрессе' && d.path?.endsWith('.html'))
    .at(-1);
  const reportFile = path.resolve(document.path);
  assert(
    reportFile.startsWith(path.resolve(documentsDir) + path.sep),
    'Export must stay in the isolated test document directory.',
  );
  const bytes = await fs.readFile(reportFile),
    html = bytes.toString('utf8');
  assert(bytes.length > 500);
  assert.match(html, /<!doctype html/i);
  assert(html.includes(first.title));
  assert(html.includes('пропущен') && html.includes('не завершён'));
  assert(html.includes('Итог модели не запрашивался'));
  result.export = {
    path: reportFile,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  result.checks.push('actual-html-file-created-and-registered-after-successful-write');
  const reportWindowPromise = app.waitForEvent('window');
  await app.evaluate(async ({ BrowserWindow }, file) => {
    const w = new BrowserWindow({
      width: 1280,
      height: 900,
      show: true,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: false,
      },
    });
    await w.loadFile(file);
    w.show();
    w.focus();
  }, reportFile);
  const reportPage = await reportWindowPromise;
  await reportPage.waitForLoadState('load');
  await screenshot('07-real-exported-html', reportPage);
  await reportPage.close();

  await nav('Математика').click();
  await page.locator('.studio-room').waitFor();
  await screenshot('08-composer-1280');
  result.composerBounds = await page
    .getByRole('textbox', { name: 'Сообщение Cosmos', exact: true })
    .evaluate((el) => ({
      ...el.getBoundingClientRect().toJSON(),
      fontSize: getComputedStyle(el).fontSize,
      viewportHeight: innerHeight,
      viewportWidth: innerWidth,
    }));
  assert(
    result.composerBounds.top >= 0 && result.composerBounds.bottom <= 720,
    'At 1280×720 the composer must fit in the visible page.',
  );
  assert(result.composerBounds.width >= 240 && parseFloat(result.composerBounds.fontSize) >= 12);
  result.checks.push('composer-visible-and-readable-at-1280x720');
  const conversationTitle = await page.locator('.studio-route h2').innerText();
  await nav('Настройки').click();
  await page
    .locator('.workspace-trail')
    .getByRole('button', { name: 'Назад', exact: true })
    .click();
  await page.locator('.studio-chat').waitFor();
  assert.equal(await page.locator('.studio-route h2').innerText(), conversationTitle);
  const historyCount = Object.values((await readState()).cloudSessions).filter(
    (l) => l.subject === 'math',
  ).length;
  await page
    .locator('.studio-tabs')
    .getByRole('button', { name: /^История/ })
    .click();
  assert.equal(await page.locator('.studio-history-row').count(), historyCount);
  assert(historyCount > 0);
  await screenshot('08b-conversation-history');
  const row = page.locator('.studio-history-row').last(),
    storedTitle = await row.locator('h3').innerText();
  await row.click();
  await page.locator('.studio-chat').waitFor();
  assert.equal(await page.locator('.studio-route h2').innerText(), storedTitle);
  assert.equal(
    Object.values((await readState()).cloudSessions).filter((l) => l.subject === 'math').length,
    historyCount,
  );
  result.checks.push('sidebar-back-retains-conversation-and-history-opens-without-duplicates');
  await nav('Все темы ЕГЭ').click();
  await button('Базовый ЕГЭ · 21 позиция').click();
  await page.locator('.basic-exam-guide').waitFor();
  assert.equal(await page.locator('.basic-exam-card').count(), 21);
  await page.getByRole('searchbox', { name: 'Найти позицию', exact: true }).fill('17');
  assert.equal(await page.locator('.basic-exam-card').count(), 1);
  assert.equal(await page.locator('.basic-exam-number').innerText(), '17');
  await page.locator('.basic-exam-card summary').click();
  assert(await page.locator('.basic-exam-requirement').isVisible());
  assert((await page.locator('.basic-exam-requirement').innerText()).length > 20);
  await screenshot('08c-basic-exam-position17');
  const cardFile = path.join(out, '08d-basic-exam-position17-detail.png');
  await page.locator('.basic-exam-card').screenshot({ path: cardFile });
  result.screenshots.push(cardFile);
  await page.getByRole('searchbox', { name: 'Найти позицию', exact: true }).fill('');
  assert.equal(await page.locator('.basic-exam-card').count(), 21);
  result.checks.push('basic-exam-guide-shows-21-positions-and-exact-17-filter');
  if (await button('Общий каталог тем').isVisible()) await button('Общий каталог тем').click();
  const search = page.getByLabel('Поиск тем', { exact: true });
  await search.fill('модуль');
  await screenshot('09-search-1280');
  result.searchBounds = await search.evaluate((el) => {
    const label = el.closest('label'),
      icon = label?.querySelector('svg');
    return {
      input: el.getBoundingClientRect().toJSON(),
      icon: icon?.getBoundingClientRect().toJSON(),
      fontSize: getComputedStyle(el).fontSize,
    };
  });
  const sb = result.searchBounds;
  assert(sb.input.width > 200 && sb.input.top >= 0 && sb.input.bottom < 720);
  assert(sb.icon, 'Search icon should be present.');
  assert(
    Math.abs(sb.icon.y + sb.icon.height / 2 - (sb.input.y + sb.input.height / 2)) <= 8,
    'Search icon should align with the text input line.',
  );
  assert(
    sb.icon.x < sb.input.x + 70,
    'Search icon should be at the start of the field, not centered above it.',
  );
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  result.checks.push('search-line-aligned-and-no-horizontal-overflow-at-1280x720');

  await settled();
  const before = await readState();
  assert(
    Object.values(before.cloudSessions).every((l) => l.messages.length === 0),
    'This run must not create or inject any model messages.',
  );
  await app.close();
  app = undefined;
  await launch();
  const restored = await readState();
  assert.deepEqual(restored.planning.runs[runId].report, before.planning.runs[runId].report);
  assert.equal(restored.planning.runs[runId].status, 'finished-early');
  assert.deepEqual(restored.cloudSessions, before.cloudSessions);
  if (disableGpu) {
    assert.equal(restored.settings.quality, 'low');
    assert.equal(restored.settings.reducedMotion, true);
    result.preferences.restoredAfterRestart = true;
  }
  assert(restored.documents.some((d) => d.id === document.id && d.path === reportFile));
  assert.equal(
    createHash('sha256')
      .update(await fs.readFile(reportFile))
      .digest('hex'),
    result.export.sha256,
  );
  await nav('Мои конспекты').click();
  await page.getByRole('heading', { name: document.title, exact: true }).waitFor();
  await screenshot('10-restored-report-document');
  result.checks.push('real-restart-retains-run-report-sessions-and-file-reference');
  assert.deepEqual(result.pageErrors, []);
  result.status = 'pass';
} catch (error) {
  result.status = 'fail';
  result.error = String(error.stack || error);
  if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
  await app?.close();
  result.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'pass') process.exitCode = 1;
}
