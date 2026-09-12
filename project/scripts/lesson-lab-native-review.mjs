import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const out = path.resolve(
  process.env.COSMOS_REVIEW_OUT || 'docs/verification/lesson-lab-native-0.7.5',
);
const profile = path.resolve('test-results', `lab-native-${Date.now()}`);
const catalog = JSON.parse(
  await fs.readFile('docs/verification/lesson-lab-expansion/report.json', 'utf8'),
);
const samples = [...new Map(catalog.catalogMatches.map((x) => [x.scenario, x])).values()];
const names = {
  math: 'Математика',
  physics: 'Физика',
  chemistry: 'Химия',
  biology: 'Биология',
  geography: 'География',
  history: 'История',
  social: 'Обществознание',
  russian: 'Русский язык',
  literature: 'Литература',
  english: 'Английский язык',
  informatics: 'Информатика',
  project: 'Индивидуальный проект',
};
await fs.mkdir(out, { recursive: true });
const report = {
  status: 'running',
  exe,
  profile,
  checks: [],
  screenshots: [],
  errors: [],
  asarSha256: createHash('sha256')
    .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
    .digest('hex'),
};
let app, page;
const button = (name) => page.getByRole('button', { name, exact: true });
const nav = (name) => page.locator('.studio-sidebar').getByRole('button', { name, exact: true });
async function shot(name) {
  const p = path.join(out, name + '.png');
  await page.screenshot({ path: p });
  report.screenshots.push(p);
}
try {
  app = await electron.launch({
    executablePath: exe,
    env: { ...process.env, COSMOS_USER_DATA: profile },
    timeout: 45000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setIgnoreMouseEvents(true);
    w.setContentSize(1280, 720);
  });
  await page.locator('.welcome-modal input').waitFor();
  await page.locator('.welcome-modal input').fill('Проверка рисунков');
  await button('Начнём знакомство').click();
  await page
    .locator('.school-mode-switch')
    .getByRole('button', { name: 'Школа', exact: true })
    .click();
  for (const sample of samples) {
    await nav('Все школьные предметы').click();
    await page.getByLabel('Школьный класс', { exact: true }).selectOption(String(sample.grade));
    if (await button('Все предметы').isVisible()) await button('Все предметы').click();
    await page.getByLabel('Поиск школьных тем', { exact: true }).fill('');
    await page
      .locator('.school-subject-card')
      .filter({ has: page.getByRole('heading', { name: names[sample.subject], exact: true }) })
      .click();
    await page.getByLabel('Поиск школьных тем', { exact: true }).fill(sample.topic);
    const row = page.locator('.school-subtopic-row').filter({ hasText: sample.topic }).first();
    await row.locator('button').first().click();
    await page.locator('.school-room').waitFor();
    await page.locator('.school-materials-menu > summary').click();
    await page.locator('#school-local-material > summary').click();
    const scene = page.locator('#school-local-material .dialogue-scene');
    await scene.getByRole('button', { name: 'Рисунок целиком', exact: true }).click();
    await page.waitForTimeout(300);
    await scene.getByRole('button', { name: 'Повторить рисунок', exact: true }).click();
    const pause = scene.getByRole('button', { name: 'Пауза', exact: true });
    if (await pause.isEnabled()) await pause.click();
    assert(await scene.locator('[data-lab-id]').count(), 'Expected new authored scene');
    const count = await scene.locator('.ds-dots button').count();
    assert(count >= 3);
    await scene.getByRole('button', { name: 'Следующий кадр', exact: true }).click();
    const next = await scene.locator('.ds-caption').innerText();
    await scene.getByRole('button', { name: 'Предыдущий кадр', exact: true }).click();
    assert.notEqual(await scene.locator('.ds-caption').innerText(), next);
    await shot(`${sample.scenario}-${sample.subject}-first`);
    await scene.locator('.ds-dots button').last().click();
    await shot(`${sample.scenario}-${sample.subject}-last`);
    report.checks.push({
      ...sample,
      frames: count,
      controls: 'fullscreen/replay/pause/next/back/last',
    });
    await scene.getByRole('button', { name: 'Вернуться к переписке', exact: true }).click();
    await fs.writeFile(path.join(out, 'progress.json'), JSON.stringify(report, null, 2));
  }
  assert.equal(report.checks.length, 18);
  assert.deepEqual(report.errors, []);
  report.status = 'pass';
} catch (e) {
  report.status = 'failed';
  report.failure = String(e.stack || e);
  if (page) await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  if (app) await app.close();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({ status: report.status, count: report.checks.length, failure: report.failure }),
  );
}
