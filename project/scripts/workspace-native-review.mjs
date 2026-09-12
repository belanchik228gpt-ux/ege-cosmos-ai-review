import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const executable = path.resolve(
  process.env.COSMOS_EXE || 'test-results/installed-app/EGE Cosmos.exe',
);
const out = path.resolve('docs/verification/workspace-native-0.2');
const profile = path.resolve('test-results/workspace-native-' + Date.now());
const appAsarSha256 = createHash('sha256')
  .update(await fs.readFile(path.join(path.dirname(executable), 'resources/app.asar')))
  .digest('hex');
if (process.env.COSMOS_EXPECTED_ASAR)
  assert.equal(appAsarSha256, process.env.COSMOS_EXPECTED_ASAR.toLowerCase());
await fs.mkdir(out, { recursive: true });
const app = await electron.launch({
  executablePath: executable,
  args: ['--disable-backgrounding-occluded-windows'],
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
  screenshots = [];
let failure;
const page = await app.firstWindow();
page.on('pageerror', (e) => errors.push(e.message));
const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
  screenshots.push({
    name,
    ...(await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
    }))),
  });
};
const check = async (name, fn) => {
  await fn();
  checks.push(name);
  console.log('PASS', name);
};
async function size(width, height) {
  await app.evaluate(
    ({ BrowserWindow }, { width, height }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(width, height),
    { width, height },
  );
}
async function jump(query, title) {
  await page.getByRole('button', { name: 'Быстрый переход', exact: true }).click();
  await page.getByLabel('Поиск темы или действия').fill(query);
  await page.locator('.command-result').filter({ hasText: title }).first().click();
}
try {
  await page.getByLabel('Как к тебе обращаться?').fill('Алекс');
  await page.getByRole('button', { name: 'Начнём знакомство' }).click();
  await size(1440, 1000);
  await check('home-screenshot', () => shot('01-today'));
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  for (const [name, file] of [
    ['Изображение и звук', 'color'],
    ['Неон и движение', 'motion'],
    ['Рабочее место', 'workspace'],
    ['Учебный ритм', 'study'],
    ['Конспекты', 'documents'],
    ['Преподаватель', 'teacher'],
    ['Источники', 'sources'],
  ]) {
    await check('settings-' + file, async () => {
      await page
        .getByRole('navigation', { name: 'Разделы настроек' })
        .getByRole('button', { name, exact: true })
        .click();
      await shot('settings-' + file);
    });
  }
  await check('sources-pagination-and-search', async () => {
    assert.equal(await page.locator('.source-card').count(), 6);
    const first = await page.locator('.source-card h3').first().innerText();
    await page
      .getByRole('navigation', { name: 'Страницы источников' })
      .getByRole('button', { name: 'Следующие', exact: true })
      .click();
    assert.notEqual(await page.locator('.source-card h3').first().innerText(), first);
    await page.getByLabel('Поиск источника').fill('OpenStax');
    assert((await page.locator('.source-card').count()) >= 1);
    for (const card of await page.locator('.source-card').all())
      assert.match(await card.innerText(), /OpenStax/i);
    await shot('sources-search');
    await page.getByLabel('Поиск источника').fill('');
    assert.equal(await page.locator('.source-card h3').first().innerText(), first);
  });
  await size(390, 844);
  await shot('settings-narrow');
  await size(1280, 720);
  await page.getByRole('button', { name: 'Темы ЕГЭ', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Предмет каталога' })
    .getByRole('button', { name: 'Математика', exact: true })
    .click();
  await check('basic-exam-21', async () => {
    assert.equal(await page.locator('.basic-exam-card').count(), 21);
    await shot('basic-exam');
  });
  await check('topic-card-four-colored-panels', async () => {
    await page.getByRole('button', { name: 'Общий кодификатор и школа', exact: true }).click();
    await page.getByRole('textbox', { name: 'Поиск по всем темам ЕГЭ' }).fill('1.7');
    await page
      .locator('.curriculum-node')
      .filter({ has: page.locator('.curriculum-code').filter({ hasText: /^1\.7$/ }) })
      .click();
    const panes = page.getByRole('navigation', { name: 'Содержание карточки темы' });
    for (const [title, file] of [
      ['Суть и цель', 'overview'],
      ['Объяснение в сцене', 'visual'],
      ['Примеры и практика', 'practice'],
      ['Программа и источники', 'sources'],
    ]) {
      await panes.getByRole('button', { name: title, exact: true }).click();
      assert.equal(await panes.locator('[aria-pressed="true"]').count(), 1);
      assert.equal(
        await panes.getByRole('button', { name: title, exact: true }).getAttribute('aria-pressed'),
        'true',
      );
      await shot('topic-card-' + file);
    }
  });
  await jump('модуль', 'Модуль числа и расстояние');
  await page.locator('.lesson-toolbox summary').click();
  await page.getByRole('button', { name: 'Создать конспект занятия', exact: true }).click();
  await check('document-composition', async () => {
    await page.getByRole('button', { name: 'Создать документ', exact: true }).click();
    await page.getByRole('dialog', { name: 'Редактор документа' }).waitFor();
    await shot('document-preview');
  });
  const exported = [];
  for (const format of ['pdf', 'html', 'docx', 'md', 'txt'])
    await check('real-export-' + format, async () => {
      await page.getByLabel('Формат', { exact: true }).selectOption(format);
      await page.getByRole('button', { name: 'Сохранить и экспортировать', exact: true }).click();
      await page.getByText('ДОКУМЕНТ СОХРАНЁН', { exact: true }).waitFor({ timeout: 25000 });
      let document;
      for (let attempt = 0; attempt < 80; attempt++) {
        document = await page.evaluate(
          async (f) =>
            (await window.cosmos.loadState()).documents.find((d) => d.path?.endsWith('.' + f)),
          format,
        );
        if (document) break;
        await page.waitForTimeout(150);
      }
      assert(document, 'Saved document must appear in the persisted state');
      const bytes = await fs.readFile(document.path);
      assert(bytes.length > 50);
      if (format === 'pdf') assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
      if (format === 'docx') assert.equal(bytes.subarray(0, 2).toString(), 'PK');
      exported.push({
        format,
        path: document.path,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    });
  await page.getByRole('button', { name: 'Закрыть документ', exact: true }).click();
  await shot('documents-library');
  await jump('база знаний', 'База знаний');
  await shot('knowledge-library');
  for (const name of ['Пример', 'Самопроверка', 'Понять']) {
    await page.getByRole('button', { name, exact: true }).click();
    await shot('knowledge-' + name);
  }
  await size(390, 844);
  await shot('knowledge-narrow');
  await size(1920, 1080);
  await page.getByRole('button', { name: 'Материалы', exact: true }).click();
  await shot('materials-1920');
  await page.getByRole('button', { name: 'План', exact: true }).first().click();
  await shot('plan-1920');
  await check('no-render-errors', async () => assert.deepEqual(errors, []));
  await fs.writeFile(path.join(out, 'exports.json'), JSON.stringify(exported, null, 2));
  await fs.rm(path.join(out, 'failure.png'), { force: true });
} catch (error) {
  failure = String(error.stack || error);
  await shot('failure').catch(() => {});
  console.error(failure);
  process.exitCode = 1;
} finally {
  await fs.writeFile(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        executable,
        appAsarSha256,
        profile,
        checks,
        screenshots,
        errors,
        failure,
        passed: !failure,
      },
      null,
      2,
    ),
  );
  await app.close();
}
