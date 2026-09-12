import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compareScenePixels, readSceneVisualState } from './scene-pixel-metrics.mjs';

const exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const out = path.resolve(process.env.COSMOS_QA_OUT || 'docs/verification/teaching-native-0.4');
const profile = path.resolve(
  process.env.COSMOS_QA_PROFILE || `test-results/teaching-native-${Date.now()}`,
);
const runtime = process.env.COSMOS_QA_LIVE
  ? path.resolve('runtime')
  : path.join(profile, 'no-model');
await fs.mkdir(out, { recursive: true });
const checks = [],
  screenshots = [],
  errors = [],
  dialogue = [];
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
async function send(text) {
  const t = Date.now();
  await page.getByLabel('Сообщение Cosmos', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Отправить сообщение', exact: true }).click();
  await page.waitForTimeout(160);
  await page
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .waitFor({ state: 'visible' });
  await page.locator('.tutor-thinking').waitFor({ state: 'hidden', timeout: 150000 });
  dialogue.push({
    text,
    ms: Date.now() - t,
    condition: await page.locator('.conversation-condition').innerText(),
    reply: await page.locator('.dialogue').innerText(),
  });
}
async function next() {
  await page.getByLabel('Управление ходом объяснения').getByRole('button').click();
  await page.waitForTimeout(150);
}
async function state() {
  await page.waitForTimeout(400);
  return page.evaluate(() => window.cosmos.loadState());
}
async function session(topic) {
  return Object.values((await state()).sessions).find((s) => s.topicId === topic);
}
try {
  await launch();
  await page.getByLabel('Как к тебе обращаться?').fill('Алекс');
  await page.getByRole('button', { name: 'Начнём знакомство' }).click();
  await page.locator('.daily-dashboard').waitFor();
  await size(1920, 1080);
  assert.equal((await page.evaluate(() => window.cosmos.getAppInfo())).version, '0.4.0');
  await jump('модуль числа', 'Модуль числа и расстояние');
  for (let i = 0; i < 4; i++) await next();
  await check('skip-without-fake-success', async () => {
    const s = await session('math-absolute');
    assert.equal(s.taskIndex, 4);
    assert.equal(((await state()).progress['math-absolute']?.attempts || []).length, 0);
    assert.equal(await page.locator('.teaching-scene').getAttribute('data-visual'), 'zero-root');
    await shot('01-module-count');
  });
  await send('дай подсказку');
  await check('hint-registers-coordinate-question', async () => {
    assert.match(await page.locator('.conversation-condition').innerText(), /координат/);
    assert.equal((await session('math-absolute')).teaching.activeStepId, 'zero-coordinate');
    await shot('02-coordinate-step');
    const composerBounds = await page.getByLabel('Сообщение Cosmos',{exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight};});
    assert(composerBounds.bottom <= composerBounds.height && composerBounds.top >= 0, `Composer outside the initial viewport: ${JSON.stringify(composerBounds)}`);
  });
  await send('0? я не знаю(');
  await check('uncertain-zero-is-accepted-for-coordinate', async () => {
    const s = await session('math-absolute');
    assert.equal(s.teaching.phase, 'answered');
    assert.equal(s.teaching.attempts.at(-1).correct, true);
    assert.equal(s.taskIndex, 4);
    assert.equal(((await state()).progress['math-absolute']?.attempts || []).length, 0);
    await shot('03-zero-accepted');
  });
  await send('объясни первый шаг');
  await send('ну от нуля 0 находится не?');
  await send('окей что дальше?');
  await check('dialogue-returns-to-count-without-loop', async () => {
    assert.equal((await session('math-absolute')).teaching.activeStepId, 'main');
    assert.match(
      await page.locator('.conversation-condition').innerText(),
      /Сколько действительных корней/,
    );
  });
  await send('я не знаю как находить действительные, объясни тему');
  await check('definition-detour-is-tracked-and-illustrated', async () => {
    assert.match((await session('math-absolute')).teaching.activeStepId, /definition/);
    assert.match(await page.locator('.conversation-condition').innerText(), /x = 2/);
    assert.equal(await page.locator('.teaching-scene').getAttribute('data-visual'), 'expression');
    await shot('04-meaning-of-root');
  });
  await send('да');
  await next();
  // A return may preserve the coordinate step; the main question remains reachable without answer copying.
  for (let i = 0; i < 3 && (await session('math-absolute')).teaching.activeStepId !== 'main'; i++)
    await next();
  await send('один');
  await check('whole-task-completes-as-assisted', async () => {
    assert.equal((await session('math-absolute')).taskIndex, 5);
    const a = (await state()).progress['math-absolute'].attempts.at(-1);
    assert(a.correct && a.assisted);
    await shot('05-negative-radius');
  });
  await send('напиши ответ');
  await next();
  await check('reveal-does-not-require-copying-answer', async () => {
    assert.equal((await session('math-absolute')).taskIndex, 6);
    assert.equal(
      await page.locator('.teaching-scene').getAttribute('data-visual'),
      'shifted-modulus',
    );
  });
  await send('объясни первый шаг');
  await shot('06-shifted-step');
  await jump('корни модуль', 'Корни, модуль и знаки выражений');
  await check('new-topic-starts-with-explanation', async () => {
    assert.equal((await session('math-radicals')).teaching.activeStepId, 'radicals-1-square');
    assert.match(await page.locator('.teaching-scene').innerText(), /Сначала квадрат/);
    await shot('07-radicals-first-step');
  });
  await check('native-animation-pause-replay-back-speed', async () => {
    const scene = page.locator('.teaching-scene');
    await page.waitForTimeout(2200);
    await scene.getByLabel('Повторить учебный шаг', { exact: true }).click();
    await page.waitForTimeout(850);
    assert.equal(await scene.getAttribute('data-playing'), 'true');
    await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
    await page.mouse.move(3, 3);
    await page.waitForTimeout(1000);
    const stateA = await scene.locator('.ts-body').evaluate(readSceneVisualState);
    const a = await scene.locator('svg[role="img"]').screenshot({path:path.join(out,'paused-a.png')});
    await page.waitForTimeout(550);
    const b = await scene.locator('svg[role="img"]').screenshot({path:path.join(out,'paused-b.png')});
    const stateB = await scene.locator('.ts-body').evaluate(readSceneVisualState);
    const pixels = compareScenePixels(a,b);
    await fs.writeFile(path.join(out,'pause-metrics.json'),JSON.stringify({pixels,stateA,stateB},null,2));
    assert.deepEqual(stateA,stateB,'Paused geometry or animation clock changed');
    assert(pixels.maxChannelDelta <= 1, `Paused scene pixels changed: ${JSON.stringify(pixels)}`);
    await scene.getByLabel('Следующий кадр объяснения', { exact: true }).click();
    assert.equal(await scene.getAttribute('data-stage'), 'build');
    await scene.getByLabel('Предыдущий кадр объяснения', { exact: true }).click();
    assert.equal(await scene.getAttribute('data-stage'), 'orient');
    await scene.getByLabel('Скорость учебного шага').selectOption('2');
    await scene.getByLabel('Повторить учебный шаг').click();
    await page.waitForTimeout(4000);
    await shot('08-radical-animation');
  });
  await send('25');
  await next();
  await send('неотрицательное');
  await next();
  await send('5');
  await send('|х - 6|');
  await next();
  await send('оно отрицательное так как х меньше 6');
  await next();
  await send('-(x-6)');
  await next();
  await send('-(x-6)=-x+6');
  await next();
  await check('equivalent-expressions-complete-without-retyping', async () => {
    const s = await session('math-radicals');
    assert.equal(s.taskIndex, 2);
    assert.equal(s.teaching.activeStepId, 'radicals-3-square');
    assert.equal(
      (await state()).progress['math-radicals'].attempts.filter((a) => a.correct).length,
      2,
    );
    await shot('09-next-expression');
  });
  await size(1280, 720);
  await shot('10-1280');
  await size(640, 900);
  await shot('11-narrow');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await size(1280, 900);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2),
  );
  await shot('12-app-zoom-200');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(()=>document.querySelector('.teaching-scene')?.getAttribute('data-playing')==='false',null,{timeout:3000});
  await check('reduced-motion-retains-manual-steps', async () => {
    const scene = page.locator('.teaching-scene');
    assert.equal(await scene.getAttribute('data-playing'), 'false');
    await scene.getByLabel('Повторить учебный шаг').click();
    await scene.getByLabel('Следующий кадр объяснения').click();
    assert.equal(await scene.getAttribute('data-stage'), 'build');
    await shot('13-reduced-motion');
  });
  const before = await session('math-radicals');
  await app.close();
  app = undefined;
  await launch();
  await size(1920, 1080);
  await jump('корни модуль', 'Корни, модуль и знаки выражений');
  await check('restart-preserves-active-substep-and-evidence', async () => {
    const after = await session('math-radicals');
    assert.equal(after.id, before.id);
    assert.equal(after.teaching.activeStepId, before.teaching.activeStepId);
    assert.deepEqual(after.teachingHistory, before.teachingHistory);
    await shot('14-restored');
  });
  await jump('запятая', 'Запятая между частями');
  await send('что');
  await shot('15-russian-condition');
  await jump('крещение', 'Крещение Руси');
  await shot('16-history-condition');
  await jump('спрос', 'Спрос и предложение');
  await send('спрос станет маленьким');
  await shot('17-social-condition');
  await check('subject-isolation-and-real-sentence-boards', async () => {
    assert.equal((await session('math-radicals')).taskIndex, 2);
    assert.equal((await session('social-demand')).taskIndex, 1);
    assert.equal(await page.locator('.active-task-board').count(), 1);
    assert.deepEqual(errors, []);
  });
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
        live: !!process.env.COSMOS_QA_LIVE,
        scope:
          'Actual packaged EXE; isolated profile; deterministic learning flow with real rendered screenshots',
        checks,
        screenshots,
        errors,
        dialogue,
        failure,
      },
      null,
      2,
    ),
  );
}
if (failure) process.exitCode = 1;
