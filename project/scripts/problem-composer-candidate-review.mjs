/** Candidate CSS injection only: this is NOT a final packaged visual acceptance. */
import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const exe = path.resolve(process.env.COSMOS_EXE || 'test-results/installed-app/EGE Cosmos.exe');
const out = path.resolve('docs/verification/problem-composer-candidate-0.4');
const profile = path.resolve(`test-results/problem-composer-candidate-${Date.now()}`);
const runtime = path.join(profile, 'empty-runtime');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const source = await fs.readFile('src/ui/tutor-workspace.css', 'utf8');
const start = source.indexOf('@media (min-width: 831px) and (min-height: 640px)');
const rules = source.slice(start).match(/\.tutor-workspace \.tutor-conversation \{[^}]+\}/)?.[0];
assert(rules?.includes('min-height: 420px;'));
const css = `@media (min-width: 831px) and (min-height: 640px) {${rules}}`;
const result = {
  kind: 'candidate-css-injected-into-existing-exe',
  status: 'running',
  startedAt: new Date().toISOString(),
  css,
  cssSha256: hash(css),
  sourceSha256: hash(source),
  exe,
  profile,
  checks: [],
  screenshots: [],
  errors: [],
  boundaries: [
    'CSS injected via addStyleTag; not final packaged CSS acceptance.',
    'Empty runtime prevents model or vision worker startup; learning state created only by UI.',
  ],
};
let app, page;
const button = (name) => page.getByRole('button', { name, exact: true });
async function saved() {
  await page.waitForFunction(() => !localStorage.getItem('ege-cosmos-v1-pending'));
  return page.evaluate(() => window.cosmos.loadState());
}
async function say(text) {
  await page.getByLabel('Сообщение о своей задаче').fill(text);
  await button('Отправить ответ по своей задаче').click();
  await page.waitForFunction(() => !document.querySelector('.tutor-thinking'));
  await saved();
}
async function check(name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(450);
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('.tutor-conversation');
    const selectors = {
      header: '.tutor-header',
      condition: '.conversation-condition',
      history: '.dialogue',
      composer: '.composer',
      field: 'textarea',
      send: '.send-button',
    };
    const b = (el) => {
      const r = el.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        height: r.height,
      };
    };
    return {
      width: innerWidth,
      height: innerHeight,
      panel: b(panel),
      parts: Object.fromEntries(
        Object.entries(selectors).map(([k, s]) => [k, b(panel.querySelector(s))]),
      ),
    };
  });
  const inside = Object.values(layout.parts).every(
    (b) => b.top >= layout.panel.top - 1 && b.bottom <= layout.panel.bottom + 1,
  );
  const file = `${name}.png`;
  const png = await page.screenshot({ path: path.join(out, file), fullPage: true });
  result.screenshots.push({ file, sha256: hash(png) });
  result.checks.push({ name, inside, layout });
  console.log(inside ? 'PASS' : 'FAIL', name, JSON.stringify(layout));
  assert(inside, `${name}: child clipped by panel`);
}
await fs.mkdir(out, { recursive: true });
await fs.mkdir(runtime, { recursive: true });
const timeout = setTimeout(() => {
  void app?.close();
}, 90000);
try {
  result.asarSha256 = hash(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')));
  app = await electron.launch({
    executablePath: exe,
    timeout: 45000,
    env: {
      ...process.env,
      COSMOS_USER_DATA: profile,
      COSMOS_RUNTIME_DIR: runtime,
      COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
    },
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => result.errors.push(e.message));
  await page.locator('.app-shell').waitFor();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setContentSize(1280, 720);
    w.show();
    w.focus();
  });
  await page.addStyleTag({ content: css });
  await page.getByPlaceholder('Твоё имя').fill('Тестовый ученик');
  await button('Начнём знакомство').click();
  assert.equal((await page.evaluate(() => window.cosmos.modelStatus())).available, false);
  await button('Своя задача').click();
  await page
    .getByLabel('Условие своей задачи')
    .fill('Площадь прямоугольника со сторонами 7 и 4 см');
  await button('Разобрать мой пример').click();
  await say('не знаю');
  await check('01-row-closed');
  await page.locator('.conversation-condition summary').click();
  await check('02-row-original-condition-expanded');
  await say('7?');
  await button('Далее').click();
  await saved();
  await page
    .getByLabel('Сообщение о своей задаче')
    .fill('Я пока не понимаю, как выбрать действие для этой площади, объясни ещё раз.');
  await check('03-long-operation-original-expanded-composer-filled');
  await page.locator('.tutor-conversation').scrollIntoViewIfNeeded();
  await page.waitForTimeout(450);
  const file = '04-scrolled-operation-viewport.png';
  const png = await page.screenshot({ path: path.join(out, file) });
  result.screenshots.push({ file, sha256: hash(png) });
  assert.deepEqual(result.errors, []);
  result.status = 'candidate-geometry-pass';
} catch (error) {
  result.status = 'fail';
  result.failure = error.message;
  console.error(error);
} finally {
  clearTimeout(timeout);
  await app?.close();
  result.ownAppClosed = true;
  result.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'candidate-geometry-pass' ? 0 : 1;
}
