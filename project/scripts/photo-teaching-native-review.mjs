/** Actual local vision -> unchanged confirmed transcript -> tracked teaching -> restart.
 * Requires the release owner's explicit native/GPU queue GO.
 * No mocked bridge, state injection, transcription fill or manual OCR fallback.
 * COSMOS_EXE, COSMOS_EXPECTED_ASAR_SHA, COSMOS_QA_OUT are optional.
 */
import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const exe = path.resolve(process.env.COSMOS_EXE || 'test-results/installed-app/EGE Cosmos.exe');
const out = path.resolve(
  process.env.COSMOS_QA_OUT || 'docs/verification/photo-teaching-installed-0.4',
);
const profile = path.resolve(`test-results/photo-teaching-native-${Date.now()}`);
const fixture = path.resolve('docs/verification/vision-runtime/rectangle.png');
const expected = 'Найдите площадь прямоугольника. Длина 7 см, ширина 4 см.';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalized = (s) => s.toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
const env = {
  ...process.env,
  COSMOS_USER_DATA: profile,
  COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
};
// Use the actually delivered runtime, never a developer/model fallback directory.
delete env.COSMOS_RUNTIME_DIR;
const result = {
  kind: 'actual-local-vision-and-teaching-through-packaged-exe',
  status: 'running',
  startedAt: new Date().toISOString(),
  exe,
  profile,
  checks: [],
  screenshots: [],
  errors: [],
  layoutFailures: [],
  launches: [],
  visualReview: 'pending-personal-review',
  fixture: {
    file: fixture,
    kind: 'author-created printed QA image, not pupil handwriting',
    expected,
  },
  boundaries: [
    'The condition textbox is never filled by this script; its text must come from actual local vision.',
    'No manual transcription fallback is allowed. Unavailable/incorrect OCR fails this scenario.',
    'Only two intermediate steps are completed; no final area answer, task completion or mastery is claimed.',
    'One helper explanation may use the real text model; its actual kind/verification is recorded separately. A canonical fallback is not counted as model quality PASS.',
    'Installer execution and handwriting quality are outside this scenario.',
  ],
};
let app, page, stage, id, transcript;
const button = (name) => page.getByRole('button', { name, exact: true });
async function closeOwnApp() {
  const own = app;
  app = undefined;
  if (own) await own.close();
}
async function launch() {
  app = await electron.launch({
    executablePath: exe,
    env,
    timeout: 45000,
    args: ['--disable-backgrounding-occluded-windows'],
  });
  result.launches.push({ pid: app.process().pid, at: new Date().toISOString() });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => result.errors.push(e.message));
  await page.locator('.app-shell').waitFor();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setContentSize(1280, 720);
    w.show();
    w.focus();
  });
}
async function saved() {
  await page.waitForFunction(() => !localStorage.getItem('ege-cosmos-v1-pending'));
  return page.evaluate(() => window.cosmos.loadState());
}
async function stateWhen(predicate, label) {
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    const s = await saved();
    if (predicate(s)) return s;
    await page.waitForTimeout(100);
  }
  throw Error(`Saved-state deadline: ${label}`);
}
async function check(name, fn) {
  stage = name;
  const start = Date.now();
  const evidence = await fn();
  result.checks.push({ name, status: 'pass', elapsedMs: Date.now() - start, evidence });
  console.log('PASS', name);
}
async function say(text) {
  await page.getByLabel('Сообщение о своей задаче').fill(text);
  await button('Отправить ответ по своей задаче').click();
  await page.waitForFunction(() => !document.querySelector('.tutor-thinking'), undefined, {
    timeout: 150000,
  });
  return saved();
}
async function capture(name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('.tutor-conversation'),
      send = panel?.querySelector('.send-button'),
      field = panel?.querySelector('textarea');
    const b = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    };
    if (!panel || !send || !field) return { width: innerWidth, height: innerHeight };
    const p = b(panel),
      s = b(send),
      f = b(field);
    return {
      width: innerWidth,
      height: innerHeight,
      panel: p,
      send: s,
      field: f,
      clipped:
        s.top < p.top - 1 ||
        s.bottom > p.bottom + 1 ||
        f.top < p.top - 1 ||
        f.bottom > p.bottom + 1,
    };
  });
  if (layout.clipped) result.layoutFailures.push({ name, layout });
  const file = `${name}.png`,
    bytes = await page.screenshot({ path: path.join(out, file), fullPage: true });
  result.screenshots.push({ file, sha256: sha(bytes), ...layout });
}
await fs.mkdir(out, { recursive: true });
const deadline = setTimeout(() => {
  void closeOwnApp();
}, 330000);
try {
  result.artifacts = {
    asar: sha(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar'))),
    executable: sha(await fs.readFile(exe)),
  };
  result.fixture.sha256 = sha(await fs.readFile(fixture));
  if (process.env.COSMOS_EXPECTED_ASAR_SHA)
    assert.equal(result.artifacts.asar, process.env.COSMOS_EXPECTED_ASAR_SHA.toLowerCase());
  await launch();
  await page.getByPlaceholder('Твоё имя').fill('Тестовый ученик');
  await button('Начнём знакомство').click();
  await check('packaged-text-and-vision-packages-available', async () => {
    const info = await page.evaluate(() => window.cosmos.getAppInfo());
    const vision = await page.evaluate(() => window.cosmos.imageReaderStatus());
    const model = await page.evaluate(() => window.cosmos.modelStatus());
    assert.equal(info.packaged, true);
    assert.equal(vision.available, true);
    assert.equal(model.available, true);
    return { info, vision, model };
  });
  await button('Своя задача').click();
  await check('real-image-actual-local-transcription-no-manual-fill', async () => {
    const start = Date.now();
    assert.equal(await page.getByLabel('Условие своей задачи').inputValue(), '');
    await page.locator('input[type=file]').setInputFiles(fixture);
    await page.waitForFunction(
      () => {
        const n = document.querySelector('.transcription-note');
        return (
          !!n &&
          !document.querySelector('.tutor-thinking') &&
          !n.textContent.includes('Переписываю')
        );
      },
      undefined,
      { timeout: 160000 },
    );
    const notice = await page.locator('.transcription-note').innerText();
    transcript = await page.getByLabel('Условие своей задачи').inputValue();
    result.ocr = { transcript, notice, elapsedMs: Date.now() - start, manualEdits: 0 };
    assert.match(notice, /Условие переписано локальной моделью/);
    assert.equal(normalized(transcript), normalized(expected));
    const diagnostics = await page.evaluate(() => window.cosmos.getDiagnostics());
    const evidence = diagnostics
      .filter((d) => d.scope === 'image-read')
      .map(({ at, scope, message }) => ({ at, scope, summary: String(message).split(/\r?\n/)[0] }));
    assert.equal(
      evidence.length,
      1,
      'An actual successful vision inference diagnostic is required',
    );
    result.ocr.diagnostics = evidence;
    await capture('01-actual-recognition');
    return result.ocr;
  });
  await check('unchanged-ocr-text-confirmed-and-scene-matches', async () => {
    await button('Условие верное — разобрать').click();
    const s = await stateWhen(
      (s) => Object.values(s.problemSessions || {}).length === 1,
      'confirmed photo',
    );
    const own = Object.values(s.problemSessions)[0];
    id = own.id;
    assert.equal(own.confirmedText, transcript);
    assert.equal(own.originalText, transcript);
    assert.equal(own.fromPhoto, true);
    assert.match(await page.locator('.problem-scene').innerText(), /Рядов: 4 · В каждом: 7/);
    assert.equal(own.attempts, 0);
    return own;
  });
  await check('real-photo-first-intermediate-question-and-uncertain-answer', async () => {
    await say('не знаю');
    let s = await stateWhen(
      (s) => s.problemSessions[id].teaching?.activeStepId === 'own-rectangle-rows',
      'first row step',
    );
    const reply = s.problemSessions[id].messages.filter((m) => m.role === 'cosmos').at(-1);
    result.helperExplanation = {
      kind: reply.kind,
      text: reply.text,
      verification: reply.verification,
      actualModelAccepted: reply.kind === 'model',
      modelQualityAcceptedByThisScenario: false,
    };
    await capture('02-first-step-from-photo');
    await say('7?');
    s = await stateWhen(
      (s) => s.problemSessions[id].teaching?.phase === 'answered',
      'row accepted',
    );
    assert.equal(s.problemSessions[id].teaching.attempts.at(-1).correct, true);
    assert.equal(s.problemSessions[id].attempts, 0);
    assert.equal(s.problemSessions[id].solved, false);
    await capture('03-first-step-accepted');
    return s.problemSessions[id].teaching;
  });
  await check('second-intermediate-step-accepted-without-final-solution', async () => {
    await button('Далее').click();
    await stateWhen(
      (s) => s.problemSessions[id].teaching.activeStepId === 'own-rectangle-operation',
      'operation step',
    );
    await say('умножение');
    const s = await stateWhen(
        (s) => s.problemSessions[id].teaching.phase === 'answered',
        'operation accepted',
      ),
      own = s.problemSessions[id];
    assert.deepEqual(own.teaching.completedStepIds, [
      'own-rectangle-rows',
      'own-rectangle-operation',
    ]);
    assert.equal(own.teaching.attempts.length, 2);
    assert(own.teaching.attempts.every((a) => a.correct));
    assert.equal(own.attempts, 0);
    assert.equal(own.solved, false);
    assert.equal(own.revealed, false);
    await capture('04-second-step-accepted');
    return own;
  });
  await check('actual-process-restart-restores-photo-and-two-accepted-steps', async () => {
    await saved();
    await closeOwnApp();
    await launch();
    await button('Своя задача').click();
    const lib = page.locator('.lesson-toolbox').filter({ hasText: 'Мои примеры' });
    await lib.locator('summary').click();
    await lib.locator('.own-problem-list button').first().click();
    await lib.locator('summary').click();
    await page.locator('.teaching-scene').waitFor();
    const s = await saved(),
      own = s.problemSessions[id];
    assert.equal(own.confirmedText, transcript);
    assert.equal(own.fromPhoto, true);
    assert.equal(own.teaching.activeStepId, 'own-rectangle-operation');
    assert.equal(own.teaching.phase, 'answered');
    assert.deepEqual(own.teaching.completedStepIds, [
      'own-rectangle-rows',
      'own-rectangle-operation',
    ]);
    assert.equal(own.teaching.attempts.length, 2);
    assert.equal(own.attempts, 0);
    assert.equal(own.solved, false);
    assert.equal(JSON.stringify(s).includes('data:image'), false);
    assert.equal(Object.keys(s.sessions).length, 0);
    await capture('05-restored-photo-teaching');
    return own;
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.layoutFailures, []);
  result.status = 'actual-photo-teaching-flow-pass';
} catch (error) {
  result.status = 'fail';
  result.failure = { stage, message: error.message };
  console.error('FAIL', stage, error.message);
  if (page && !page.isClosed()) await capture('failure').catch(() => {});
} finally {
  clearTimeout(deadline);
  await closeOwnApp();
  result.ownAppClosed = true;
  result.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'actual-photo-teaching-flow-pass' ? 0 : 1;
}
