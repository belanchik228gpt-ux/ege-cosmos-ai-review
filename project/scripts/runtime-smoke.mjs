import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { LocalModel } = require('../desktop/local-model.cjs');
const qa = resolve(import.meta.dirname, '../runtime/qa');
await mkdir(qa, { recursive: true });
const logs = [],
  model = new LocalModel({
    runtimeDir: resolve(import.meta.dirname, '../runtime'),
    userData: qa,
    log: (scope, message) => {
      logs.push({ at: new Date().toISOString(), scope, message });
      console.log(scope, message);
    },
  });
const results = [];
try {
  console.log('Status:', await model.status());
  for (const request of [
    {
      subject: 'math',
      topic: 'Площадь прямоугольника',
      message:
        'Меня зовут Вова. Я не знаю, как найти площадь прямоугольника 6 на 4. Дай первый шаг, не говори готовый результат.',
      context: 'Ученик только начал тему. Никаких самостоятельных ответов ещё нет.',
    },
    {
      subject: 'russian',
      topic: 'Запятая в сложном предложении',
      message:
        'Почему нужна запятая в предложении «Когда наступил вечер, мы вернулись домой»? Объясни коротко и задай один вопрос.',
    },
  ]) {
    const started = Date.now(),
      response = await model.ask(request);
    const result = { subject: request.subject, elapsedTotalMs: Date.now() - started, ...response };
    results.push(result);
    console.log(JSON.stringify(result));
    if (!response.ok) break;
  }
} finally {
  model.stop();
  await writeFile(
    resolve(qa, 'model-smoke.json'),
    JSON.stringify({ date: new Date().toISOString(), results, logs }, null, 2),
  );
}
if (results.length !== 2 || results.some((r) => !r.ok)) process.exitCode = 1;
