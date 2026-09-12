import type { Task, Topic } from './types';
import type { TeachingStep } from './teaching-types';
import type { TeachingVisual } from './teaching-visual';

/** Small, parameterized teaching examples. The shared conversation informed the pedagogy,
 * not an imported transcript or an official examination problem. */
const expression = (...lines: Array<[string, string, string]>): TeachingVisual => ({
  kind: 'expression',
  workedExample: true,
  lines: lines.map(([text, focus, explanation]) => ({ text, focus, explanation })),
});
const q = (prompt: string, answer: string, accepted: string[] = []) => ({
  prompt,
  answer,
  accepted,
  kind: 'text' as const,
  answerMeaning: 'expression' as const,
});
function subtraction(id: string): TeachingStep {
  return {
    id,
    concept: 'expression-value',
    title: 'Что означает «чему равно»',
    explanation:
      '«Чему равно» — это «какое число получится». При вычитании порядок важен. В примере 2 − 4 начинаем с 2 и делаем четыре шага влево: через ноль к отрицательным числам. Теперь попробуем с другими числами.',
    question: {
      prompt: 'Сколько будет 3 − 5?',
      answer: '-2',
      accepted: ['минус 2', 'минус два'],
      kind: 'number',
      answerMeaning: 'value',
    },
    visual: { kind: 'subtraction', start: 2, subtract: 4, workedExample: true },
    success: '3 − 5 = −2. Порядок вычитания сохранили. Вернёмся к выражению с буквой.',
  };
}

/** Every primary question may pause for the same prerequisite without copying its implementation. */
function withValuePrerequisite(steps: TeachingStep[]): TeachingStep[] {
  return steps.map((step) =>
    step.detours?.some((detour) => detour.concept === 'expression-value')
      ? step
      : {
          ...step,
          detours: [...(step.detours ?? []), subtraction(`${step.id}-value-meaning`)],
        },
  );
}
function signStep(
  id: string,
  a: number,
  positive = false,
  allowZeroNegative = false,
): TeachingStep {
  const term = positive ? `x + ${a}` : `x − ${a}`;
  return {
    id,
    title: 'Сначала знак внутри модуля',
    explanation: positive
      ? `Условие x ≥ −${a} означает: x не меньше −${a}. Прибавление одного числа к обеим сторонам сохраняет сравнение. Проверим на самом маленьком разрешённом x.`
      : allowZeroNegative
        ? `Условие x ≤ ${a} разрешает и меньшие числа, и само ${a}. Разность x − ${a} не больше нуля; при равенстве границе она равна нулю.`
        : `Мы не ищем значение x. Сравниваем x с ${a}. Если из меньшего числа вычесть большее, получится отрицательное число. На доске — отдельный числовой пример.`,
    question: {
      prompt: positive
        ? `При x ≥ −${a} выражение ${term} отрицательное или неотрицательное?`
        : allowZeroNegative
          ? `При x ≤ ${a} выражение ${term} положительное или неположительное?`
          : `При x < ${a} выражение ${term} положительное или отрицательное?`,
      answer: positive
        ? 'неотрицательное'
        : allowZeroNegative
          ? 'неположительное'
          : 'отрицательное',
      accepted: positive
        ? [
            'неотрицательно',
            'больше или равно нулю',
            'не меньше нуля',
            'не может быть отрицательным',
          ]
        : allowZeroNegative
          ? ['неположительно', 'меньше или равно нулю', 'не больше нуля', 'отрицательное или ноль']
          : ['отрицательно', 'отрицательный', 'минус', 'отрицательное потому что x меньше ' + a],
      kind: 'text',
      answerMeaning: 'sign',
    },
    visual: positive
      ? expression(
          ['y ≥ −3', '−3', 'Берём наименьшее разрешённое значение.'],
          ['y + 3 ≥ −3 + 3', '+ 3', 'Прибавляем одно и то же число.'],
          ['y + 3 ≥ 0', '≥ 0', 'Результат не меньше нуля.'],
        )
      : allowZeroNegative
        ? expression(
            ['y ≤ 3', '≤', 'Отдельный пример включает равенство.'],
            ['y − 3 ≤ 0', '≤ 0', 'После вычитания трёх результат не больше нуля.'],
            ['3 − 3 = 0', '= 0', 'На границе получается ноль.'],
          )
        : { kind: 'subtraction', start: 2, subtract: 4, workedExample: true },
    detours: [subtraction(`${id}-subtract`)],
    success: positive
      ? 'Верно: внутри модуля число не меньше нуля.'
      : allowZeroNegative
        ? 'Да, выражение внутри модуля не больше нуля. На границе оно равно нулю, в остальных разрешённых точках отрицательно.'
        : 'Да, выражение внутри модуля отрицательное. Сам x при этом не обязан быть отрицательным.',
  };
}
function removeModule(
  id: string,
  a: number,
  positive = false,
  allowZeroNegative = false,
): TeachingStep {
  return {
    id,
    title: 'Модуль сохраняет расстояние',
    explanation:
      (allowZeroNegative
        ? `Из x ≤ ${a} следует x − ${a} ≤ 0. При нуле смена знака тоже работает: −0 = 0. `
        : '') +
      'Модуль должен дать неотрицательное значение. Неотрицательное выражение оставляем; у отрицательного меняем знак всего выражения. Минус перед скобкой пока не меняет запись внутри неё.',
    question: positive
      ? q(`Убери модуль |x + ${a}| при x ≥ −${a}.`, `x+${a}`, [`x + ${a}`, `х+${a}`])
      : q(
          `Убери модуль |x − ${a}| при x ${allowZeroNegative ? '≤' : '<'} ${a}. Можно пока оставить скобки.`,
          `-(x-${a})`,
          [`−(x − ${a})`, `-х+${a}`, `-x+${a}`, `${a}-x`, `${a}-х`],
        ),
    visual: positive
      ? expression(
          ['|3|', '3', 'Число внутри неотрицательное.'],
          ['3', '3', 'Значение оставляем без изменения.'],
          ['|0| = 0', '0', 'Для нуля это правило тоже работает.'],
        )
      : expression(
          ['|−3|', '−3', 'Число внутри отрицательное.'],
          ['−(−3)', '−(', 'Берём противоположное всему числу.'],
          ['3', '3', 'Получили расстояние до нуля.'],
        ),
    detours: [signStep(`${id}-sign`, a, positive, allowZeroNegative)],
    success: 'Это равное выражение без модуля. Мы изменили запись, а не нашли x.',
  };
}
function brackets(id: string, a: number): TeachingStep {
  return {
    id,
    title: 'Минус перед всей скобкой',
    explanation:
      'Минус перед скобкой — умножение каждого слагаемого на −1. У каждого слагаемого меняется знак. Переставлять части не обязательно: запись с −x в начале тоже верна.',
    question: q(`Раскрой скобки: −(x − ${a}).`, `-x+${a}`, [
      `−x + ${a}`,
      `${a}-x`,
      `${a}-х`,
      `-х+${a}`,
    ]),
    visual: expression(
      ['−(y − 3)', '−(', 'Минус относится ко всей скобке.'],
      ['−y + 3', '+ 3', 'Поменялись оба знака.'],
      ['3 − y', '− y', 'Можно переставить слагаемые вместе со знаками.'],
    ),
    detours: [
      {
        id: `${id}-reorder`,
        title: 'Почему можно переставить слагаемые',
        explanation:
          'В сумме знак принадлежит слагаемому. В −3 + 8 переставляем целые слагаемые −3 и +8: получаем 8 + (−3). Минус остаётся при тройке.',
        question: q('Запиши −2 + 9, поставив 9 первым и сохранив знаки.', '9-2', [
          '9 − 2',
          '9+(-2)',
        ]),
        visual: expression(
          ['−3 + 8', '−3', 'Два слагаемых: −3 и +8.'],
          ['8 + (−3)', '−3', 'Переставляем вместе со знаком.'],
          ['8 − 3', '− 3', 'Это та же сумма.'],
        ),
      },
    ],
    success: `−x + ${a} и ${a} − x — равные записи. Обе подходят.`,
  };
}
function squareToModule(id: string, inside: string): TeachingStep {
  return {
    id,
    title: 'Корень из квадрата',
    explanation:
      'Квадратный корень означает неотрицательное число. Поэтому корень из квадрата выражения равен его модулю. Само выражение внутри может быть отрицательным — просто зачеркнуть корень и квадрат нельзя.',
    question: q(`Запиши √((${inside})²) через модуль. Пока не убирай модуль.`, `|${inside}|`, [
      `|${inside.replace(/x/g, 'х')}|`,
    ]),
    visual: expression(
      ['√((−4)²)', '−4', 'Сначала возводим отрицательное число в квадрат.'],
      ['√16', '16', 'Под корнем теперь неотрицательное число.'],
      ['4 = |−4|', '|−4|', 'Корень выбирает неотрицательный результат.'],
    ),
  };
}
function recognizeSquare(id: string, a: number, positive: boolean): TeachingStep {
  const sign = positive ? '+' : '−';
  return {
    id,
    title: 'Узнаём квадрат скобки',
    explanation:
      'Квадрат суммы даёт три слагаемых: квадрат первого, удвоенное произведение и квадрат второго. Проверяем все три, особенно середину. Свободный член должен получиться из квадрата постоянного числа в скобке; одна постоянная без x не заменяет всю скобку.',
    question: q(
      `x² ${sign} ${2 * a}x + ${a * a} = ( … )². Что будет внутри скобки?`,
      `x${positive ? '+' : '-'}${a}`,
      [
        `(x${positive ? '+' : '-'}${a})²`,
        `(x${positive ? '+' : '-'}${a})2`,
        `(x${positive ? '+' : '-'}${a})^2`,
        `(х${positive ? '+' : '-'}${a})2`,
      ],
    ),
    visual: expression(
      ['(y + 3)(y + 3)', 'y + 3', 'Квадрат — умножение скобки на себя.'],
      ['y² + 3y + 3y + 9', '3y + 3y', 'Умножаем каждое слагаемое на каждое.'],
      ['y² + 6y + 9', '6y', 'Середина — удвоенное произведение.'],
    ),
  };
}
const terminal = (step: TeachingStep): TeachingStep => ({ ...step, completesTask: true });
function polynomialTask(id: string, a: number, positive: boolean): Task {
  const inside = `x${positive ? '+' : '-'}${a}`;
  const answer = positive ? inside : `${a}-x`;
  return {
    id,
    prompt: `Упрости √(x² ${positive ? '+' : '−'} ${2 * a}x + ${a * a}), если x ${positive ? '≥ −' : '< '}${a}.`,
    answer,
    accepted: [answer.replace('x', 'х'), ...(positive ? [] : [`-x+${a}`, `-х+${a}`, `-(x-${a})`])],
    kind: 'text',
    answerMeaning: 'expression',
    hint: 'Сначала узнай квадрат скобки под корнем. Затем перейди к модулю и проверь знак выражения.',
    explanation: `Под корнем (${inside})². Корень равен |${inside}|. Условие позволяет убрать модуль: ${answer}.`,
    teachingSteps: [
      recognizeSquare(`${id}-square`, a, positive),
      squareToModule(`${id}-module`, inside),
      signStep(`${id}-sign`, a, positive),
      ...(positive
        ? [terminal(removeModule(`${id}-remove`, a, true))]
        : [removeModule(`${id}-remove`, a, false), terminal(brackets(`${id}-brackets`, a))]),
    ],
  };
}

export const radicalTopic: Topic = {
  id: 'math-radicals',
  subject: 'math',
  title: 'Корни, модуль и знаки выражений',
  description:
    'От корня из квадрата — к выражениям с x. Можно остановиться на любом непонятном действии.',
  sceneId: 'math-radicals',
  durationMinutes: 35,
  explanation:
    'Пойдём маленькими шагами: смысл корня, знак выражения, раскрытие модуля и скобок. Если станет непонятно, временно возьмём простой пример и вернёмся к задаче.',
  known: 'Знак квадратного корня обозначает неотрицательный результат.',
  goal: 'Преобразовывать выражения с корнями и модулем, объясняя каждый переход.',
  firstStep: 'Отделить выражение под корнем от его значения после извлечения корня.',
  formula: '√(a²) = |a|. При a < 0: |a| = −a; при a ≥ 0: |a| = a.',
  question: 'Чем отличается значение выражения от количества корней уравнения?',
  sourceId: 'cosmos-training',
  sourceIds: ['cosmos-training', 'openstax-roots', 'openstax-special-products'],
  materialStatus: 'training',
  version: '2026.09.08.4',
  tasks: (
    [
      {
        id: 'radicals-1',
        prompt: 'Вычисли √((−5)²).',
        answer: '5',
        kind: 'number',
        answerMeaning: 'value',
        hint: 'Сначала возведи число в квадрат. Затем найди неотрицательное число, квадрат которого совпадает с результатом.',
        explanation: '(−5)² = 25, а √25 = 5. Корень выбирает неотрицательное значение.',
        teachingSteps: [
          {
            id: 'radicals-1-square',
            title: 'Сначала квадрат',
            explanation:
              'Квадрат означает умножение числа на само себя. Произведение двух отрицательных чисел положительно. На доске отдельный пример с четвёркой.',
            question: {
              prompt: 'Сколько будет (−5) · (−5)?',
              answer: '25',
              kind: 'number',
              answerMeaning: 'value',
            },
            visual: expression(
              ['(−4)²', '−4', 'Квадрат — число умножить на себя.'],
              ['(−4) · (−4)', '·', 'Два отрицательных множителя.'],
              ['16', '16', 'Их произведение положительно.'],
            ),
          },
          {
            id: 'radicals-1-root',
            title: 'Корень выбирает неотрицательное',
            explanation:
              'У квадрата могут быть два противоположных прообраза. Но знак √ обозначает именно неотрицательное значение. Поэтому важно различать √25 и уравнение x² = 25.',
            question: {
              prompt: 'Значение квадратного корня должно быть отрицательным или неотрицательным?',
              answer: 'неотрицательным',
              accepted: ['неотрицательное', 'неотрицательным или ноль'],
              kind: 'text',
              answerMeaning: 'sign',
            },
            visual: expression(
              ['√16', '√', 'Ищем неотрицательное число.'],
              ['4 · 4 = 16', '4', 'Проверяем квадрат.'],
              ['√16 = 4', '4', 'Для примера с шестнадцатью выбрана четвёрка.'],
            ),
          },
        ],
      },
      {
        id: 'radicals-2',
        prompt: 'Упрости √((x − 6)²), если x < 6.',
        answer: '6-x',
        accepted: ['6-х', '-x+6', '-х+6', '-(x-6)'],
        kind: 'text',
        answerMeaning: 'expression',
        hint: 'Сначала замени корень из квадрата модулем. Затем учти условие x < 6.',
        explanation: '√((x−6)²) = |x−6| = −(x−6) = −x+6 = 6−x.',
        teachingSteps: [
          squareToModule('radicals-2-module', 'x-6'),
          signStep('radicals-2-sign', 6),
          removeModule('radicals-2-remove', 6),
          terminal(brackets('radicals-2-brackets', 6)),
        ],
      },
      polynomialTask('radicals-3', 4, true),
      polynomialTask('radicals-4', 7, false),
      {
        id: 'radicals-5',
        prompt: 'Упрости √(x² + 4x + 4) + √(x² − 10x + 25), если −2 ≤ x ≤ 5.',
        answer: '7',
        kind: 'number',
        answerMeaning: 'value',
        hint: 'Разбери два корня отдельно. Левая и правая границы условия помогут выбрать знак каждого выражения.',
        explanation: 'Получаем |x+2| + |x−5| = x+2−x+5 = 7.',
        teachingSteps: [
          recognizeSquare('radicals-5-first', 2, true),
          recognizeSquare('radicals-5-second', 5, false),
          removeModule('radicals-5-left', 2, true),
          removeModule('radicals-5-right', 5, false, true),
          {
            id: 'radicals-5-collect',
            completesTask: true,
            title: 'Собираем слагаемые',
            explanation:
              'Слагаемые +x и −x противоположны: их сумма равна нулю. Складывать числа и слагаемые с x удобнее отдельно.',
            question: {
              prompt: 'Какое выражение получится из x + 2 − x + 5?',
              answer: '7',
              kind: 'number',
              answerMeaning: 'value',
            },
            visual: expression(
              ['y + 3 − y + 6', 'y', 'Отдельный пример: буквы и числа.'],
              ['(y − y) + (3 + 6)', 'y − y', 'Противоположные слагаемые дают ноль.'],
              ['0 + 9', '9', 'Остаётся сумма чисел.'],
            ),
          },
        ],
      },
      {
        id: 'radicals-6',
        prompt: 'Упрости √(x² − 10x + 25) / (x − 5), если x < 5.',
        answer: '-1',
        accepted: ['минус один', '−1'],
        kind: 'number',
        answerMeaning: 'value',
        hint: 'Сначала преобразуй только числитель. После раскрытия модуля сохрани скобки, чтобы увидеть общий множитель.',
        explanation:
          'Числитель равен |x−5| = −(x−5). Так как x < 5, знаменатель не равен нулю. Сокращение даёт −1.',
        teachingSteps: [
          recognizeSquare('radicals-6-square', 5, false),
          squareToModule('radicals-6-module', 'x-5'),
          signStep('radicals-6-sign', 5),
          removeModule('radicals-6-remove', 5),
          {
            id: 'radicals-6-cancel',
            completesTask: true,
            title: 'Сокращаем только общий множитель',
            explanation:
              'При сокращении отношение одинаковых ненулевых множителей заменяется единицей. Другие множители, в том числе минус, сохраняются. В задаче x < 5, значит x − 5 не равно нулю.',
            question: q('Что остаётся от −a/a, если a ≠ 0?', '-1', ['−1', 'минус один']),
            visual: expression(
              ['−8 · 3 / 3', '3 / 3', 'Отдельный числовой пример.'],
              ['−8 · 1', '−8', 'Тройки сократились. Остальные множители сохраняем.'],
              ['−8', '−8', 'Минус никуда не исчез.'],
            ),
          },
        ],
      },
    ] satisfies Task[]
  ).map((task) => ({ ...task, teachingSteps: withValuePrerequisite(task.teachingSteps ?? []) })),
};
