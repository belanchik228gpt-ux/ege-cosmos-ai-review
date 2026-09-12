import { chromium, _electron as electron } from 'playwright';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let PNG;
try {
  ({ PNG } = require('pngjs'));
} catch {
  ({ PNG } = require(
    path.join(
      process.env.USERPROFILE,
      '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pngjs',
    ),
  ));
}
const comparePixels = (before, after) => {
  const a = PNG.sync.read(before),
    b = PNG.sync.read(after);
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  let changedPixels = 0,
    maxChannelDelta = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(a.data[index + channel] - b.data[index + channel]);
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      if (delta) changed = true;
    }
    if (changed) changedPixels++;
  }
  return {
    exactFileEquality: before.equals(after),
    exactPixelEquality: changedPixels === 0,
    maxChannelDelta,
    changedPixels,
    totalPixels: a.width * a.height,
    changedFraction: changedPixels / (a.width * a.height),
  };
};

// These are real lessons opened through Ctrl+K, without test-only application routes.
const source = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
let sceneRegistry, topics, getScene;
try {
  ({ sceneRegistry, getScene } = await source.ssrLoadModule('/src/scenes/registry.ts'));
  ({ topics } = await source.ssrLoadModule('/src/domain/catalog.ts'));
} finally {
  await source.close();
}
const entries = Object.values(sceneRegistry).map((scene) => {
  const topic = topics.find((candidate) => getScene(candidate.sceneId)?.id === scene.id);
  assert(topic, `No authored lesson for scene ${scene.id}`);
  const formulaStep = scene.steps.findLastIndex((step) => Boolean(step.formula));
  assert(formulaStep >= 0, `No formula or conclusion in ${scene.id}`);
  return { scene, topic, formulaStep };
});
assert.equal(entries.length, 13, 'Review every pre-existing authored scene; absolute is separate');
const filter = process.env.COSMOS_SCENES?.split(',').filter(Boolean);
const reviewed = filter ? entries.filter((entry) => filter.includes(entry.scene.id)) : entries;
assert(reviewed.length, 'The requested authored scene list cannot be empty');
const executable = process.env.COSMOS_EXE && path.resolve(process.env.COSMOS_EXE);
const folder = path.resolve(
  process.env.COSMOS_AUTHORED_OUTPUT || `docs/authored-review/${executable ? 'native' : 'browser'}`,
);
await mkdir(folder, { recursive: true });
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
const report = {
  at: new Date().toISOString(),
  kind: executable
    ? 'Actual packaged EXE through Ctrl+K and authored lesson title'
    : 'Headless Chrome source application; NOT packaged EXE',
  expectedScenes: reviewed.map(({ scene, topic, formulaStep }) => ({
    sceneId: scene.id,
    title: topic.title,
    topicId: topic.id,
    steps: scene.steps.length,
    formulaStep: formulaStep + 1,
    formula: scene.steps[formulaStep].formula,
  })),
  sourceRegistrySha256: hash(await readFile('src/scenes/registry.ts')),
  sourceClockSha256: hash(await readFile('src/scenes/useSceneClock.ts')),
  scenes: [],
  mode:
    process.env.COSMOS_MANUAL_ONLY === '1' ? 'manual-formula-persistence' : 'full-authored-scenes',
  errors: [],
  passed: false,
  nativePixelRule:
    'At most one 8-bit channel level of compositor rounding; geometry and paused animation clocks must remain exactly unchanged. Exact PNG equality is reported separately.',
};

if (process.env.COSMOS_DRY_RUN === '1') {
  // Preparation validates data and selectors' intended route; this does not assert UI success.
  await writeFile(path.join(folder, 'prepared.json'), JSON.stringify(report, null, 2));
  console.log(`PREPARED ${reviewed.length} authored scenes; no browser or EXE launched`);
} else {
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
          'Installed app.asar must match the requested build',
        );
      const env = {
        ...process.env,
        COSMOS_USER_DATA: path.resolve(`test-results/authored-native-${Date.now()}`),
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
        const window = BrowserWindow.getAllWindows()[0];
        window.setContentSize(1280, 720);
        window.show();
        window.focus();
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
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    page.setDefaultTimeout(12000);
    page.on('pageerror', (error) => report.errors.push(error.message));
    const name = page.getByPlaceholder('Твоё имя');
    await name.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    if (await name.isVisible().catch(() => false)) {
      await name.fill('Проверка авторских сцен');
      await page.getByRole('button', { name: 'Начнём знакомство', exact: true }).click();
    }
    await page.getByRole('navigation', { name: 'Основная навигация' }).waitFor();

    // Isolate teaching motion from decorative page motion using normal user settings.
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

    const player = () => page.locator('.scene-player');
    const svg = () => player().locator('.sc-stage > svg');
    const visualState = () =>
      player()
        .locator('.sc-body')
        .evaluate((body) => ({
          geometry: [...body.querySelectorAll('svg *')].map((node) => {
            const style = getComputedStyle(node);
            return {
              tag: node.tagName,
              attributes: [...node.attributes].map((a) => [a.name, a.value]),
              opacity: style.opacity,
              transform: style.transform,
              strokeDashoffset: style.strokeDashoffset,
              fill: style.fill,
              stroke: style.stroke,
              filter: style.filter,
            };
          }),
          animations: body.getAnimations({ subtree: true }).map((animation) => ({
            currentTime: animation.currentTime,
            playState: animation.playState,
            transitionProperty: animation.transitionProperty,
            animationName: animation.animationName,
            target: animation.effect?.target?.tagName,
          })),
        }));
    const currentStep = async () =>
      Number((await player().locator('.sc-counter').innerText()).trim().split('/')[0]) - 1;
    const waitStep = async (index, timeout = 12000) =>
      page.waitForFunction(
        (step) =>
          Number(
            document.querySelector('.scene-player .sc-counter')?.textContent?.split('/')[0],
          ) ===
          step + 1,
        index,
        { timeout },
      );
    const selectStep = async (index) => {
      await player().locator('.sc-tick').nth(index).click();
      await waitStep(index);
    };
    const openLesson = async (topic, scene) => {
      await page.keyboard.press('Control+k');
      const dialog = page.getByRole('dialog', { name: 'Быстрый переход', exact: true });
      await dialog.waitFor({ state: 'visible' });
      await dialog.getByRole('textbox', { name: 'Поиск темы или действия' }).fill(topic.title);
      await dialog
        .locator('.command-result')
        .filter({
          has: page.locator('strong').filter({
            hasText: new RegExp(`^${topic.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
          }),
        })
        .first()
        .click();
      await dialog.waitFor({ state: 'hidden' });
      await page.getByRole('heading', { level: 1, name: topic.title, exact: true }).waitFor();
      await player().waitFor();
      assert.equal(await player().getAttribute('aria-label'), `Учебная сцена: ${scene.title}`);
      await player().scrollIntoViewIfNeeded();
    };

    const verifyManualSnapshot = async ({ scene, topic, formulaStep }) => {
      await selectStep(formulaStep);
      assert.equal(
        await player().locator('.sc-formula.sc-has-formula').innerText(),
        scene.steps[formulaStep].formula,
      );
      const before = await svg().screenshot({
        path: path.join(folder, `${scene.id}-manual-before.png`),
      });
      const beforeGeometry = (await visualState()).geometry;
      await page
        .getByRole('navigation', { name: 'Основная навигация' })
        .getByRole('button', { name: 'Сегодня', exact: true })
        .click();
      await openLesson(topic, scene);
      assert.equal(await currentStep(), formulaStep);
      assert.equal(
        await player().locator('.sc-formula.sc-has-formula').innerText(),
        scene.steps[formulaStep].formula,
      );
      assert.equal(await player().getByRole('button', { name: 'Пауза', exact: true }).count(), 0);
      const after = await svg().screenshot({
        path: path.join(folder, `${scene.id}-manual-restored.png`),
      });
      const comparison = comparePixels(before, after);
      Object.assign(report.activeScene, { manualComparison: comparison });
      assert.deepEqual(
        beforeGeometry,
        (await visualState()).geometry,
        `${scene.id}: manual step geometry persists`,
      );
      assert(
        comparison.maxChannelDelta <= (executable ? 1 : 0),
        `${scene.id}: manual step pixels persist`,
      );
      return comparison;
    };

    for (const { scene, topic, formulaStep } of reviewed) {
      report.activeScene = { sceneId: scene.id };
      await openLesson(topic, scene);
      if (process.env.COSMOS_MANUAL_ONLY === '1') {
        const manualComparison = await verifyManualSnapshot({ scene, topic, formulaStep });
        report.scenes.push({
          sceneId: scene.id,
          title: topic.title,
          manualComparison,
          formula: scene.steps[formulaStep].formula,
        });
        delete report.activeScene;
        console.log(`PASS MANUAL ${scene.id}: formula, pixels, paused cursor after menu return`);
        continue;
      }
      await player().getByRole('button', { name: 'Пауза', exact: true }).waitFor();
      assert.equal(await currentStep(), 0, `${scene.id}: fresh lesson starts at initial step`);
      const start = await svg().screenshot({ path: path.join(folder, `${scene.id}-start.png`) });
      assert.equal(await player().locator('.sc-tick').count(), scene.steps.length);
      await waitStep(1, scene.steps[0].durationMs + 7000);
      await page.waitForTimeout(170);
      await player().getByRole('button', { name: 'Пауза', exact: true }).click();
      const pausedStep = await currentStep();
      assert.equal(pausedStep, 1);
      const pausedStateA = await visualState();
      const pausedA = await svg().screenshot({
        path: path.join(folder, `${scene.id}-paused-a.png`),
      });
      await page.waitForTimeout(650);
      const pausedB = await svg().screenshot({
        path: path.join(folder, `${scene.id}-paused-b.png`),
      });
      const pausedStateB = await visualState();
      const pauseComparison = comparePixels(pausedA, pausedB);
      Object.assign(report.activeScene, { pauseComparison, pausedStateA, pausedStateB });
      assert.deepEqual(
        pausedStateA,
        pausedStateB,
        `${scene.id}: geometry and animation clocks stay unchanged on pause`,
      );
      assert(
        pauseComparison.maxChannelDelta <= (executable ? 1 : 0),
        `${scene.id}: paused drawing exceeds compositor rounding tolerance`,
      );
      assert(!start.equals(pausedA), `${scene.id}: autoplay must change the actual drawing`);

      // Restore a genuinely animated cursor, including its partial visual state.
      await page
        .getByRole('navigation', { name: 'Основная навигация' })
        .getByRole('button', { name: 'Сегодня', exact: true })
        .click();
      await openLesson(topic, scene);
      assert.equal(await currentStep(), pausedStep, `${scene.id}: menu return preserves step`);
      assert.equal(await player().getByRole('button', { name: 'Пауза', exact: true }).count(), 0);
      const restoredStateA = await visualState();
      const restoredA = await svg().screenshot({
        path: path.join(folder, `${scene.id}-restored-a.png`),
      });
      await page.waitForTimeout(350);
      const restoredB = await svg().screenshot({
        path: path.join(folder, `${scene.id}-restored-b.png`),
      });
      const restoredStateB = await visualState();
      const restoredPauseComparison = comparePixels(restoredA, restoredB);
      const menuReturnComparison = comparePixels(pausedB, restoredA);
      Object.assign(report.activeScene, {
        restoredPauseComparison,
        menuReturnComparison,
        restoredStateA,
        restoredStateB,
      });
      assert.deepEqual(
        restoredStateA,
        restoredStateB,
        `${scene.id}: restored clocks and geometry stay paused`,
      );
      assert(
        restoredPauseComparison.maxChannelDelta <= (executable ? 1 : 0),
        `${scene.id}: restored drawing stays paused`,
      );
      assert.deepEqual(
        pausedStateB.geometry,
        restoredStateA.geometry,
        `${scene.id}: menu return restores exact geometry`,
      );
      assert(
        menuReturnComparison.maxChannelDelta <= (executable ? 1 : 0),
        `${scene.id}: restored animation frame matches its saved frame`,
      );

      await player().getByRole('button', { name: 'Воспроизвести', exact: true }).click();
      await waitStep(2, scene.steps[1].durationMs + 7000);
      await player().getByRole('button', { name: 'Пауза', exact: true }).click();
      await selectStep(1);

      await player().getByRole('button', { name: 'Следующий шаг', exact: true }).click();
      await waitStep(2);
      await player().getByRole('button', { name: 'Предыдущий шаг', exact: true }).click();
      await waitStep(1);
      let midpointRestore;
      if (scene.id === 'median') {
        // Exercise the moving M coordinate and its label, not only an opacity transition.
        await selectStep(4);
        await player().getByRole('button', { name: 'Воспроизвести', exact: true }).click();
        await waitStep(5, scene.steps[4].durationMs + 7000);
        await page.waitForTimeout(270);
        await player().getByRole('button', { name: 'Пауза', exact: true }).click();
        const before = await svg().screenshot({
          path: path.join(folder, 'median-moving-m-before.png'),
        });
        const beforeState = await visualState();
        await page
          .getByRole('navigation', { name: 'Основная навигация' })
          .getByRole('button', { name: 'Сегодня', exact: true })
          .click();
        await openLesson(topic, scene);
        assert.equal(await currentStep(), 5);
        const after = await svg().screenshot({
          path: path.join(folder, 'median-moving-m-restored.png'),
        });
        const afterState = await visualState();
        midpointRestore = comparePixels(before, after);
        Object.assign(report.activeScene, {
          midpointRestore,
          movingBefore: beforeState,
          movingAfter: afterState,
        });
        assert.deepEqual(
          beforeState.geometry,
          afterState.geometry,
          'Median: M and label restore their partial geometry',
        );
        assert(
          midpointRestore.maxChannelDelta <= (executable ? 1 : 0),
          'Median: moving M restores the same image',
        );
      }
      await selectStep(formulaStep);
      assert.equal(
        await player().locator('.sc-formula.sc-has-formula').innerText(),
        scene.steps[formulaStep].formula,
      );
      await page.waitForTimeout(120);
      const filename = `${scene.id}-formula.png`;
      await player().screenshot({ path: path.join(folder, filename) });
      const layout = await page.evaluate(() => ({
        viewport: innerWidth,
        page: document.documentElement.scrollWidth,
        playerWidth: document.querySelector('.scene-player').getBoundingClientRect().width,
        playerScroll: document.querySelector('.scene-player').scrollWidth,
      }));
      assert(layout.page <= layout.viewport + 1, `${scene.id}: horizontal page overflow`);
      assert(
        layout.playerScroll <= layout.playerWidth + 1,
        `${scene.id}: horizontal player overflow`,
      );
      if (scene.id === 'rectangle')
        await page.screenshot({
          path: path.join(folder, 'rectangle-lesson-context.png'),
          fullPage: true,
        });

      const manualComparison = await verifyManualSnapshot({ scene, topic, formulaStep });

      await selectStep(scene.steps.length - 1);
      await player().getByRole('button', { name: 'Завершить просмотр сцены', exact: true }).click();
      await player().getByRole('button', { name: 'Повторить сцену', exact: true }).click();
      await waitStep(0);
      await player().getByRole('button', { name: 'Пауза', exact: true }).waitFor();
      await waitStep(1, scene.steps[0].durationMs + 7000);
      await player().getByRole('button', { name: 'Пауза', exact: true }).click();
      report.scenes.push({
        sceneId: scene.id,
        topicId: topic.id,
        title: topic.title,
        autoplayPixelsChanged: true,
        pauseComparison,
        pausedGeometryAndClocksEqual: true,
        restoredPauseComparison,
        menuReturnComparison,
        midpointRestore,
        manualComparison,
        restoredTimelineResumed: true,
        menuRestoreStepAndPixels: true,
        nextBackReplay: true,
        formulaStep: formulaStep + 1,
        formula: scene.steps[formulaStep].formula,
        screenshot: filename,
        layout,
      });
      delete report.activeScene;
      console.log(
        `PASS AUTHORED ${scene.id}: autoplay, pixel pause, menu restore, controls, formula`,
      );
    }
    assert.equal(report.scenes.length, reviewed.length);
    assert.deepEqual(report.errors, []);
    report.passed = true;
    console.log(`PASS ${report.scenes.length} authored scenes; ${folder}`);
  } catch (error) {
    report.failure = String(error?.stack || error);
    await page
      ?.screenshot({ path: path.join(folder, 'failure.png'), fullPage: true })
      .catch(() => {});
    process.exitCode = 1;
    console.error(report.failure);
  } finally {
    if (app) await app.close();
    if (browser) await browser.close();
    report.finishedAt = new Date().toISOString();
    await writeFile(path.join(folder, 'results.json'), JSON.stringify(report, null, 2));
  }
}
