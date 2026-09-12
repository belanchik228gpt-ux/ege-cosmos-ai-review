import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Run only after packaging. All lesson data belongs to a fresh, isolated QA profile.
// This script deliberately makes real requests; it never injects teacher responses.
const workspace = path.resolve('.');
const exe = path.resolve(process.env.COSMOS_EXE || 'release/win-unpacked/EGE Cosmos.exe');
const profile = path.resolve(workspace, 'test-results', `overnight-dialogue-${Date.now()}`);
const out = path.resolve(process.env.COSMOS_REVIEW_OUT || 'docs/verification/overnight-dialogue');
const timeoutMs = 180_000;
const geometryReview = process.env.COSMOS_REVIEW_SCENARIO === 'geometry';
const assignment = geometryReview ? 'Три различные точки A, B, C соединены попарно отрезками. Докажи, что все отрезки лежат в одной плоскости. Хочу понять доказательство по шагам, с настоящим чертежом.' :
  '|2x+8| - |x-5| = 12. Хочу сам научиться решать такие уравнения. Объясняй небольшими шагами и рисунками, не выдавай всё решение сразу.';
await fs.mkdir(out, { recursive: true });
const report = {
  status: 'prepared',
  exe,
  profile,
  startedAt: new Date().toISOString(),
  timeoutMs,
  plannedTurns: geometryReview ? 3 : 16,
  actualRequests: 0,
  turns: [],
  screenshots: [],
  issues: [],
  pageErrors: [],
  contentReview:
    'Pending human review. Successful transport and screenshots do not prove teaching quality or mathematical correctness.',
  asarSha256: createHash('sha256')
    .update(await fs.readFile(path.join(path.dirname(exe), 'resources/app.asar')))
    .digest('hex'),
};
let app, page, lastAnswer, lessonId;
const button = (name) => page.getByRole('button', { name, exact: true });
const nav = (name) => page.locator('.studio-sidebar').getByRole('button', { name, exact: true });
const clean = (text) =>
  String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
async function checkpoint(stage) {
  report.stage = stage;
  report.updatedAt = new Date().toISOString();
  const data = JSON.stringify(report, null, 2);
  await fs.writeFile(path.join(out, 'progress.json'), data);
  await fs.writeFile(path.join(out, 'report.json'), data);
  console.log(
    JSON.stringify({
      stage,
      completedTurns: report.turns.filter((t) => t.answer).length,
      actualRequests: report.actualRequests,
      issues: report.issues.length,
    }),
  );
}
async function shot(name) {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file });
  report.screenshots.push(file);
  return file;
}
async function lesson() {
  const state = await page.evaluate(() => window.cosmos.loadState());
  return state.homeworkDesk?.lessons?.[lessonId || state.homeworkDesk?.activeLessonId];
}
async function poll(condition, ms = timeoutMs) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}
function concern(turn, kind, detail) {
  report.issues.push({ turn, kind, detail });
}
const current = () =>
  clean(lastAnswer?.learningStep?.instruction || lastAnswer?.question || '').slice(0, 260);
const longPrompts = [
  () =>
    'Сначала объясни, что ищем в моём уравнении и зачем делим ось на промежутки. Начни с одного шага и составь понятный план.',
  () =>
    current()
      ? `В текущем вопросе «${current()}» я путаюсь: мы ищем корень всего уравнения или пока числа, где меняются знаки? Объясни эту разницу на маленьком рисунке.`
      : 'Не понимаю разницу между корнем уравнения и точкой, где меняется знак выражения под модулем. Объясни простыми словами.',
  () =>
    'Я нашёл -4 для 2x+8 и 5 для x-5. Но это уже ответы всего уравнения или только границы промежутков? Почему?',
  () =>
    'Если я пробую x=0, значит мы считаем ноль корнем? Или это только проверочное число? Не переходи пока к решению: мне нужно понять его роль.',
  () =>
    'Покажи на рисунке, где находится 0 относительно -4 и 5. Объясни, как по нему узнать знаки двух выражений. Спроси меня только об одном знаке.',
  () =>
    'При x=0 у меня 2x+8 положительное, а x-5 отрицательное. Тогда почему перед вторым модулем ещё один минус снаружи? Не понимаю разницу этих двух минусов.',
  () =>
    'На промежутке между -4 и 5 я написал (2x+8) - (5-x). Если раскрыть внешние скобки, получится 2x+8-5+x? Проверь именно этот переход и объясни знак перед x.',
  () =>
    'Стоп, пока не давай следующий пример и не двигайся дальше. Я устал от новых действий. Повтори только смысл последнего перехода и покажи, где мы сейчас в плане.',
  () =>
    current()
      ? `Останемся на шаге «${current()}». Придумай простой числовой пример про минус перед скобками, без нового решения нашего уравнения.`
      : 'Останемся на минусе перед скобками. Придумай простой числовой пример, чтобы я сам заметил, что происходит со знаками.',
  () =>
    'Теперь вернёмся именно к |2x+8|-|x-5|=12. Напомни, какой промежуток мы разбирали и что я уже сделал. Продолжи с того места, без повторной диагностики.',
  () =>
    'Для среднего промежутка у меня получается x=3. Проверяю в исходном условии: |14|-|-2|=14-2=12. Объясни, достаточно ли этого для одного найденного корня и что ещё остаётся проверить для полного решения.',
  () =>
    'Остальные промежутки пока не решай. Дай короткий промежуточный итог: что мы поняли, где я путался, что нужно повторить и с какого шага потом продолжить. Не говори, что я освоил всю тему.',
  () =>
    'Модули откладываем. Сейчас явно переключаемся на стереометрию, 10 класс: аксиомы о точках, прямых и плоскостях. Начни новую тему с нуля, простым рисунком и одним вопросом. Старое уравнение сейчас не решаем.',
  () =>
    'Я думал, что любые три точки задают одну плоскость. А если все три точки лежат на одной прямой? Покажи, почему тут есть разница, без сложных слов.',
  () =>
    'Ещё путаюсь: если две точки прямой лежат в плоскости, почему вся прямая тоже в этой плоскости? Это доказывают или это принимают как аксиому? Нарисуй именно эту ситуацию.',
  () =>
    'Подведи итог сегодняшнего разговора отдельно по двум темам: модули и стереометрия. Что я сам предложил, что мы разбирали с помощью и где остановились? Дай мне один маленький самостоятельный вопрос по стереометрии, без ответа.',
];
const prompts = geometryReview ? [
  () => 'Сначала дай короткий план. Нарисуй A, B, C не на одной прямой в плоскости альфа и три отрезка. Объясни обозначения, затем спроси только один следующий шаг, без полного доказательства.',
  () => 'А если три различные точки на одной прямой? Я думаю, тогда плоскостей может быть несколько, но отрезки всё равно можно поместить в одну. Покажи этот случай на отдельном чертеже и проверь мою мысль.',
  () => 'Вернёмся к первому случаю. A и B — две разные точки в альфа. Значит, по аксиоме вся прямая AB и отрезок AB лежат в альфа. Я правильно применил правило? Нарисуй именно это и скажи, что осталось доказать.',
] : longPrompts;
async function reviewSheet(index) {
  if (!lastAnswer?.learningStep) return;
  try {
    await button('Лист для решения').click();
    const reference = page.getByRole('region', { name: 'Условие над листом' });
    await reference.waitFor();
    const rendered = await reference.innerText();
    report.turns[index - 1].sheetReference = rendered;
    if (!(await reference.locator('.tutor-markdown').count()))
      concern(index, 'sheet-formatting', 'No formatted task text found above the sheet.');
    await shot(`${String(index).padStart(2, '0')}-current-sheet`);
  } catch (error) {
    concern(index, 'sheet-ui', String(error.message || error));
  } finally {
    if (
      await button('Закрыть лист')
        .isVisible()
        .catch(() => false)
    )
      await button('Закрыть лист').click();
  }
}
async function send(index, userText) {
  const before = await lesson();
  const previousIds = new Set(
    (before?.messages || []).filter((m) => m.role === 'assistant').map((m) => m.id),
  );
  const record = { index, userText, startedAt: new Date().toISOString(), status: 'sending' };
  report.turns.push(record);
  await checkpoint(`turn-${index}-sending`);
  const start = Date.now();
  try {
    await page.getByLabel('Сообщение школьному преподавателю', { exact: true }).fill(userText);
    await button('Отправить').click();
    const sent = await poll(
      async () => (await lesson())?.messages.some((m) => m.role === 'user' && m.text === userText),
      10_000,
    );
    if (!sent)
      throw Error('The message did not enter the QA conversation; no model request counted.');
    report.actualRequests++;
    record.status = 'waiting';
    await checkpoint(`turn-${index}-waiting`);
    const completed = await poll(async () => {
      if (await button('Остановить').isVisible()) return false;
      return (await page.locator('article.school-message.assistant').count()) > previousIds.size;
    });
    if (!completed) throw Error('No completed assistant reply within180 seconds.');
    const restored = await lesson();
    const answer = restored?.messages
      .filter((m) => m.role === 'assistant' && !previousIds.has(m.id))
      .at(-1);
    if (!answer)
      throw Error(
        'Assistant reply appeared but could not be read from the persisted QA conversation.',
      );
    record.elapsedMs = Date.now() - start;
    record.answer = answer; // Full genuine text, drawing, question, learningStep and verification.
    record.status = 'received';
    if (!answer.text?.trim()) concern(index, 'empty-reply', 'The saved answer has no text.');
    if (answer.verification?.status === 'conflict')
      concern(
        index,
        'verification-conflict',
        'The local review withheld the generated answer; inspect exact evidence.',
      );
    if (!answer.learningStep)
      concern(index, 'missing-checkpoint', 'No current learning position was saved for this turn.');
    if (lastAnswer && clean(answer.text) === clean(lastAnswer.text))
      concern(
        index,
        'verbatim-repeat',
        'The complete reply repeats the previous assistant text verbatim.',
      );
    if (
      index >= 13 &&
      !/стереометр|плоскост|прям|точк/iu.test([answer.text, answer.learningStep?.task].join(' '))
    )
      concern(
        index,
        'topic-switch',
        'Response has no apparent reference to the explicitly requested geometry topic; human review needed.',
      );
    lastAnswer = answer;
    if (geometryReview) {
      if (answer.drawing?.figure !== 'spatial-plane') concern(index, 'missing-spatial-drawing', 'Expected the requested parametric spatial diagram.');
      const scene = page.locator('article.school-message.assistant').last().locator('.dialogue-scene');
      if (await scene.count()) {
        await scene.getByRole('button', { name: 'Рисунок целиком', exact: true }).click();
        await scene.locator('.ds-dots button').last().click();
        await shot(`${index}-spatial-fullscreen`);
        await scene.getByRole('button', { name: 'Вернуться к переписке', exact: true }).click();
      }
    }
    await page.locator('article.school-message.assistant').last().scrollIntoViewIfNeeded();
    record.screenshot = await shot(`${String(index).padStart(2, '0')}-reply`);
    if ([1, 4, 7, 10, 13, 15].includes(index)) await reviewSheet(index);
    await checkpoint(`turn-${index}-received`);
    return true;
  } catch (error) {
    record.elapsedMs = Date.now() - start;
    record.status = 'interrupted';
    record.error = String(error.message || error);
    concern(index, 'request-interruption', record.error);
    if (
      await button('Остановить')
        .isVisible()
        .catch(() => false)
    )
      await button('Остановить')
        .click()
        .catch(() => {});
    await shot(`${String(index).padStart(2, '0')}-interrupted`).catch(() => {});
    await checkpoint(`turn-${index}-interrupted`);
    return false;
  }
}
try {
  report.status = 'running';
  await checkpoint('launching');
  app = await electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      COSMOS_USER_DATA: profile,
      COSMOS_OPENAI_USER_DATA: path.join(process.env.APPDATA, 'EGE Cosmos Studio'),
      COSMOS_DOCUMENTS_DIR: path.join(profile, 'documents'),
    },
    timeout: 45_000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(20_000);
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setIgnoreMouseEvents(true);
    w.setContentSize(1280, 720);
  });
  await page.locator('.cosmos-studio').waitFor();
  await page.locator('.welcome-modal input').waitFor();
  await page.locator('.welcome-modal input').fill('Проверка длинного диалога');
  await button('Начнём знакомство').click();
  await nav('Домашние задания').click();
  await page.getByLabel('Предмет домашней работы').selectOption('math');
  await page.getByLabel('Класс домашней работы').selectOption('10');
  await page.getByLabel('Условие домашнего задания').fill(assignment);
  await button('Открыть разбор').click();
  if (
    !(await poll(
      async () =>
        (await page.evaluate(() => window.cosmos.getOpenAIStatus())).authenticated === true,
      45_000,
    ))
  )
    throw Error(
      'OpenAI authentication did not become ready; no login or credential operations performed.',
    );
  lessonId = (await lesson())?.id;
  if (!lessonId) throw Error('New QA homework conversation was not saved.');
  report.lessonId = lessonId;
  report.assignment = assignment;
  await checkpoint('conversation-created');
  let consecutiveFailures = 0;
  for (let i = 0; i < prompts.length; i++) {
    const ok = await send(i + 1, prompts[i]());
    consecutiveFailures = ok ? 0 : consecutiveFailures + 1;
    if (consecutiveFailures >= 2) {
      concern(
        i + 1,
        'stopped',
        'Two consecutive interruptions; stopped without automatic resubmission or wasting further requests.',
      );
      break;
    }
  }
  report.persistedLesson = await lesson();
  report.status =
    report.issues.length ||
    report.pageErrors.length ||
    report.turns.filter((t) => t.answer).length < prompts.length
      ? 'needs-review'
      : 'completed';
} catch (error) {
  report.status = 'needs-review';
  report.error = String(error.stack || error);
  if (page) await shot('fatal-ui-state').catch(() => {});
} finally {
  report.finishedAt = new Date().toISOString();
  await checkpoint('finished');
  if (app) await app.close().catch(() => {});
}
