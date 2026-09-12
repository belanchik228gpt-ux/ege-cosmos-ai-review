import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const out = path.resolve(process.env.COSMOS_QA_OUT || 'docs/verification/studio-stream-native-0.5');
const profile = path.resolve(
  process.env.COSMOS_LIVE_PROFILE || 'test-results/studio-live-native-1788894342050',
);
await fs.mkdir(out, { recursive: true });
const result = {
  status: 'running',
  startedAt: new Date().toISOString(),
  exe,
  profile,
  asarSha256: createHash('sha256')
    .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
    .digest('hex'),
  checks: [],
  replies: [],
  screenshots: [],
  errors: [],
  limits: [
    'Actual OpenAI responses and screenshots from packaged EXE. Existing Cosmos sign-in reused, credentials never read or copied.',
    'Learning data isolated. No response or learning-state injection. PDF requested through the actual desktop bridge using the saved chat document.',
  ],
};
let app, page;
const finalSelector = '.studio-message.assistant:not(.streaming)';
const smokeOnly = process.env.COSMOS_FINAL_SMOKE === '1';
const nav = (name) => page.locator('.studio-sidebar').getByRole('button', { name, exact: true });
const button = (name) => page.getByRole('button', { name, exact: true });
async function shot(name) {
  const file = path.join(out, name + '.png');
  await page.screenshot({ path: file });
  result.screenshots.push(file);
}
async function launch() {
  app = await electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      COSMOS_USER_DATA: profile,
      COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
      COSMOS_OPENAI_USER_DATA: path.join(process.env.APPDATA, 'EGE Cosmos Studio'),
    },
    timeout: 45000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(25000);
  page.on('pageerror', (e) => result.errors.push(e.message));
  await page.locator('.cosmos-studio').waitFor();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setContentSize(1600, 1000);
    w.show();
    w.focus();
  });
  await nav('Математика').click();
  await page.waitForFunction(
    async () => (await window.cosmos.getOpenAIStatus()).authenticated === true,
    null,
    { timeout: 30000 },
  );
  await page.evaluate(() => {
    window.__streamAudit = [];
    window.cosmos.onOpenAITutorProgress((p) =>
      window.__streamAudit.push({
        requestId: p.requestId,
        conversationId: p.conversationId,
        elapsedMs: p.elapsedMs,
        text: p.text,
      }),
    );
  });
}
async function start(prompt) {
  const count = await page.locator(finalSelector).count();
  await page.evaluate(() => {
    window.__streamAudit = [];
  });
  await page.getByRole('textbox', { name: 'Сообщение Cosmos', exact: true }).fill(prompt);
  const started = Date.now();
  await button('Отправить сообщение').click();
  return { count, started, prompt };
}
async function finish(turn, name) {
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll('.studio-message.assistant:not(.streaming)').length > count ||
      !!document.querySelector('.studio-chat-error'),
    turn.count,
    { timeout: 170000 },
  );
  const error = await page
    .locator('.studio-chat-error')
    .innerText()
    .catch(() => '');
  assert(!error, error);
  const elapsedMs = Date.now() - turn.started;
  const events = await page.evaluate(() => window.__streamAudit);
  assert(events.length > 0, 'Real model must emit temporary text.');
  assert(events[0].elapsedMs < elapsedMs, 'Text must be available before the whole answer.');
  assert(
    events.every((e) => e.text.length <= 16000 && !/^\s*\{\s*"(?:text|scene)"/.test(e.text)),
    'No raw envelope in the visible text.',
  );
  const answer = await page.locator(finalSelector).last().innerText();
  result.replies.push({
    name,
    prompt: turn.prompt,
    answer,
    elapsedMs,
    firstTextMs: events[0].elapsedMs,
    updates: events.length,
  });
  console.log(JSON.stringify(result.replies.at(-1)));
  await page.locator(finalSelector).last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await shot(name);
}
try {
  await launch();
  result.model = (await page.evaluate(() => window.cosmos.getOpenAIStatus())).selectedModel;
  const turn = await start(smokeOnly
    ? 'Вспомни, какие рисунки сохранены к нашему объяснению модуля. Не утверждай, что я уже просмотрел их. Покажи ещё один маленький пример на числовой прямой, без ответа за меня. Дай ссылку на официальный источник ФИПИ для рамок экзамена, если он есть в контексте.'
    : 'Объясни на одном небольшом примере, почему в формуле \\(\\sqrt{a^2}=|a|\\) нужен модуль. Нарисуй 3–4 последовательных шага на числовой прямой. В конце задай похожий пример без готового ответа.',
  );
  await page.locator('.studio-message.streaming').waitFor({ timeout: 140000 });
  assert.equal(
    await page.locator(finalSelector).count(),
    turn.count,
    'Partial output is not a completed answer.',
  );
  const during = await page.evaluate(() => window.cosmos.loadState());
  const duringMath = Object.values(during.cloudSessions)
    .filter((l) => l.subject === 'math')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  assert.equal(duringMath.messages.at(-1).role, 'user', 'Temporary model text is not persisted.');
  await shot('01-stream-in-progress');
  await finish(turn, '02-complete-explanation');
  result.checks.push('real-stream-before-final-no-partial-persistence');

  if (!smokeOnly) {
  const canceled = await start('Объясни ещё раз с несколькими рисунками и задай вопрос.');
  await page.locator('.studio-message.streaming').waitFor({ timeout: 140000 });
  await button('Остановить ответ').click();
  await page.locator('.studio-chat-error').waitFor();
  await page.waitForTimeout(1300);
  assert.equal(await page.locator(finalSelector).count(), canceled.count);
  assert.equal(await page.locator('.studio-message.streaming').count(), 0);
  await shot('03-canceled');
  await page.evaluate(() => {
    window.__streamAudit = [];
  });
  const retry = {
    ...canceled,
    started: Date.now(),
    prompt: 'Повторить сохранённый запрос после отмены',
  };
  await button('Повторить запрос').click();
  await finish(retry, '04-retry-completed');
  result.checks.push('cancel-clears-stream-and-next-real-request-succeeds');
  }

  await page.evaluate(() => {
    window.__streamAudit = [];
  });
  const summaryTurn = {
    count: await page.locator(finalSelector).count(),
    started: Date.now(),
    prompt: 'Завершить занятие через штатную кнопку',
  };
  await button('Завершить занятие').click();
  await finish(summaryTurn, '05-session-summary');
  const documentsBefore=(await page.evaluate(()=>window.cosmos.loadState())).documents.length;
  await button('Сохранить конспект').first().click();
  await page.waitForFunction(async count => {
    const s = await window.cosmos.loadState();
    return s.documents.length > count && s.documents.at(-1)?.path?.endsWith('.html');
  }, documentsBefore);
  const saved = await page.evaluate(() => window.cosmos.loadState());
  const doc = saved.documents.filter((d) => d.sessionId && d.path?.endsWith('.html')).at(-1);
  const html = await fs.readFile(doc.path, 'utf8');
  assert(html.includes('katex'));
  assert(html.includes('data:font/woff2'));
  assert(html.includes('Cosmos'));
  const pdf = await page.evaluate(
    (d) =>
      window.cosmos.exportDocument({
        title: d.title,
        subject: d.subject,
        topicId: d.topicId,
        content: d.content,
        format: 'pdf',
        documentType: d.type,
        style: 'cosmos',
      }),
    doc,
  );
  assert(pdf?.ok && pdf.path);
  const bytes = await fs.readFile(pdf.path);
  assert(bytes.subarray(0, 5).toString() === '%PDF-');
  const htmlCopy = path.join(out, 'actual-chat-note.html'),
    pdfCopy = path.join(out, 'actual-chat-note.pdf');
  await fs.copyFile(doc.path, htmlCopy);
  await fs.copyFile(pdf.path, pdfCopy);
  result.documents = { html: htmlCopy, pdf: pdfCopy, pdfBytes: bytes.length };
  result.checks.push('real-chat-html-and-packaged-pdf-with-local-math-fonts');

  await page.waitForFunction(() => !localStorage.getItem('ege-cosmos-v1-pending'));
  const before = await page.evaluate(() => window.cosmos.loadState());
  await app.close();
  app = undefined;
  await launch();
  const after = await page.evaluate(() => window.cosmos.loadState());
  assert.deepEqual(after.cloudSessions, before.cloudSessions);
  if (!smokeOnly) {
  const resumed = await start(
    'Коротко напомни правило, которое мы только что обсуждали, и предложи следующий маленький шаг.',
  );
  await finish(resumed, '05-after-real-restart');
  result.checks.push('sign-in-and-conversation-restored-next-real-response');
  } else {
    await shot('06-installed-restart');
    result.checks.push('installed-sign-in-and-conversation-restored');
  }
  assert.deepEqual(result.errors, []);
  result.status = 'pass';
} catch (e) {
  result.status = 'fail';
  result.error = String(e.stack || e);
  if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
  await app?.close();
  result.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({ status: result.status, checks: result.checks, error: result.error }),
  );
  if (result.status !== 'pass') process.exitCode = 1;
}
