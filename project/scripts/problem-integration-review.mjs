import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { compareScenePixels, readSceneVisualState } from './scene-pixel-metrics.mjs';
const output = path.join(process.cwd(), 'docs/problem-review/integration-browser');
await fs.mkdir(output, { recursive: true });
const report = {
  at: new Date().toISOString(),
  kind: 'Actual application in headless Chrome; source, not EXE',
  checks: [],
  errors: [],
  passed: false,
};
let server, browser, page;
const check = (name, value, detail) => {
  report.checks.push({ name, passed: !!value, detail });
  if (!value) throw Error(name);
};
try {
  server = await createServer({
    server: { port: 5177, host: '127.0.0.1', strictPort: true },
    logLevel: 'error',
  });
  await server.listen();
  browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    reducedMotion: 'no-preference',
  });
  page.on('pageerror', (error) => report.errors.push(String(error)));
  await page.goto('http://127.0.0.1:5177');
  await page.getByPlaceholder('Твоё имя').fill('Проверка');
  await page.getByRole('button', { name: 'Начнём знакомство', exact: true }).click();
  async function topic(title) {
    await page.keyboard.press('Control+k');
    await page.getByRole('textbox', { name: 'Поиск темы или действия' }).fill(title);
    await page
      .locator('.command-result')
      .filter({ has: page.locator('strong', { hasText: new RegExp(`^${title}$`) }) })
      .first()
      .click();
    await page.locator('.tutor-conversation').waitFor();
  }
  await topic('Площадь прямоугольника');
  const scene = page.locator('.problem-scene');
  await scene.waitFor();
  check(
    'current task and scene both use 7 by 3',
    (await scene.locator('.ps-condition').innerText()).includes('a = 7') &&
      (await scene.locator('.ps-condition').innerText()).includes('b = 3') &&
      (await page.locator('.conversation-condition').innerText()).includes('7 клеток'),
  );
  await page.waitForFunction(
    () => document.querySelector('.ps-step-select select')?.value === '1',
    null,
    { timeout: 12000 },
  );
  await page.waitForTimeout(180);
  await scene.getByRole('button', { name: 'Пауза', exact: true }).click();
  const beforeState = await scene.locator('.ps-body').evaluate(readSceneVisualState),
    before = await scene
      .locator('svg')
      .first()
      .screenshot({ path: path.join(output, 'rectangle-pause-a.png') });
  await page.waitForTimeout(550);
  const afterState = await scene.locator('.ps-body').evaluate(readSceneVisualState),
    after = await scene
      .locator('svg')
      .first()
      .screenshot({ path: path.join(output, 'rectangle-pause-b.png') });
  const pixels = compareScenePixels(before, after);
  check(
    'integrated scene pause holds geometry and pixels',
    pixels.maxChannelDelta <= 1 && JSON.stringify(beforeState) === JSON.stringify(afterState),
    pixels,
  );
  const count = await scene.getByLabel('Шаг решения задачи').locator('option').count();
  await scene.getByLabel('Шаг решения задачи').selectOption(String(count - 1));
  check('practice scene conceals 21 before own answer', !(await scene.innerText()).includes('21'));
  const dimensions = await scene.evaluate((el) => ({
    panel: el.getBoundingClientRect().width,
    svg: el.querySelector('svg').getBoundingClientRect().width,
    shape: el.querySelector('.ps-outline').getBoundingClientRect().width,
    bodyColumns: getComputedStyle(el.querySelector('.ps-body')).gridTemplateColumns,
  }));
  check('nested scene gives illustration enough width', dimensions.shape >= 380, dimensions);
  await page.screenshot({ path: path.join(output, '01-current-7-by-3.png'), fullPage: true });
  await page.getByLabel('Сообщение Cosmos', { exact: true }).fill('получится 21 клетка');
  await page.getByRole('button', { name: 'Отправить сообщение', exact: true }).click();
  await page.waitForTimeout(200);
  check(
    'math task advances after natural language answer',
    (await page.locator('.conversation-condition').innerText()).includes('8 см'),
  );
  await page.getByRole('button', { name: 'Своя задача', exact: true }).click();
  await page
    .getByLabel('Условие своей задачи')
    .fill('Площадь прямоугольника со сторонами 7 и 4 см');
  await page.getByRole('button', { name: 'Разобрать мой пример', exact: true }).click();
  await scene.waitFor();
  check(
    'own task scene uses confirmed 7 by 4',
    (await scene.locator('.ps-condition').innerText()).includes('a = 7') &&
      (await scene.locator('.ps-condition').innerText()).includes('b = 4'),
  );
  await page.getByLabel('Сообщение о своей задаче').fill('будет площадь 28 см2');
  await page.getByRole('button', { name: 'Отправить ответ по своей задаче' }).click();
  await page.waitForTimeout(250);
  check(
    'own answer wording is accepted',
    (await page.locator('.dialogue').innerText()).includes('Ты решил свой пример самостоятельно'),
  );
  const all = await scene.getByLabel('Шаг решения задачи').locator('option').count();
  await scene.getByLabel('Шаг решения задачи').selectOption(String(all - 1));
  await page.screenshot({ path: path.join(output, '02-own-7-by-4.png'), fullPage: true });
  await page.reload();
  await page.locator('.app-shell').waitFor();
  await page.getByRole('button', { name: 'Своя задача', exact: true }).click();
  await scene.waitFor();
  check(
    'own condition survives reload',
    (await scene.locator('.ps-condition').innerText()).includes('b = 4'),
  );
  await topic('Основа предложения');
  await page.getByLabel('Сообщение Cosmos', { exact: true }).fill('птицы');
  await page.getByRole('button', { name: 'Отправить сообщение', exact: true }).click();
  await page.waitForTimeout(200);
  check(
    'russian advances instead of repeating first prompt',
    (await page.locator('.conversation-condition').innerText()).includes('Тихий дождь'),
  );
  await page.screenshot({ path: path.join(output, '03-russian-next.png'), fullPage: true });
  await topic('Спрос и предложение');
  await page.getByLabel('Сообщение Cosmos', { exact: true }).fill('спрос будет маленьким');
  await page.getByRole('button', { name: 'Отправить сообщение', exact: true }).click();
  await page.waitForTimeout(200);
  check(
    'social free wording advances to next question',
    (await page.locator('.conversation-condition').innerText()).includes('100 единиц'),
  );
  await page.screenshot({ path: path.join(output, '04-social-next.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, '05-social-narrow.png'), fullPage: true });
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  check('390 layout has no horizontal overflow', layout.scroll <= layout.width, layout);
  report.passed = report.errors.length === 0;
} catch (error) {
  report.failure = String(error);
  process.exitCode = 1;
  if (page)
    await page
      .screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
      .catch(() => {});
} finally {
  await browser?.close();
  await server?.close();
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
