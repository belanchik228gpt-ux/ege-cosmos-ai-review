import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const out = path.resolve(process.env.COSMOS_QA_OUT || 'docs/verification/studio-live-native-0.5');
const profile = path.resolve(
    process.env.COSMOS_LIVE_PROFILE || `test-results/studio-live-native-${Date.now()}`,
  ),
  exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const authUserData = path.join(process.env.APPDATA, 'EGE Cosmos Studio');
await fs.mkdir(out, { recursive: true });
const result = {
  kind: 'actual-OpenAI-through-packaged-UI',
  startedAt: new Date().toISOString(),
  status: 'running',
  exe,
  profile,
  checks: [],
  turns: [],
  screenshots: [],
  errors: [],
  limits: [
    'Cosmos-owned existing sign-in reused through an explicit auth-home override; no credentials read or copied.',
    'Synthetic authored pupil prompts and a printed QA image, not an exam score evaluation.',
    'No model response injection, no state injection, no manual photo transcription.',
  ],
  asarSha256: createHash('sha256')
    .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
    .digest('hex'),
};
let app, page;
async function launch() {
  app = await electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      COSMOS_USER_DATA: profile,
      COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
      COSMOS_OPENAI_USER_DATA: authUserData,
    },
    timeout: 45000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(25000);
  page.on('pageerror', (e) => result.errors.push(e.message));
  await page.locator('.cosmos-studio').waitFor();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setContentSize(1600, 1000);
    w.show();
    w.focus();
  });
}
const nav = (name) => page.locator('.studio-sidebar').getByRole('button', { name, exact: true });
async function shot(name) {
  const f = path.join(out, name + '.png');
  await page.screenshot({ path: f });
  result.screenshots.push(f);
}
async function send(text, name) {
  const count = await page.locator('.studio-message.assistant:not(.streaming)').count(),
    start = Date.now();
  await page.getByRole('textbox', { name: 'Сообщение Cosmos', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Отправить сообщение', exact: true }).click();
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll('.studio-message.assistant:not(.streaming)').length > count ||
      !!document.querySelector('.studio-chat-error'),
    count,
    { timeout: 170000 },
  );
  const error = await page
    .locator('.studio-chat-error')
    .innerText()
    .catch(() => '');
  assert(!error, error);
  const last = page.locator('.studio-message.assistant:not(.streaming)').last();
  const reply = await last.innerText();
  const drawings = await last.locator('.dialogue-scene').count();
  result.turns.push({ name, prompt: text, reply, drawings, elapsedMs: Date.now() - start });
  console.log(JSON.stringify(result.turns.at(-1)));
  await last.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await shot(name);
  return reply;
}
try {
  await launch();
  if (!process.env.COSMOS_LIVE_PROFILE) {
    await page.locator('.welcome-modal input').fill('Проверка Cosmos');
    await page.getByRole('button', { name: 'Начнём знакомство', exact: true }).click();
  }
  await nav('Математика').click();
  await page.locator('.studio-chat').waitFor();
  await page.waitForFunction(
    async () => {
      const s = await window.cosmos.getOpenAIStatus();
      return s.authenticated === true;
    },
    null,
    { timeout: 30000 },
  );
  const status = await page.evaluate(() => window.cosmos.getOpenAIStatus());
  result.model = status.selectedModel;
  assert(status.authenticated);
  result.checks.push('real-existing-sign-in-restored');
  if (!process.env.COSMOS_LIVE_PROFILE) {
    await send(
      'Я в 10 классе. Объясни, почему корень из a² равен |a|. Я не понимаю смысл модуля. Начни с маленького примера и рисунка, не выдавай большую лекцию.',
      '01-root-explanation',
    );
    await send(
      'Если a = −3, квадрат получается 9, а корень 3. Значит результат 3, а не −3? Я правильно понял?',
      '02-natural-reasoning',
    );
    await send(
      'Дай один похожий пример, чтобы я попробовал сам. Покажи первый шаг рисунком, но не решай пример за меня.',
      '03-independent-question',
    );
  }
  const mathState = await page.evaluate(() => window.cosmos.loadState());
  const math = Object.values(mathState.cloudSessions).find((l) => l.subject === 'math');
  assert(math.messages.filter((m) => m.kind === 'openai').length >= 3);
  assert(math.messages.some((m) => m.drawing));
  result.checks.push('three-consecutive-real-model-turns-with-drawing');
  let scene = page.locator('.dialogue-scene').last();
  await scene.scrollIntoViewIfNeeded();
  await scene.getByRole('button', { name: 'Повторить рисунок', exact: true }).click();
  await page.waitForTimeout(500);
  await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(350);
  await scene.screenshot(); // settle locator-triggered scroll before pixel measurement
  await page.waitForTimeout(500);
  const one = await scene.screenshot();
  await page.waitForTimeout(700);
  const two = await scene.screenshot();
  await fs.writeFile(path.join(out, 'pause-a.png'), one);
  await fs.writeFile(path.join(out, 'pause-b.png'), two);
  assert(one.equals(two), 'Paused scene must have stable actual rendered pixels.');
  await fs.writeFile(path.join(out, '04-paused-scene.png'), one);
  result.screenshots.push(path.join(out, '04-paused-scene.png'));
  await scene.getByRole('button', { name: 'Следующий кадр', exact: true }).click();
  await scene.getByRole('button', { name: 'Предыдущий кадр', exact: true }).click();
  result.checks.push('actual-generated-scene-pixel-stable-pause-next-back');
  await page
    .locator('.studio-composer input[type=file]')
    .setInputFiles(path.resolve('docs/verification/vision-runtime/rectangle.png'));
  const photo = await send(
    'Это мой отдельный пример на фото. Сначала перепиши условие ровно с картинки, затем объясни только первый шаг с рисунком. Площадь пока не вычисляй.',
    '05-actual-photo',
  );
  assert(/7/.test(photo) && /4/.test(photo) && /прямоугольник/i.test(photo));
  assert(
    !/(?:ответ|площадь\s+(?:равна|составляет))\s*[:=—]?\s*28/i.test(photo),
    'Must not reveal area while asked only for first step.',
  );
  result.checks.push('actual-image-read-and-first-step');
  for (const [name, text, file] of [
    [
      'Русский язык',
      'Объясни, как найти границу главного и придаточного в предложении «Я знаю что ты придёшь». Покажи разбор рисунком и задай один простой вопрос, не ставь запятую вместо меня сразу.',
      '06-russian',
    ],
    [
      'История',
      'Объясни причины Февральской революции 1917 года простыми словами. Покажи причину, событие и последствие на рисунке. Не делай большую лекцию.',
      '07-history',
    ],
    [
      'Обществознание',
      'Помоги понять разницу между спросом и величиной спроса. Цена выросла, покупают меньше. Объясни на рисунке и спроси меня о следующем шаге.',
      '08-social',
    ],
  ]) {
    await nav(name).click();
    await page.locator('.studio-chat').waitFor();
    await send(text, file);
  }
  await page.waitForFunction(() => !localStorage.getItem('ege-cosmos-v1-pending'));
  const saved = await page.evaluate(() => window.cosmos.loadState());
  const subjects = new Set(Object.values(saved.cloudSessions).map((l) => l.subject));
  assert.equal(subjects.size, 4);
  result.checks.push('real-four-subject-dialogues-isolated');
  await app.close();
  app = undefined;
  await launch();
  await nav('Математика').click();
  await page.waitForFunction(
    async () => (await window.cosmos.getOpenAIStatus()).authenticated === true,
  );
  const restored = await page.evaluate(() => window.cosmos.loadState());
  assert.deepEqual(restored.cloudSessions, saved.cloudSessions);
  await send(
    'Продолжим после перезапуска. Напомни коротко, какой отдельный пример я прислал на фото, и какой первый шаг мы обсуждали.',
    '09-restart-continuation',
  );
  result.checks.push('signed-in-restart-and-next-real-reply');
  assert.deepEqual(result.errors, []);
  result.status = 'pass';
} catch (e) {
  result.status = 'fail';
  result.error = String(e.stack || e);
  if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
  await app?.close();
  result.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({ status: result.status, checks: result.checks, error: result.error }),
  );
  if (result.status !== 'pass') process.exitCode = 1;
}
