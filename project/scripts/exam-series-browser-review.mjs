import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = process.cwd(), out = path.join(root, 'docs/verification/exam-series-browser-0.5.1');
await fs.mkdir(out, { recursive: true });
const report = { at: new Date().toISOString(), scope: 'CONTROLLED BACKEND FIXTURE. Actual App in isolated headless Chrome. UI-only learning changes; fixed model responses, not live OpenAI or native EXE evidence. Browser pointer events do not move the system cursor.', checks: [], screenshots: [], errors: [], pass: false };
let server, browser, page;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
try {
  report.sourceSha256 = createHash('sha256').update(await fs.readFile(path.join(root, 'src/ui/CloudRoom.tsx'))).digest('hex');
  server = await createServer({ root, server: { host: '127.0.0.1', port: 5187, strictPort: true }, logLevel: 'error' });
  await server.listen();
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--disable-gpu'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => {
    const control = { queue: [], requests: [], cancellations: 0, held: undefined };
    window.__examFixture = control;
    window.cosmos = {
      loadState: async () => JSON.parse(localStorage.getItem('exam-fixture-state') || 'null'),
      saveState: async (state) => { localStorage.setItem('exam-fixture-state', JSON.stringify(state)); return true; },
      modelStatus: async () => ({ available: false }),
      listBackgrounds: async () => [],
      getOpenAIStatus: async () => ({ available: true, runtimeAvailable: true, authenticated: true, state: 'ready', busy: false, selectedModel: 'qa-fixed-fixture', models: [] }),
      onOpenAITutorProgress: () => () => {},
      generateOpenAITutor: async (request) => {
        control.requests.push(request);
        const response = control.queue.shift();
        if (!response) throw new Error('No controlled response was queued');
        if (response.hold) return await new Promise((resolve) => { control.held = resolve; });
        return response;
      },
      cancelOpenAITutor: async () => { control.cancellations++; return true; },
    };
  });
  page.on('pageerror', error => report.errors.push(String(error)));
  await page.goto('http://127.0.0.1:5187');
  await page.locator('.welcome-modal input').fill('QA серии — фиксированные ответы');
  await page.getByRole('button', { name: 'Начнём знакомство', exact: true }).click();
  await page.locator('.studio-sidebar').getByRole('button', { name: 'Как решать ЕГЭ', exact: true }).click();
  await page.getByRole('button', { name: /^Задание 3:/ }).click();
  await page.getByLabel('Количество примеров', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Открыть тренировку', exact: true }).click();
  const lesson = () => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('exam-fixture-state')).cloudSessions).find(value => value.examTraining));
  const initial = await lesson();
  const initialProgress = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('exam-fixture-state')).progress));
  assert(initial.topicId === 'exam-math-3', 'Exam lesson uses unrelated school topic');
  const enqueue = (response) => page.evaluate(value => window.__examFixture.queue.push(value), response);
  const done = () => page.waitForFunction(() => !document.querySelector('.studio-thinking'));
  const sendText = async (text, response) => {
    await enqueue(response);
    await page.getByRole('textbox', { name: 'Сообщение Cosmos', exact: true }).fill(text);
    await page.getByRole('button', { name: 'Отправить сообщение', exact: true }).click();
    await done();
  };
  const shot = async name => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(180);
    await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
    report.screenshots.push(name + '.png');
  };
  const fixture = (text, phase = 'practice') => ({ ok: true, text: 'Тестовый фиксированный ответ: ' + text, phase });
  await enqueue(fixture('В таблице три значения: 4, 6 и 8. Назови наибольшее.'));
  await page.getByRole('button', { name: 'Начать серию', exact: true }).click();
  await done();
  assert((await lesson()).examTraining.completed.length === 0, 'Initial example counted as reviewed');
  await sendText('8', fixture('Текстовая попытка получена.', 'review'));
  assert((await lesson()).examTraining.completed.length === 0, 'Math text-only review falsely counted as sheet review');
  assert(await page.getByRole('button', { name: 'Следующий пример', exact: true }).isDisabled(), 'Next enabled without mathematical attachment review');
  report.checks.push('isolated-exam-context-and-review-requires-math-attachment');

  async function inkSheet(marker, close = false) {
    await page.getByRole('button', { name: 'Решить на листе', exact: true }).click();
    await page.getByRole('dialog', { name: 'Лист для решения', exact: true }).waitFor();
    const paper = page.locator('.math-sheet canvas');
    await paper.scrollIntoViewIfNeeded();
    const box = await paper.boundingBox();
    const x = box.x + Math.min(box.width * .35, 200) + (marker.includes('второго') ? 45 : 0), y = box.y + Math.min(box.height * .15, 150);
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 65, y + 35, { steps: 8 }); await page.mouse.up();
    await page.getByLabel('Условие или пояснение — по желанию', { exact: true }).fill(marker);
    if (close) await page.getByRole('button', { name: 'Закрыть лист', exact: true }).click();
  }
  await inkSheet('Черновик первого примера');
  await enqueue(fixture('На листе первого примера ответ 8. Разбор окончен.', 'review'));
  await page.getByRole('button', { name: 'Проверить решение', exact: true }).click();
  await done();
  assert(JSON.stringify((await lesson()).examTraining.completed) === '[1]', 'Reviewed mathematical sheet did not complete example 1');
  const firstRequest = await page.evaluate(() => window.__examFixture.requests.at(-1));
  assert(firstRequest.image?.name === 'Моё рукописное решение.png' && firstRequest.image.dataUrl.startsWith('data:image/png;base64,'), 'Sheet was not actually rendered and attached');
  report.firstSheetBytes = Buffer.from(firstRequest.image.dataUrl.split(',')[1], 'base64').length;
  await shot('01-first-sheet-reviewed');
  await page.getByRole('button', { name: 'Решить на листе', exact: true }).click();
  assert(await page.getByLabel('Условие или пояснение — по желанию', { exact: true }).inputValue() === 'Черновик первого примера', 'Example 1 draft did not reopen');
  await page.getByRole('button', { name: 'Закрыть лист', exact: true }).click();
  report.checks.push('actual-canvas-sheet-review-recorded-once-and-draft-restored');

  // Deliberately attach a photo after the completed review, then change examples.
  // The next request must not inherit either the image payload or a false image label.
  await page.locator('.studio-composer input[type=file]').setInputFiles({ name: 'previous-example.png', mimeType: 'image/png', buffer: Buffer.from(firstRequest.image.dataUrl.split(',')[1], 'base64') });
  await page.locator('.studio-photo-chip').waitFor();
  await enqueue(fixture('Пример 2: значения 3, 5 и 9. Назови наибольшее.'));
  await page.getByRole('button', { name: 'Следующий пример', exact: true }).click();
  await done();
  const afterNext = await lesson(), nextRequest = await page.evaluate(() => window.__examFixture.requests.at(-1));
  assert(afterNext.examTraining.current === 2 && JSON.stringify(afterNext.examTraining.completed) === '[1]', 'Next did not advance exactly once');
  assert(!nextRequest.image, 'Old image leaked into the new example request');
  const boundaryMessage = afterNext.messages[afterNext.examTraining.startMessageIndex];
  assert(!boundaryMessage.imageName, 'New-example message falsely labels the old unsubmitted photo');
  await sendText('Нужна подсказка для второго примера.', fixture('Сравни числа второго примера.', 'understand'));
  assert(!(await page.evaluate(() => window.__examFixture.requests.at(-1))).image, 'Old image was reused by a later request in example 2');
  await page.getByRole('button', { name: 'Решить на листе', exact: true }).click();
  assert(await page.getByLabel('Условие или пояснение — по желанию', { exact: true }).inputValue() === '', 'Example 2 inherited example 1 sheet context');
  assert(await page.getByRole('button', { name: 'Проверить решение', exact: true }).isDisabled(), 'Example 2 inherited example 1 strokes');
  await page.getByRole('button', { name: 'Закрыть лист', exact: true }).click();
  await inkSheet('Черновик второго примера', true);
  const drafts = await page.evaluate(id => [1, 2].map(n => JSON.parse(localStorage.getItem(`cosmos-math-sheet-v1:${id}:exam-${n}`))), initial.id);
  assert(drafts[0].context === 'Черновик первого примера' && drafts[1].context === 'Черновик второго примера' && drafts.every(d => d.strokes.length > 0), 'Per-example persisted drafts are not independent');
  report.checks.push('next-increments-once-no-photo-leak-and-independent-per-example-drafts');
  await shot('02-second-example-isolated');

  await sendText('Проверь второй пример.', { ok: false, error: 'Контролируемый отказ транспорта QA.' });
  assert((await lesson()).examTraining.current === 2 && JSON.stringify((await lesson()).examTraining.completed) === '[1]', 'Failure changed series progress');
  const failed = await lesson(), failedRequest = await page.evaluate(() => window.__examFixture.requests.at(-1));
  await enqueue(fixture('Запрос восстановлен, лист второго примера ещё не отправлен.', 'understand'));
  await page.getByRole('button', { name: 'Повторить запрос', exact: true }).click();
  await done();
  const retried = await lesson(), retriedRequest = await page.evaluate(() => window.__examFixture.requests.at(-1));
  assert(retried.messages.filter(m => m.role === 'user').length === failed.messages.filter(m => m.role === 'user').length, 'Retry duplicated student request');
  assert(JSON.stringify(retriedRequest.messages) === JSON.stringify(failedRequest.messages), 'Retry changed request context');
  assert(retried.examTraining.current === 2 && JSON.stringify(retried.examTraining.completed) === '[1]', 'Retry counted a nonexistent review');
  report.checks.push('failed-request-and-retry-retain-number-history-and-review-count');

  await enqueue({ hold: true });
  await page.getByRole('textbox', { name: 'Сообщение Cosmos', exact: true }).fill('Ещё объяснение второго примера.');
  await page.getByRole('button', { name: 'Отправить сообщение', exact: true }).click();
  await page.waitForFunction(() => typeof window.__examFixture.held === 'function');
  await page.getByRole('button', { name: 'Остановить ответ', exact: true }).click();
  await done();
  const canceled = await lesson();
  await page.evaluate(() => window.__examFixture.held({ ok: true, text: 'ПОЗДНИЙ ОТМЕНЁННЫЙ ОТВЕТ QA', phase: 'review' }));
  await page.waitForTimeout(200);
  assert((await lesson()).messages.length === canceled.messages.length, 'Canceled late answer entered conversation');
  assert((await lesson()).examTraining.current === 2 && JSON.stringify((await lesson()).examTraining.completed) === '[1]', 'Cancel changed exam progress');
  await enqueue(fixture('Повтор после отмены сохранён.', 'understand'));
  await page.getByRole('button', { name: 'Повторить запрос', exact: true }).click();
  await done();
  assert((await lesson()).messages.filter(m => m.role === 'user').length === canceled.messages.filter(m => m.role === 'user').length, 'Retry after cancel duplicated student message');
  report.checks.push('cancel-ignores-late-response-and-retry-retains-current-example');
  await shot('03-cancel-and-retry');

  await page.getByRole('button', { name: 'Решить на листе', exact: true }).click();
  await enqueue({ ok: false, error: 'Контролируемая ошибка проверки листа QA.' });
  await page.getByRole('button', { name: 'Проверить решение', exact: true }).click();
  await done();
  const failedSheet = await page.evaluate(() => window.__examFixture.requests.at(-1));
  assert(failedSheet.image?.dataUrl !== firstRequest.image.dataUrl, 'Different current-example drawing reused the first sheet PNG');
  assert((await lesson()).examTraining.current === 2 && JSON.stringify((await lesson()).examTraining.completed) === '[1]', 'Failed sheet review falsely completed example');
  await enqueue(fixture('Лист второго примера проверен: ответ 9.', 'review'));
  await page.getByRole('button', { name: 'Повторить запрос', exact: true }).click();
  await done();
  const final = await lesson(), retrySheet = await page.evaluate(() => window.__examFixture.requests.at(-1));
  assert(retrySheet.image?.dataUrl === failedSheet.image?.dataUrl, 'Retry did not retain the actual second sheet image');
  assert(final.examTraining.current === 2 && JSON.stringify(final.examTraining.completed) === '[1,2]', 'Second successful sheet review did not count exactly once');
  const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem('exam-fixture-state')));
  assert(Object.values(snapshot.sessions).every(s => (s.attempts?.length ?? 0) === 0), 'Fixture review fabricated independently assessed learning attempts');
  assert(JSON.stringify(snapshot.progress) === initialProgress, 'Model review changed independently measured topic mastery');
  report.checks.push('failed-sheet-retains-image-and-successful-retry-adds-only-current-review');
  report.finalTraining = final.examTraining;
  report.requests = await page.evaluate(() => window.__examFixture.requests.map((request, index) => ({ index: index + 1, subject: request.subject, model: request.model, imageName: request.image?.name, imageBytes: request.image?.dataUrl.length ?? 0, lastMessage: request.messages.at(-1)?.content, hasUnrelatedModuleContext: request.instructions.includes('Модуль числа и расстояние') })));
  report.cancellations = await page.evaluate(() => window.__examFixture.cancellations);
  await shot('04-second-sheet-reviewed');
  report.pass = report.errors.length === 0;
  assert(report.pass, 'Browser runtime errors');
} catch (error) {
  report.failure = String(error); process.exitCode = 1;
  if (page) report.currentState = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('exam-fixture-state') || 'null');
    const lesson = Object.values(state?.cloudSessions || {}).find(value => value.examTraining);
    return { lesson, lastRequest: window.__examFixture?.requests.at(-1) && { image: !!window.__examFixture.requests.at(-1).image, lastMessage: window.__examFixture.requests.at(-1).messages.at(-1) } };
  }).catch(() => undefined);
  await page?.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  await browser?.close(); await server?.close();
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify({ pass: report.pass, checks: report.checks, failure: report.failure, screenshots: report.screenshots, errors: report.errors }, null, 2));
}
