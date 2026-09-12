import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = process.cwd();
const out = path.join(root, 'docs/verification/exam-workshop-browser-0.5.1');
await fs.mkdir(out, { recursive: true });
const report = {
  startedAt: new Date().toISOString(),
  scope:
    'Real App in isolated headless Chrome, UI-only mutations, no injected state and no model requests. This is not a native EXE test.',
  checks: [],
  screenshots: [],
  pageErrors: [],
  pass: false,
};
let server, browser, page;
function assert(ok, message) {
  if (!ok) throw new Error(message);
}
try {
  server = await createServer({
    root,
    server: { host: '127.0.0.1', port: 5186, strictPort: true },
    logLevel: 'error',
  });
  await server.listen();
  browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (error) => report.pageErrors.push(String(error)));
  await page.goto('http://127.0.0.1:5186');
  await page.locator('.welcome-modal input').fill('Проверка номеров');
  await page.getByRole('button', { name: 'Начнём знакомство', exact: true }).click();
  await page
    .locator('.studio-sidebar')
    .getByRole('button', { name: 'Как решать ЕГЭ', exact: true })
    .click();
  await page.locator('.exam-workshop').waitFor();
  const shot = async (name, fullPage = true) => {
    await page.waitForTimeout(180);
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      name + ': horizontal overflow',
    );
    await page.screenshot({ path: path.join(out, name + '.png'), fullPage });
    report.screenshots.push(name + '.png');
  };
  assert(
    (await page.locator('.exam-number-grid button').count()) === 21,
    'Base mathematics must show 21 positions',
  );
  await page.getByRole('button', { name: /^Задание 3:/ }).click();
  await shot('01-math3-1280');
  await page.getByRole('tab', { name: 'Требования', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert(
    (await page
      .getByRole('tab', { name: 'Оформление', exact: true })
      .getAttribute('aria-selected')) === 'true',
    'Arrow key did not change detail tab',
  );
  report.checks.push('base-math-21-selection-and-keyboard-tabs');
  for (const [subject, number, expectedCount, tab, name] of [
    ['Русский язык', 27, 27, 'Оформление', '02-russian27-format'],
    ['История', 21, 21, 'Советы и ошибки', '03-history21-tips'],
    ['Обществознание', 25, 25, 'Требования', '04-social25-requirements'],
  ]) {
    await page
      .locator('.exam-subjects')
      .getByRole('button', { name: new RegExp(subject) })
      .click();
    assert(
      (await page.locator('.exam-number-grid button').count()) === expectedCount,
      subject + ': incorrect position count',
    );
    await page.getByRole('button', { name: new RegExp('^Задание ' + number + ':') }).click();
    await page.getByRole('tab', { name: tab, exact: true }).click();
    assert(
      (await page.locator('.exam-source a').getAttribute('href')).startsWith('https://'),
      'Missing source URL',
    );
    await shot(name);
  }
  report.checks.push('four-subject-positions-real-source-and-detail-content');
  await page.getByLabel('Количество примеров', { exact: true }).fill('31');
  assert(
    await page.getByRole('button', { name: 'Открыть тренировку', exact: true }).isDisabled(),
    'Invalid count enabled start',
  );
  await page.getByLabel('Количество примеров', { exact: true }).fill('0');
  assert(
    await page.getByRole('button', { name: 'Открыть тренировку', exact: true }).isDisabled(),
    'Zero count enabled start',
  );
  await page
    .locator('.exam-subjects')
    .getByRole('button', { name: /Математика/ })
    .click();
  assert(
    (await page.locator('.exam-task-number').innerText()).includes('3'),
    'Subject switch lost chosen number',
  );
  await page
    .locator('.exam-count-control')
    .getByRole('button', { name: '10', exact: true })
    .click();
  report.checks.push('invalid-count-rejected-and-subject-selection-retained');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('05-math3-narrow');
  await page
    .getByRole('button', { name: 'Открыть тренировку', exact: true })
    .scrollIntoViewIfNeeded();
  await shot('06-series-controls-narrow', false);
  await page.getByRole('button', { name: 'Открыть тренировку', exact: true }).click();
  await page.locator('.studio-chat').waitFor();
  await page.waitForTimeout(700);
  const readSessions = () =>
    page.evaluate(() =>
      Object.values(JSON.parse(localStorage.getItem('ege-cosmos-v1') || '{}').cloudSessions || {}),
    );
  const sessions = await readSessions();
  const lesson = sessions.find((item) => item.examTraining);
  assert(
    lesson && lesson.subject === 'math' && lesson.mode === 'own',
    'Series did not create real math own lesson',
  );
  assert(
    lesson.examTraining.number === 3 &&
      lesson.examTraining.total === 10 &&
      lesson.examTraining.current === 1 &&
      lesson.examTraining.completed.length === 0,
    'Series metadata differs from requested selection',
  );
  assert(lesson.messages.length === 0, 'Opening series created fake or unsolicited model messages');
  report.startedLesson = {
    id: lesson.id,
    subject: lesson.subject,
    title: lesson.title,
    topicId: lesson.topicId,
    mode: lesson.mode,
    examTraining: lesson.examTraining,
    messageCount: lesson.messages.length,
  };
  await shot('07-training-room-narrow');
  await page.reload();
  await page.locator('.studio-brand').waitFor();
  const restored = (await readSessions()).find((item) => item.id === lesson.id);
  assert(
    restored?.examTraining?.number === 3 &&
      restored.examTraining.total === 10 &&
      restored.examTraining.current === 1 &&
      restored.examTraining.completed.length === 0 &&
      (restored.examTraining.skipped?.length ?? 0) === 0 &&
      (restored.examTraining.startMessageIndex ?? 0) === 0,
    'Series metadata did not survive reload/hydration',
  );
  report.checks.push('real-series-created-without-fake-progress-and-restored');
  report.pass = report.pageErrors.length === 0;
  assert(report.pass, 'Browser errors');
} catch (error) {
  report.failure = String(error);
  process.exitCode = 1;
  await page?.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  await browser?.close();
  await server?.close();
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify(report, null, 2));
}
