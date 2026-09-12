import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const out = path.resolve(process.env.COSMOS_QA_OUT || 'docs/verification/tutor-native-0.3');
const profile = path.resolve(
  process.env.COSMOS_QA_PROFILE || `test-results/tutor-native-${Date.now()}`,
);
const runtime = process.env.COSMOS_QA_LIVE
  ? path.resolve('runtime')
  : path.join(profile, 'no-model');
await fs.mkdir(out, { recursive: true });
const checks = [],
  screenshots = [],
  errors = [];
const sha = createHash('sha256')
  .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
  .digest('hex');
let app, page, failure;
async function launch() {
  app = await electron.launch({
    executablePath: exe,
    args: ['--disable-backgrounding-occluded-windows'],
    env: {
      ...process.env,
      COSMOS_USER_DATA: profile,
      COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
      COSMOS_RUNTIME_DIR: runtime,
    },
    timeout: 45000,
  });
  page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.locator('.app-shell').waitFor();
}
async function size(w, h) {
  await app.evaluate(
    ({ BrowserWindow }, { w, h }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setMinimumSize(300, 400);
      win.setContentSize(w, h);
    },
    { w, h },
  );
}
async function shot(name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  await page.screenshot({ path: path.join(out, `${name}-viewport.png`) });
  screenshots.push({
    name,
    ...(await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
    }))),
  });
}
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log('PASS', name);
}
async function jump(query, title) {
  await page.getByRole('button', { name: 'Быстрый переход', exact: true }).click();
  await page.getByLabel('Поиск темы или действия').fill(query);
  await page.locator('.command-result').filter({ hasText: title }).first().click();
  await page.getByLabel('Прогресс занятия', { exact: true }).waitFor();
}
async function send(text, own = false) {
  await page
    .getByLabel(own ? 'Сообщение о своей задаче' : 'Сообщение Cosmos', { exact: true })
    .fill(text);
  await page
    .getByRole('button', {
      name: own ? 'Отправить ответ по своей задаче' : 'Отправить сообщение',
      exact: true,
    })
    .click();
  await page.waitForTimeout(200);
}
async function persisted() {
  await page.waitForTimeout(400);
  return page.evaluate(() => window.cosmos.loadState());
}
try {
  await launch();
  await page.getByLabel('Как к тебе обращаться?').fill('Алекс');
  await page.getByRole('button', { name: 'Начнём знакомство' }).click();
  await page.locator('.daily-dashboard').waitFor();
  await size(1280, 720);
  await check('new-build-opens', async () => {
    assert.equal((await page.evaluate(() => window.cosmos.getAppInfo())).version, '0.3.0');
    await shot('01-today');
  });
  await jump('площадь прямоугольника', 'Площадь прямоугольника');
  await check('focus-can-be-exited', async () => {
    await page.getByRole('button', { name: 'Сосредоточиться', exact: true }).click();
    assert.equal(await page.locator('.app-header').isVisible(), false);
    await page.getByRole('button', { name: 'Выйти из фокуса', exact: true }).click();
    assert.equal(await page.locator('.app-header').isVisible(), true);
  });
  await check('one-condition-7-by-3', async () => {
    await page.locator('.problem-scene').waitFor();
    assert.match(await page.locator('.conversation-condition').innerText(), /7 клеток.*3 ряда/);
    assert.match(await page.locator('.problem-scene').innerText(), /Рядов: 3 · В каждом: 7/);
    assert.equal(await page.locator('.sc-question').count(), 0);
    assert.equal(await page.locator('.composer-modes').count(), 0);
    const bounds = await page.locator('.tutor-conversation').evaluate((aside) => {
      const a = aside.getBoundingClientRect();
      const b = aside
        .querySelector('button[aria-label="Отправить сообщение"]')
        .getBoundingClientRect();
      return { asideTop: a.top, asideBottom: a.bottom, buttonTop: b.top, buttonBottom: b.bottom };
    });
    assert(
      bounds.buttonBottom <= bounds.asideBottom && bounds.buttonTop >= bounds.asideTop,
      `Composer must remain inside its panel: ${JSON.stringify(bounds)}`,
    );
    await shot('02-rectangle-current');
  });
  await check('native-scene-controls-and-pixel-pause', async () => {
    const scene = page.locator('.problem-scene');
    await scene.getByRole('button', { name: 'Повторить разбор задачи', exact: true }).click();
    await page.waitForTimeout(700);
    assert.equal(await scene.getAttribute('data-playing'), 'true');
    await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
    await page.mouse.move(3, 3);
    await page.waitForTimeout(80);
    const first = await scene.locator('svg[role=img]').screenshot();
    await page.waitForTimeout(500);
    const second = await scene.locator('svg[role=img]').screenshot();
    assert.equal(
      Buffer.compare(first, second),
      0,
      'The paused native scene must preserve its rendered pixels',
    );
    await scene.getByRole('button', { name: 'Следующий шаг задачи', exact: true }).click();
    assert.equal(await scene.getByLabel('Шаг решения задачи').inputValue(), '1');
    await scene.getByRole('button', { name: 'Предыдущий шаг задачи', exact: true }).click();
    assert.equal(await scene.getByLabel('Шаг решения задачи').inputValue(), '0');
    await scene.getByLabel('Скорость разбора задачи').selectOption('1.5');
    await scene.getByRole('button', { name: 'Повторить разбор задачи', exact: true }).click();
    assert.equal(await scene.getAttribute('data-playing'), 'true');
    await page.evaluate(() => window.scrollTo(0, 0));
  });
  await check('scaffold-plain-language-not-model', async () => {
    await send('дай подсказку');
    await send('Получается 7');
    assert.match(
      await page.locator('.conversation-condition').innerText(),
      /действ|слож|слагаем|умнож/i,
    );
    assert.equal(await page.locator('.tutor-thinking').count(), 0);
    await shot('03-small-step');
  });
  await send('умножение');
  await send('21');
  await check('progress-follows-current-task', async () => {
    assert.match(await page.locator('.conversation-condition').innerText(), /8 см.*5 см/);
    assert.equal(
      await page
        .getByLabel('Пройденные задания занятия, не освоение темы', { exact: true })
        .getAttribute('value'),
      '1',
    );
    await shot('04-progress-next-condition');
  });
  await check('topic-progress-stays-visible-while-scrolling', async () => {
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(200);
    const layout = await page.evaluate(() => {
      const c = document.querySelector('.lesson-compass').getBoundingClientRect();
      const aside = document.querySelector('.tutor-conversation').getBoundingClientRect();
      const button = document
        .querySelector('button[aria-label="Отправить сообщение"]')
        .getBoundingClientRect();
      return {
        top: c.top,
        bottom: c.bottom,
        asideTop: aside.top,
        sendBottom: button.bottom,
        height: innerHeight,
      };
    });
    assert(layout.top >= -1 && layout.bottom < layout.height / 2, JSON.stringify(layout));
    assert(
      layout.asideTop >= layout.bottom && layout.sendBottom <= layout.height,
      JSON.stringify(layout),
    );
    await page.screenshot({ path: path.join(out, '04b-sticky-progress-viewport.png') });
    screenshots.push({ name: '04b-sticky-progress-viewport', ...layout });
    await page.evaluate(() => window.scrollTo(0, 0));
  });
  await check('topic-picker-direct-search', async () => {
    await page.getByRole('button', { name: 'Сменить тему', exact: true }).click();
    await page.getByLabel('Поиск темы в комнате').fill('процент');
    assert.equal(await page.locator('.direct-topics > button').count(), 1);
    await page.locator('.direct-topics > button').click();
    assert.match(await page.locator('.lesson-compass h1').innerText(), /Проценты/);
    await shot('05-selected-topic');
  });
  await jump('спрос', 'Спрос и предложение');
  await check('social-semantic-answer', async () => {
    await send('спрос станет маленьким');
    assert.match(await page.locator('.conversation-condition').innerText(), /100 единиц/);
    const state = await persisted();
    const session = Object.values(state.sessions).find((s) => s.topicId === 'social-demand');
    assert.equal(session.taskIndex, 1);
    assert.equal(state.progress['social-demand'].attempts.at(-1).correct, true);
    await shot('06-social-accepted');
  });
  await jump('запятая', 'Запятая между частями');
  await check('task-board-restarts-after-last-step', async () => {
    const board = page.getByLabel('Доска текущего задания', { exact: true });
    await board.getByLabel('Скорость доски').selectOption('2');
    await board.getByRole('button', { name: 'Повторить доску', exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('.active-task-board .eyebrow')?.textContent ===
        'Сформулируй свой ответ',
      null,
      { timeout: 12000 },
    );
    await board.getByRole('button', { name: 'Смотреть', exact: true }).click();
    assert.equal(await board.locator('.eyebrow').innerText(), 'Прочитай условие');
    await page.waitForFunction(
      () => ['Выдели главное', 'Сформулируй свой ответ'].includes(document.querySelector('.active-task-board .eyebrow')?.textContent || ''),
      null,
      { timeout: 10000 },
    );
  });
  for (const a of ['весна', 'что', 'дождь']) await send(a);
  await check('russian-hint-reveal-no-error-loop', async () => {
    await send('дай подсказку');
    await send('я не знаю');
    await send('напиши ответ');
    assert.match(await page.locator('.dialogue').innerText(), /который/);
    await send('дальше');
    assert.match(await page.locator('.lesson-finish-card').innerText(), /разбор|Разбор|итог/);
    const state = await persisted();
    assert.equal(state.progress['russian-commas'].attempts.length, 3);
    await shot('07-russian-finish');
  });
  await jump('крещение', 'Крещение Руси');
  await check('history-current-condition-and-subject-isolation', async () => {
    await page.getByRole('img', { name: 'Крепость и исторический документ' }).waitFor();
    await send('988 год');
    assert.match(await page.locator('.conversation-condition').innerText(), /князем/);
    const s = await persisted();
    assert.equal(s.progress['history-baptism'].attempts.length, 1);
    assert.equal(s.progress['history-baptism'].attempts[0].correct, true);
    assert.equal(s.progress['social-demand'].attempts.length, 1);
    assert.equal(s.progress['russian-commas'].attempts.length, 3);
    await shot('07b-history');
  });
  await page.getByRole('button', { name: 'Своя задача', exact: true }).click();
  await page
    .getByLabel('Условие своей задачи')
    .fill('Площадь прямоугольника со сторонами 7 и 4 см');
  await page.getByRole('button', { name: 'Разобрать мой пример', exact: true }).click();
  await check('own-7-by-4-checks-28', async () => {
    assert.match(await page.locator('.problem-scene').innerText(), /Рядов: 4 · В каждом: 7/);
    await send('будет площадь 28 см2', true);
    assert.match(
      await page.locator('.dialogue').innerText(),
      /Ты решил свой пример самостоятельно/,
    );
    assert.equal(
      await page
        .getByLabel('Пройденные задания занятия, не освоение темы', { exact: true })
        .getAttribute('value'),
      '1',
    );
    await shot('08-own-correct-28');
  });
  await page.getByRole('button', { name: 'Новый пример', exact: true }).click();
  await page.getByLabel('Условие своей задачи').fill('|x − 2| = 3');
  await page.getByRole('button', { name: 'Разобрать мой пример', exact: true }).click();
  await check('module-scene-conceals-answer', async () => {
    assert(!(await page.locator('.problem-scene').getByText('x = −1; 5', { exact: true }).count()));
    await send('напиши ответ', true);
    await page.locator('.ps-step-dot').count();
    await shot('09-module-revealed');
  });
  await send('дальше', true);
  await page.getByLabel('Условие своей задачи').waitFor();
  await check('own-unsupported-is-clarification', async () => {
    await page.getByLabel('Условие своей задачи').fill('sin(x)=0,5');
    await page.getByRole('button', { name: 'Разобрать мой пример', exact: true }).click();
    assert.equal(await page.locator('.problem-scene').count(), 0);
    assert.match(await page.locator('.lesson-finish-card').innerText(), /Уточним/);
    await shot('10-clarification');
  });
  await size(640, 900);
  await shot('11-narrow');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await size(1280, 900);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2),
  );
  await shot('12-windows-scale-200');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1),
  );
  const saved = await persisted();
  assert.equal(Object.values(saved.problemSessions).length, 3);
  await app.close();
  app = undefined;
  await launch();
  await size(1280, 900);
  await page.getByRole('button', { name: 'Своя задача', exact: true }).click();
  await page.locator('.lesson-toolbox summary').click();
  await check('restart-restores-own-work', async () => {
    assert.equal(await page.locator('.own-problem-list > button').count(), 3);
    await page
      .locator('.own-problem-list > button')
      .filter({ hasText: 'Площадь прямоугольника' })
      .click();
    assert.match(await page.locator('.dialogue').innerText(), /28 см2/);
    assert.equal(
      await page
        .getByLabel('Пройденные задания занятия, не освоение темы', { exact: true })
        .getAttribute('value'),
      '1',
    );
    await shot('13-restored-own-task');
  });
  assert.deepEqual(errors, []);
} catch (e) {
  failure = e.stack;
  console.error(failure);
  if (page) await shot('failure').catch(() => {});
} finally {
  if (app) await app.close();
  await fs.writeFile(
    path.join(out, 'result.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        exe,
        appAsarSha256: sha,
        profile,
        scope:
          'Actual packaged Electron application; isolated study profile; no model response claimed by this suite',
        checks,
        screenshots,
        errors,
        failure,
      },
      null,
      2,
    ),
  );
}
if (failure) process.exitCode = 1;
