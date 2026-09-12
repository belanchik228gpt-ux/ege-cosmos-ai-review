import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const profile = path.resolve(
  process.env.COSMOS_QA_PROFILE || 'test-results/school-native-1788926849357',
);
const out = path.resolve(process.env.COSMOS_QA_OUT || 'docs/verification/school-visual-0.7.0');
await fs.mkdir(out, { recursive: true });
const report = {
  at: new Date().toISOString(),
  exe,
  profile,
  status: 'running',
  checks: [],
  screenshots: [],
  errors: [],
  scope:
    'Real EXE, replay of saved real OpenAI QA lessons; no injected model responses. External AutoClicker excluded only from QA window. No new live model calls.',
};
report.asarSha256 = createHash('sha256')
  .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
  .digest('hex');
let app, page;
async function poll(fn, timeout = 60000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Timed out');
}
const nav = (name) => page.locator('.studio-sidebar').getByRole('button', { name, exact: true });
const button = (name) => page.getByRole('button', { name, exact: true });
async function shot(name) {
  const p = path.join(out, name + '.png');
  await page.screenshot({ path: p });
  report.screenshots.push(p);
}
async function lesson(subject) {
  await nav('Сегодня').click();
  await page
    .locator('.school-history > button')
    .filter({ has: page.locator('span').filter({ hasText: new RegExp('^' + subject + '$') }) })
    .first()
    .click();
  await page.locator('.school-room').waitFor();
}
try {
  app = await electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      COSMOS_USER_DATA: profile,
      COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
      COSMOS_OPENAI_USER_DATA: path.join(process.env.APPDATA, 'EGE Cosmos Studio'),
    },
    timeout: 45000,
  });
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setIgnoreMouseEvents(true);
    w.setContentSize(1600, 1000);
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.locator('.cosmos-studio').waitFor();
  await nav('Школа').click();
  const egeBefore = (await page.evaluate(() => window.cosmos.loadState())).cloudSessions;
  await lesson('Физика');
  let scene = page.locator('.school-message.assistant .dialogue-scene').first();
  await scene.scrollIntoViewIfNeeded();
  await scene.getByRole('button', { name: 'Кадр 1', exact: true }).click();
  assert.equal(await scene.locator('.ds-person,.ds-institution').count(), 0);
  assert.equal(
    await scene.getByRole('img', { name: 'Масса тела и результирующая сила из условия' }).count(),
    1,
  );
  await shot('physics-force-corrected');
  scene = page.locator('.school-message.assistant .dialogue-scene').last();
  await scene.scrollIntoViewIfNeeded();
  await scene.getByRole('button', { name: 'Кадр 1', exact: true }).click();
  await scene.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
  await poll(async () => (await scene.getAttribute('data-playing')) === 'true');
  await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
  assert.equal(await scene.getAttribute('data-playing'), 'false');
  await scene.getByRole('button', { name: 'Следующий кадр', exact: true }).click();
  assert.equal(await scene.getAttribute('data-step'), '1');
  await scene.getByRole('button', { name: 'Предыдущий кадр', exact: true }).click();
  assert.equal(await scene.getAttribute('data-step'), '0');
  await scene.getByRole('button', { name: 'Повторить рисунок', exact: true }).click();
  await scene.getByRole('button', { name: 'Рисунок целиком', exact: true }).click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.waitForFunction(() => {
    const node = document.fullscreenElement?.querySelector('.ds-data-node');
    return node && Number(getComputedStyle(node).opacity) > 0.98;
  });
  await shot('physics-fullscreen');
  await scene.getByRole('button', { name: 'Вернуться к переписке', exact: true }).click();
  await lesson('Химия');
  scene = page.locator('.school-message.assistant .dialogue-scene').last();
  await scene.scrollIntoViewIfNeeded();
  await scene.getByRole('button', { name: 'Кадр 1', exact: true }).click();
  assert.equal(await scene.locator('.ds-person,.ds-institution').count(), 0);
  await shot('chemistry-electrons-corrected');
  report.checks.push(
    'physics-data-body-force-no-social-icons',
    'chemistry-data-no-social-icons',
    'play-pause-next-back-replay-fullscreen',
  );
  await nav('Настройки').click();
  await button('Учебные сцены').click();
  await page.getByRole('button', { name: 'Низкое Без тяжёлых эффектов' }).click();
  await page.getByRole('checkbox', { name: /Уменьшить движение/ }).check();
  await nav('Школа').click();
  await lesson('Химия');
  scene = page.locator('.school-message.assistant .dialogue-scene').last();
  await scene.scrollIntoViewIfNeeded();
  assert.equal(await scene.getAttribute('data-motion'), 'off');
  assert.equal(await scene.getAttribute('data-quality'), 'low');
  await scene.getByRole('button', { name: 'Следующий кадр', exact: true }).click();
  await shot('chemistry-low-reduced-motion');
  report.checks.push('low-quality-and-reduced-motion-manual-step');
  await nav('Настройки').click();
  await button('Учебные сцены').click();
  await page.getByRole('button', { name: 'Высокое Свечение и плавные переходы' }).click();
  await page.getByRole('checkbox', { name: /Уменьшить движение/ }).uncheck();
  await nav('Школа').click();
  await lesson('Физика');
  await button('Конспект').click();
  await page.locator('.school-document-preview').waitFor();
  await button('PDF').click();
  await poll(() =>
    page.evaluate(async () => {
      const s = (await window.cosmos.loadState()).school;
      return s.documents.some(
        (d) => d.path?.endsWith('.pdf') && Date.parse(d.createdAt) >= Date.now() - 60000,
      );
    }),
  );
  const docs = (await page.evaluate(() => window.cosmos.loadState())).school.documents;
  const d = docs
    .filter((d) => d.path?.endsWith('.pdf'))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  await fs.copyFile(d.path, path.join(out, 'physics-corrected.pdf'));
  report.document = d.path;
  assert.deepEqual((await page.evaluate(() => window.cosmos.loadState())).cloudSessions, egeBefore);
  const sources = await page.evaluate(() => window.cosmos.listSchoolSources());
  const expected = JSON.parse(await fs.readFile('resources/school-program/manifest.json', 'utf8')).documents;
  assert.deepEqual(sources.map(s=>s.id).sort(), expected.map(s=>s.id).sort());
  for (const source of sources) {
    const read = await page.evaluate(
      (id) => window.cosmos.readSchoolSource({ id, page: 1, maxChars: 600 }),
      source.id,
    );
    assert(read.ok, source.id);
  }
  report.checks.push(
    `all-${sources.length}-local-PDFs-and-fragments-readable`,
    'real-corrected-PDF-export',
    'EGE-state-preserved',
  );
  assert.deepEqual(report.errors, []);
  report.status = 'pass';
} catch (e) {
  report.status = 'failed';
  report.failure = String(e.stack || e);
  if (page) await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  if (app) await app.close();
  console.log(JSON.stringify(report, null, 2));
}
