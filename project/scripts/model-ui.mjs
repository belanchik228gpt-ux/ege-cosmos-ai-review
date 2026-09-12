import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = process.cwd(),
  profile = path.join(root, 'test-results/model-ui-' + Date.now());
const launchEnv = { ...process.env, COSMOS_USER_DATA: profile };
if (process.env.COSMOS_EXE) delete launchEnv.COSMOS_RUNTIME_DIR;
else launchEnv.COSMOS_RUNTIME_DIR = path.join(root, 'runtime');
const app = await electron.launch({
  executablePath: process.env.COSMOS_EXE || path.join(root, 'release/win-unpacked/EGE Cosmos.exe'),
  args: [],
  env: launchEnv,
  timeout: 45000,
});
const page = await app.firstWindow();
const results = [];
let failure = null;
try {
  results.push({
    environment: await page.evaluate(() => window.cosmos.getAppInfo()),
    status: await page.evaluate(() => window.cosmos.modelStatus()),
    appAsarSha256: createHash('sha256')
      .update(
        await fs.readFile(
          path.join(
            path.dirname(
              process.env.COSMOS_EXE || path.join(root, 'release/win-unpacked/EGE Cosmos.exe'),
            ),
            'resources/app.asar',
          ),
        ),
      )
      .digest('hex'),
  });
  await page.getByPlaceholder('Твоё имя').fill('Алексей');
  await page.getByRole('button', { name: 'Начнём знакомство' }).click();
  await page
    .getByRole('navigation', { name: 'Предметы' })
    .getByRole('button', { name: 'Математика', exact: true })
    .click();
  await page.locator('.topic-card').filter({ hasText: 'Площадь прямоугольника' }).click();
  await page.getByRole('button', { name: 'Спросить Cosmos', exact: true }).click();
  for (const text of [
    'Я забыл, что такое площадь. Объясни один первый шаг и задай мне вопрос.',
    'Почему площадь измеряют в квадратных сантиметрах?',
  ]) {
    await page.getByRole('button', { name: /^Шаг 1:/ }).click();
    const before = await page.locator('.message').count(),
      started = Date.now();
    await page.getByRole('textbox', { name: 'Сообщение Cosmos' }).fill(text);
    await page.getByRole('button', { name: 'Отправить сообщение' }).click();
    const sceneBefore = await page.locator('.sc-counter').innerText();
    await page.getByRole('button', { name: 'Следующий шаг', exact: true }).click();
    assert.notEqual(await page.locator('.sc-counter').innerText(), sceneBefore);
    const inferencePending = (await page.locator('.thinking').count()) > 0;
    await page.getByRole('button', { name: 'Мой ответ', exact: true }).click();
    await page.getByRole('textbox', { name: 'Сообщение Cosmos' }).fill('21');
    assert(await page.getByRole('button', { name: 'Отправить сообщение' }).isEnabled());
    await page.getByRole('textbox', { name: 'Сообщение Cosmos' }).fill('');
    await page.getByRole('button', { name: 'Спросить Cosmos', exact: true }).click();
    await page.waitForFunction(
      (n) => document.querySelectorAll('.message').length >= n + 2,
      before,
      { timeout: 175000 },
    );
    const last = await page.locator('.message').last().innerText();
    results.push({
      question: text,
      response: last,
      elapsedMs: Date.now() - started,
      practiceInputAvailableWhileInferencePending: inferencePending,
    });
    assert(
      last.includes('ЛОКАЛЬНАЯ МОДЕЛЬ'),
      'Actual model response required; labelled learning-material fallback is not a model PASS',
    );
    assert(last.length > 50);
  }
  await page.getByRole('button', { name: /Шаг 9:/ }).click();
  await page.waitForTimeout(1800);
  await page.screenshot({
    path: 'docs/screenshots/12-local-model-dialogue.png',
    fullPage: true,
  });
  await page.locator('.message-evidence').last().locator('summary').click();
  await page.locator('.message-evidence').last().screenshot({
    path: 'docs/screenshots/13-model-source-check.png',
  });
  await page.waitForFunction(
    () => !localStorage.getItem('ege-cosmos-v1-pending'),
    {},
    { timeout: 10000 },
  );
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => window.cosmos.loadState());
  const session = Object.values(state.sessions).find((s) => s.subject === 'math');
  assert.equal(session.messages.filter((m) => m.kind === 'model').length, 2);
  assert(
    session.messages
      .filter((m) => m.kind === 'model')
      .every(
        (m) =>
          m.verification?.method === 'local-model-review' && m.verification.evidence.length > 0,
      ),
  );
  assert.equal(state.progress['math-rectangle'].attempts.length, 0);
  assert(session.hintsUsed > 0);
  results.push({
    check:
      'Two actual model replies passed required evidence review and persisted exact fragments; no attempts or mastery added; next answer marked assisted',
    pass: true,
  });
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  failure = {
    message: error.message,
    diagnostics: await page.evaluate(() => window.cosmos.getDiagnostics()).catch(() => []),
  };
  await page
    .screenshot({ path: 'test-results/model-ui-failure.png', fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await fs.mkdir('docs/verification', { recursive: true });
  await fs.writeFile(
    'docs/verification/model-ui.json',
    JSON.stringify(
      { at: new Date().toISOString(), status: failure ? 'fail' : 'pass', results, failure },
      null,
      2,
    ),
  );
  await app.close();
}
