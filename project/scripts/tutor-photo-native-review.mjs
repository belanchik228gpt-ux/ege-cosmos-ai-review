import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const exe = path.resolve(process.env.COSMOS_EXE || 'test-results/installed-app/EGE Cosmos.exe');
const out = path.resolve('docs/verification/photo-native-0.3');
const profile = path.resolve(`test-results/photo-native-${Date.now()}`);
await fs.mkdir(out, { recursive: true });
const env = {
  ...process.env,
  COSMOS_USER_DATA: profile,
  COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
};
delete env.COSMOS_RUNTIME_DIR;
const app = await electron.launch({
  executablePath: exe,
  args: ['--disable-backgrounding-occluded-windows'],
  env,
  timeout: 45000,
});
const page = await app.firstWindow();
page.setDefaultTimeout(20000);
const results = [],
  screenshots = [],
  errors = [];
let failure;
page.on('pageerror', (e) => errors.push(e.message));
async function shot(name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
  await page.screenshot({ path: path.join(out, name + '-viewport.png') });
  screenshots.push(name);
}
async function ownSend(text) {
  await page.getByLabel('Сообщение о своей задаче').fill(text);
  await page.getByRole('button', { name: 'Отправить ответ по своей задаче', exact: true }).click();
}
async function latest() {
  await page.waitForTimeout(350);
  const s = await page.evaluate(() => window.cosmos.loadState());
  return Object.values(s.problemSessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}
async function read(name) {
  const at = Date.now();
  await page
    .locator('input[type=file]')
    .setInputFiles(path.resolve(`docs/verification/vision-runtime/${name}.png`));
  await page
    .getByText('Условие переписано локальной моделью.', { exact: false })
    .waitFor({ timeout: 150000 });
  const text = await page.getByLabel('Условие своей задачи').inputValue();
  results.push({
    kind: 'actual-vision-through-installed-ui',
    fixture: name,
    text,
    elapsedMs: Date.now() - at,
  });
  return text;
}
async function model(text, name) {
  const count = await page.locator('.message').count();
  const at = Date.now();
  await ownSend(text);
  await page.waitForFunction(
    (n) =>
      document.querySelectorAll('.message').length >= n + 2 &&
      !document.querySelector('.tutor-thinking'),
    count,
    { timeout: 180000 },
  );
  const work = await latest();
  const reply = work.messages.at(-1);
  results.push({
    kind: 'actual-text-through-installed-ui',
    name,
    elapsedMs: Date.now() - at,
    reply,
    hints: work.hints,
  });
  assert.equal(reply.kind, 'model', JSON.stringify(reply));
  assert(reply.verification?.evidence?.length);
  assert(!reply.text.includes('?'), 'A model cannot introduce an ungraded question');
  await shot(name);
}
try {
  await page.getByLabel('Как к тебе обращаться?').fill('Алекс');
  await page.getByRole('button', { name: 'Начнём знакомство' }).click();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 1000),
  );
  const info = await page.evaluate(() => window.cosmos.getAppInfo());
  assert.equal(info.version, '0.3.0');
  assert.equal((await page.evaluate(() => window.cosmos.modelStatus())).available, true);
  assert.equal((await page.evaluate(() => window.cosmos.imageReaderStatus())).available, true);
  await page.getByRole('button', { name: 'Своя задача', exact: true }).click();
  const text = await read('rectangle');
  assert.match(text, /7\s*см.*4\s*см/);
  await shot('01-photo-transcription');
  await page.getByRole('button', { name: 'Условие верное — разобрать', exact: true }).click();
  assert.match(await page.locator('.problem-scene').innerText(), /Рядов: 4 · В каждом: 7/);
  await model('Почему здесь умножение, а не сложение?', '02-live-explanation');
  await ownSend('будет площадь 28 см2');
  await page.getByText('Мы разобрали пример с помощью;', { exact: false }).waitFor();
  const solved = await latest();
  assert.equal(solved.solved, true);
  assert(solved.hints > 0);
  await page.locator('.problem-scene').getByLabel('Шаг решения задачи').selectOption('3');
  await shot('03-photo-solved');
  await page.getByRole('button', { name: 'Новый пример', exact: true }).click();
  const both = await read('fractions');
  assert.match(both, /3\s*\/\s*8/);
  assert.match(both, /\|x/);
  await shot('04-review-multiple-conditions');
  await page.getByLabel('Условие своей задачи').fill('3/8 + 1/4');
  await page.getByRole('button', { name: 'Условие верное — разобрать', exact: true }).click();
  await model(
    'Почему здесь сначала приводят дроби к общему знаменателю?',
    '05-text-after-second-photo',
  );
  await ownSend('5/8');
  await page.getByText('Этот пример решён', { exact: true }).waitFor();
  await shot('06-fraction-solved');
  const state = await page.evaluate(() => window.cosmos.loadState());
  assert.equal(Object.values(state.problemSessions).length, 2);
  assert.deepEqual(errors, []);
  results.push({
    kind: 'memory',
    ownProblems: 2,
    assistedAnswers: Object.values(state.problemSessions).every((p) => p.solved && p.hints > 0),
    rawImagePersisted: JSON.stringify(state).includes('data:image'),
  });
  assert.equal(results.at(-1).rawImagePersisted, false);
} catch (e) {
  failure = e.stack;
  console.error(failure);
  await shot('failure').catch(() => {});
} finally {
  await app.close();
  await fs.writeFile(
    path.join(out, 'result.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        exe,
        appAsarSha256: createHash('sha256')
          .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
          .digest('hex'),
        profile,
        scope:
          'Installed EXE, installed text and vision weights, UI file attachment, actual inference; authored printed images, handwriting not tested',
        results,
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
else
  console.log(
    'PASS installed image → reviewed text → scene → real conversation → checked answer; repeated after second photo',
  );
