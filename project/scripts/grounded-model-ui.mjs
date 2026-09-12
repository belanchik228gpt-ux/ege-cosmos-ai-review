import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// Native UI transport/grounding evidence. Pedagogical quality requires reviewing
// the saved exact answers; an HTTP response or a local-material fallback is not PASS.
const cases = [
  {
    subject: 'math',
    room: 'Математика',
    topicId: 'math-rectangle',
    topic: 'Площадь прямоугольника',
    questions: [
      'У прямоугольника стороны 7 и 3. Я сложил их и получил площадь 10. В чём ошибка? Дай одну подсказку и короткий вопрос.',
      'Не знаю, почему единицы площади квадратные. Начни с одного простого шага.',
    ],
  },
  {
    subject: 'russian',
    room: 'Русский язык',
    topicId: 'russian-commas',
    topic: 'Запятая между частями',
    questions: [
      'В предложении «Когда наступила весна, птицы вернулись» где грамматические основы? Помоги найти одну.',
      'Не знаю, зачем нужна запятая между этими частями. Объясни один шаг и задай короткий вопрос.',
    ],
  },
  {
    subject: 'history',
    room: 'История',
    topicId: 'history-baptism',
    topic: 'Крещение Руси',
    questions: [
      'Почему князь Владимир принял христианство? Назови одну причину и задай короткий вопрос.',
      'Я не помню дату Крещения Руси. Дай маленькую подсказку, не называя дату целиком.',
    ],
  },
  {
    subject: 'social',
    room: 'Обществознание',
    topicId: 'social-demand',
    topic: 'Спрос и предложение',
    questions: [
      'Почему при повышении цены покупатели обычно покупают меньше товара? Объясни на одном простом примере.',
      'Я думаю, что спрос и величина спроса — одно и то же. Помоги найти различие и задай один вопрос.',
    ],
  },
];
const REQUEST_MS = 175000,
  TOTAL_MS = 12 * 60 * 1000;
if (process.argv.includes('--describe')) {
  console.log(
    JSON.stringify(
      {
        cases,
        requestDeadlineMs: REQUEST_MS,
        totalDeadlineMs: TOTAL_MS,
        requiresInstalledExe: true,
        startsModel: false,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
assert(
  process.env.COSMOS_EXE,
  'COSMOS_EXE must point to the installed EGE Cosmos.exe. This test does not use a development runtime.',
);
const root = process.cwd(),
  exe = path.resolve(process.env.COSMOS_EXE);
assert.equal(path.extname(exe).toLowerCase(), '.exe');
assert((await fs.stat(exe)).isFile(), 'Installed EXE must exist');
const out = path.resolve(
  process.env.COSMOS_GROUNDED_QA_OUTPUT || 'docs/verification/grounded-model-ui-verified',
);
const profile = path.join(root, 'test-results', 'grounded-model-ui-' + Date.now());
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
  startedAt: new Date().toISOString(),
  executable: path.basename(exe),
  status: 'running',
  pedagogyStatus: 'pending-manual-review',
  expectedRealAnswers: 8,
  requestDeadlineMs: REQUEST_MS,
  totalDeadlineMs: TOTAL_MS,
  results: [],
  subjectChecks: [],
  errors: [],
  fatal: null,
};
let app, page;
const started = Date.now();
const remaining = () => Math.max(0, TOTAL_MS - (Date.now() - started));
const diagnosticKey = (entry) => `${entry.at}|${entry.scope}|${entry.message}`;
async function bounded(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label + ' deadline exceeded')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function snapshot() {
  return bounded(
    page.evaluate(() => window.cosmos.loadState()),
    Math.min(5000, remaining()),
    'State read',
  );
}
async function saveReport() {
  await fs.writeFile(path.join(out, 'answers.json'), JSON.stringify(report, null, 2));
}
async function evidenceShot(subject) {
  const message = page.locator('.message.cosmos').last();
  if (await message.locator('.message-evidence').count())
    await message.locator('.message-evidence').evaluate((element) => {
      element.open = true;
    });
  const sources = message.locator('details.source-links');
  if (await sources.count())
    await sources.evaluate((element) => {
      element.open = true;
    });
  await message.scrollIntoViewIfNeeded().catch(() => {});
  await page
    .locator('.toast button')
    .click({ timeout: 300 })
    .catch(() => {});
  await page.screenshot({ path: path.join(out, subject + '.png'), fullPage: false });
}

try {
  app = await electron.launch({ executablePath: exe, args: [], env, timeout: 45000 });
  page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => report.errors.push(error.message));
  await page.waitForSelector('.home-intro');
  const info = await page.evaluate(() => window.cosmos.getAppInfo());
  report.application = { version: info.version, packaged: info.packaged, platform: info.platform };
  assert.equal(info.packaged, true, 'A packaged installed EXE is required');
  report.modelStatus = await page.evaluate(() => window.cosmos.modelStatus());
  assert.equal(
    report.modelStatus.available,
    true,
    'Installed model package required; local fallback cannot pass this test',
  );
  if (await page.locator('.welcome-modal').count()) {
    await page.getByPlaceholder('Твоё имя').fill('Тестовый ученик');
    await page.getByRole('button', { name: 'Начнём знакомство' }).click();
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));

  for (const test of cases) {
    if (remaining() <= 0) throw new Error('Global model evaluation deadline exceeded');
    await page
      .getByRole('navigation', { name: 'Предметы' })
      .getByRole('button', { name: test.room, exact: true })
      .click();
    await page.locator('.topic-card').filter({ hasText: test.topic }).click();
    await page.getByRole('button', { name: 'Спросить Cosmos', exact: true }).click();
    const initial = await snapshot();
    const selected = Object.values(initial.sessions)
      .filter((session) => session.subject === test.subject && session.topicId === test.topicId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    assert(selected, 'UI must persist the new subject session');
    const baselineAttempts = (initial.progress[test.topicId]?.attempts || []).filter(
      (attempt) => attempt.sessionId === selected.id,
    ).length;
    const collectedIds = [];

    for (const question of test.questions) {
      if (remaining() <= 0) throw new Error('Global model evaluation deadline exceeded');
      const before = await snapshot();
      const beforeIds = new Set(before.sessions[selected.id].messages.map((message) => message.id));
      const diagnosticsBefore = new Set(
        (await page.evaluate(() => window.cosmos.getDiagnostics())).map(diagnosticKey),
      );
      await page.getByRole('button', { name: /^Шаг 1:/ }).click();
      const pause = page.getByRole('button', { name: 'Пауза', exact: true });
      if (await pause.count()) await pause.click();
      await page.getByRole('textbox', { name: 'Сообщение Cosmos' }).fill(question);
      const begin = Date.now();
      await page.getByRole('button', { name: 'Отправить сообщение', exact: true }).click();
      const sceneBefore = await page.locator('.sc-counter').innerText();
      await page.getByRole('button', { name: 'Следующий шаг', exact: true }).click();
      const sceneResponsive = (await page.locator('.sc-counter').innerText()) !== sceneBefore;
      let response,
        saved,
        failure = null;
      const deadline = begin + Math.min(REQUEST_MS, remaining());
      while (Date.now() < deadline) {
        saved = await snapshot();
        response = saved.sessions[selected.id]?.messages.find(
          (message) => !beforeIds.has(message.id) && message.role === 'cosmos',
        );
        if (response) break;
        await page.waitForTimeout(400);
      }
      if (!response) failure = 'No persisted teacher reply before bounded deadline';
      const newDiagnostics = (await page.evaluate(() => window.cosmos.getDiagnostics())).filter(
        (entry) => !diagnosticsBefore.has(diagnosticKey(entry)),
      );
      const transport = newDiagnostics.find((entry) => entry.scope === 'model-candidate');
      const deliveredEvent = newDiagnostics.find((entry) => entry.scope === 'model-answer');
      const verificationEvent = newDiagnostics.find(
        (entry) => entry.scope === 'model-verification',
      );
      const guard = newDiagnostics.find((entry) => entry.scope === 'tutor-check');
      const timing = transport?.message.match(/(\d+)ms; (\d+) output tokens/);
      const sourceIds = response?.sourceIds || [];
      const knowledgeIds = response?.knowledgeIds || [];
      const actualModelReply =
        response?.kind === 'model' &&
        !!transport &&
        !!deliveredEvent &&
        !!response.verification?.evidence.length;
      const authoredCorrection =
        response?.kind === 'material' &&
        !!transport &&
        (!!guard || !!verificationEvent?.message.match(/^(unsupported|unavailable);/));
      const refsPersisted = sourceIds.length > 0 && knowledgeIds.length > 0;
      const displayedSourceLinks = response
        ? await page
            .locator('.message.cosmos')
            .last()
            .locator('.source-links a[href]')
            .evaluateAll((links) =>
              links.map((link) => ({ title: link.textContent?.trim(), url: link.href })),
            )
        : [];
      const pass =
        (!!actualModelReply || authoredCorrection) &&
        refsPersisted &&
        sceneResponsive &&
        displayedSourceLinks.length > 0;
      if (!pass && !failure)
        failure =
          response?.kind !== 'model'
            ? 'Local-material fallback or other non-model reply; not a real model PASS'
            : !transport
              ? 'Missing runtime inference completion evidence'
              : !refsPersisted
                ? 'Model message missing persisted sourceIds/knowledgeIds'
                : !sceneResponsive
                  ? 'Scene did not respond while model was working'
                  : 'Persisted reference ids did not produce known source links';
      if (response?.id) collectedIds.push(response.id);
      report.results.push({
        subject: test.subject,
        topicId: test.topicId,
        sessionId: selected.id,
        question,
        responseText: response?.text || null,
        responseKind: response?.kind || null,
        messageId: response?.id || null,
        elapsedMs: Date.now() - begin,
        actualModelReply: !!actualModelReply,
        actualInferenceCompleted: !!transport,
        evidenceVerification: response?.verification || null,
        verificationEvent: verificationEvent?.message || null,
        authoredCorrection,
        guardReason: guard?.message || null,
        sourceIds,
        knowledgeIds,
        displayedSourceLinks,
        sceneResponsive,
        runtime: timing
          ? { generationMs: Number(timing[1]), outputTokens: Number(timing[2]) }
          : null,
        transportStatus: pass
          ? authoredCorrection
            ? 'candidate-blocked-authored-material-delivered'
            : 'verified-model-delivered'
          : 'fail',
        pedagogyStatus: 'pending-manual-review',
        failure,
      });
      await saveReport();
      console.log(
        `${pass ? (authoredCorrection ? 'PASS labelled authored correction (not model answer)' : 'PASS transport') : 'FAIL transport'} ${test.subject}: ${Date.now() - begin}ms`,
      );
      // Do not issue a concurrent next request when the first UI turn never completed.
      if (!response) throw new Error(`${test.subject}: teacher reply deadline exceeded`);
    }
    const final = await snapshot(),
      current = final.sessions[selected.id];
    const isolated = collectedIds.every((id) =>
      Object.values(final.sessions)
        .filter((session) => session.id !== selected.id)
        .every((session) => session.messages.every((message) => message.id !== id)),
    );
    const attemptsUnchanged =
      (final.progress[test.topicId]?.attempts || []).filter(
        (attempt) => attempt.sessionId === selected.id,
      ).length === baselineAttempts;
    const bothPersisted =
      collectedIds.length === 2 &&
      collectedIds.every((id) => current.messages.some((message) => message.id === id));
    report.subjectChecks.push({
      subject: test.subject,
      sessionId: selected.id,
      bothResponsesPersisted: bothPersisted,
      isolatedFromOtherSubjects: isolated,
      attemptsUnchanged,
      modelMessages: current.messages.filter((message) => message.kind === 'model').length,
    });
    await evidenceShot(test.subject);
    await saveReport();
  }
  report.status =
    report.results.length === 8 &&
    report.results.every((result) => result.transportStatus !== 'fail') &&
    report.subjectChecks.every(
      (check) =>
        check.bothResponsesPersisted && check.isolatedFromOtherSubjects && check.attemptsUnchanged,
    ) &&
    !report.errors.length
      ? report.results.some((result) => result.authoredCorrection)
        ? 'inference-completed-with-authored-corrections'
        : 'transport-pass-pedagogy-unreviewed'
      : 'fail';
} catch (error) {
  report.status = 'fail';
  report.fatal = error.message;
  if (page)
    await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: false }).catch(() => {});
} finally {
  report.completedAt = new Date().toISOString();
  report.elapsedMs = Date.now() - started;
  report.unexecutedQuestionCount = Math.max(0, 8 - report.results.length);
  await saveReport();
  if (app)
    await bounded(app.close(), 15000, 'Application cleanup').catch(() => {
      app.process().kill();
    });
  console.log(
    JSON.stringify(
      {
        status: report.status,
        pedagogyStatus: report.pedagogyStatus,
        realAnswers: report.results.filter((result) => result.actualModelReply).length,
        completedInferences: report.results.filter((result) => result.actualInferenceCompleted)
          .length,
        authoredCorrections: report.results.filter((result) => result.authoredCorrection).length,
        report: path.join(out, 'answers.json'),
        fatal: report.fatal,
      },
      null,
      2,
    ),
  );
  if (report.status === 'fail') process.exitCode = 1;
}
