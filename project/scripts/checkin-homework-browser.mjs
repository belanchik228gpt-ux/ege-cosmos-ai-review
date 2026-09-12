import { chromium, _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const native = !!process.env.COSMOS_EXE;
const out = path.resolve(`docs/verification/diagnostic-homework-${native ? 'native' : 'browser'}`);
await fs.mkdir(out, { recursive: true });
const profile = path.resolve('test-results/diagnostic-homework-' + Date.now());
const browser = native
  ? null
  : await chromium.launch({
      headless: true,
      executablePath:
        process.env.COSMOS_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    });
let app, page;
const checks = [],
  errors = [];
let application;
async function launch() {
  app = await electron.launch({
    executablePath: process.env.COSMOS_EXE,
    args: ['--disable-backgrounding-occluded-windows'],
    env: {
      ...process.env,
      COSMOS_USER_DATA: profile,
      COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
    },
    timeout: 45000,
  });
  page = await app.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForSelector('.home-intro');
}
if (native) await launch();
else {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (error) => errors.push(error.message));
}
const readState = () =>
  page.evaluate(async () => {
    const journal = JSON.parse(localStorage.getItem('ege-cosmos-v1-pending') || 'null');
    if (journal?.state) return journal.state;
    return window.cosmos
      ? await window.cosmos.loadState()
      : JSON.parse(localStorage.getItem('ege-cosmos-v1') || '{}');
  });
async function size(width, height) {
  if (app)
    await app.evaluate(
      ({ BrowserWindow }, { width, height }) =>
        BrowserWindow.getAllWindows()[0].setSize(width, height),
      { width, height },
    );
  else await page.setViewportSize({ width, height });
}
const check = async (name, run) => {
  await run();
  checks.push({ name, status: 'pass' });
  console.log('PASS', name);
};
const shot = async (name) => {
  await page.waitForTimeout(800);
  await page
    .locator('.toast button')
    .click({ timeout: 150 })
    .catch(() => {});
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
};
const subject = async (name) =>
  page
    .getByRole('navigation', { name: 'Предметы' })
    .getByRole('button', { name, exact: true })
    .click();
async function openCheckin(name) {
  await subject(name);
  const lessonButton = page.getByRole('button', { name: 'Короткая диагностика', exact: true });
  if (await lessonButton.count()) await lessonButton.click();
  else await page.getByRole('button', { name: 'Начать диагностику', exact: true }).click();
  const begin = page.getByRole('button', { name: 'Начать короткий разговор' });
  if (await begin.count()) await begin.click();
  await page.getByRole('log', { name: 'Переписка с Cosmos' }).waitFor();
}
async function answer(text, label = 'Мой ответ в диагностике') {
  await page.getByLabel(label, { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Ответить Cosmos', exact: true }).click();
}
try {
  if (!native) await page.goto(process.env.COSMOS_TEST_URL || 'http://127.0.0.1:5173');
  else
    await check('actual-packaged-executable', async () => {
      application = await page.evaluate(() => window.cosmos.getAppInfo());
      assert.equal(application.packaged, true);
      await size(1440, 1000);
    });
  await page.getByPlaceholder('Твоё имя').fill('Алексей');
  await page.getByRole('button', { name: 'Начнём знакомство' }).click();
  await check('conversation-waits-and-uncertainty-is-a-hint', async () => {
    await openCheckin('Математика');
    assert.equal(await page.locator('.practice-message.question').count(), 1);
    await page.getByLabel('Мой ответ в диагностике', { exact: true }).fill('Не знаю');
    await page.getByLabel('Мой ответ в диагностике', { exact: true }).press('Enter');
    const state = await readState(),
      diagnostic = Object.values(state.diagnostics)[0];
    assert.equal(diagnostic.responses.length, 0);
    assert.equal(diagnostic.phase, 'question');
    assert.equal(diagnostic.hintedItemIds.length, 1);
    assert.equal(
      await page.getByLabel('Мой ответ в диагностике', { exact: true }).inputValue(),
      '',
    );
    await shot('01-diagnostic-hint');
  });
  await check('actual-answer-persists-across-page-restart', async () => {
    await answer('4/10');
    assert.equal(
      (await readState()).diagnostics[Object.keys((await readState()).diagnostics)[0]].responses[0]
        .assisted,
      true,
    );
    if (native) {
      await page.waitForFunction(async () =>
        Object.values((await window.cosmos.loadState()).diagnostics || {}).some(
          (record) => record.responses.length === 1,
        ),
      );
      await app.close();
      await launch();
      await size(1440, 1000);
    } else await page.reload();
    await openCheckin('Математика');
    await page.getByRole('button', { name: 'Следующий вопрос', exact: true }).waitFor();
    const record = Object.values((await readState()).diagnostics)[0];
    assert.equal(record.responses.length, 1);
    assert.equal(record.responses[0].text, '4/10');
  });
  await check('three-answers-produce-specific-saved-summary-not-mastery', async () => {
    await page.getByRole('button', { name: 'Следующий вопрос', exact: true }).click();
    await answer('30');
    await page.getByRole('button', { name: 'Следующий вопрос', exact: true }).click();
    await answer('10');
    await page.getByRole('button', { name: 'Сохранить итог', exact: true }).click();
    await page.getByRole('heading', { name: 'Это я запомню для наших занятий' }).waitFor();
    await page.locator('.practice-summary .source-links').waitFor();
    const state = await readState(),
      record = Object.values(state.diagnostics)[0];
    assert.equal(record.summary.independentCorrect, 1);
    assert.equal(record.summary.assistedCorrect, 1);
    assert.ok(
      record.summary.skills.some(
        (skill) => skill.topicId === 'math-rectangle' && skill.needsPractice,
      ),
    );
    assert.equal(
      Object.values(state.progress).filter((progress) => progress.mastery === 'mastered').length,
      0,
    );
    await shot('02-diagnostic-summary');
  });
  await check('homework-is-separate-and-selected-from-observed-weaknesses', async () => {
    await page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('button', { name: 'Домашняя работа', exact: true })
      .click();
    await page.getByRole('button', { name: 'Подобрать три задания' }).click();
    const state = await readState(),
      assignment = Object.values(state.homework)[0];
    assert.equal(assignment.subject, 'math');
    assert.equal(assignment.items.length, 3);
    assert.equal(assignment.items[0].topicId, 'math-fraction');
    assert.ok(assignment.items.some((item) => item.topicId === 'math-rectangle'));
    assert.ok(assignment.dueAt);
    await shot('03-homework-desktop');
    await size(390, 844);
    await shot('04-homework-narrow');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
      false,
    );
    await size(1440, 1000);
  });
  await check('homework-result-schedules-repeat-and-keeps-original-assignment', async () => {
    const answerMap = { 'fraction-1': '4/10', 'rectangle-1': '21', 'triangle-1': '12' };
    for (let i = 0; i < 3; i++) {
      const assignment = Object.values((await readState()).homework)[0];
      const taskId = assignment.items[assignment.currentIndex].taskId;
      assert.ok(answerMap[taskId], taskId);
      await answer(i === 0 ? 'неверный ответ' : answerMap[taskId], 'Мой ответ в домашней работе');
      await page
        .getByRole('button', { name: i === 2 ? 'Сохранить итог' : 'Следующий вопрос', exact: true })
        .click();
    }
    const old = Object.values((await readState()).homework)[0];
    assert.equal(old.phase, 'completed');
    assert.ok(old.repeatAt);
    await shot('05-homework-result');
    await page.getByRole('button', { name: 'Повторить эту работу', exact: true }).click();
    const assignments = Object.values((await readState()).homework);
    assert.equal(assignments.length, 2);
    assert.equal(assignments.find((assignment) => assignment.id === old.id).responses.length, 3);
    assert.equal(assignments.find((assignment) => assignment.id !== old.id).responses.length, 0);
  });
  await check('main-lesson-remembers-diagnostic-and-homework-results', async () => {
    await subject('Математика');
    await page.locator('.topic-card').filter({ hasText: 'Как устроена дробь' }).click();
    await page.locator('.lesson-memory-strip').waitFor();
    const state = await readState(),
      session = Object.values(state.sessions).at(-1);
    assert.ok(
      session.messages.some(
        (message) =>
          message.kind === 'memory' &&
          message.text.includes('диагностика') &&
          message.text.includes('Домашняя работа'),
      ),
    );
    await shot('06-lesson-remembers');
  });
  await check('lesson-completion-assigns-homework-once-and-opens-that-assignment', async () => {
    const before = await readState(),
      session = Object.values(before.sessions).at(-1);
    await page.getByRole('button', { name: 'Завершить занятие', exact: true }).click();
    await page.getByRole('button', { name: 'Домашняя работа по занятию', exact: true }).click();
    await page.getByRole('heading', { name: 'Домашняя работа', exact: true }).waitFor();
    const state = await readState();
    const assigned = Object.values(state.homework).filter(
      (assignment) => assignment.sourceSessionId === session.id,
    );
    assert.equal(assigned.length, 1);
    assert.equal(assigned[0].subject, 'math');
    assert.ok(assigned[0].items.every((item) => item.topicId === session.topicId));
    assert.equal(Object.keys(state.homework).length, Object.keys(before.homework).length + 1);
    await shot('07-assigned-after-lesson');
  });
  await check('all-four-subject-diagnostics-are-independent-dialogues', async () => {
    for (const [name, id] of [
      ['Русский язык', 'russian'],
      ['История', 'history'],
      ['Обществознание', 'social'],
    ]) {
      await openCheckin(name);
      for (let i = 0; i < 3; i++) {
        await page.getByRole('button', { name: 'Пока пропустить', exact: true }).click();
        await page
          .getByRole('button', {
            name: i === 2 ? 'Сохранить итог' : 'Следующий вопрос',
            exact: true,
          })
          .click();
      }
      const record = Object.values((await readState()).diagnostics).find(
        (record) => record.subject === id,
      );
      assert.equal(record.responses.length, 3);
      assert.equal(record.summary.independentCorrect, 0);
      assert.equal(record.phase, 'completed');
    }
    const state = await readState();
    assert.equal(Object.values(state.diagnostics).length, 4);
    assert.ok(Object.values(state.homework).every((assignment) => assignment.subject === 'math'));
  });
  await check('no-render-exceptions', async () => assert.deepEqual(errors, []));
} catch (error) {
  errors.push(String(error));
  await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await fs.writeFile(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        environment: native ? 'installed-executable' : 'development-browser',
        packaged: native,
        application,
        executable: native ? process.env.COSMOS_EXE : undefined,
        url: native ? undefined : process.env.COSMOS_TEST_URL || 'http://127.0.0.1:5173',
        at: new Date().toISOString(),
        checks,
        errors,
        limitation: native
          ? 'Actual installed EXE interactions and screenshots; bounded diagnostic/homework workflow, not full application acceptance. No model was invoked.'
          : 'Actual rendered browser interactions and screenshots; not packaged EXE acceptance. No model was invoked.',
      },
      null,
      2,
    ),
  );
  await app?.close();
  await browser?.close();
}
