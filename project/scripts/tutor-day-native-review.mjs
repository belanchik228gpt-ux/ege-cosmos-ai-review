/** Actual installed-app review for the 120-minute day with the unified TutorRoom.
 * Run only when the release owner grants the native window queue.
 * No injected learning state, fabricated timing, model transport, or GPU runtime.
 * Usage: node scripts/tutor-day-native-review.mjs
 * Optional: COSMOS_EXE, COSMOS_EXPECTED_ASAR_SHA, COSMOS_QA_OUT.
 */
import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const exe = path.resolve(process.env.COSMOS_EXE || 'test-results/installed-app/EGE Cosmos.exe');
const out = path.resolve(process.env.COSMOS_QA_OUT || 'docs/verification/tutor-day-native-0.3');
const profile = path.resolve(`test-results/tutor-day-native-${Date.now()}`);
const documents = path.join(profile, 'documents');
const runtime = path.join(profile, 'empty-runtime');
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const result = {
  kind: 'installed-executable',
  startedAt: new Date().toISOString(),
  status: 'running',
  profile,
  runtime,
  checks: [],
  screenshots: [],
  pageErrors: [],
  visualReview: 'pending-personal-review',
  boundaries: [
    'The selected daily plan is 120 minutes; the test does not pretend to study for two hours.',
    'All learning changes originate in actual UI controls; state and IPC are read only.',
    'A unique empty runtime prevents model or GPU startup; no live-model quality claim.',
    'Manual completion of one partly practised block is not mastery of its topic.',
    'PNG capture and PDF signatures do not replace personal visual review of those artifacts.',
  ],
};
let app, page, stage, runId, sessionId, dayDate, finalState, timer;
let cleaning;
async function cleanup() {
  if (cleaning) return cleaning;
  if (!app) return;
  const closing = app;
  app = undefined;
  cleaning = closing.close().finally(() => {
    cleaning = undefined;
  });
  return cleaning;
}
async function launch() {
  app = await electron.launch({
    executablePath: exe,
    timeout: 45000,
    env: {
      ...process.env,
      COSMOS_USER_DATA: profile,
      COSMOS_DOCUMENTS_DIR: documents,
      COSMOS_RUNTIME_DIR: runtime,
    },
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  await page.locator('.app-shell').waitFor();
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setContentSize(1280, 720);
    window.show();
    window.focus();
  });
}
const button = (name) => page.getByRole('button', { name, exact: true });
const input = () => page.getByRole('textbox', { name: 'Сообщение Cosmos', exact: true });
const toolbar = () => page.locator('.guided-toolbar');
async function persisted() {
  // Await the synchronous recovery journal's removal before reading the asynchronous disk port.
  // Reading the IPC before the queued saves finish can otherwise overtake the latest change.
  await page.waitForFunction(() => !localStorage.getItem('ege-cosmos-v1-pending'));
  return page.evaluate(() => window.cosmos.loadState());
}
async function stateWhen(predicate, description, timeoutMs = 18000) {
  const stop = Date.now() + timeoutMs;
  while (Date.now() < stop) {
    const state = await persisted();
    if (predicate(state)) return state;
    await page.waitForTimeout(100);
  }
  throw new Error(`Saved-state deadline: ${description}`);
}
async function check(name, action) {
  stage = name;
  const startedAt = new Date().toISOString(),
    start = Date.now();
  const evidence = await action();
  result.checks.push({ name, status: 'pass', startedAt, elapsedMs: Date.now() - start, evidence });
  console.log('PASS', name);
}
async function screenshot(name) {
  const notice = button('Закрыть уведомление');
  if (await notice.count()) await notice.click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const layout = await page.evaluate(() => ({
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
  }));
  assert.ok(layout.documentWidth <= layout.viewportWidth + 2, `Horizontal overflow: ${name}`);
  for (const fullPage of [false, true]) {
    const file = `${name}-${fullPage ? 'full' : 'viewport'}.png`;
    const bytes = await page.screenshot({ path: path.join(out, file), fullPage });
    result.screenshots.push({
      file,
      fullPage,
      bytes: bytes.length,
      sha256: sha256(bytes),
      ...layout,
    });
  }
}
async function say(text, expectedTaskIndex, expectedAttempts) {
  await input().fill(text);
  await button('Отправить сообщение').click();
  const saved = await stateWhen(
    (s) =>
      s.sessions[sessionId]?.taskIndex === expectedTaskIndex &&
      (s.progress['math-absolute']?.attempts.length || 0) === expectedAttempts,
    `answer recorded: ${text}`,
  );
  assert.equal(
    await page.locator('.tutor-thinking').count(),
    0,
    'A checked answer must not call the model',
  );
  assert.equal(await input().inputValue(), '');
  return saved;
}
const totalActive = (state) =>
  state.planning.runs[runId].blocks.reduce((sum, b) => sum + b.activeMs, 0);
function assertPlan(state) {
  const day = state.planning.days[dayDate];
  assert.equal(day.budgetMinutes, 120);
  assert.equal(
    day.entries.reduce((sum, b) => sum + b.minutes, 0),
    120,
  );
  assert.deepEqual(
    new Set(day.entries.filter((b) => b.subject).map((b) => b.subject)),
    new Set(['math', 'russian', 'history', 'social']),
  );
  return day;
}
async function assertDayProgress(state, completed) {
  const run = state.planning.runs[runId],
    current = run.blocks.find((b) => b.id === run.activeBlockId);
  const strip = page.getByLabel('Прогресс сегодняшнего занятия', { exact: true });
  await strip.waitFor();
  const text = await strip.innerText();
  const total = run.blocks.filter((b) => b.kind !== 'break').length;
  const skipped = run.blocks.filter((b) => b.kind !== 'break' && b.status === 'skipped').length;
  assert.ok(
    text.includes(
      `Завершено ${completed} из ${total} · пропущено ${skipped} · осталось ${total - completed - skipped}`,
    ),
  );
  assert.ok(text.includes(`Сейчас: ${current.title}`));
  const remaining = Math.max(
    0,
    run.blocks
      .filter((b) => !['completed', 'skipped'].includes(b.status))
      .reduce((sum, b) => sum + Math.max(0, b.minutes - b.activeMs / 60000), 0),
  ).toFixed(0);
  assert.ok(text.includes(`В плане осталось: ${remaining} мин`));
  assert.equal(
    await page
      .getByRole('progressbar', { name: 'Учебные блоки дня', exact: true })
      .getAttribute('value'),
    String(completed),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  const bounds = await strip.boundingBox();
  assert.ok(
    bounds && bounds.y >= 0 && bounds.y + bounds.height <= 720,
    'Day progress must be visible in the 1280×720 viewport without scrolling',
  );
  return {
    text,
    remainingMinutes: Number(remaining),
    completedBlocks: completed,
    totalBlocks: total,
    currentTitle: current.title,
    bounds,
  };
}
try {
  await fs.mkdir(out, { recursive: true });
  // The profile is unique and intentionally never reuses an existing pupil profile.
  await fs.mkdir(profile, { recursive: false });
  await fs.mkdir(runtime);
  const asar = await fs.readFile(path.join(path.dirname(exe), 'resources', 'app.asar'));
  result.artifact = { executablePath: exe, asarBytes: asar.length, asarSha256: sha256(asar) };
  if (process.env.COSMOS_EXPECTED_ASAR_SHA)
    assert.equal(result.artifact.asarSha256, process.env.COSMOS_EXPECTED_ASAR_SHA.toLowerCase());
  timer = setTimeout(() => {
    result.totalDeadlineExceeded = true;
    void cleanup().catch(() => {});
  }, 300000);
  await launch();
  await check('installed-cold-start-with-empty-model-runtime', async () => {
    await page.getByLabel('Как к тебе обращаться?').fill('Алексей');
    await button('Начнём знакомство').click();
    await page.locator('.daily-dashboard').waitFor();
    const state = await stateWhen(
      (s) => s.profile?.name === 'Алексей' && Object.keys(s.planning?.days || {}).length > 0,
      'initial plan',
    );
    dayDate = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    assert.equal(state.planning.preferences.schoolGrade, 10);
    assert.equal(state.planning.preferences.mathLevel, 'basic');
    assert.equal(Object.keys(state.sessions).length, 0);
    const application = await page.evaluate(() => window.cosmos.getAppInfo());
    const model = await page.evaluate(() => window.cosmos.modelStatus());
    assert.equal(application.packaged, true);
    assert.equal(model.available, false);
    assert.equal(model.state, 'missing');
    return {
      application,
      model,
      profileName: state.profile.name,
      schoolGrade: 10,
      mathLevel: 'basic',
    };
  });
  await check('select-120-minutes-and-link-a-school-topic-through-ui', async () => {
    await button('2 часа').click();
    await stateWhen((s) => s.planning.days[dayDate]?.budgetMinutes === 120, '120-minute budget');
    await page.locator('.study-school-panel summary').click();
    await page
      .getByLabel('Тема школьного урока', { exact: true })
      .fill('Модули и уравнения с модулем');
    await page
      .locator('.study-school-form')
      .getByLabel('Как получилось')
      .selectOption('needs-help');
    await button('Учесть школьную тему').click();
    const state = await stateWhen(
      (s) =>
        s.planning.schoolTopics.length === 1 &&
        s.planning.days[dayDate].entries[0]?.topicId === 'math-absolute',
      'school lesson linked',
    );
    const day = assertPlan(state);
    await screenshot('01-plan-120');
    return {
      budgetMinutes: day.budgetMinutes,
      entries: day.entries.map(({ title, kind, subject, minutes, topicId }) => ({
        title,
        kind,
        subject,
        minutes,
        topicId,
      })),
    };
  });
  await check('start-shows-day-progress-and-the-current-task', async () => {
    await button('Начать сегодняшнее занятие').click();
    await page.getByRole('region', { name: 'Занятие по плану', exact: true }).waitFor();
    await input().waitFor();
    const state = await stateWhen(
      (s) => !!s.planning.activeRunId && Object.keys(s.sessions).length === 1,
      'day started',
    );
    runId = state.planning.activeRunId;
    const run = state.planning.runs[runId];
    sessionId = run.blocks.find((b) => b.id === run.activeBlockId).sessionId;
    assert.equal(state.sessions[sessionId].topicId, 'math-absolute');
    assert.match(await page.locator('.conversation-condition').innerText(), /Вычисли \|−7\|/);
    assert.match(
      await page.getByLabel('Прогресс занятия', { exact: true }).innerText(),
      /Вычисли \|−7\|/,
    );
    assert.equal(
      await page
        .getByRole('progressbar', { name: 'Пройденные задания занятия, не освоение темы', exact: true })
        .getAttribute('value'),
      '0',
    );
    assert.equal(await page.locator('.composer-modes').count(), 0);
    const progress = await assertDayProgress(state, 0);
    await screenshot('02-active-day-current-task');
    return { runId, sessionId, ...progress };
  });
  await check('pause-freezes-time-and-controls-resume-restores-them', async () => {
    await input().click();
    const before = totalActive(await persisted());
    const grown = await stateWhen((s) => totalActive(s) > before, 'visible active time grows');
    await toolbar().getByRole('button', { name: 'Пауза занятия', exact: true }).click();
    const paused = await stateWhen(
      (s) => s.planning.runs[runId].status === 'paused',
      'pause saved',
    );
    const pausedMs = totalActive(paused);
    assert.equal(await input().isDisabled(), true);
    assert.equal(await button('Отправить сообщение').isDisabled(), true);
    assert.equal(
      await page
        .locator('.tutor-suggestions')
        .getByRole('button', { name: 'Подсказка', exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(await button('Показать разбор').isDisabled(), true);
    assert.equal(await button('Завершить блок').isDisabled(), true);
    await screenshot('03-paused');
    await page.waitForTimeout(5600);
    assert.equal(totalActive(await persisted()), pausedMs);
    await toolbar().getByRole('button', { name: 'Продолжить', exact: true }).click();
    await stateWhen((s) => s.planning.runs[runId].status === 'active', 'resume saved');
    assert.equal(await input().isDisabled(), false);
    assert.equal(await button('Показать разбор').isDisabled(), false);
    await input().click();
    const resumed = await stateWhen((s) => totalActive(s) > pausedMs, 'active time resumes');
    return {
      beforeMs: before,
      grownMs: totalActive(grown),
      pausedMs,
      unchangedWaitMs: 5600,
      resumedMs: totalActive(resumed),
      windowActivity: await page.evaluate(() => window.cosmos.getWindowActivity()),
    };
  });
  await check('four-real-attempts-separate-error-help-and-independence', async () => {
    await say('-7', 0, 1);
    await say('Получается 7', 1, 2);
    await say('дай подсказку', 1, 2);
    await say('0', 2, 3);
    const state = await say('2,5', 3, 4);
    const attempts = state.progress['math-absolute'].attempts;
    assert.equal(attempts.filter((a) => !a.correct).length, 1);
    assert.equal(attempts.filter((a) => a.correct && a.assisted).length, 2);
    assert.equal(attempts.filter((a) => a.correct && !a.assisted).length, 1);
    assert.ok(attempts.every((a) => a.sessionId === sessionId));
    assert.notEqual(state.progress['math-absolute'].mastery, 'mastered');
    assert.equal(Object.values(state.progress).flatMap((p) => p.attempts).length, 4);
    assert.equal(
      await page
        .getByRole('progressbar', { name: 'Пройденные задания занятия, не освоение темы', exact: true })
        .getAttribute('value'),
      '3',
    );
    assert.match(await page.locator('.conversation-condition').innerText(), /отрицательный корень/);
    const progress = await assertDayProgress(state, 0);
    await page.locator('.lesson-notebook summary').click();
    await page
      .getByLabel('Черновик занятия', { exact: true })
      .fill('Модуль — расстояние.\nЗнак числа и знак расстояния различаются.');
    await stateWhen((s) => s.sessions[sessionId].note?.includes('\nЗнак'), 'lesson note saved');
    await screenshot('04-real-attempts-and-next-question');
    return { attempts, taskIndex: 3, remainingTasks: 5, ...progress };
  });
  await check('manual-block-completion-advances-day-without-granting-mastery', async () => {
    await button('Завершить блок').click();
    const state = await stateWhen((s) => {
      const run = s.planning.runs[runId];
      return (
        run.blocks.filter((b) => b.kind !== 'break' && b.status === 'completed').length === 1 &&
        run.blocks.find((b) => b.id === run.activeBlockId)?.sessionId !== sessionId
      );
    }, 'day advances after manual completion');
    const run = state.planning.runs[runId],
      block = run.blocks.find((b) => b.sessionId === sessionId);
    assert.equal(block.evidence.attempts, 4);
    assert.equal(block.evidence.independentCorrect, 1);
    assert.equal(block.evidence.assistedCorrect, 2);
    assert.equal(block.evidence.incorrect, 1);
    assert.equal(block.note, state.sessions[sessionId].note);
    assert.notEqual(state.progress['math-absolute'].mastery, 'mastered');
    const progress = await assertDayProgress(state, 1);
    await screenshot('05-next-day-block');
    return {
      manuallyCompletedTopic: 'math-absolute',
      mastery: state.progress['math-absolute'].mastery,
      ...progress,
    };
  });
  await check('early-finish-reports-real-results-and-unfinished-work', async () => {
    await toolbar().getByRole('button', { name: 'Закончить раньше', exact: true }).click();
    const view = page.getByRole('region', { name: 'Итог занятия дня', exact: true });
    await view.waitFor();
    finalState = await stateWhen(
      (s) => s.planning.runs[runId].status === 'finished-early',
      'early report persisted',
    );
    const run = finalState.planning.runs[runId],
      report = run.report;
    assert.equal(report.endedEarly, true);
    assert.equal(report.plannedMinutes, 120);
    assert.equal(report.completedBlocks, 1);
    assert.equal(report.attempts, 4);
    assert.equal(report.incorrect, 1);
    assert.equal(report.assistedCorrect, 2);
    assert.equal(report.independentCorrect, 1);
    assert.ok(report.activeMs > 0 && report.activeMs < 120 * 60000);
    const unfinished = run.blocks.filter(
      (b) => b.kind !== 'break' && !['completed', 'skipped'].includes(b.status),
    );
    assert.equal(report.unfinishedBlocks, unfinished.length);
    assert.ok(report.unfinishedBlocks > 0);
    const reportText = await view.innerText();
    assert.match(reportText, /Сегодня остановились здесь/);
    assert.match(reportText, /Ответов с помощью — 2/);
    assert.match(reportText, /План — 120 мин/);
    assert.ok(
      reportText.includes(
        `Учебные блоки: завершено 1, пропущено 0, осталось ${report.unfinishedBlocks}.`,
      ),
    );
    assert.equal(await page.locator('.study-error-review').count(), 1);
    const rows = await page.locator('.study-report-block').allTextContents();
    assert.equal(
      rows.filter((text) => /Не начинали|Начали, но не завершили/.test(text)).length,
      unfinished.length,
    );
    assert.ok(rows.some((text) => text.includes('Знак числа и знак расстояния различаются.')));
    await fs.writeFile(path.join(out, 'report-visible.txt'), reportText, 'utf8');
    await screenshot('06-early-report');
    return { ...report, unfinishedTitles: unfinished.map((b) => b.title), visibleReportRows: rows };
  });
  await check('export-button-creates-a-real-pdf-with-the-same-counts', async () => {
    const oldIds = new Set(finalState.documents.map((d) => d.id));
    await button('Сохранить отчёт в PDF').click();
    const state = await stateWhen(
      (s) => s.documents.some((d) => !oldIds.has(d.id) && d.path?.toLowerCase().endsWith('.pdf')),
      'actual PDF export saved',
      45000,
    );
    const document = state.documents.find(
      (d) => !oldIds.has(d.id) && d.path?.toLowerCase().endsWith('.pdf'),
    );
    assert.equal(document.subject, 'all');
    assert.equal(document.type, 'Отчёт о прогрессе');
    assert.ok(
      document.content.includes(
        'Проверенных попыток: 4. Самостоятельных верных: 1. Верных с помощью: 2. Ошибок: 1.',
      ),
    );
    assert.ok(
      document.content.includes(
        `Осталось незавершёнными: ${state.planning.runs[runId].report.unfinishedBlocks}.`,
      ),
    );
    assert.ok(
      document.content.includes('Модуль — расстояние.\nЗнак числа и знак расстояния различаются.'),
    );
    const relative = path.relative(documents, document.path);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    const pdf = await fs.readFile(document.path);
    assert.ok(pdf.length > 1000);
    assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(pdf.subarray(-1024).includes(Buffer.from('%%EOF')));
    const file = 'early-study-report.pdf';
    await fs.copyFile(document.path, path.join(out, file));
    await fs.writeFile(path.join(out, 'report-source.md'), document.content, 'utf8');
    // This manifest is consumed by scripts/render-export-review.py after the native window closes.
    await fs.writeFile(
      path.join(out, 'pdf-exports.json'),
      `${JSON.stringify([{ format: 'pdf', path: path.join(out, file) }], null, 2)}\n`,
    );
    finalState = state;
    result.reportPdf = {
      file,
      actualExportPath: document.path,
      bytes: pdf.length,
      sha256: sha256(pdf),
      documentId: document.id,
      generatedThrough: 'Actual UI: Сохранить отчёт в PDF',
      visualReview: 'pending-render-and-personal-review',
    };
    await screenshot('07-exported-report');
    return result.reportPdf;
  });
  await check('restart-retains-the-report-attempts-and-actual-document', async () => {
    finalState = await persisted();
    await cleanup();
    await launch();
    await page.locator('.daily-dashboard').waitFor();
    const saved = await persisted();
    assert.equal(await page.locator('.welcome-modal').count(), 0);
    assert.deepEqual(saved.planning.runs[runId].report, finalState.planning.runs[runId].report);
    assert.deepEqual(saved.progress, finalState.progress);
    assert.deepEqual(saved.documents, finalState.documents);
    assert.equal(saved.sessions[sessionId].note, finalState.sessions[sessionId].note);
    assert.equal(saved.planning.activeRunId, undefined);
    assert.equal(
      sha256(await fs.readFile(result.reportPdf.actualExportPath)),
      result.reportPdf.sha256,
    );
    await screenshot('08-restarted-today');
    return {
      runId,
      persistedAttempts: saved.progress['math-absolute'].attempts.length,
      reportPdfSha256: result.reportPdf.sha256,
      finishedRunIsNotActive: true,
    };
  });
  await check('no-page-errors-model-start-or-false-model-history', async () => {
    const saved = await persisted(),
      model = await page.evaluate(() => window.cosmos.modelStatus());
    assert.deepEqual(result.pageErrors, []);
    assert.equal(model.available, false);
    assert.equal(model.state, 'missing');
    const modelMessages = Object.values(saved.sessions)
      .flatMap((s) => s.messages)
      .filter((m) => m.kind === 'model');
    assert.equal(modelMessages.length, 0);
    assert.equal(await page.locator('.tutor-thinking').count(), 0);
    return { pageErrors: 0, modelState: model.state, modelMessages: 0 };
  });
  result.status = 'pass';
} catch (error) {
  result.status = 'fail';
  result.failure = { stage, message: error.message, stack: error.stack };
  console.error('FAIL', stage, error.message);
  if (page && !page.isClosed()) await screenshot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  try {
    await cleanup();
    result.windowClosed = true;
  } catch (error) {
    result.windowClosed = false;
    result.cleanupError = error.message;
    result.status = 'fail';
    process.exitCode = 1;
  }
  result.finishedAt = new Date().toISOString();
  await fs.mkdir(out, { recursive: true });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  await fs.writeFile(path.join(out, 'result.json'), json);
  await fs.writeFile(path.join(out, 'result.sha256'), `${sha256(json)}  result.json\n`);
  console.log(
    JSON.stringify({
      status: result.status,
      checks: result.checks.length,
      windowClosed: result.windowClosed,
      result: path.join(out, 'result.json'),
    }),
  );
}
