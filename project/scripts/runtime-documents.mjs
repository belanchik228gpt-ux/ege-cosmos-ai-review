import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = process.cwd(),
  profile = path.join(root, 'test-results', 'documents-' + Date.now());
const evidence = path.join(root, 'docs', 'verification');
await fs.mkdir(evidence, { recursive: true });
const exe =
  process.env.COSMOS_TEST_EXE || path.join(root, 'node_modules/electron/dist/electron.exe');
const asarFile = path.join(path.dirname(exe), 'resources', 'app.asar');
const asarSha256 = process.env.COSMOS_TEST_EXE
  ? await fs.readFile(asarFile).then((bytes) => createHash('sha256').update(bytes).digest('hex'))
  : undefined;
const app = await electron.launch({
  executablePath: exe,
  args: process.env.COSMOS_TEST_EXE ? [] : ['.'],
  env: {
    ...process.env,
    COSMOS_USER_DATA: profile,
    COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
    COSMOS_RUNTIME_DIR: path.join(profile, 'no-model'),
  },
  timeout: 45000,
});
const checks = [],
  errors = [],
  outputs = [];
let page, info, failure;
const deadline = setTimeout(() => app.close().catch(() => {}), 240000);
try {
  page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForSelector('.home-intro');
  info = await page.evaluate(() => window.cosmos.getAppInfo());
  if (process.env.COSMOS_TEST_EXE)
    assert.equal(info.packaged, true, 'This run requires a packaged native app');
  await page.getByPlaceholder('Твоё имя').fill('Тестовый ученик');
  await page.getByRole('button', { name: 'Начнём знакомство' }).click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
  await page
    .getByRole('navigation', { name: 'Предметы' })
    .getByRole('button', { name: 'Математика', exact: true })
    .click();
  await page.locator('.topic-card').filter({ hasText: 'Площадь прямоугольника' }).click();
  await page.getByRole('textbox', { name: 'Сообщение Cosmos' }).fill('9999');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await page.getByRole('textbox', { name: 'Сообщение Cosmos' }).fill('21');
  await page.getByRole('button', { name: 'Отправить сообщение' }).click();
  await page.getByRole('button', { name: 'Мои документы', exact: true }).click();
  await page.getByLabel('Тип документа', { exact: true }).selectOption('Конспект занятия');
  assert.match(
    await page.locator('.document-session-note').innerText(),
    /2 проверенных попыток · 0 верных самостоятельно · 1 с помощью/,
  );
  await page.screenshot({
    path: path.join(evidence, 'documents-session-selection.png'),
    fullPage: true,
  });
  checks.push('actual-current-session-selected-with-two-attempts-and-assisted-status');
  await page.getByRole('button', { name: 'Создать документ', exact: true }).click();
  await page.getByRole('dialog', { name: 'Редактор документа' }).waitFor();
  assert.match(
    await page.frameLocator('.album-preview').locator('body').innerText(),
    /Самостоятельных верных ответов: 0/,
  );
  assert.match(
    await page.frameLocator('.album-preview').locator('body').innerText(),
    /Попыток с ошибкой: 1/,
  );
  assert.equal(await page.frameLocator('.album-preview').locator('.teaching').count(), 1);
  await page.getByLabel('Оформление документа', { exact: true }).selectOption('paper');
  await page.frameLocator('.album-preview').locator('body.paper').waitFor();
  await page.getByLabel('Оформление документа', { exact: true }).selectOption('cosmos');
  await page.frameLocator('.album-preview').locator('body.cosmos').waitFor();
  checks.push('same-renderer-album-preview-and-theme-switch');
  checks.push('preview-real-error-and-assisted-answer');
  await page.getByRole('button', { name: 'Редактирование', exact: true }).click();
  const before = await page.getByRole('textbox', { name: 'Содержание документа' }).inputValue();
  await page
    .getByRole('textbox', { name: 'Содержание документа' })
    .fill(before + '\n\n## Мой проверенный следующий шаг\nСначала посчитаю клетки одного ряда.');
  await page.getByRole('button', { name: 'Закрыть документ', exact: true }).click();
  await page.getByRole('button', { name: 'Продолжить черновик', exact: true }).click();
  assert.match(
    await page.getByRole('textbox', { name: 'Содержание документа' }).inputValue(),
    /Сначала посчитаю клетки одного ряда/,
  );
  checks.push('draft-edit-survives-closing-modal');
  await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click();
  await page.screenshot({
    path: path.join(evidence, 'documents-session-preview.png'),
    fullPage: false,
  });
  for (const format of ['pdf', 'md', 'html', 'txt', 'docx']) {
    await page.getByLabel('Формат', { exact: true }).selectOption(format);
    await page.getByRole('button', { name: 'Сохранить и экспортировать', exact: true }).click();
    await page
      .locator('.document-modal .eyebrow')
      .filter({ hasText: 'ДОКУМЕНТ СОХРАНЁН' })
      .waitFor();
    let doc;
    for (let retry = 0; retry < 30; retry++) {
      doc = await page.evaluate(async () => (await window.cosmos.loadState()).documents[0]);
      if (doc?.path?.endsWith('.' + format)) break;
      await page.waitForTimeout(100);
    }
    assert.equal(
      doc?.path?.endsWith('.' + format),
      true,
      'Persisted document format must match ' + format,
    );
    assert.equal((await fs.stat(doc.path)).size > 0, true);
    assert.equal(doc.content.includes('Сначала посчитаю клетки одного ряда.'), true);
    assert.equal(doc.sourceSnapshot.length > 0, true);
    assert.equal(doc.style, 'cosmos');
    assert.equal(
      doc.sources.every((url) => doc.content.split(url).length === 2),
      true,
    );
    outputs.push({
      format,
      file: path.relative(profile, doc.path),
      bytes: (await fs.stat(doc.path)).size,
    });
    checks.push('native-' + format + '-file-written-with-source-snapshot');
  }
  await page.getByRole('button', { name: 'Закрыть документ', exact: true }).click();
  await page.locator('.saved-document').waitFor();
  assert.equal(await page.locator('.saved-document').count(), 1);
  checks.push('repeated-export-does-not-duplicate-library-document');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 720));
  await page.locator('.saved-document').click();
  await page
    .locator('.toast button')
    .click({ timeout: 400 })
    .catch(() => {});
  await page.screenshot({
    path: path.join(evidence, 'documents-session-720p.png'),
    fullPage: false,
  });
  const bounds = await page
    .getByRole('button', { name: 'Сохранить и экспортировать', exact: true })
    .boundingBox();
  assert(
    bounds && bounds.y >= 0 && bounds.y + bounds.height <= (await page.evaluate(() => innerHeight)),
  );
  const formatBounds = await page.getByLabel('Формат', { exact: true }).boundingBox();
  assert(
    formatBounds &&
      formatBounds.y >= 0 &&
      formatBounds.y + formatBounds.height <= (await page.evaluate(() => innerHeight)),
  );
  checks.push('1280x720-preview-and-export-control-visible');
  const modelStatus = await page.evaluate(() => window.cosmos.modelStatus());
  assert.notEqual(modelStatus.state, 'starting');
  assert.notEqual(modelStatus.state, 'ready');
  checks.push('model-not-started-during-documents-smoke');
  console.log(JSON.stringify({ profile, checks, errors, outputs }, null, 2));
  assert.deepEqual(errors, []);
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  await page
    ?.screenshot({ path: path.join(evidence, 'documents-session-failure.png'), fullPage: false })
    .catch(() => {});
  throw error;
} finally {
  clearTimeout(deadline);
  await fs.writeFile(
    path.join(evidence, 'documents-session-checks.json'),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        status: failure ? 'failed' : 'passed',
        scope: process.env.COSMOS_TEST_EXE
          ? 'Packaged native Electron UI with isolated learning profile'
          : 'Production UI in development Electron shell',
        packaged: info?.packaged,
        version: info?.version,
        asarSha256,
        profile: path.relative(root, profile),
        checks,
        errors,
        outputs,
        ...(failure ? { failure } : {}),
      },
      null,
      2,
    ),
  );
  await app.close().catch(() => {});
}
