/** Real packaged-app own-problem teaching flow. No model, injected state or fake OCR.
 * Run after the release owner grants the native queue.
 * COSMOS_EXE, COSMOS_EXPECTED_ASAR_SHA and COSMOS_QA_OUT are optional.
 */
import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const out = path.resolve(
  process.env.COSMOS_QA_OUT || 'docs/verification/problem-teaching-native-0.4',
);
const profile = path.resolve(`test-results/problem-teaching-native-${Date.now()}`);
const runtime = path.join(profile, 'empty-runtime');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const result = {
  kind: 'packaged-native-executable',
  startedAt: new Date().toISOString(),
  status: 'running',
  exe,
  profile,
  checks: [],
  screenshots: [],
  pageErrors: [],
  launches: [],
  visualReview: 'pending-personal-review',
  layoutFailures: [],
  boundaries: [
    'All learning mutations use real visible UI controls; persisted state is read only.',
    'The runtime directory is empty: no text model or vision model is started.',
    'Photo coverage means file selection, honest unavailable OCR, manual transcription and restoration. It is not an OCR accuracy claim.',
    'Assisted step answers do not count as independent solutions or topic mastery.',
    'This checks the exact EXE path and ASAR hash recorded above; installer execution is verified separately.',
  ],
};
let app, page, stage, timer, rectangleId, photoId;
async function closeOwnApp() {
  const own = app;
  app = undefined;
  if (own) await own.close();
}
async function launch() {
  app = await electron.launch({
    executablePath: exe,
    timeout: 45000,
    args: ['--disable-backgrounding-occluded-windows'],
    env: {
      ...process.env,
      COSMOS_USER_DATA: profile,
      COSMOS_RUNTIME_DIR: runtime,
      COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
    },
  });
  result.launches.push({ pid: app.process().pid, at: new Date().toISOString() });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  await page.locator('.app-shell').waitFor();
  await resize(1280, 720);
}
async function resize(width, height) {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const own = BrowserWindow.getAllWindows()[0];
      own.setContentSize(size.width, size.height);
      own.show();
      own.focus();
    },
    { width, height },
  );
}
const button = (name) => page.getByRole('button', { name, exact: true });
async function persisted() {
  await page.waitForFunction(() => !localStorage.getItem('ege-cosmos-v1-pending'));
  return page.evaluate(() => window.cosmos.loadState());
}
async function stateWhen(predicate, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const saved = await persisted();
    if (predicate(saved)) return saved;
    await page.waitForTimeout(100);
  }
  throw Error(`Persisted state deadline: ${label}`);
}
async function check(name, fn) {
  stage = name;
  const start = Date.now();
  const evidence = await fn();
  result.checks.push({ name, status: 'pass', elapsedMs: Date.now() - start, evidence });
  console.log('PASS', name);
}
async function capture(name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(550);
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  const composerLayout = await page.evaluate(() => {
    const panel = document.querySelector('.tutor-conversation');
    const send = panel?.querySelector('[aria-label="Отправить ответ по своей задаче"]');
    const field = panel?.querySelector('[aria-label="Сообщение о своей задаче"]');
    if (!panel || !send || !field) return undefined;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const p = box(panel),
      s = box(send),
      f = box(field);
    return {
      panel: p,
      send: s,
      field: f,
      clippedByPanel:
        s.bottom > p.bottom + 1 ||
        s.top < p.top - 1 ||
        f.bottom > p.bottom + 1 ||
        f.top < p.top - 1,
    };
  });
  if (composerLayout?.clippedByPanel) result.layoutFailures.push({ name, ...composerLayout });
  assert.ok(layout.scrollWidth <= layout.width + 2, `Horizontal overflow: ${name}`);
  const file = `${name}.png`;
  const bytes = await page.screenshot({ path: path.join(out, file), fullPage: true });
  result.screenshots.push({
    file,
    sha256: sha(bytes),
    bytes: bytes.length,
    fullPage: true,
    ...layout,
    composerLayout,
  });
  if (name === '01-rectangle-row' || name === '03-rectangle-operation-after-restart') {
    const viewportFile = `${name}-viewport.png`;
    const viewportBytes = await page.screenshot({
      path: path.join(out, viewportFile),
      fullPage: false,
    });
    result.screenshots.push({
      file: viewportFile,
      sha256: sha(viewportBytes),
      bytes: viewportBytes.length,
      fullPage: false,
      ...layout,
    });
  }
}
async function say(text) {
  await page.getByRole('textbox', { name: 'Сообщение о своей задаче' }).fill(text);
  await button('Отправить ответ по своей задаче').click();
  await page.waitForFunction(() => !document.querySelector('.tutor-thinking'));
  assert.equal(
    await page.getByRole('textbox', { name: 'Сообщение о своей задаче' }).inputValue(),
    '',
  );
}
async function startProblem(text) {
  const before = new Set(Object.keys((await persisted()).problemSessions || {}));
  await page.getByRole('textbox', { name: 'Условие своей задачи' }).fill(text);
  await button('Разобрать мой пример').click();
  const saved = await stateWhen(
    (s) => Object.keys(s.problemSessions).some((id) => !before.has(id)),
    'new own problem',
  );
  return Object.keys(saved.problemSessions).find((id) => !before.has(id));
}
async function answerStep(id, text, expectedStep) {
  await say(text);
  await stateWhen((s) => s.problemSessions[id].teaching?.phase === 'answered', `answered ${text}`);
  await button('Далее').click();
  return stateWhen(
    (s) => s.problemSessions[id].teaching?.activeStepId === expectedStep,
    `next ${expectedStep}`,
  );
}
async function reopenLatestProblem() {
  // Selected example is sessionStorage-scoped. After a real process restart,
  // the supported persistence path is the visible saved-example library.
  const library = page.locator('.lesson-toolbox').filter({ hasText: 'Мои примеры' });
  await library.locator('summary').click();
  await library.locator('.own-problem-list button').first().click();
  await library.locator('summary').click();
}

await fs.mkdir(out, { recursive: true });
await fs.mkdir(runtime, { recursive: true });
timer = setTimeout(() => {
  void closeOwnApp();
}, 240000);
try {
  const asarPath = path.join(path.dirname(exe), 'resources', 'app.asar');
  result.artifacts = {
    asar: { path: asarPath, sha256: sha(await fs.readFile(asarPath)) },
    executable: { path: exe, sha256: sha(await fs.readFile(exe)) },
  };
  if (process.env.COSMOS_EXPECTED_ASAR_SHA)
    assert.equal(result.artifacts.asar.sha256, process.env.COSMOS_EXPECTED_ASAR_SHA.toLowerCase());
  await launch();
  await page.getByPlaceholder('Твоё имя').fill('Тестовый ученик');
  await button('Начнём знакомство').click();
  await check('packaged-app-with-empty-runtime', async () => {
    const appInfo = await page.evaluate(() => window.cosmos.getAppInfo());
    const model = await page.evaluate(() => window.cosmos.modelStatus());
    const vision = await page.evaluate(() => window.cosmos.imageReaderStatus());
    assert.equal(appInfo.packaged, true);
    assert.equal(model.available, false);
    assert.equal(vision.available, false);
    return { appInfo, model, vision };
  });
  await button('Своя задача').click();
  rectangleId = await startProblem('Площадь прямоугольника со сторонами 7 и 4 см');
  await check('rectangle-hint-targets-row-step-with-actual-numbers', async () => {
    await say('не знаю');
    const saved = await stateWhen(
      (s) => s.problemSessions[rectangleId].teaching?.activeStepId === 'own-rectangle-rows',
      'rectangle row',
    );
    assert.equal(saved.problemSessions[rectangleId].attempts, 0);
    assert.match(
      await page.locator('.conversation-condition').innerText(),
      /Сколько клеток находится в одном ряду/,
    );
    await page.locator('.teaching-scene').waitFor();
    await capture('01-rectangle-row');
    return saved.problemSessions[rectangleId].teaching;
  });
  await check('uncertain-correct-answer-checks-current-step-only', async () => {
    await say('4');
    await say('7?');
    const saved = await stateWhen(
      (s) => s.problemSessions[rectangleId].teaching?.phase === 'answered',
      'row answer',
    );
    const own = saved.problemSessions[rectangleId];
    assert.equal(own.attempts, 0);
    assert.equal(own.solved, false);
    assert.deepEqual(
      own.teaching.attempts.map((a) => a.correct),
      [false, true],
    );
    await capture('02-rectangle-row-accepted');
    return { attempts: own.attempts, stepAttempts: own.teaching.attempts };
  });
  await check('real-process-restart-restores-answered-step-and-visual', async () => {
    await persisted();
    await closeOwnApp();
    await launch();
    await button('Своя задача').click();
    await reopenLatestProblem();
    await page.locator('.teaching-scene').waitFor();
    const own = (await persisted()).problemSessions[rectangleId];
    assert.equal(own.teaching.activeStepId, 'own-rectangle-rows');
    assert.equal(own.teaching.phase, 'answered');
    await button('Далее').click();
    await stateWhen(
      (s) => s.problemSessions[rectangleId].teaching.activeStepId === 'own-rectangle-operation',
      'operation after restart',
    );
    await capture('03-rectangle-operation-after-restart');
    return { restoredStep: own.teaching.activeStepId, phase: own.teaching.phase };
  });
  await check('final-next-completes-without-retyping-or-double-counting', async () => {
    await answerStep(rectangleId, 'умножение', 'own-final');
    await say('28?');
    await button('Далее').click();
    const saved = await stateWhen((s) => s.problemSessions[rectangleId].solved, 'rectangle solved');
    const own = saved.problemSessions[rectangleId];
    assert.equal(own.attempts, 1);
    assert.ok(own.hints > 0);
    assert.equal(own.messages.filter((m) => m.role === 'student' && m.text === '28?').length, 1);
    await capture('04-rectangle-completed');
    return own;
  });
  await check('positive-absolute-smallsteps-preserve-center-and-two-roots', async () => {
    await button('Новый пример').click();
    const id = await startProblem('|x − 2| = 3');
    await say('не знаю');
    await stateWhen(
      (s) => s.problemSessions[id].teaching?.activeStepId === 'own-absolute-center',
      'absolute center',
    );
    await answerStep(id, '2?', 'own-absolute-distance');
    await answerStep(id, 'нет', 'own-absolute-direction');
    await capture('05-absolute-direction');
    await answerStep(id, 'влево', 'own-final');
    await say('5; -1?');
    await button('Далее').click();
    const saved = await stateWhen((s) => s.problemSessions[id].solved, 'absolute solved');
    assert.equal(saved.problemSessions[id].attempts, 1);
    assert.ok(saved.problemSessions[id].hints > 0);
    await capture('06-absolute-completed');
    return saved.problemSessions[id];
  });
  await check('negative-distance-no-fabricated-roots', async () => {
    await button('Новый пример').click();
    const id = await startProblem('|x − 2| = -3');
    await say('не знаю');
    await stateWhen(
      (s) => s.problemSessions[id].teaching?.activeStepId === 'own-absolute-center',
      'negative center',
    );
    await answerStep(id, '2', 'own-absolute-distance');
    await capture('07-negative-distance');
    await answerStep(id, 'нет', 'own-final');
    await say('нет решений');
    await button('Далее').click();
    const saved = await stateWhen((s) => s.problemSessions[id].solved, 'negative no solutions');
    assert.equal(saved.problemSessions[id].attempts, 1);
    await capture('08-negative-completed');
    return saved.problemSessions[id];
  });
  await check('photo-manual-transcription-and-teaching-restoration', async () => {
    await button('Новый пример').click();
    const fixture = path.resolve('docs/verification/vision-runtime/rectangle.png');
    const photoSha = sha(await fs.readFile(fixture));
    await page.locator('input[type=file]').setInputFiles(fixture);
    await page.getByText('Не удалось уверенно прочитать фото.', { exact: false }).waitFor();
    await page
      .getByRole('textbox', { name: 'Условие своей задачи' })
      .fill('Площадь прямоугольника со сторонами 7 и 4 см');
    await capture('09-photo-manual-confirmation');
    await button('Условие верное — разобрать').click();
    await say('не знаю');
    const saved = await stateWhen(
      (s) =>
        Object.values(s.problemSessions).some(
          (p) => p.fromPhoto && p.teaching?.activeStepId === 'own-rectangle-rows',
        ),
      'photo teaching',
    );
    photoId = Object.values(saved.problemSessions).find((p) => p.fromPhoto).id;
    await say('7?');
    await stateWhen(
      (s) => s.problemSessions[photoId].teaching?.phase === 'answered',
      'photo row answered',
    );
    await closeOwnApp();
    await launch();
    await button('Своя задача').click();
    await reopenLatestProblem();
    await page.locator('.teaching-scene').waitFor();
    const restored = await persisted(),
      own = restored.problemSessions[photoId];
    assert.equal(own.fromPhoto, true);
    assert.equal(own.confirmedText, 'Площадь прямоугольника со сторонами 7 и 4 см');
    assert.equal(own.teaching.phase, 'answered');
    assert.equal(own.teaching.activeStepId, 'own-rectangle-rows');
    assert.equal(JSON.stringify(restored).includes('data:image'), false);
    await capture('10-photo-step-restored');
    return { fixture, photoSha, method: 'manual-transcription-after-unavailable-OCR', own };
  });
  await check('narrow-native-layout-and-subject-memory-isolation', async () => {
    await resize(620, 844);
    await capture('11-narrow-native');
    const saved = await persisted();
    assert.equal(Object.values(saved.problemSessions).length, 4);
    assert.equal(Object.values(saved.problemSessions).filter((p) => p.solved).length, 3);
    assert.equal(Object.values(saved.sessions).length, 0);
    assert.equal(
      Object.values(saved.problemSessions).some((p) => p.messages.some((m) => m.kind === 'model')),
      false,
    );
    result.finalDiagnostics = (await page.evaluate(() => window.cosmos.getDiagnostics())).map(
      ({ at, scope, message }) => ({ at, scope, summary: String(message).split(/\r?\n/)[0] }),
    );
    assert.equal(
      result.finalDiagnostics.some((d) => d.scope === 'model-ready'),
      false,
    );
    return { ownProblems: 4, solvedWithAssistance: 3, courseSessions: 0, localModelMessages: 0 };
  });
  assert.deepEqual(result.pageErrors, []);
  result.status = result.layoutFailures.length
    ? 'native-flow-pass-layout-fail'
    : 'native-flow-pass';
} catch (error) {
  result.status = 'fail';
  result.failure = { stage, message: error.message };
  if (page && !page.isClosed())
    await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
  console.error('FAIL', stage, error.message);
} finally {
  clearTimeout(timer);
  await closeOwnApp();
  result.ownAppClosed = true;
  result.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'native-flow-pass' ? 0 : 1;
}
