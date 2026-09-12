import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const exe = path.resolve(process.env.COSMOS_EXE || 'test-results/installed-app/EGE Cosmos.exe');
const live = JSON.parse(
  await fs.readFile('docs/verification/subject-live-0.7.1/report.json', 'utf8'),
);
const profile = live.profile,
  out = path.resolve(process.env.COSMOS_REVIEW_OUT || 'docs/verification/subject-final-0.7.1');
await fs.mkdir(out, { recursive: true });
const report = {
  status: 'running',
  exe,
  profile,
  at: new Date().toISOString(),
  scope:
    'Actual EXE at the recorded path; replay of two saved actual OpenAI responses, not synthetic responses. No new model calls.',
  checks: [],
  errors: [],
  screenshots: [],
};
report.asarSha256 = createHash('sha256')
  .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
  .digest('hex');
let app, page;
const button = (name) => page.getByRole('button', { name, exact: true });
const nav = (name) => page.locator('.studio-sidebar').getByRole('button', { name, exact: true });
async function poll(fn, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw Error('Timed out');
}
async function shot(name) {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file });
  report.screenshots.push(file);
}
async function launch() {
  app = await electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      COSMOS_USER_DATA: profile,
      COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
    },
    timeout: 45000,
  });
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setIgnoreMouseEvents(true);
    w.setContentSize(1280, 720);
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.locator('.cosmos-studio').waitFor();
}
async function resume() {
  await page.locator('.conversation-history-list button').first().click();
  await page.locator('.school-room').waitFor();
}
try {
  await launch();
  await resume();
  assert.equal(await page.locator('.school-message.assistant').count(), 2);
  const before = (await page.evaluate(() => window.cosmos.loadState())).school.lessons;
  for (const scene of await page.locator('.school-message.assistant .dialogue-scene').all()) {
    await scene.getByRole('button', { name: 'Кадр 2', exact: true }).click();
    assert.equal(await scene.locator('[data-subject-figure="circuit"]').count(), 1);
    assert((await scene.locator('.ds-main-formula .katex').count()) > 0);
    assert.equal(await scene.locator('.katex-error').count(), 0);
  }
  let scene = page.locator('.school-message.assistant .dialogue-scene').last();
  await scene.getByRole('button', { name: 'Рисунок целиком', exact: true }).click();
  await poll(() => page.evaluate(() => !!document.fullscreenElement));
  await shot('actual-openai-circuit-formula-fixed');
  await scene.getByRole('button', { name: 'Вернуться к переписке', exact: true }).click();
  await nav('Настройки').click();
  await button('Изображение и звук').click();
  await button('Учебные сцены').click();
  await page.getByRole('button', { name: /Низкое Без тяжёлых эффектов/ }).click();
  await resume();
  scene = page.locator('.school-message.assistant .dialogue-scene').last();
  assert.equal(await scene.getAttribute('data-quality'), 'low');
  await scene.getByRole('button', { name: 'Кадр 2', exact: true }).click();
  await scene.getByRole('button', { name: 'Рисунок целиком', exact: true }).click();
  await poll(() => page.evaluate(() => !!document.fullscreenElement));
  await shot('low-quality-fullscreen');
  await scene.getByRole('button', { name: 'Вернуться к переписке', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await poll(async () => (await scene.getAttribute('data-motion')) === 'off');
  await scene.getByRole('button', { name: 'Предыдущий кадр', exact: true }).click();
  assert.equal(await scene.getAttribute('data-step'), '0');
  await scene.getByRole('button', { name: 'Следующий кадр', exact: true }).click();
  await shot('reduced-motion');
  report.checks.push(
    'Two actual OpenAI formulas rendered with KaTeX; 1280x720 window and native monitor fullscreen; low quality; reduced motion; back/next remain available.',
  );
  const existingDocIds = (
    await page.evaluate(() => window.cosmos.loadState())
  ).school.documents.map((d) => d.id);
  await button('Конспект').click();
  await page.locator('.school-document-preview').waitFor();
  await button('PDF').click();
  await poll(async () =>
    (await page.evaluate(() => window.cosmos.loadState())).school.documents.some(
      (d) => d.path?.endsWith('.pdf') && !existingDocIds.includes(d.id),
    ),
  );
  const doc = (await page.evaluate(() => window.cosmos.loadState())).school.documents
    .filter((d) => d.path?.endsWith('.pdf') && !existingDocIds.includes(d.id))
    .at(-1);
  assert.equal(doc.drawings.length, 2);
  assert(!doc.content.includes('Разобранный пример\n\n'));
  report.document = path.join(out, 'actual-openai-notes.pdf');
  await fs.copyFile(doc.path, report.document);
  assert((await fs.stat(report.document)).size > 10000);
  await app.close();
  app = null;
  await launch();
  await resume();
  assert.deepEqual((await page.evaluate(() => window.cosmos.loadState())).school.lessons, before);
  assert.equal((await page.evaluate(() => window.cosmos.loadState())).settings.quality, 'low');
  assert.equal(await page.locator('.school-message.assistant').count(), 2);
  report.checks.push(
    'Actual EXE restart preserves the unchanged two-reply lesson, figure data and low-quality preference. Real PDF contains both actual drawings.',
  );
  assert.deepEqual(report.errors, []);
  report.status = 'pass';
} catch (e) {
  report.status = 'failed';
  report.failure = String(e.stack || e);
  process.exitCode = 1;
  if (page) await shot('failure').catch(() => {});
} finally {
  if (app) await app.close();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
