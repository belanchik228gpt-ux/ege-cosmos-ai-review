import type { Session, Task, Message } from './types';
import type { ProblemSession } from './problem-sessions';
import type { TeachingStep } from './teaching-types';
import type { TeachingVisual } from './teaching-visual';
import {
  parseProblem,
  checkProblemAnswer,
  verifyProblem,
  formatProblemNumber,
  type ProblemSpec,
} from './problem-workbench';
import {
  getTeachingContext,
  handleTeachingTurn,
  hydrateTeachingState,
  interpretTeachingInput,
  selectTeachingStep,
} from './teaching';

const n = formatProblemNumber;
const expression = (...lines: string[]): TeachingVisual => ({
  kind: 'expression',
  lines: lines
    .filter((text) => text.length <= 64)
    .slice(0, 6)
    .map((text) => ({ text })),
});
const q = (
  prompt: string,
  answer: string,
  accepted: string[] = [],
  numeric = false,
): TeachingStep['question'] => ({
  prompt,
  answer,
  accepted,
  kind: numeric ? 'number' : 'text',
  answerMeaning: numeric ? 'value' : 'text',
});
const exactCalculation = (text: string) => {
  const calculated = parseProblem(text);
  if (!calculated.verified) throw new Error('Invalid local teaching calculation');
  return calculated.expectedAnswer;
};
const say = (text: string, kind = 'feedback'): Message => ({
  id: crypto.randomUUID(),
  role: 'cosmos',
  text,
  kind,
});

/** Only the verified parser supplies parameters and answers. No model-authored teaching blueprint. */
export function createProblemTask(problem: ProblemSpec): Task {
  const task: Task = {
    id: problem.id,
    prompt: problem.question || problem.confirmedText,
    answer: problem.expectedAnswer,
    hint: 'Разберём условие по одному проверяемому действию.',
    explanation: problem.explanation,
    kind: Array.isArray(problem.parameters.roots) ? 'text' : 'number',
    answerMeaning: Array.isArray(problem.parameters.roots) ? 'text' : 'value',
    teachingSteps: [],
  };
  if (!problem.verified || !verifyProblem(problem).valid) return task;
  const p = problem.parameters;
  const steps: TeachingStep[] = [];
  const add = (
    id: string,
    title: string,
    explanation: string,
    question: TeachingStep['question'],
    visual: TeachingVisual,
    success?: string,
  ) => steps.push({ id, title, explanation, question, visual, ...(success ? { success } : {}) });
  const final = (explanation: string, visual: TeachingVisual, prompt = problem.question) => {
    add(
      'own-final',
      'Твой итоговый шаг',
      explanation,
      {
        ...q(prompt, problem.expectedAnswer, [], task.kind === 'number'),
        answerMeaning: task.answerMeaning,
      },
      visual,
      'Итог совпадает с локальной проверкой твоего условия.',
    );
    steps.at(-1)!.completesTask = true;
  };
  if (problem.kind === 'rectangle') {
    const a = Number(p.a),
      b = Number(p.b);
    const integral = Number.isInteger(a) && Number.isInteger(b);
    add(
      'own-rectangle-rows',
      integral ? 'Читаем ряды клеток' : 'Две стороны прямоугольника',
      integral
        ? `Длина ${n(a)} задаёт количество единичных клеток в одном ряду. Поперечный размер ${n(b)} задаёт количество таких рядов. Пока не считаем площадь целиком.`
        : 'Площадь описывает внутреннюю область. Для неё нужны длины двух соседних сторон в одинаковых единицах.',
      q(
        integral ? 'Сколько клеток находится в одном ряду?' : 'Какова длина первой стороны a?',
        n(a),
        [],
        true,
      ),
      expression(`a = ${n(a)}`, `b = ${n(b)}`),
    );
    add(
      'own-rectangle-operation',
      'Почему умножаем',
      'Умножение заменяет повторное сложение одинаковых слагаемых. Для целых размеров мы берём клетки одного ряда столько раз, сколько рядов. Для дробных размеров формула площади также равна произведению сторон. Сумма только двух сторон не считает всю внутреннюю область.',
      q(
        'Какое действие связывает две стороны при вычислении площади: сложение или умножение?',
        'умножение',
        ['умножить', 'перемножить', 'произведение'],
      ),
      expression('S = a · b', `S = ${n(a)} · ${n(b)}`),
    );
    final(
      'Теперь выполни выбранное умножение по своим размерам.',
      expression(`${n(a)} · ${n(b)} = ?`),
    );
  } else if (problem.kind === 'triangle') {
    const a = Number(p.a),
      h = Number(p.b);
    add(
      'own-triangle-height',
      'Высота к нужному основанию',
      'Высота — перпендикуляр к линии выбранного основания. Произвольная боковая сторона не заменяет высоту. В условии высота уже дана.',
      q('Какова указанная высота h?', n(h), [], true),
      expression(`a = ${n(a)}`, `h = ${n(h)}`),
    );
    add(
      'own-triangle-half',
      'Почему берём половину',
      'Две одинаковые копии треугольника составляют параллелограмм с теми же основанием и высотой. Его площадь равна произведению основания и высоты; один треугольник занимает половину.',
      q('На какое число нужно разделить произведение основания и высоты?', '2', ['два'], true),
      expression('S = a · h / 2', `S = ${n(a)} · ${n(h)} / 2`),
    );
    final(
      'Сначала умножь основание на высоту, затем возьми половину произведения.',
      expression(`${n(a)} · ${n(h)} / 2 = ?`),
    );
  } else if (problem.kind === 'percent') {
    const base = Number(p.base),
      rate = Number(p.rate);
    add(
      'own-percent-whole',
      'Находим целое',
      'За сто процентов принимаем всё исходное число. Процент описывает долю именно этого целого.',
      q('Какое число в условии принято за 100%?', n(base), [], true),
      expression(`100% ↔ ${n(base)}`, `${n(rate)}% ↔ ?`),
    );
    add(
      'own-percent-hundredth',
      'Смысл одного процента',
      'Один процент — одна сотая целого. Чтобы получить сотую часть, разделим целое на сто.',
      q('На какое число делят целое, чтобы найти 1%?', '100', ['сто'], true),
      expression(`1% ↔ ${n(base)} / 100`),
    );
    final(
      `Нужно взять ${n(rate)} сотых исходного целого. Выполни вычисление, не меняя число из условия.`,
      expression(`${n(base)} · ${n(rate)} / 100 = ?`),
    );
  } else if (problem.kind === 'absolute') {
    const center = Number(p.center),
      radius = Number(p.radius);
    const visual: TeachingVisual =
      Math.abs(center) <= 1000 && Math.abs(radius) <= 1000
        ? radius < 0
          ? { kind: 'negative-radius', center, radius }
          : { kind: 'shifted-modulus', center, radius }
        : expression('|x − c| = r', `c = ${n(center)}`, `r = ${n(radius)}`);
    add(
      'own-absolute-center',
      'Откуда считаем расстояние',
      'В записи |x − c| буква c обозначает координату центра. Если внутри стоит плюс, перепиши его как вычитание отрицательного числа. Пока называем центр, а не корни.',
      {
        ...q('Какова координата центра c в твоём условии?', n(center), [], true),
        answerMeaning: 'coordinate',
      },
      visual,
    );
    add(
      'own-absolute-distance',
      'Знак расстояния',
      'Модуль разности измеряет длину пути. Направление может быть влево или вправо, но длина не бывает отрицательной.',
      q('Может ли расстояние быть отрицательным?', 'нет', ['не может', 'нет не может']),
      visual,
    );
    if (radius > 0)
      add(
        'own-absolute-direction',
        'Ищем меньшую координату',
        'На числовой прямой координаты увеличиваются вправо. Чтобы найти меньший корень, выбери сторону от центра; второе направление проверим тоже.',
        q('В какую сторону от центра идём за меньшим корнем?', 'влево', ['налево', 'слева']),
        visual,
      );
    final(
      radius > 0
        ? 'Отложи указанное расстояние в обе стороны от центра. Назови все различные подходящие координаты.'
        : 'Сопоставь указанное расстояние с тем, каким может быть модуль. Проверь, остаются ли подходящие координаты.',
      visual,
    );
  } else if (problem.kind === 'linear' || problem.kind === 'quadratic') {
    const a = Number(p.a),
      b = Number(p.b),
      c = Number(p.c);
    const reduced = `${problem.kind === 'quadratic' ? `${n(a)}x² + ` : ''}${n(b)}x + (${n(c)}) = 0`;
    add(
      'own-equation-balance',
      'Сохраняем равенство',
      'С обеими частями уравнения выполняем одно и то же допустимое действие. Вычитание правой части из обеих сторон позволяет собрать все слагаемые слева.',
      q(
        'При вычитании выражения из левой части нужно вычесть его и из правой? Ответь «да» или «нет».',
        'да',
        ['нужно', 'да нужно'],
      ),
      expression(reduced),
    );
    if (problem.kind === 'linear' && b !== 0) {
      add(
        'own-linear-constant',
        'Отделяем свободный член',
        'К обеим частям прибавляем число, противоположное свободному члену. После этого слева остаётся слагаемое с x. Пока не делим на его коэффициент.',
        q(`Какое число стоит справа в ${n(b)}x = ?`, n(-c), [], true),
        expression(reduced, `${n(b)}x = ?`),
      );
      add(
        'own-linear-divisor',
        'Убираем коэффициент',
        'Чтобы оставить один x, делим обе части на его ненулевой коэффициент. Деление только одной части нарушило бы равенство.',
        q('На какое число нужно разделить обе части?', n(b), [], true),
        expression(`${n(b)}x = ${n(-c)}`, 'x = ?'),
      );
    } else if (problem.kind === 'quadratic') {
      add(
        'own-quadratic-coefficient',
        'Коэффициенты со знаками',
        'После переноса к нулю коэффициент a стоит при x², b — при x, c — свободный член. Знак является частью коэффициента.',
        q('Назови коэффициент b в приведённой записи.', n(b), [], true),
        expression(reduced),
      );
      add(
        'own-quadratic-discriminant',
        'Вычисляем дискриминант',
        'Дискриминант вычисляется по формуле D = b² − 4ac. Его знак помогает определить число действительных решений.',
        q('Чему равен дискриминант твоего уравнения?', n(Number(p.discriminant)), [], true),
        expression('D = b² − 4ac', `D = (${n(b)})² − 4 · (${n(a)}) · (${n(c)})`),
      );
    }
    final(
      problem.kind === 'quadratic'
        ? 'Если D положителен, вычисли обе ветви (−b ± √D)/(2a). При нулевом D ветви совпадают. При отрицательном D действительных корней нет. Для иррациональных корней проверка принимает показанную точность до шести знаков.'
        : b !== 0
          ? 'Раздели обе части на ненулевой коэффициент и проверь найденное значение в исходном равенстве.'
          : 'После переноса буквенные слагаемые исчезли. Проверь, получилось верное числовое равенство или противоречие.',
      expression(problem.kind === 'quadratic' ? 'x = (−b ± √D)/(2a)' : reduced),
    );
  } else if (problem.kind === 'arithmetic') {
    const source = String(p.expression || '');
    const fraction = source.match(/(?:^|[+(*/-])(\d+)\/(\d+)/);
    if (fraction && Number(fraction[2]) > 0) {
      add(
        'own-fraction-parts',
        'Что показывает знаменатель',
        'Знаменатель показывает, на сколько равных долей разделено целое; числитель — сколько таких долей взято. Смысл доли нужно сохранять при действиях с дробями.',
        q(
          `В дроби ${fraction[1]}/${fraction[2]} на сколько равных долей разделено целое?`,
          fraction[2],
          [],
          true,
        ),
        expression(`${fraction[1]}/${fraction[2]}`, 'числитель / знаменатель'),
      );
      if (/\/[\d.]+[+-]/.test(source))
        add(
          'own-fraction-common',
          'Одинаковый размер долей',
          'При сложении или вычитании дробей сначала нужны доли одинакового размера. Для этого приводим дроби к общему знаменателю. Разные исходные знаменатели не запрещают сложение.',
          q(
            'Что нужно привести к общему значению перед сложением дробей: числители или знаменатели?',
            'знаменатели',
            ['знаменатель', 'общий знаменатель'],
          ),
          expression('a/b + c/d', 'одинаковый размер долей'),
        );
      else if (source.includes('*'))
        add(
          'own-fraction-product',
          'Перемножаем доли',
          'При умножении дробей перемножаем числители и отдельно знаменатели. Общий знаменатель для умножения не требуется.',
          q('При умножении дробей нужен общий знаменатель? Ответь «да» или «нет».', 'нет', [
            'не нужен',
          ]),
          expression('(a/b) · (c/d) = (a · c)/(b · d)'),
        );
    }
    if (p.absoluteValue !== undefined)
      add(
        'own-number-distance',
        'Модуль — длина пути',
        'Модуль числа показывает расстояние до нуля. Направление движения и длина — разные понятия.',
        q('Может ли длина пути быть отрицательной?', 'нет', ['не может']),
        Math.abs(Number(p.absoluteValue)) <= 1000
          ? { kind: 'distance', value: Number(p.absoluteValue) }
          : expression('|a| ≥ 0'),
      );
    const traced = problem.steps.filter((step) => /^Действие \d+$/.test(step.title));
    for (const [index, step] of traced.entries()) {
      const parts = (step.formula || '').split(' = ');
      if (parts.length !== 2) continue;
      const parsed = parseProblem(parts[0]);
      if (!parsed.verified) continue;
      add(
        `own-calculate-${index}`,
        `Одно действие · ${index + 1}`,
        'Выполни только это действие. Сохрани знаки и порядок чисел. Полученное значение затем заменит соответствующую часть исходного выражения.',
        q(`Чему равно ${parts[0]}?`, exactCalculation(parts[0]), [], true),
        expression(`${parts[0]} = ?`),
      );
    }
    const last = steps.at(-1);
    if (
      last &&
      last.id.startsWith('own-calculate-') &&
      checkProblemAnswer(problem, last.question.answer).correct
    )
      last.completesTask = true;
    else
      final(
        'Примени порядок действий к своему выражению: скобки и степени, затем умножение и деление, затем сложение и вычитание. Для дробей сохраняй точное значение.',
        expression(source.length <= 60 ? `${source} = ?` : 'Вычисли исходное выражение'),
      );
  }
  task.teachingSteps = steps;
  task.hint = steps[0]?.explanation || task.hint;
  return task;
}

export function problemAsSession(
  own: ProblemSession,
  task = createProblemTask(parseProblem(own.confirmedText)),
): Session {
  const teaching = hydrateTeachingState(
    own.teaching,
    task,
    undefined,
    own.hints > 0 || own.revealed,
  );
  teaching.mainRevealed ||= own.revealed;
  return {
    id: own.id,
    subject: own.subject,
    topicId: `own:${task.id}`,
    startedAt: own.createdAt,
    messages: own.messages,
    taskIndex: 0,
    hintsUsed: own.hints,
    phase: 'practice',
    teaching,
  };
}
export function getProblemTeachingContext(own: ProblemSession) {
  const problem = parseProblem(own.confirmedText),
    task = createProblemTask(problem);
  return getTeachingContext(problemAsSession(own, task), task);
}
const fromSession = (own: ProblemSession, session: Session): ProblemSession => ({
  ...own,
  messages: session.messages.slice(-200),
  teaching: session.teaching,
  hints: Math.max(own.hints, session.hintsUsed),
  revealed: own.revealed || session.teaching?.mainRevealed === true,
});
export function selectProblemTeachingStep(own: ProblemSession, stepId: string): ProblemSession {
  const task = createProblemTask(parseProblem(own.confirmedText));
  return fromSession(own, selectTeachingStep(problemAsSession(own, task), task, stepId));
}

/** Intermediate attempts remain inside TeachingState; main attempts use the exact problem checker. */
export function applyProblemTeachingTurn(
  own: ProblemSession,
  input: string,
  now: Date | string | number = new Date(),
) {
  const problem = parseProblem(own.confirmedText);
  const task = createProblemTask(problem);
  const session = problemAsSession(own, task);
  const context = getTeachingContext(session, task);
  if (!problem.verified)
    return {
      session: { ...own, messages: [...own.messages, say(problem.question)] },
      action: 'discussion' as const,
      needsExplanation: false,
      completed: false,
    };
  const cleaned = input
    .trim()
    .replace(/[?？]+$/u, '')
    .trim();
  const exact = checkProblemAnswer(problem, cleaned);
  const terminal =
    context.mode === 'main' ||
    context.steps.find((step) => step.id === context.stepId)?.completesTask === true;
  // A valid set of roots may be reordered or written as fractions. Only the exact checker
  // authorizes the additional accepted spelling for this turn; it is never persisted.
  if (terminal && exact.correct) {
    if (context.mode === 'main') task.accepted = [...(task.accepted || []), input];
    else
      task.teachingSteps = task.teachingSteps?.map((step) =>
        step.id === context.stepId
          ? {
              ...step,
              question: { ...step.question, accepted: [...(step.question.accepted || []), input] },
            }
          : step,
      );
  }
  const interpreted = interpretTeachingInput(context.activeQuestion, input);
  const turn = handleTeachingTurn(session, task, input, now);
  let next = fromSession(own, turn.session);
  const completion = turn.completion;
  if (
    terminal &&
    context.mode !== 'main' &&
    !context.completed &&
    !context.revealed &&
    turn.action === 'answer' &&
    interpreted.assessment.status !== 'not-answer'
  ) {
    const attempted = next.teaching?.attempts.at(-1);
    if (attempted && attempted.stepId === context.stepId && attempted.correct !== exact.correct) {
      attempted.correct = exact.correct;
      next.teaching!.completedStepIds = exact.correct
        ? [...new Set([...next.teaching!.completedStepIds, context.stepId])]
        : next.teaching!.completedStepIds.filter((id) => id !== context.stepId);
      next.teaching!.phase = exact.correct ? 'answered' : 'asking';
      next.messages[next.messages.length - 1] = say(
        exact.correct
          ? `${exact.feedback} Этот шаг принят; можно продолжить.`
          : `${exact.feedback} Сейчас проверяется итоговый шаг твоей задачи.`,
      );
    }
  }
  let completed = false;
  if (completion && !completion.skipped && !own.solved) {
    const checked = checkProblemAnswer(
      problem,
      context.mode === 'main' ? cleaned : completion.answer,
    );
    next.attempts += 1;
    next.solved = checked.correct;
    next.messages.push(
      say(
        `${checked.feedback} ${checked.correct ? (next.hints || next.revealed ? 'Пример разобран с помощью; самостоятельное освоение не начисляется.' : 'Ты решил этот пример самостоятельно. Одна попытка не означает освоение всей темы.') : 'Можно разобрать один маленький шаг.'}`,
      ),
    );
    if (checked.correct && next.teaching) next.teaching.activeStepId = 'main';
    completed = checked.correct;
  } else if (completion?.skipped)
    next.messages.push(
      say(
        own.solved || own.revealed
          ? 'Этот пример сохранён. Можно взять новый.'
          : 'Пример сохранён без завершения. Можно ответить, открыть один шаг или взять новый пример.',
        'guidance',
      ),
    );
  return {
    session: next,
    action: turn.action,
    needsExplanation: ['why', 'hint', 'discussion'].includes(turn.action),
    completed,
  };
}
