import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// No askModel call: this smoke checks configuration without starting inference.
const root = process.cwd();
const exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const profile = path.join(root, 'test-results/backend-ui-' + Date.now());
const out = path.join(root, 'docs/verification');
await fs.mkdir(out, { recursive: true });
const env = {
  ...process.env,
  COSMOS_USER_DATA: profile,
  COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
};
delete env.COSMOS_RUNTIME_DIR;
delete env.COSMOS_REFERENCES_DIR;
delete env.COSMOS_DEV_URL;
const report = {
  checkedAt: new Date().toISOString(),
  status: 'running',
  checks: [],
  selections: [],
  errors: [],
  modelStarted: false,
};
let app, page;
const labels = { auto: 'Авто', cpu: 'Процессор', gpu: 'Видеокарта' };
async function launch() {
  app = await electron.launch({ executablePath: exe, args: [], env, timeout: 60000 });
  page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.waitForSelector('.home-intro');
  const info = await page.evaluate(() => window.cosmos.getAppInfo());
  assert.equal(info.packaged, true);
  assert.equal(
    await page.evaluate(() => typeof window.cosmos.updateModelBackend),
    'function',
    'New packaged backend bridge required',
  );
  if (await page.locator('.welcome-modal').count()) {
    await page.getByPlaceholder('Твоё имя').fill('Тестовый ученик');
    await page.getByRole('button', { name: 'Начнём знакомство', exact: true }).click();
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 720));
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: 'Преподаватель', exact: true }).click();
  await page.getByRole('group', { name: 'Режим работы модели' }).waitFor();
  return info;
}
async function ensureBackend(expected, requireFile = true) {
  let status;
  for (let attempt = 0; attempt < 60; attempt++) {
    status = await page.evaluate(() => window.cosmos.modelStatus());
    const selected = await page
      .getByRole('group', { name: 'Режим работы модели' })
      .getByRole('button', { name: new RegExp('^' + labels[expected]) })
      .getAttribute('aria-pressed');
    if (status.backend === expected && !status.busy && selected === 'true') break;
    await page.waitForTimeout(200);
  }
  assert.equal(status.backend, expected);
  assert.equal(status.busy, false);
  assert(!['starting', 'ready'].includes(status.state), 'Configuration must not start inference');
  assert.equal(status.mode, undefined);
  assert.equal(status.lastElapsedMs, undefined);
  if (requireFile) {
    const config = JSON.parse(await fs.readFile(path.join(profile, 'model.json'), 'utf8'));
    assert.equal(config.backend, expected);
    assert.equal('modelPath' in config, false, 'Default installed model must stay relocatable');
  }
  report.selections.push({
    backend: expected,
    state: status.state,
    available: status.available,
    busy: status.busy,
  });
  return status;
}
async function choose(backend) {
  await page
    .getByRole('group', { name: 'Режим работы модели' })
    .getByRole('button', { name: new RegExp('^' + labels[backend]) })
    .click();
  await ensureBackend(backend);
  report.checks.push(`native-selection-${backend}-persisted`);
}
async function assertNoInference() {
  const diagnostics = await page.evaluate(() => window.cosmos.getDiagnostics());
  const started = diagnostics.filter((entry) =>
    ['model-start', 'model-ready', 'model-answer', 'model-request', 'model-exit'].includes(
      entry.scope,
    ),
  );
  report.modelStarted = started.length > 0;
  assert.equal(started.length, 0, 'This test must not start or query the model');
}

try {
  const info = await launch();
  report.application = { name: info.name, version: info.version, packaged: info.packaged };
  await ensureBackend('auto', false);
  report.checks.push('default-auto-without-inference');
  await choose('cpu');
  await assertNoInference();
  await app.close();
  app = null;
  await launch();
  await ensureBackend('cpu');
  report.checks.push('cpu-survives-native-app-restart');
  await choose('gpu');
  await choose('auto');
  await assertNoInference();
  await app.close();
  app = null;
  await launch();
  await ensureBackend('auto');
  report.checks.push('auto-survives-native-app-restart');
  const group = page.getByRole('group', { name: 'Режим работы модели' });
  await group.scrollIntoViewIfNeeded();
  await page
    .locator('.toast button')
    .click({ timeout: 400 })
    .catch(() => {});
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert(viewport.scrollWidth <= viewport.width + 1, 'No horizontal page overflow at 1280x720');
  for (const label of Object.values(labels)) {
    const button = group.getByRole('button', { name: new RegExp('^' + label) });
    const box = await button.boundingBox();
    assert(
      box &&
        box.x >= 0 &&
        box.x + box.width <= viewport.width &&
        box.y >= 0 &&
        box.y + box.height <= viewport.height,
      'Backend control must fit the native viewport',
    );
    assert.equal(await button.isEnabled(), true);
  }
  await page.screenshot({ path: path.join(out, 'backend-ui.png'), fullPage: false });
  report.checks.push('all-three-backend-controls-visible-at-1280x720');
  await assertNoInference();
  report.checks.push('no-model-start-or-inference-during-entire-test');
  assert.deepEqual(report.errors, []);
  report.status = 'pass';
} catch (error) {
  report.status = 'fail';
  report.failure = error.message;
  if (page)
    await page
      .screenshot({ path: path.join(out, 'backend-ui-failure.png'), fullPage: false })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'backend-ui.json'), JSON.stringify(report, null, 2));
  if (app) await app.close();
  console.log(JSON.stringify(report, null, 2));
}
