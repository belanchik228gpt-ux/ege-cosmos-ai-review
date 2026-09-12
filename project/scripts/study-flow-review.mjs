/** Actual UI smoke. Default: headless Chrome + Vite. Set COSMOS_EXE for a packaged-app run.
 * Only isolated profiles are created; no model is started and no learning state is injected.
 */
import { chromium, _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const native = Boolean(process.env.COSMOS_EXE);
const kind = native ? 'native' : 'browser';
const narrowWidth = native ? 620 : 390; // Native shell intentionally has a 620px minimum width.
const out = path.resolve(`docs/verification/study-flow-${kind}`);
const profile = path.resolve(`test-results/study-flow-${kind}-${Date.now()}`);
const result = {
  kind,
  startedAt: new Date().toISOString(),
  status: 'running',
  checks: [],
  screenshots: [],
  pageErrors: [],
  profile,
  boundaries: [
    'UI interactions only; no injected learning state',
    'No model or live-model claims',
    'Manual block completion is separate from mastery',
    native
      ? 'Native narrow capture respects the 620px shell minimum'
      : 'Browser captures include 390px; packaged executable not exercised by this run',
  ],
};
await fs.mkdir(out, { recursive: true });
let context, app, page, stage, currentRunId, currentSessionId, finalRun, workspace;
const deadline = setTimeout(() => {
  console.error('FAIL total deadline: 8 minutes');
  process.exitCode = 1;
  void cleanup();
}, 480000);
async function cleanup() {
  if (app) {
    const old = app;
    app = null;
    await old.close().catch(() => {});
  }
  if (context) {
    const old = context;
    context = null;
    await old.close().catch(() => {});
  }
}
async function launch() {
  if (native) {
    app = await electron.launch({
      executablePath: path.resolve(process.env.COSMOS_EXE),
      timeout: 45000,
      env: {
        ...process.env,
        COSMOS_USER_DATA: path.join(profile, 'native'),
        COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
        COSMOS_RUNTIME_DIR: path.join(profile, 'no-model'),
      },
    });
    page = await app.firstWindow();
  } else {
    context = await chromium.launchPersistentContext(path.join(profile, 'chrome'), {
      headless: true,
      executablePath:
        process.env.COSMOS_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      viewport: { width: 1440, height: 1000 },
    });
    page = context.pages()[0] || (await context.newPage());
  }
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  if (!native) await page.goto(process.env.COSMOS_TEST_URL || 'http://127.0.0.1:5173');
  await page.locator('.daily-dashboard, .welcome-modal').first().waitFor();
}
const readState = () =>
  page.evaluate(async () => {
    const journal = JSON.parse(localStorage.getItem('ege-cosmos-v1-pending') || 'null');
    if (journal?.state) return journal.state;
    return window.cosmos
      ? await window.cosmos.loadState()
      : JSON.parse(localStorage.getItem('ege-cosmos-v1') || '{}');
  });
async function stateWhen(predicate, description, timeoutMs = 10000) {
  const stop = Date.now() + timeoutMs;
  while (Date.now() < stop) {
    const state = await readState();
    if (predicate(state)) return state;
    await page.waitForTimeout(100);
  }
  throw new Error(`State deadline: ${description}`);
}
async function check(name, action) {
  stage = name;
  const started = Date.now();
  const evidence = await action();
  result.checks.push({
    name,
    status: 'pass',
    elapsedMs: Date.now() - started,
    ...(evidence ? { evidence } : {}),
  });
  console.log('PASS', name);
}
const button = (name) => page.getByRole('button', { name, exact: true });
const nav = (name) =>
  page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('button', { name, exact: true })
    .click();
async function size(width, height) {
  if (app)
    await app.evaluate(
      ({ BrowserWindow }, args) =>
        BrowserWindow.getAllWindows()[0].setSize(args.width, args.height),
      { width, height },
    );
  else await page.setViewportSize({ width, height });
}
async function screenshot(name, width, height) {
  if (width) await size(width, height);
  const closeNotice = page.getByRole('button', { name: 'Закрыть уведомление', exact: true });
  if (await closeNotice.count()) await closeNotice.click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    pageHeight: document.documentElement.scrollHeight,
  }));
  result.screenshots.push({ file: `${name}.png`, ...layout });
  assert.ok(
    layout.documentWidth <= layout.width + 2,
    `Horizontal overflow: ${name} ${layout.documentWidth}/${layout.width}`,
  );
}
async function say(text) {
  const input = page.getByRole('textbox', { name: 'Сообщение Cosmos', exact: true });
  await input.fill(text);
  await button('Отправить сообщение').click();
  await input.filter({ visible: true }).waitFor();
  await page.waitForTimeout(150);
}
async function returnToRun() {
  await button('Вернуться к занятию').click();
  await page.getByRole('region', { name: 'Занятие по плану' }).waitFor();
}
const localDate = (offset = 0) => {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};
async function selectCalendarDate(date) {
  const labelPart = new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
  const labels = await page
    .locator('.study-day')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  const label = labels.find((value) => value.includes(labelPart));
  assert.ok(label, `Calendar date missing: ${labelPart}`);
  await page.getByRole('button', { name: label, exact: true }).click();
}
try {
  if (native) {
    const executablePath = path.resolve(process.env.COSMOS_EXE);
    const asar = await fs.readFile(
      path.join(path.dirname(executablePath), 'resources', 'app.asar'),
    );
    const asarSha256 = createHash('sha256').update(asar).digest('hex');
    result.artifact = { executablePath, asarBytes: asar.length, asarSha256 };
    if (process.env.COSMOS_EXPECTED_ASAR_SHA)
      assert.equal(
        asarSha256,
        process.env.COSMOS_EXPECTED_ASAR_SHA.toLowerCase(),
        'Installed artifact must match expected final build',
      );
  }
  await launch();
  await check('cold-onboarding-10-basic-120', async () => {
    await page.getByPlaceholder('Твоё имя').fill('Алексей');
    await button('Начнём знакомство').click();
    await page.locator('.daily-dashboard').waitFor();
    const state = await stateWhen(
      (s) => s.profile?.name === 'Алексей' && s.planning?.days?.[localDate()],
      'onboarding saved',
    );
    assert.equal(state.planning.preferences.schoolGrade, 10);
    assert.equal(state.planning.preferences.mathLevel, 'basic');
    assert.equal(state.planning.preferences.dailyMinutes, 120);
    const day = state.planning.days[localDate()];
    assert.ok(day.entries.reduce((sum, b) => sum + b.minutes, 0) <= 120);
    assert.deepEqual(
      new Set(day.entries.filter((b) => b.subject).map((b) => b.subject)),
      new Set(['math', 'russian', 'history', 'social']),
    );
    if (native) {
      result.application = await page.evaluate(() => window.cosmos.getAppInfo());
      assert.equal(result.application.packaged, true);
    }
    await screenshot('01-today-1280', 1280, 720);
    return {
      grade: 10,
      mathLevel: 'basic',
      budgetMinutes: day.budgetMinutes,
      blocks: day.entries.map(({ title, subject, minutes }) => ({ title, subject, minutes })),
    };
  });
  await check('school-modulus-preserves-budget-and-starts-real-lesson', async () => {
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
      (s) => s.planning.schoolTopics.length === 1,
      'school record saved',
    );
    const day = state.planning.days[localDate()];
    assert.equal(day.entries[0].topicId, 'math-absolute');
    assert.equal(day.entries[0].kind, 'school');
    assert.equal(day.budgetMinutes, 120);
    assert.ok(day.entries.reduce((sum, b) => sum + b.minutes, 0) <= 120);
    await button('Начать сегодняшнее занятие').click();
    await page.getByRole('textbox', { name: 'Сообщение Cosmos', exact: true }).waitFor();
    const started = await stateWhen(
      (s) => s.planning.activeRunId && Object.values(s.sessions).length === 1,
      'day and linked session started',
    );
    currentRunId = started.planning.activeRunId;
    const run = started.planning.runs[currentRunId];
    currentSessionId = run.blocks.find((b) => b.id === run.activeBlockId).sessionId;
    assert.equal(started.sessions[currentSessionId].topicId, 'math-absolute');
    return {
      runId: currentRunId,
      sessionId: currentSessionId,
      topicId: 'math-absolute',
      schoolMinutes: day.entries[0].minutes,
    };
  });
  await check('wrong-answer-hint-assisted-and-independent-attempts', async () => {
    await say('-7');
    await say('7');
    await say('не знаю');
    await say('0');
    await say('2.5');
    const state = await stateWhen(
      (s) => s.progress['math-absolute']?.attempts?.length >= 4,
      'four checked attempts',
    );
    const attempts = state.progress['math-absolute'].attempts;
    assert.equal(attempts.length, 4);
    assert.equal(attempts.filter((a) => !a.correct).length, 1);
    assert.ok(attempts.some((a) => a.correct && a.assisted));
    assert.ok(attempts.some((a) => a.correct && !a.assisted));
    assert.equal(state.sessions[currentSessionId].taskIndex, 3);
    assert.notEqual(state.progress['math-absolute'].mastery, 'mastered');
    assert.equal(
      Object.keys(state.progress).filter((key) => state.progress[key].attempts.length > 0).length,
      1,
    );
    return attempts.map(({ taskId, correct, assisted }) => ({ taskId, correct, assisted }));
  });
  await check('settings-materials-plan-return-preserve-session-and-scene', async () => {
    const scene = page.locator('.curriculum-scene').first();
    await scene.waitFor();
    const play = scene.locator('.cv-play');
    if (
      (await play.getAttribute('aria-label')) === 'Пауза' ||
      (await play.innerText()).includes('Пауза')
    )
      await play.click();
    await scene.getByRole('button', { name: 'Следующий шаг', exact: true }).click();
    const cursor = await scene.locator('.cv-step-label').innerText();
    await page.locator('.lesson-toolbox summary').click();
    assert.equal(await button('Создать конспект занятия').isVisible(), true);
    await button('Настройки').click();
    await page.getByRole('heading', { name: 'Настройки', exact: true }).waitFor();
    await returnToRun();
    assert.equal(await scene.locator('.cv-step-label').innerText(), cursor);
    await nav('Материалы');
    await returnToRun();
    await page
      .locator('.guided-toolbar')
      .getByRole('button', { name: 'План', exact: true })
      .click();
    await page.getByRole('region', { name: 'Календарь подготовки' }).waitFor();
    await returnToRun();
    const state = await readState();
    assert.equal(state.planning.activeRunId, currentRunId);
    assert.equal(Object.keys(state.sessions).length, 1);
    assert.equal(state.sessions[currentSessionId].taskIndex, 3);
    assert.equal(await scene.locator('.cv-step-label').innerText(), cursor);
    await screenshot('02-lesson-1280', 1280, 720);
    return { cursor, sessionId: currentSessionId, taskIndex: 3 };
  });
  await check('pause-resume-and-real-break-transition', async () => {
    const toolbar = page.locator('.guided-toolbar');
    const totalActive = (state) =>
      state.planning.runs[currentRunId].blocks.reduce((sum, b) => sum + b.activeMs, 0);
    let nativeActivity;
    if (native) {
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win.show();
        win.focus();
      });
      await page.getByRole('textbox', { name: 'Сообщение Cosmos', exact: true }).click();
      const before = totalActive(await readState());
      const grew = await stateWhen(
        (s) => totalActive(s) > before,
        'native visible active time grows',
      );
      nativeActivity = {
        before,
        after: totalActive(grew),
        window: await page.evaluate(() => window.cosmos.getWindowActivity()),
      };
      assert.ok(nativeActivity.window.visible && nativeActivity.window.focused);
    }
    await toolbar.getByRole('button', { name: 'Пауза занятия', exact: true }).click();
    const paused = await stateWhen(
      (s) => s.planning.runs[currentRunId].status === 'paused',
      'run paused',
    );
    const activeMs = paused.planning.runs[currentRunId].blocks.reduce(
      (sum, b) => sum + b.activeMs,
      0,
    );
    const pausedInput = page.getByRole('textbox', { name: 'Сообщение Cosmos', exact: true });
    const pausedHint = page.getByRole('button', { name: 'Не знаю, с чего начать', exact: true });
    assert.equal(await pausedInput.isDisabled(), true, 'A paused day must disable answer input');
    assert.equal(await pausedHint.isDisabled(), true, 'A paused day must disable the hint button');
    assert.equal(
      await button('Отправить сообщение').isDisabled(),
      true,
      'A paused day must disable sending',
    );
    const attemptCountWhilePaused = paused.progress['math-absolute'].attempts.length;
    await page.waitForTimeout(native ? 5600 : 1600);
    assert.equal(
      (await readState()).planning.runs[currentRunId].blocks.reduce(
        (sum, b) => sum + b.activeMs,
        0,
      ),
      activeMs,
    );
    assert.equal(
      (await readState()).progress['math-absolute'].attempts.length,
      attemptCountWhilePaused,
    );
    await toolbar.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await stateWhen((s) => s.planning.runs[currentRunId].status === 'active', 'run resumed');
    assert.equal(
      await pausedInput.isDisabled(),
      false,
      'Answer input must be available again after resume',
    );
    assert.equal(await pausedHint.isDisabled(), false, 'Hint must be available again after resume');
    if (native) {
      const resumed = await stateWhen(
        (s) => totalActive(s) > activeMs,
        'native active time resumes after pause',
      );
      nativeActivity.afterResume = totalActive(resumed);
      nativeActivity.pauseUnchangedForMs = 5600;
    }
    let traversed = 0;
    while (!(await page.locator('.study-break').count()) && traversed < 3) {
      if (await button('Завершить шаг и продолжить').count())
        await button('Завершить шаг и продолжить').click();
      else await button('Завершить работу над этим шагом').click();
      traversed++;
      await page.waitForTimeout(200);
    }
    await page.locator('.study-break').waitFor();
    await screenshot('03-break-1280', 1280, 720);
    await button('Продолжить подготовку').click();
    const state = await readState(),
      run = state.planning.runs[currentRunId];
    assert.equal(
      run.blocks.filter((b) => b.kind === 'break' && b.status === 'completed').length,
      1,
    );
    assert.notEqual(run.blocks.find((b) => b.id === run.activeBlockId).kind, 'break');
    return {
      teachingBlocksManuallyCompleted: traversed,
      completedBreaks: 1,
      pausedActiveMs: activeMs,
      nativeActivity,
      pausedControls: {
        inputDisabled: true,
        hintDisabled: true,
        sendDisabled: true,
        attemptsUnchanged: true,
        inputAndHintRestored: true,
      },
    };
  });
  await check('early-summary-keeps-real-errors-and-unstarted-blocks', async () => {
    await page
      .locator('.guided-toolbar')
      .getByRole('button', { name: 'Закончить раньше', exact: true })
      .click();
    await page.getByRole('region', { name: 'Итог занятия дня' }).waitFor();
    const state = await stateWhen(
      (s) => s.planning.runs[currentRunId].status === 'finished-early',
      'early summary saved',
    );
    finalRun = state.planning.runs[currentRunId];
    assert.equal(finalRun.report.endedEarly, true);
    assert.equal(finalRun.report.attempts, 4);
    assert.equal(finalRun.report.incorrect, 1);
    assert.ok(finalRun.report.assistedCorrect >= 1);
    assert.ok(finalRun.blocks.some((b) => b.status === 'pending'));
    assert.equal(
      finalRun.report.completedBlocks,
      finalRun.blocks.filter((b) => b.kind !== 'break' && b.status === 'completed').length,
    );
    assert.equal(await page.locator('.study-error-review').count(), 1);
    if (native) {
      const existingDocumentIds = new Set(state.documents.map((document) => document.id));
      await button('Сохранить отчёт в PDF').click();
      const exportedState = await stateWhen(
        (saved) =>
          saved.documents.some(
            (document) =>
              !existingDocumentIds.has(document.id) &&
              document.type === 'Отчёт о прогрессе' &&
              document.path?.toLowerCase().endsWith('.pdf'),
          ),
        'native UI report PDF saved after actual file creation',
        40000,
      );
      const exportedDocument = exportedState.documents.find(
        (document) =>
          !existingDocumentIds.has(document.id) &&
          document.type === 'Отчёт о прогрессе' &&
          document.path?.toLowerCase().endsWith('.pdf'),
      );
      const relative = path.relative(path.join(profile, 'documents'), exportedDocument.path);
      assert.ok(
        relative && !relative.startsWith('..') && !path.isAbsolute(relative),
        'Export must stay inside the isolated documents directory',
      );
      const pdf = await fs.readFile(exportedDocument.path);
      assert.ok(pdf.length > 1000, 'Exported PDF must contain actual pages');
      assert.equal(
        pdf.subarray(0, 5).toString('ascii'),
        '%PDF-',
        'Exported file has the PDF signature',
      );
      assert.ok(
        pdf.subarray(-1024).includes(Buffer.from('%%EOF')),
        'Exported PDF has its final marker',
      );
      const evidencePath = path.join(out, 'early-study-report.pdf');
      await fs.copyFile(exportedDocument.path, evidencePath);
      result.reportPdf = {
        path: exportedDocument.path,
        evidencePath,
        bytes: pdf.length,
        sha256: createHash('sha256').update(pdf).digest('hex'),
        documentId: exportedDocument.id,
        subject: exportedDocument.subject,
        generatedThrough: 'Actual UI button: Сохранить отчёт в PDF',
      };
    }
    await screenshot('04-early-report-1280', 1280, 720);
    return finalRun.report;
  });
  await check('week-month-personal-topic-date-edit-and-budget', async () => {
    await nav('Темы ЕГЭ');
    const personal = page.locator('.study-personal');
    await personal
      .getByPlaceholder('Например: как решать уравнения с модулем')
      .fill('Мой вопрос: зачем нужен модуль в расстояниях');
    await personal.getByLabel('День', { exact: true }).fill(localDate(1));
    await personal.getByRole('button', { name: 'Добавить свою тему', exact: true }).click();
    let state = await stateWhen((s) => s.planning.customTopics.length === 1, 'custom topic saved');
    const customId = state.planning.customTopics[0].id;
    await button('Мой план').click();
    await button('Месяц').click();
    await page.locator('.study-calendar.month').waitFor();
    await button('Заполнить свободные дни').click();
    state = await readState();
    await selectCalendarDate(localDate(1));
    const editor = page
      .locator('.study-block-editor')
      .filter({ hasText: 'Мой вопрос: зачем нужен модуль в расстояниях' });
    await editor.getByRole('spinbutton').fill('15');
    await editor.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await editor.locator('input[type=date]').fill(localDate(2));
    await editor.getByRole('button', { name: 'Перенести', exact: true }).click();
    await page.waitForTimeout(250);
    let target = (await readState()).planning.days[localDate(2)];
    let fullDayRejection;
    if (!target.entries.some((b) => b.customTopicId === customId)) {
      const refused = await readState();
      assert.ok(
        refused.planning.days[localDate(1)].entries.some((b) => b.customTopicId === customId),
      );
      fullDayRejection = await page
        .locator('.toast')
        .innerText()
        .catch(() => 'Budget refusal; original entry retained');
      assert.equal(target.budgetMinutes, 120);
      // Make room explicitly, as a pupil would; do not increase their budget silently.
      await selectCalendarDate(localDate(2));
      const removable = target.entries.findLast(
        (b) => b.kind !== 'break' && !b.customTopicId && !b.schoolTopicId && b.minutes >= 15,
      );
      assert.ok(removable, 'No automatic block available to remove');
      await button(`Убрать: ${removable.title}`).click();
      await selectCalendarDate(localDate(1));
      await editor.locator('input[type=date]').fill(localDate(2));
      await editor.getByRole('button', { name: 'Перенести', exact: true }).click();
    }
    state = await stateWhen(
      (s) => s.planning.days[localDate(2)]?.entries.some((b) => b.customTopicId === customId),
      'personal topic moved',
    );
    assert.equal(
      state.planning.days[localDate(1)].entries.some((b) => b.customTopicId === customId),
      false,
    );
    assert.equal(
      state.planning.days[localDate(2)].entries.find((b) => b.customTopicId === customId).minutes,
      15,
    );
    for (const day of Object.values(state.planning.days))
      assert.ok(
        day.entries.reduce((sum, b) => sum + b.minutes, 0) <= day.budgetMinutes,
        `Budget overflow ${day.date}`,
      );
    await screenshot('05-month-1280', 1280, 720);
    await button('Неделя').click();
    await page.locator('.study-calendar.week').waitFor();
    workspace = (await readState()).studyWorkspace;
    return {
      customTopicId: customId,
      movedTo: localDate(2),
      minutes: 15,
      planCount: Object.keys(state.planning.plans).length,
      fullDayRejection,
    };
  });
  await check('three-diagnostic-answers-and-return-to-personal-plan', async () => {
    await nav('Сегодня');
    await page.locator('.study-extra summary').click();
    await button('Стартовая диагностика').click();
    await button('Начать короткий разговор').click();
    for (let index = 0; index < 3; index++) {
      await page
        .getByLabel('Мой ответ в диагностике', { exact: true })
        .fill(['2', '200', '6/35'][index]);
      await button('Ответить Cosmos').click();
      await button(index === 2 ? 'Сохранить итог' : 'Следующий вопрос').click();
    }
    await button('К моему плану подготовки').waitFor();
    const state = await readState(),
      diagnostic = Object.values(state.diagnostics)[0];
    assert.equal(diagnostic.subject, 'math');
    assert.equal(diagnostic.responses.length, 3);
    assert.equal(diagnostic.route.schoolGrade, 10);
    assert.equal(diagnostic.route.mathLevel, 'basic');
    assert.ok(diagnostic.responses.every((answer) => answer.correct && !answer.assisted));
    assert.equal(state.progress['math-absolute'].attempts.length, 4);
    await screenshot('06-diagnostic-summary-1280', 1280, 720);
    await button('К моему плану подготовки').click();
    await page.getByRole('region', { name: 'Календарь подготовки' }).waitFor();
    workspace = (await readState()).studyWorkspace;
    return { route: diagnostic.route, responses: diagnostic.responses };
  });
  await check('actual-restart-restores-learning-calendar-and-personal-topic', async () => {
    const before = await readState();
    await cleanup();
    await launch();
    await page.locator('.daily-dashboard').waitFor();
    const state = await readState();
    assert.equal(state.profile.name, 'Алексей');
    assert.deepEqual(state.planning.customTopics, before.planning.customTopics);
    assert.deepEqual(state.planning.days, before.planning.days);
    assert.deepEqual(state.planning.runs[currentRunId].report, finalRun.report);
    assert.deepEqual(state.progress, before.progress);
    assert.deepEqual(state.diagnostics, before.diagnostics);
    assert.deepEqual(state.documents, before.documents);
    assert.deepEqual(state.studyWorkspace, workspace);
    assert.equal(
      Object.values(state.sessions)
        .flatMap((s) => s.messages)
        .filter((m) => m.kind === 'model').length,
      0,
    );
    await screenshot(`07-today-${narrowWidth}`, narrowWidth, 844);
    await nav('План');
    await page.getByRole('region', { name: 'Календарь подготовки' }).waitFor();
    await screenshot(`08-plan-${narrowWidth}`, narrowWidth, 844);
    const narrowControls = await page.locator('.study-block-editor').evaluateAll((editors) => ({
      viewportWidth: innerWidth,
      blocks: editors.map((editor, index) => {
        const box = editor.getBoundingClientRect();
        return {
          index,
          editor: { left: box.left, right: box.right },
          buttons: [...editor.querySelectorAll('.block-buttons button')].map((button) => {
            const rect = button.getBoundingClientRect();
            return {
              name: button.getAttribute('aria-label'),
              left: rect.left,
              right: rect.right,
              width: rect.width,
            };
          }),
        };
      }),
    }));
    assert.equal(
      narrowControls.viewportWidth,
      native ? 604 : 390,
      'Narrow control geometry must be measured at the requested inner width',
    );
    assert.ok(narrowControls.blocks.length > 0, 'Calendar editing blocks must be present');
    for (const block of narrowControls.blocks) {
      assert.equal(block.buttons.length, 3);
      for (const control of block.buttons)
        assert.ok(
          control.width >= 24 &&
            control.left >= block.editor.left - 1 &&
            control.right <= block.editor.right + 1,
          `Narrow calendar button exceeds its editor: ${control.name}`,
        );
    }
    result.narrowControls = narrowControls;
    assert.equal(result.pageErrors.length, 0, result.pageErrors.join('\n'));
    return {
      modelMessages: 0,
      realRestart: true,
      reportRestored: true,
      localDates: Object.keys(state.planning.days).length,
    };
  });
  result.status = 'pass';
} catch (error) {
  result.status = 'fail';
  result.failure = { stage, message: error.message, stack: error.stack };
  result.checks.push({ name: stage, status: 'fail', error: error.message });
  console.error('FAIL', stage, error);
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
    result.failure.visibleText = (
      await page
        .locator('body')
        .innerText()
        .catch(() => '')
    ).slice(0, 14000);
    result.failure.savedState = await readState().catch(() => null);
  }
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  await fs.mkdir(profile, { recursive: true });
  await fs.writeFile(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
  await cleanup();
  clearTimeout(deadline);
  console.log(`Evidence: ${out}`);
}
