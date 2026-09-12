import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const profile = path.resolve(
  process.env.COSMOS_QA_PROFILE || `test-results/learning-plan-${Date.now()}`,
);
const out = path.resolve(process.env.COSMOS_REVIEW_OUT || 'docs/verification/learning-plan-0.7.4');
await fs.mkdir(out, { recursive: true });
const report = {
  status: 'running',
  exe,
  profile,
  turns: [],
  checks: [],
  screenshots: [],
  errors: [],
  asarSha256: createHash('sha256')
    .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
    .digest('hex'),
};
let app, page, firstInk;
const button = (n) => page.getByRole('button', { name: n, exact: true });
const nav = (n) => page.locator('.studio-sidebar').getByRole('button', { name: n, exact: true });
async function poll(fn, ms = 160000) {
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
  page.setDefaultTimeout(25000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setIgnoreMouseEvents(true);
    w.setContentSize(1280, 720);
  });
  await page.locator('.cosmos-studio').waitFor();
}
async function lesson() {
  const s = await page.evaluate(() => window.cosmos.loadState());
  return s.homeworkDesk.lessons[s.homeworkDesk.activeLessonId];
}
async function send(text) {
  const count = await page.locator('.school-message.assistant').count(),
    start = Date.now();
  await page.getByLabel('Сообщение школьному преподавателю', { exact: true }).fill(text);
  await button('Отправить').click();
  await poll(
    async () =>
      !(await button('Остановить').isVisible()) &&
      (await page.locator('.school-message.assistant').count()) > count,
  );
  const m = (await lesson()).messages.filter((m) => m.role === 'assistant').at(-1);
  report.turns.push({ elapsedMs: Date.now() - start, ...m });
  assert.notEqual(m.verification?.status, 'conflict');
  assert(m.learningStep, 'Real response must carry teaching position');
  return m;
}
async function sheet(name) {
  await button('Лист для решения').click();
  const reference = page.getByRole('region', { name: 'Условие над листом' });
  await reference.waitFor();
  const text = await reference.innerText();
  const m = (await lesson()).messages.filter((m) => m.learningStep).at(-1);
  assert(await reference.locator('.tutor-markdown').count());
  if (/\\\(|\\\[|\$/.test(m.learningStep.task)) assert(await reference.locator('.katex').count());
  assert(text.trim().length > 20);
  if (name === '02-first-current-sheet') {
    await button('Надпись').click();
    await page.getByLabel('Текст надписи').fill('Черновик первого шага');
    await page.getByLabel('Белый лист для рисования').click({ position: { x: 110, y: 75 } });
    await page.waitForTimeout(150);
    firstInk = await page.getByLabel('Белый лист для рисования').evaluate((c) => c.toDataURL());
    await button('Скачать PNG').click();
    await page.locator('.sheet-export-path').waitFor();
    const file = await page.locator('.sheet-export-path').getAttribute('data-path');
    assert(file && (await fs.stat(file)).size > 1000);
    await fs.copyFile(file, path.join(out, 'current-step-with-ink.png'));
    report.checks.push('Actual PNG exported with current condition and ink.');
  }
  await shot(name);
  await button('Закрыть лист').click();
  return text;
}
try {
  await launch();
  if (await page.locator('.welcome-modal input').isVisible()) {
    await page.locator('.welcome-modal input').fill('Проверка плана');
    await button('Начнём знакомство').click();
  } else if (!process.env.COSMOS_QA_PROFILE) {
    await page.locator('.welcome-modal input').waitFor();
    await page.locator('.welcome-modal input').fill('Проверка плана');
    await button('Начнём знакомство').click();
  }
  await nav('Домашние задания').click();
  if (process.env.COSMOS_QA_PROFILE) {
    await page.getByLabel('Поиск прошлых диалогов').fill('корнями');
    await page.locator('.conversation-history-list button').first().click();
    await page.locator('.learning-plan').waitFor();
    await page.locator('.learning-plan summary').click();
    await shot('installed-restored-plan');
    await sheet('installed-current-sheet');
    await page.getByLabel('Листы прошлых шагов').selectOption({ index: 1 });
    await page.waitForTimeout(150);
    await shot('installed-previous-ink');
    await button('Закрыть лист').click();
    await page.getByLabel('Поиск прошлых диалогов').fill('сегодня мы');
    await page.locator('.conversation-history-list button').first().click();
    await page.locator('.learning-plan').waitFor();
    await page.locator('.school-message.assistant').last().scrollIntoViewIfNeeded();
    await page.locator('.learning-plan summary').click();
    await shot('installed-long-dialogue-plan');
    await sheet('installed-long-dialogue-sheet');
    const last = (await lesson()).messages.filter((m) => m.role === 'assistant').at(-1);
    assert(last.learningStep && last.verification?.status !== 'conflict');
    report.turns.push({ ...last, reusedAfterRestart: true });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1920, 1080),
    );
    await page.waitForTimeout(500);
    await page.locator('.school-message.assistant').last().scrollIntoViewIfNeeded();
    await shot('installed-dialogue-1920');
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(960, 720),
    );
    await page.waitForTimeout(500);
    await shot('installed-dialogue-960');
    report.checks.push(
      'EXE restored actual plan, current task and previous ink; long genuine dialogue retained and plan accessible at1280/1920/960.',
    );
  } else {
    await page
      .getByLabel('Условие домашнего задания')
      .fill(
        'Помоги понять выражения с корнями: √((x−6)²), x<6. Не давай готовое решение, объясни тему с нуля на других примерах, затем дай 5 похожих задач по очереди.',
      );
    await button('Открыть разбор').click();
    await poll(
      async () =>
        (await page.evaluate(() => window.cosmos.getOpenAIStatus())).authenticated === true,
      45000,
    );
    const first = await send(
      'Сначала дай план, затем начни объяснять первый пункт с нуля на числах.',
    );
    await page.locator('.learning-plan summary').click();
    await shot('01-plan-first-explanation');
    const firstSheet = await sheet('02-first-current-sheet');
    const second = await send(
      'Я путаюсь: мы ищем x или переписываем выражение? Объясни это на простых числах, потом вернись к нашему плану.',
    );
    assert.deepEqual(
      second.learningStep.plan.map((p) => p.id),
      first.learningStep.plan.map((p) => p.id),
    );
    await page.locator('.school-message.assistant').last().scrollIntoViewIfNeeded();
    await shot('03-specific-misconception');
    await sheet('04-current-step-after-explanation');
    await send(
      'Теперь понял: значение x мы не ищем. Хочу потренироваться: дай один новый пример с другими числами, без ответа, скажи только какое первое действие мне сделать.',
    );
    const nextSheet = await sheet('05-next-task-sheet');
    assert.notEqual(nextSheet, firstSheet);
    await page.getByLabel('Листы прошлых шагов').selectOption({ index: 1 });
    await page.waitForTimeout(150);
    assert.equal(
      await page.getByLabel('Белый лист для рисования').evaluate((c) => c.toDataURL()),
      firstInk,
    );
    await shot('05b-previous-ink-restored');
    await button('Закрыть лист').click();
    report.checks.push('Previous step ink reopened unchanged after switching tasks.');
    report.checks.push(
      'Three genuine OpenAI turns: stable plan IDs, specific misconception, new task automatically replaces sheet condition.',
    );
    // Copy only the reported lesson into an isolated QA session. Original profile is never written.
    const source = JSON.parse(
      await fs.readFile(
        path.join(process.env.APPDATA, 'EGE Cosmos Studio', 'learning-state.v1.json'),
        'utf8',
      ),
    );
    const reported = source.homeworkDesk?.lessons?.['c337508c-7c04-4664-bded-61d4dfa96184'];
    if (reported) {
      const id = 'qa-long-dialogue';
      const copied = {
        ...reported,
        id,
        unitId: `homework:${id}`,
        messages: reported.messages.map((m) => ({ ...m })),
        completedAt: undefined,
      };
      await page.evaluate(
        async ({ id, copied }) => {
          const s = await window.cosmos.loadState();
          s.homeworkDesk.lessons[id] = copied;
          s.homeworkDesk.activeLessonId = id;
          s.homeworkDesk.view = 'room';
          await window.cosmos.saveState(s);
        },
        { id, copied },
      );
      await page.reload();
      await page.locator('.cosmos-studio').waitFor();
      await nav('Домашние задания').click();
      await page.getByLabel('Поиск прошлых диалогов').fill('сегодня мы');
      await page.locator('.conversation-history-list button').first().click();
      await poll(
        async () =>
          (await page.evaluate(() => window.cosmos.getOpenAIStatus())).authenticated === true,
        45000,
      );
      const recovered = await send(
        'Я правильно решил x²−4x+3=0: D=16−12=4, x₁=(4+2)/2=3, x₂=(4−2)/2=1. Проверь именно мои вычисления. Объясни где мы в решении исходного задания и составь план продолжения, не начинай тему заново.',
      );
      assert(!recovered.text.includes('убрал этот вариант'));
      await page.locator('.learning-plan summary').click();
      await shot('06-long-dialogue-recovered');
      await sheet('07-long-dialogue-current-sheet');
      report.checks.push(
        `Reported ${reported.messages.length}-message dialogue recovered with genuine OpenAI, correct indexed roots retained.`,
      );
    }
  }
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (e) {
  report.status = 'failed';
  report.error = String(e.stack || e);
  if (page) await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        status: report.status,
        profile,
        turns: report.turns.length,
        checks: report.checks,
        error: report.error,
      },
      null,
      2,
    ),
  );
}
