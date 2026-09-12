import { _electron as electron } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const exe = path.resolve('release/win-unpacked/EGE Cosmos.exe'),
  profile = path.resolve(`test-results/fast-live-${Date.now()}`),
  out = path.resolve('docs/verification/fast-live-0.7.2');
await fs.mkdir(out, { recursive: true });
const report = {
  status: 'running',
  exe,
  profile,
  turns: [],
  errors: [],
  scope:
    'Three actual OpenAI turns: chemistry, history, civics; mandatory local gate and real packaged EXE. Isolated learning profile; shared sign-in used by runtime only.',
};
report.asarSha256 = createHash('sha256')
  .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
  .digest('hex');
let app, page;
async function poll(fn, ms = 150000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error('Timed out');
}
const button = (name) => page.getByRole('button', { name, exact: true });
const nav = (name) => page.locator('.studio-sidebar').getByRole('button', { name, exact: true });
try {
  app = await electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      COSMOS_USER_DATA: profile,
      COSMOS_OPENAI_USER_DATA: path.join(process.env.APPDATA, 'EGE Cosmos Studio'),
    },
    timeout: 45000,
  });
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setIgnoreMouseEvents(true);
    w.setContentSize(1600, 1000);
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.locator('.welcome-modal input').fill('Проверка 7 класса');
  await button('Начнём знакомство').click();
  await nav('Школа').click();

  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  let cases;
  try {
    const { schoolUnits, schoolSubjects } = await server.ssrLoadModule(
      '/src/domain/school-program.ts',
    );
    const targets = [
      {
        subject: 'chemistry',
        pattern: /Химические уравнения|Составление химических уравнений/i,
        prompt:
          'Объясни образование воды простыми словами на авторском рисунке с атомами: 2H2 + O2 → 2H2O. Покажи три шага, почему коэффициенты 2, 1, 2 и почему индексы менять нельзя. Число атомов нужно сверить. Используй chemistry-reaction, пример0, кадры0,2,4. В конце спроси, почему H2O2 это другое вещество.',
      },
      {
        subject: 'history',
        pattern: /Крымская война/i,
        prompt:
          'Крымская война началась в 1854 году? Проверь дату, объясни разницу между началом войны и высадкой союзников в Крыму. Покажи Крым и стрелки на фиксированной карте history-map0. Три кадра: место, высадка, Севастополь. Простыми словами отдели причину войны от цели операции, не рисуй выдуманные границы.',
      },
      {
        subject: 'social',
        pattern: /Инфляция/i,
        prompt:
          'Объясни инфляцию простыми словами: если подорожали только яблоки, это уже инфляция? Приведи правильное определение и контрпример. Сделай три последовательных понятных рисунка с карточками. Потом дай короткий вопрос без готового ответа.',
      },
    ];
    cases = targets.map((t) => {
      const unit = schoolUnits.find(
        (u) => u.subject === t.subject && [u.title, ...u.topics].some((x) => t.pattern.test(x)),
      );
      assert(unit, t.subject);
      return { ...t, unit, subjectTitle: schoolSubjects.find((s) => s.id === t.subject).title };
    });
  } finally {
    await server.close();
  }
  await poll(
    async () => (await page.evaluate(() => window.cosmos.getOpenAIStatus())).authenticated === true,
    45000,
  );
  for (const c of cases) {
    await nav('Все школьные предметы').click();
    await page.getByLabel('Школьный класс', { exact: true }).selectOption(String(c.unit.grade));
    if (await button('Все предметы').isVisible()) await button('Все предметы').click();
    await page.getByLabel('Поиск школьных тем', { exact: true }).fill('');
    await page
      .locator('.school-subject-card')
      .filter({ has: page.getByRole('heading', { name: c.subjectTitle, exact: true }) })
      .click();
    await page.getByLabel('Поиск школьных тем', { exact: true }).fill(c.unit.title);
    await page
      .locator('.school-topic-title')
      .filter({ has: page.getByText(c.unit.title, { exact: true }) })
      .first()
      .click();
    await button('Изучать раздел').click();
    const before = await page.locator('.school-message.assistant').count(),
      start = Date.now();
    await page.getByLabel('Сообщение школьному преподавателю', { exact: true }).fill(c.prompt);
    await button('Отправить').click();
    await poll(
      async () =>
        !(await button('Остановить').isVisible()) &&
        (await page.locator('.school-message.assistant').count()) > before,
    );
    assert.equal(await page.locator('.school-feedback').count(), 0);
    const answer = page.locator('.school-message.assistant').last();
    const state = await page.evaluate(() => window.cosmos.loadState());
    const lesson = Object.values(state.school.lessons)
      .filter((l) => l.subject === c.subject)
      .at(-1);
    const message = lesson.messages.filter((m) => m.kind === 'openai').at(-1);
    assert(message?.verification, 'Mandatory check missing');
    assert(message.verification.durationMs < 250, 'Slow local verification');
    assert.notEqual(
      message.verification.status,
      'conflict',
      'Actual model supplied an explicit incorrect claim',
    );
    const scene = answer.locator('.dialogue-scene');
    assert.equal(await scene.count(), 1);
    await scene.getByRole('button', { name: 'Кадр 2', exact: true }).click();
    await answer.locator('.answer-review summary').click();
    await answer.scrollIntoViewIfNeeded();
    report.turns.push({
      subject: c.subject,
      prompt: c.prompt,
      answer: message,
      elapsedMs: Date.now() - start,
    });
    await page.screenshot({ path: path.join(out, c.subject + '.png') });
    await scene.getByRole('button', { name: 'Рисунок целиком', exact: true }).click();
    await page.screenshot({ path: path.join(out, c.subject + '-fullscreen.png') });
    await page.getByRole('button', { name: 'Вернуться к переписке', exact: true }).click();
    if (c.subject === 'social') {
      const deck = page.locator('.term-deck');
      await deck.locator('summary').first().click();
      await deck.getByLabel('Найти термин', { exact: true }).fill('инфляция');
      await deck.getByRole('button', { name: 'Инфляция', exact: true }).click();
      await deck.getByRole('button', { name: 'Сверить своё рассуждение', exact: true }).click();
      await deck.screenshot({ path: path.join(out, 'terms.png') });
    }
  }
  const saved = await page.evaluate(() => window.cosmos.loadState());
  report.persistedReviews = Object.values(saved.school.lessons)
    .flatMap((l) => l.messages)
    .filter((m) => m.verification).length;
  assert.equal(report.persistedReviews, 3);
  await page.reload();
  await page.locator('.cosmos-studio').waitFor();
  const restored = await page.evaluate(() => window.cosmos.loadState());
  assert.deepEqual(restored.school.lessons, saved.school.lessons);
  report.historyRestoredActualReplies = true;
  const sources = await page.evaluate(() => window.cosmos.listSchoolSources());
  assert.equal(sources.length, 22);
  report.gradeSevenSources = sources.filter((s) => s.grades.includes(7)).map((s) => s.id);
  assert.deepEqual(report.errors, []);
  report.status = 'pass';
} catch (e) {
  report.status = 'failed';
  report.failure = String(e.stack || e);
  process.exitCode = 1;
  if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
  if (app) await app.close();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
