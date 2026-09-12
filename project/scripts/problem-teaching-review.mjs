// Real browser interactions, no injected learning state and no model bridge.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = path.resolve('docs/verification/problem-teaching-browser-0.4');
const profile = path.resolve(`test-results/problem-teaching-browser-${Date.now()}`);
await fs.mkdir(out, { recursive: true });
const result = {
  at: new Date().toISOString(),
  kind: 'headless-browser',
  status: 'running',
  checks: [],
  screenshots: [],
  errors: [],
  boundaries: [
    'No native EXE or local model is tested.',
    'All learning state is created through visible UI controls.',
    'Photographic OCR is not repeated by this test.',
  ],
};
let context, page, stage;
const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('ege-cosmos-v1') || '{}'));
const button = (name) => page.getByRole('button', { name, exact: true });
async function waitFor(predicate) {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    const value = await read();
    if (predicate(value)) return value;
    await page.waitForTimeout(100);
  }
  throw Error('Persisted state deadline');
}
async function capture(name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(550);
  const layout = await page.evaluate(() => ({
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(layout.scrollWidth <= layout.innerWidth + 2, 'Horizontal overflow');
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  result.screenshots.push(`${name}.png`);
}
async function check(name, action) {
  stage = name;
  const evidence = await action();
  result.checks.push({ name, status: 'pass', evidence });
  console.log('PASS', name);
}
async function say(text) {
  await page.getByRole('textbox', { name: 'Сообщение о своей задаче' }).fill(text);
  await button('Отправить ответ по своей задаче').click();
  await page.waitForFunction(() => !document.querySelector('.tutor-thinking'));
}
const deadline = setTimeout(() => {
  void context?.close();
}, 180000);
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    viewport: { width: 1280, height: 720 },
  });
  page = context.pages()[0];
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => result.errors.push(error.message));
  await page.goto(process.env.COSMOS_TEST_URL || 'http://127.0.0.1:5173');
  await page.getByPlaceholder('Твоё имя').fill('Тестовый ученик');
  await button('Начнём знакомство').click();
  await button('Своя задача').click();
  await page
    .getByRole('textbox', { name: 'Условие своей задачи' })
    .fill('Площадь прямоугольника со сторонами 7 и 4 см');
  await button('Разобрать мой пример').click();
  let id;
  await check('rectangle-main-to-tracked-row-question', async () => {
    await say('не знаю');
    const saved = await waitFor((state) =>
      Object.values(state.problemSessions || {}).some(
        (own) => own.teaching?.activeStepId === 'own-rectangle-rows',
      ),
    );
    id = Object.keys(saved.problemSessions)[0];
    assert.equal(saved.problemSessions[id].attempts, 0);
    await page.locator('.teaching-scene').waitFor();
    assert.match(
      await page.locator('.conversation-condition').innerText(),
      /Сколько клеток находится в одном ряду/,
    );
    await capture('01-row-question-1280');
    return saved.problemSessions[id].teaching;
  });
  await check('wrong-then-uncertain-right-only-check-current-step', async () => {
    await say('4');
    await say('7?');
    const saved = await waitFor(
      (state) => state.problemSessions[id].teaching?.phase === 'answered',
    );
    const own = saved.problemSessions[id];
    assert.equal(own.attempts, 0);
    assert.equal(own.solved, false);
    assert.deepEqual(
      own.teaching.attempts.map((a) => a.correct),
      [false, true],
    );
    await capture('02-accepted-row-1280');
    return { attempts: own.attempts, stepAttempts: own.teaching.attempts };
  });
  await check('reload-restores-answered-step-and-visual', async () => {
    await page.reload();
    await page.locator('.app-shell').waitFor();
    await button('Своя задача').click();
    await page.locator('.teaching-scene').waitFor();
    const own = (await read()).problemSessions[id];
    assert.equal(own.teaching.activeStepId, 'own-rectangle-rows');
    assert.equal(own.teaching.phase, 'answered');
    await button('Далее').click();
    await waitFor(
      (state) => state.problemSessions[id].teaching.activeStepId === 'own-rectangle-operation',
    );
    await capture('03-operation-after-reload');
    return { activeStepId: own.teaching.activeStepId, restoredPhase: own.teaching.phase };
  });
  await check('final-step-next-completes-without-retyping', async () => {
    await say('умножение');
    await button('Далее').click();
    await waitFor((state) => state.problemSessions[id].teaching.activeStepId === 'own-final');
    await say('28?');
    await button('Далее').click();
    const saved = await waitFor((state) => state.problemSessions[id].solved);
    assert.equal(saved.problemSessions[id].attempts, 1);
    assert.ok(saved.problemSessions[id].hints > 0);
    await capture('04-completed-problem');
    return saved.problemSessions[id];
  });
  await check('narrow-dialogue-and-independent-next-example', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('05-narrow-completed');
    await button('Новый пример').click();
    await page.getByRole('textbox', { name: 'Условие своей задачи' }).fill('|x − 2| = 3');
    await button('Разобрать мой пример').click();
    await say('5; -1?');
    const saved = await waitFor(
      (state) => Object.values(state.problemSessions).filter((own) => own.solved).length === 2,
    );
    const own = Object.values(saved.problemSessions).find((own) => own.id !== id);
    assert.equal(own.attempts, 1);
    assert.equal(own.hints, 0);
    await capture('06-narrow-roots-accepted');
    return { attempts: own.attempts, hints: own.hints, solved: own.solved };
  });
  assert.deepEqual(result.errors, []);
  result.status = 'browser-flow-pass';
} catch (error) {
  result.status = 'fail';
  result.failure = { stage, message: error.message };
  if (page && !page.isClosed())
    await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
  console.error('FAIL', stage, error.message);
} finally {
  clearTimeout(deadline);
  await context?.close();
  result.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'browser-flow-pass' ? 0 : 1;
}
