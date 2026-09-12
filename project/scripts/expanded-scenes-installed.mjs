import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const exe = path.resolve(process.env.COSMOS_EXE || 'test-results/installed-app/EGE Cosmos.exe');
const live = JSON.parse(await fs.readFile('docs/verification/fast-live-0.7.2/report.json', 'utf8'));
const profile = live.profile,
  out = path.resolve(process.env.COSMOS_REVIEW_OUT || 'docs/verification/expanded-installed-0.7.2');
await fs.mkdir(out, { recursive: true });
const report = {
  status: 'running',
  exe,
  profile,
  at: new Date().toISOString(),
  checks: [],
  errors: [],
  screenshots: [],
  scope:
    'Actual EXE at recorded path, restored three actual OpenAI answers from isolated QA profile; no new model calls and no injected learning results.',
};
report.asarSha256 = createHash('sha256')
  .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
  .digest('hex');
const finalPackage = JSON.parse(await fs.readFile('docs/verification/expanded-scenes-0.7.2/report.json', 'utf8'));
assert.equal(report.asarSha256, finalPackage.asarSha256);
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
      COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
    },
    timeout: 45000,
  });
  page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setIgnoreMouseEvents(true);
    w.setContentSize(1280, 720);
  });
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.locator('.cosmos-studio').waitFor();
}
async function resume(subjectTitle) {
  await page.getByLabel('Поиск прошлых диалогов', { exact: true }).fill(subjectTitle);
  await page.locator('.conversation-history-list button').first().click();
  await page.locator('.school-room').waitFor();
}
try {
  await launch();
  const before = (await page.evaluate(() => window.cosmos.loadState())).school.lessons;
  assert.equal(
    Object.values(before)
      .flatMap((l) => l.messages)
      .filter((m) => m.verification).length,
    3,
  );
  await nav('Настройки').click();
  await button('Изображение и звук').click();
  await button('Учебные сцены').click();
  await page.getByRole('button', { name: /Низкое Без тяжёлых эффектов/ }).click();
  for (const c of [
    { title: 'Химия', id: 'chemistry', figure: 'chemistry-reaction' },
    { title: 'История', id: 'history', figure: 'history-map' },
    { title: 'Обществознание', id: 'social' },
  ]) {
    await resume(c.title);
    const answer = page.locator('.school-message.assistant').last();
    const scene = answer.locator('.dialogue-scene');
    assert.equal(await scene.getAttribute('data-quality'), 'low');
    await scene.getByRole('button', { name: 'Кадр 2', exact: true }).click();
    if (c.id === 'history') {
      assert.match(await scene.locator('.ds-caption').innerText(), /Севастополь был главной базой/);
      assert.doesNotMatch(await scene.locator('.ds-caption').innerText(), /Стрелки показывают/);
    }
    if (c.id === 'social') {
      assert.equal(await scene.locator('.ds-data-node').count(), 3);
      assert.match(await scene.locator('.ds-data-node').last().innerText(), /200/);
    }
    if (c.figure)
      assert.equal(await scene.locator(`[data-subject-figure="${c.figure}"]`).count(), 1);
    assert.equal(await answer.locator('.answer-review').count(), 1);
    await scene.getByRole('button', { name: 'Рисунок целиком', exact: true }).click();
    await poll(() => page.evaluate(() => !!document.fullscreenElement));
    await shot(c.id + '-low-fullscreen');
    await scene.getByRole('button', { name: 'Вернуться к переписке', exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await poll(async () => (await scene.getAttribute('data-motion')) === 'off');
    await scene.getByRole('button', { name: 'Предыдущий кадр', exact: true }).click();
    assert.equal(await scene.getAttribute('data-step'), '0');
    await scene.getByRole('button', { name: 'Следующий кадр', exact: true }).click();
    await scene.scrollIntoViewIfNeeded();
    await shot(c.id + '-reduced-motion');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    report.checks.push(
      c.title +
        ': restored real answer, low quality, fullscreen, reduced motion, previous/next, saved review.',
    );
    if (c.id === 'social') {
      const deck = page.locator('.term-deck');
      if (!(await deck.evaluate((el) => el.open))) await deck.locator('summary').first().click();
      await deck.getByLabel('Найти термин', { exact: true }).fill('инфляция');
      await deck.getByRole('button', { name: 'Инфляция', exact: true }).click();
      await deck.getByText('Точное определение и границы понятия', { exact: true }).click();
      assert((await deck.locator('a:visible').count()) > 0);
      await deck.scrollIntoViewIfNeeded();
      await shot('term-sources');
    }
  }
  await resume('Химия');
  const oldDocs = (await page.evaluate(() => window.cosmos.loadState())).school.documents.map(
    (d) => d.id,
  );
  await button('Конспект').click();
  await page.locator('.school-document-preview').waitFor();
  await button('PDF').click();
  await poll(async () =>
    (await page.evaluate(() => window.cosmos.loadState())).school.documents.some(
      (d) => d.path?.endsWith('.pdf') && !oldDocs.includes(d.id),
    ),
  );
  const doc = (await page.evaluate(() => window.cosmos.loadState())).school.documents
    .filter((d) => d.path?.endsWith('.pdf') && !oldDocs.includes(d.id))
    .at(-1);
  assert(doc.drawings.some((d) => d.figure === 'chemistry-reaction'));
  report.document = path.join(out, 'actual-openai-chemistry.pdf');
  await fs.copyFile(doc.path, report.document);
  assert((await fs.stat(report.document)).size > 10000);
  await app.close();
  app = null;
  await launch();
  await resume('Химия');
  const after = await page.evaluate(() => window.cosmos.loadState());
  assert.deepEqual(after.school.lessons, before);
  assert.equal(after.settings.quality, 'low');
  assert(after.school.documents.some((d) => d.id === doc.id));
  report.checks.push(
    'Actual EXE restart preserves all three complete lessons, verification metadata, low-quality preference and exported document. Chemistry PDF contains the actual OpenAI drawing.',
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
