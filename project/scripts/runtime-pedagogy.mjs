import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { LocalModel } = require('../desktop/local-model.cjs');
const qa = resolve(import.meta.dirname, '../runtime/qa');
await mkdir(qa, { recursive: true });
const requests = [
  {
    id: 'math-hint',
    subject: 'math',
    topic: 'Площадь прямоугольника',
    message: 'Не знаю, как найти площадь прямоугольника 6 на 4. Дай только первый шаг, не ответ.',
    context:
      'Проверенный материал: площадь прямоугольника S = a · b. В прямоугольнике длиной 6 см и шириной 4 см четыре ряда по шесть единичных квадратов.',
  },
  {
    id: 'math-error',
    subject: 'math',
    topic: 'Площадь прямоугольника',
    message: 'Я сложил 6 + 4 и получил площадь 10 см². Это правильно?',
    context:
      'Проверенное условие: прямоугольник длиной 6 см и шириной 4 см. Площадь S = a · b; длины сторон не складывают для площади.',
  },
  {
    id: 'russian-comma',
    subject: 'russian',
    topic: 'Сложноподчинённое предложение',
    message: 'Почему нужна запятая: «Когда наступил вечер, мы вернулись домой»?',
    context:
      'Проверенный материал: «Когда наступил вечер» — придаточная часть времени. «Мы вернулись домой» — главная часть. Придаточная часть отделяется запятой.',
  },
  {
    id: 'russian-off-topic',
    subject: 'russian',
    topic: 'Сложноподчинённое предложение',
    message: 'Давай лучше рецепт пиццы на десять человек, сейчас не хочу русский.',
    context:
      'Ученик занимается пунктуацией. Можно спокойно предложить короткий учебный шаг; нельзя выдумывать учебные результаты.',
  },
  {
    id: 'history-988',
    subject: 'history',
    topic: 'Крещение Руси',
    message: 'Не знаю, с каким князем связано Крещение Руси. Помоги вспомнить.',
    context:
      'Проверенный материал: Крещение Руси традиционно датируется 988 годом и связывается с князем Владимиром Святославичем. Киев — один из центров события. Не раскрывай всё сразу.',
  },
  {
    id: 'history-error',
    subject: 'history',
    topic: 'Отмена крепостного права',
    message: 'Я запомнил, что крепостное право отменил Александр II в 1862 году. Верно?',
    context:
      'Проверенный материал: Манифест об отмене крепостного права подписан Александром II 19 февраля 1861 года по старому стилю, 3 марта по новому. Традиционный учебный год — 1861.',
  },
  {
    id: 'social-mobility',
    subject: 'social',
    topic: 'Социальная мобильность',
    message: 'Рабочий стал директором завода. Какая это мобильность?',
    context:
      'Проверенный материал: вертикальная социальная мобильность меняет положение в иерархии. Восходящая — повышение социального статуса. Горизонтальная — изменение позиции без изменения уровня статуса.',
  },
  {
    id: 'social-demand',
    subject: 'social',
    topic: 'Спрос',
    message: 'Если тетради подорожали, люди всегда купят их больше?',
    context:
      'Проверенный материал: при прочих равных повышение цены обычно снижает величину спроса. Спрос и величина спроса различаются; доходы, предпочтения и другие факторы могут менять сам спрос.',
  },
];
const logs = [],
  model = new LocalModel({
    runtimeDir: resolve(import.meta.dirname, '../runtime'),
    userData: qa,
    log: (scope, message) => logs.push({ scope, message }),
  }),
  results = [];
try {
  for (const request of requests) {
    const started = Date.now(),
      response = await model.ask(request);
    results.push({
      ...request,
      ...response,
      elapsedTotalMs: Date.now() - started,
      questionCount: (response.text?.match(/\?/g) || []).length,
      endsWithQuestion: !!response.text?.trim().endsWith('?'),
    });
    console.log(
      request.id,
      response.ok,
      results.at(-1).questionCount,
      response.text || response.error,
    );
  }
} finally {
  model.stop();
  const output = {
    checkedAt: new Date().toISOString(),
    model: 'Qwen3-8B-Q4_K_M',
    method:
      'Eight real local requests to one process, changing subject with explicit scoped context. Not synthetic responses.',
    results,
    logs,
  };
  await writeFile(resolve(qa, 'model-pedagogy.json'), JSON.stringify(output, null, 2));
  await writeFile(
    resolve(import.meta.dirname, '../docs/verification/model-pedagogy.json'),
    JSON.stringify(output, null, 2),
  );
}
if (results.length !== requests.length || results.some((r) => !r.ok)) process.exitCode = 1;
