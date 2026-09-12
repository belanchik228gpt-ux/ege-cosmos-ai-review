import { chromium, _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { compareScenePixels, readSceneVisualState } from './scene-pixel-metrics.mjs';

// The catalogue is read from the same source tree as the reviewed build. No test-only UI route.
const source = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
let nodes, familyOf, absoluteScene;
try {
  ({ curriculumNodes: nodes } = await source.ssrLoadModule('/src/domain/curriculum-data/index.ts'));
  ({ curriculumVisualFamily: familyOf, absoluteLessonScene: absoluteScene } =
    await source.ssrLoadModule('/src/scenes/curriculum-visuals.ts'));
} finally {
  await source.close();
}
const requestedFamilies = [
  'algebra',
  'absolute',
  'graph',
  'geometry',
  'solid',
  'chance',
  'morphology',
  'syntax',
  'spelling',
  'writing',
  'map',
  'person',
  'document',
  'causes',
  'market',
  'groups',
  'law',
  'politics',
];
const picks = requestedFamilies.map((family) => {
  const candidates = nodes.filter(
    (node) =>
      familyOf(node) === family &&
      node.assessmentStatus !== 'not-assessed-in-edition' &&
      (!node.lessonTopicId || node.lessonTopicId === 'math-absolute'),
  );
  candidates.sort((a, b) => a.title.length - b.title.length);
  assert(candidates.length, `No real catalogue node for ${family}`);
  return { family, node: candidates[0] };
});
const familyFilter = process.env.COSMOS_FAMILIES?.split(',').filter(Boolean);
const reviewedPicks = familyFilter
  ? picks.filter((pick) => familyFilter.includes(pick.family))
  : picks;
const absoluteNode = nodes.find((node) => node.lessonTopicId === 'math-absolute');
assert(absoluteNode, 'The full absolute lesson must be linked from the real catalogue');
const executable = process.env.COSMOS_EXE && path.resolve(process.env.COSMOS_EXE);
const folder = path.resolve(
  process.env.COSMOS_VISUAL_OUTPUT || `docs/curriculum-review/${executable ? 'native' : 'browser'}`,
);
await mkdir(folder, { recursive: true });
const report = {
  at: new Date().toISOString(),
  kind: executable
    ? 'Actual packaged EXE through real catalogue UI'
    : 'Headless Chrome source application through real catalogue UI; NOT packaged EXE',
  catalogueNodes: nodes.length,
  expectedFamilies: reviewedPicks.map((pick) => pick.family),
  families: [],
  absolute: [],
  controls: [],
  layouts: [],
  errors: [],
  passed: false,
  nativePixelRule:
    'At most one 8-bit compositor channel level, with exactly unchanged SVG geometry and paused animation clocks. Exact equality is reported separately.',
};
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
report.sourceCatalogueSha256 = hash(
  Buffer.concat(
    await Promise.all(
      ['math', 'russian', 'history', 'social'].map((subject) =>
        readFile(`src/domain/curriculum-data/${subject}-2026.json`),
      ),
    ),
  ),
);
let browser, app, page;
try {
  if (executable) {
    report.executable = executable;
    report.appAsarSha256 = hash(
      await readFile(path.join(path.dirname(executable), 'resources/app.asar')),
    );
    if (process.env.COSMOS_EXPECTED_ASAR)
      assert.equal(
        report.appAsarSha256,
        process.env.COSMOS_EXPECTED_ASAR.toLowerCase(),
        'Installed app.asar must match requested build',
      );
    const env = {
      ...process.env,
      COSMOS_USER_DATA: path.resolve(`test-results/curriculum-native-${Date.now()}`),
    };
    delete env.COSMOS_RUNTIME_DIR;
    app = await electron.launch({
      executablePath: executable,
      args: ['--disable-backgrounding-occluded-windows'],
      env,
      timeout: 45000,
    });
    page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setContentSize(1280, 720);
      w.show();
      w.focus();
    });
  } else {
    browser = await chromium.launch({
      executablePath:
        process.env.COSMOS_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      reducedMotion: 'no-preference',
    });
    page = await context.newPage();
    await page.goto(process.env.COSMOS_URL || 'http://127.0.0.1:5173');
  }
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => report.errors.push(error.message));
  const name = page.getByPlaceholder('Твоё имя');
  await name.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
  if (await name.isVisible().catch(() => false)) {
    await name.fill('Проверка сцен');
    await page.getByRole('button', { name: 'Начнём знакомство', exact: true }).click();
  }
  await page.getByRole('navigation', { name: 'Основная навигация' }).waitFor();
  if (executable) {
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await page.getByRole('button', { name: 'Неон и движение', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Живое пространство', exact: true }).uncheck();
    await page
      .getByRole('combobox', { name: 'Движение интерфейса', exact: true })
      .selectOption('off');
    await page.getByRole('combobox', { name: 'Сила неона', exact: true }).selectOption('off');
    report.reviewPreferences = {
      animatedBackground: false,
      uiMotion: 'off',
      glow: 'off',
      sceneAutoplay: true,
    };
  }
  const subjectNames = {
    math: 'Математика',
    russian: 'Русский язык',
    history: 'История',
    social: 'Обществознание',
  };
  const player = () => page.locator('.curriculum-scene');
  const counter = () => player().locator('.cv-outline summary > span');
  const currentStep = async () => Number((await counter().innerText()).trim().split('/')[0]) - 1;
  const openNode = async (node) => {
    await page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('button', { name: 'Темы ЕГЭ', exact: true })
      .click();
    const back = page.getByRole('button', { name: /^К результатам поиска/ });
    if (await back.count()) await back.click();
    await page
      .getByRole('navigation', { name: 'Предмет каталога' })
      .getByRole('button', { name: subjectNames[node.subject], exact: true })
      .click();
    const common = page.getByRole('button', { name: 'Общий кодификатор и школа', exact: true });
    if (await common.count()) await common.click();
    const grade = page.getByLabel('Школьный класс', { exact: true });
    if (await grade.count()) await grade.selectOption('all');
    await page.getByRole('textbox', { name: 'Поиск по всем темам ЕГЭ' }).fill(node.code);
    const escaped = node.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const choice = page.locator('.curriculum-node').filter({
      has: page.locator('.curriculum-code').filter({ hasText: new RegExp(`^${escaped}$`) }),
    });
    await choice.click();
    await page.getByRole('button', { name: 'Объяснение в сцене', exact: true }).click();
    await player().waitFor();
    await player().scrollIntoViewIfNeeded();
  };
  const go = async (index) => {
    await player().getByLabel('Оглавление визуальной сцены', { exact: true }).click();
    await player().locator('.cv-outline > div > button').nth(index).click();
    assert.equal(await currentStep(), index);
  };
  const capture = async (name) => {
    await player().screenshot({ path: path.join(folder, name) });
    return name;
  };
  const pause = async () => {
    const button = player().getByRole('button', { name: 'Пауза', exact: true });
    if (await button.count()) await button.click();
  };
  const resume = () => player().getByRole('button', { name: 'Смотреть', exact: true }).click();
  const next = () => player().getByRole('button', { name: 'Следующий шаг', exact: true }).click();
  const backStep = () =>
    player().getByRole('button', { name: 'Предыдущий шаг', exact: true }).click();
  const replay = () =>
    player().getByRole('button', { name: 'Повторить визуальную сцену', exact: true }).click();
  const viewportCheck = async (label) => {
    const layout = await player().evaluate((element) => ({
      viewport: innerWidth,
      page: document.documentElement.scrollWidth,
      playerWidth: element.getBoundingClientRect().width,
      playerScroll: element.scrollWidth,
      controls: [...element.querySelectorAll('.cv-controls button,.cv-controls select')].map(
        (control) => ({
          text: control.getAttribute('aria-label') || control.textContent,
          left: control.getBoundingClientRect().left,
          right: control.getBoundingClientRect().right,
        }),
      ),
    }));
    assert(
      layout.page <= layout.viewport + 1,
      `${label}: horizontal page overflow ${layout.page}/${layout.viewport}`,
    );
    assert(layout.playerScroll <= layout.playerWidth + 1, `${label}: player overflow`);
    assert(
      layout.controls.every(
        (control) => control.left >= -1 && control.right <= layout.viewport + 1,
      ),
      `${label}: control outside viewport`,
    );
    report.layouts.push({ label, ...layout });
  };
  for (const { family, node } of reviewedPicks) {
    report.activeFamily = { family };
    await openNode(node);
    assert.equal(await player().getAttribute('data-family'), family);
    await pause();
    await go(0);
    const start = await capture(`${family}-start.png`);
    const startPixels = await player().locator('.cv-stage svg').screenshot();
    await resume();
    await page.waitForFunction(
      () =>
        Number(document.querySelector('.cv-outline summary > span')?.textContent?.split('/')[0]) ===
        2,
      {},
      { timeout: 11000 },
    );
    await page.waitForTimeout(170);
    await pause();
    const stateA = await player().locator('.cv-body').evaluate(readSceneVisualState);
    const pausedA = await player()
      .locator('.cv-stage svg')
      .screenshot({ path: path.join(folder, `${family}-paused-a.png`) });
    await page.waitForTimeout(650);
    const pausedB = await player()
      .locator('.cv-stage svg')
      .screenshot({ path: path.join(folder, `${family}-paused-b.png`) });
    const stateB = await player().locator('.cv-body').evaluate(readSceneVisualState);
    const pauseComparison = compareScenePixels(pausedA, pausedB);
    const autoplayComparison = compareScenePixels(startPixels, pausedA);
    Object.assign(report.activeFamily, { pauseComparison, autoplayComparison, stateA, stateB });
    assert.deepEqual(stateA, stateB, `${family}: geometry and animation clocks changed on pause`);
    assert(
      pauseComparison.maxChannelDelta <= (executable ? 1 : 0),
      `${family}: actual paused pixels exceed compositor rounding`,
    );
    assert(autoplayComparison.maxChannelDelta > 1, `${family}: autoplay never changed the visual`);
    await next();
    assert.equal(await currentStep(), 2);
    await backStep();
    assert.equal(await currentStep(), 1);
    const key = await capture(`${family}-key.png`);
    const stepCount = await player().locator('.cv-outline > div > button').count();
    await go(stepCount - 1);
    const end = await capture(`${family}-end.png`);
    await viewportCheck(`${family}-1280`);
    await replay();
    assert.equal(await currentStep(), 0);
    assert(await player().getByRole('button', { name: 'Пауза', exact: true }).count());
    await pause();
    report.families.push({
      family,
      nodeId: node.id,
      title: node.title,
      code: node.code,
      steps: stepCount,
      start,
      key,
      end,
      autoplayPixelsChanged: true,
      pausedPixelsEqual: pauseComparison.exactPixelEquality,
      pauseComparison,
      pausedGeometryAndClocksEqual: true,
      autoplayComparison,
      backNextReplay: true,
    });
    delete report.activeFamily;
    console.log(`PASS FAMILY ${family} (${node.code})`);
  }
  await openNode(absoluteNode);
  await pause();
  for (const style of ['glow', 'blueprint']) {
    await player().getByRole('combobox', { name: 'Стиль визуальной сцены' }).selectOption(style);
    for (let index = 0; index < absoluteScene.steps.length; index++) {
      await go(index);
      const formula = player().locator('.cv-formula');
      if (absoluteScene.steps[index].formula) {
        assert.equal(await formula.innerText(), absoluteScene.steps[index].formula);
        assert(await formula.isVisible());
      } else assert.equal(await formula.count(), 0);
      const file = await capture(`absolute-${style}-${String(index + 1).padStart(2, '0')}.png`);
      report.absolute.push({
        step: index + 1,
        style,
        file,
        formula: absoluteScene.steps[index].formula || null,
      });
    }
  }
  // Real timing at both ends of the exposed speed range, including resume on the same step.
  for (const speed of ['0.5', '2']) {
    await go(0);
    await player().getByRole('combobox', { name: 'Скорость визуальной сцены' }).selectOption(speed);
    const started = Date.now();
    await resume();
    await page.waitForFunction(
      () =>
        Number(document.querySelector('.cv-outline summary > span')?.textContent?.split('/')[0]) ===
        2,
      {},
      { timeout: 12000 },
    );
    const elapsed = Date.now() - started;
    await pause();
    const nominal = absoluteScene.steps[0].durationMs / Number(speed);
    assert(
      elapsed > nominal * 0.8 && elapsed < nominal * 1.4 + 250,
      `Speed ${speed}: ${elapsed}ms vs ${nominal}ms`,
    );
    report.controls.push({ speed, elapsedMs: elapsed, nominalMs: nominal });
  }
  await go(0);
  await player().focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await currentStep(), 1);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await currentStep(), 0);
  await page.keyboard.press('Space');
  assert(await player().getByRole('button', { name: 'Пауза', exact: true }).count());
  await page.keyboard.press('Space');
  assert.equal(await player().getByRole('button', { name: 'Пауза', exact: true }).count(), 0);
  report.controls.push({ keyboard: true });
  const chooseQuality = async (quality) => {
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await page.getByRole('button', { name: 'Изображение и звук', exact: true }).click();
    await page.getByRole('button', { name: 'Учебные сцены', exact: true }).click();
    await page
      .getByRole('button', {
        name: quality === 'low' ? /^Низкое/ : quality === 'static' ? /^Статичное/ : /^Высокое/,
      })
      .click();
    await openNode(absoluteNode);
  };
  for (const quality of ['low', 'static']) {
    await chooseQuality(quality);
    await pause();
    assert(
      await player()
        .getAttribute('class')
        .then((c) => c.includes(`cv-quality-${quality}`)),
    );
    if (quality === 'static') assert(await player().locator('.cv-play').isDisabled());
    await go(10);
    await capture(`absolute-${quality}.png`);
    await viewportCheck(`absolute-${quality}-1280`);
    const styles = await player()
      .locator('.cv-point')
      .evaluateAll((points) => points.map((p) => getComputedStyle(p).filter));
    assert(styles.every((filter) => filter === 'none'));
    await backStep();
    assert.equal(await currentStep(), 9);
    await replay();
    assert.equal(await currentStep(), 0);
    await pause();
    report.controls.push({ quality, manual: true, filters: styles });
  }
  await chooseQuality('high');
  await pause();
  await go(9);
  if (app)
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setContentSize(604, 844);
      w.focus();
    });
  else await page.setViewportSize({ width: 390, height: 844 });
  await viewportCheck('absolute-narrow');
  await capture('absolute-narrow.png');
  await page.screenshot({ path: path.join(folder, 'absolute-narrow-context.png'), fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await replay();
  assert.equal(await player().getByRole('button', { name: 'Пауза', exact: true }).count(), 0);
  await go(10);
  const reducedAnimations = await player()
    .locator('.cv-body')
    .evaluate((e) => e.getAnimations({ subtree: true }).length);
  assert.equal(reducedAnimations, 0);
  await capture('absolute-reduced-narrow.png');
  report.controls.push({ systemReducedMotion: true, animations: reducedAnimations });
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log(
    `PASS: ${report.families.length} requested families,24 absolute frames,controls,quality,narrow,reduced`,
  );
} catch (error) {
  report.failure = String(error?.stack || error);
  if (page)
    await page
      .screenshot({ path: path.join(folder, 'failure.png'), fullPage: true })
      .catch(() => {});
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  if (app) await app.close();
  if (browser) await browser.close();
  await writeFile(path.join(folder, 'results.json'), JSON.stringify(report, null, 2));
  console.log(`REPORT ${folder}`);
}
