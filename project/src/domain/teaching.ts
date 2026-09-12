import type { Message, Session, Task } from './types';
import type { TeachingAnswerMeaning, TeachingState, TeachingStep } from './teaching-types';
import type { TeachingVisual } from './teaching-visual';
import {
  assessAnswer,
  normalizeAnswerText,
  parseAnswerNumber,
  type AnswerAssessment,
} from './answer-check';
import { classifyTutorInput, type TutorInputIntent } from './tutor-intent';

export type { TeachingStep, TeachingState, TeachingQuestion } from './teaching-types';
export interface TeachingContext {
  task: Task;
  activeQuestion: Task;
  stepId: string;
  mode: 'main' | 'assisted' | 'detour';
  title: string;
  explanation: string;
  visual?: TeachingVisual;
  completed: boolean;
  revealed: boolean;
  revision: number;
  steps: TeachingStep[];
  state: TeachingState;
}
export interface TeachingChoice {
  id: string;
  title: string;
  explanation: string;
  question: string;
  action: 'stay' | 'focus-step';
  purpose: string;
}
export interface TeachingTurn {
  session: Session;
  handled: boolean;
  action: TutorInputIntent;
  completion?: {
    answer: string;
    correct: boolean;
    assisted: boolean;
    skipped: boolean;
    feedback?: string;
  };
}

const uid = () => globalThis.crypto.randomUUID();
const say = (text: string, kind = 'hint'): Message => ({ id: uid(), role: 'cosmos', text, kind });
const safeHelp = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/u)
    .filter((sentence) => !sentence.includes('?'))
    .join(' ')
    .trim();
const flatSteps = (steps: TeachingStep[], depth = 0): TeachingStep[] =>
  depth > 5 ? [] : steps.flatMap((step) => [step, ...flatSteps(step.detours ?? [], depth + 1)]);
const inferMeaning = (task: Task): TeachingAnswerMeaning =>
  task.answerMeaning ??
  (/сколько.*корн|количество.*корн/u.test(task.prompt.toLocaleLowerCase('ru'))
    ? 'count'
    : /координат|назови.*корень|меньший.*корн|больший.*корн/u.test(
          task.prompt.toLocaleLowerCase('ru'),
        )
      ? 'coordinate'
      : task.kind === 'number'
        ? 'value'
        : 'text');

const signQuestion = (id: string, visual: TeachingVisual): TeachingStep => ({
  id,
  title: 'Знак расстояния',
  explanation: 'Расстояние описывает длину пути. Направление движения и длина — разные вещи.',
  question: {
    prompt: 'Может ли расстояние быть отрицательным? Ответь «да» или «нет».',
    answer: 'нет',
    kind: 'text',
    answerMeaning: 'sign',
  },
  visual,
  success: 'Верно: расстояние не бывает отрицательным.',
  hints: [
    'Сравни длину пути и направление: влево можно идти, но длина от этого не становится отрицательной.',
  ],
});

function rootsDefinition(id: string): TeachingStep {
  return {
    id,
    title: 'Что называют корнем уравнения',
    explanation:
      'Корень уравнения — значение x, при подстановке которого равенство становится верным. Слово «действительный» здесь разрешает привычные числа на числовой прямой, включая отрицательные, дробные и ноль. Значение корня и количество разных подходящих значений — разные вопросы. Возьмём отдельный простой пример.',
    question: {
      prompt: 'Подходит ли x = 2 уравнению x + 1 = 3? Ответь «да» или «нет».',
      answer: 'да',
      accepted: ['подходит', 'верно'],
      kind: 'text',
      answerMeaning: 'text',
    },
    visual: {
      kind: 'expression',
      workedExample: true,
      lines: [
        { text: 'x + 2 = 5', explanation: 'Отдельный пример: проверяем значение подстановкой.' },
        {
          text: '3 + 2 = 5',
          focus: '3',
          explanation: 'При x = 3 равенство верное: 3 — корень этого уравнения.',
        },
      ],
    },
    hints: ['Вместо x подставь 2 и сравни левую и правую части равенства.'],
    success:
      'Да: 2 + 1 = 3. В этом примере 2 — значение корня. Вернёмся к вопросу исходной задачи.',
  };
}

/** Small authored blueprints. New lesson authors may supply their own checked steps and detours. */
function absoluteSteps(task: Task): TeachingStep[] | undefined {
  switch (task.id) {
    case 'absolute-1':
      return [
        signQuestion('distance-sign', { kind: 'distance', value: -7 }),
        {
          id: 'distance-direction',
          title: 'Путь к нулю',
          explanation: 'Найди на прямой −7 и ноль. Пока определим только направление.',
          question: {
            prompt: 'От −7 до нуля нужно двигаться вправо или влево?',
            answer: 'вправо',
            accepted: ['направо'],
            kind: 'text',
            answerMeaning: 'direction',
          },
          visual: { kind: 'distance', value: -7 },
          success: 'Да, вправо. В исходном вопросе понадобится длина этого пути.',
        },
      ];
    case 'absolute-2':
      return [
        {
          id: 'same-point',
          title: 'Начало и конец пути',
          explanation: 'Сопоставь начало и конец пути от нуля до нуля.',
          question: {
            prompt: 'Начало и конец этого пути совпадают? Ответь «да» или «нет».',
            answer: 'да',
            accepted: ['совпадают'],
            kind: 'text',
            answerMeaning: 'text',
          },
          visual: { kind: 'zero-root', center: 0 },
          success: 'Да. Теперь можно вернуться к длине пути.',
        },
      ];
    case 'absolute-3':
      return [signQuestion('fractional-distance-sign', { kind: 'distance', value: -2.5 })];
    case 'absolute-4':
      return [
        {
          id: 'negative-side',
          title: 'Выбираем сторону',
          explanation: 'Условие просит отрицательный корень. Сначала выбери сторону от нуля.',
          question: {
            prompt: 'Отрицательные числа находятся слева или справа от нуля?',
            answer: 'слева',
            accepted: ['влево'],
            kind: 'text',
            answerMeaning: 'direction',
          },
          visual: { kind: 'root-count', center: 0, radius: 4 },
          success: 'Да, слева. Осталось отложить указанное расстояние.',
        },
      ];
    case 'absolute-5':
      return [
        {
          id: 'zero-coordinate',
          title: 'Сначала найдём точку',
          explanation:
            'Сейчас ищем координату точки. Количество корней посчитаем отдельным следующим шагом. Нулевое расстояние означает, что начало и конец пути совпадают.',
          question: {
            prompt: 'Какая координата у точки, находящейся на нулевом расстоянии от нуля?',
            answer: '0',
            accepted: ['ноль', 'в нуле', 'точка ноль', 'нулевая'],
            kind: 'number',
            answerMeaning: 'coordinate',
          },
          visual: { kind: 'zero-root', center: 0 },
          hints: [
            'Останься в начале пути: при расстоянии ноль ни вправо, ни влево двигаться не нужно.',
            'Начало пути отмечено нулём. Назови координату, в которой путь заканчивается.',
          ],
          success:
            'Да, координата — 0. Это значение x. Отдельно нам предстоит посчитать, сколько разных точек удовлетворяет условию.',
          detours: [rootsDefinition('zero-root-definition')],
        },
      ];
    case 'absolute-6':
      return [
        {
          ...signQuestion('negative-radius-possible', {
            kind: 'negative-radius',
            center: 0,
            radius: -3,
          }),
          detours: [rootsDefinition('negative-root-definition')],
        },
      ];
    case 'absolute-7':
      return [
        {
          id: 'shift-center',
          title: 'Откуда считаем расстояние',
          explanation:
            '|x − c| обозначает расстояние от точки x до точки c. Найди центр, не вычисляя корни.',
          question: {
            prompt: 'От какой координаты отсчитывается расстояние в |x − 4|?',
            answer: '4',
            kind: 'number',
            answerMeaning: 'coordinate',
          },
          visual: { kind: 'shifted-modulus', center: 4, radius: 2, focus: 'smaller' },
          success: 'Верно, центр — 4.',
        },
        {
          id: 'smaller-direction',
          title: 'Меньшая координата',
          explanation: 'На числовой прямой координаты возрастают вправо.',
          question: {
            prompt: 'Для меньшего корня от центра двигаемся влево или вправо?',
            answer: 'влево',
            accepted: ['налево', 'слева'],
            kind: 'text',
            answerMeaning: 'direction',
          },
          visual: { kind: 'shifted-modulus', center: 4, radius: 2, focus: 'smaller' },
          success: 'Да, влево. Теперь вернёмся к вычислению координаты.',
          detours: [
            {
              id: 'subtraction-detour',
              title: 'Потренируем движение влево',
              explanation:
                'Возьмём другой пример. Вычитание положительного числа — движение влево по прямой.',
              question: {
                prompt: 'Чему равно 3 − 5?',
                answer: '-2',
                kind: 'number',
                answerMeaning: 'value',
              },
              visual: { kind: 'subtraction', start: 3, subtract: 5 },
              hints: ['От 3 сделай три шага влево до нуля, затем ещё два влево.'],
              success: 'Да, 3 − 5 = −2. Вернёмся к направлению движения в исходном примере.',
            },
          ],
        },
      ];
    case 'absolute-8':
      return [
        {
          id: 'negative-center',
          title: 'Переписываем центр',
          explanation: 'x + 1 можно записать как x − (−1). В записи |x − c| центр — c.',
          question: {
            prompt: 'Какова координата центра в |x + 1|?',
            answer: '-1',
            kind: 'number',
            answerMeaning: 'coordinate',
          },
          visual: { kind: 'shifted-modulus', center: -1, radius: 4, focus: 'larger' },
          success: 'Да, центр — −1.',
        },
        {
          id: 'larger-direction',
          title: 'Большая координата',
          explanation: 'Числа на прямой возрастают вправо.',
          question: {
            prompt: 'Больший корень будет справа или слева от центра?',
            answer: 'справа',
            accepted: ['вправо', 'направо'],
            kind: 'text',
            answerMeaning: 'direction',
          },
          visual: { kind: 'shifted-modulus', center: -1, radius: 4, focus: 'larger' },
          success: 'Да, справа. Теперь можешь найти координату в исходной задаче.',
        },
      ];
    default:
      return undefined;
  }
}

export function getTeachingSteps(task: Task): TeachingStep[] {
  const authored = task.teachingSteps ?? absoluteSteps(task);
  if (authored) {
    if (
      !task.teachingSteps &&
      /корн/u.test(task.prompt) &&
      authored[0] &&
      !authored[0].detours?.some((step) => step.id.includes('root-definition'))
    ) {
      return [
        {
          ...authored[0],
          detours: [
            ...(authored[0].detours ?? []),
            rootsDefinition(`${authored[0].id}-root-definition`),
          ],
        },
        ...authored.slice(1),
      ];
    }
    return authored;
  }
  return (task.scaffolds ?? []).map((step, index) => ({
    id: `legacy-${index}`,
    title: `Шаг ${index + 1}`,
    explanation:
      index === 0
        ? 'Разделим решение на небольшие вопросы. Сейчас ответь только на вопрос этого шага.'
        : 'Продолжим решение одним действием.',
    question: {
      ...step,
      hint: '',
      kind: parseAnswerNumber(step.answer) === undefined ? 'text' : 'number',
    },
    success: step.explanation,
    hints: [
      safeHelp(task.hints?.[index] ?? '') ||
        'Прочитай маленький вопрос ещё раз: сейчас важен только этот элемент решения.',
    ],
  }));
}

function mainVisual(task: Task): TeachingVisual | undefined {
  switch (task.id) {
    case 'absolute-1':
      return { kind: 'distance', value: -7 };
    case 'absolute-2':
      return { kind: 'distance', value: 0 };
    case 'absolute-3':
      return { kind: 'distance', value: -2.5 };
    case 'absolute-4':
      return { kind: 'root-count', center: 0, radius: 4 };
    case 'absolute-5':
      return { kind: 'zero-root', center: 0 };
    case 'absolute-6':
      return { kind: 'negative-radius', center: 0, radius: -3 };
    case 'absolute-7':
      return { kind: 'shifted-modulus', center: 4, radius: 2, focus: 'smaller' };
    case 'absolute-8':
      return { kind: 'shifted-modulus', center: -1, radius: 4, focus: 'larger' };
    default:
      return undefined;
  }
}

export function createTeachingState(task: Task, assisted = false): TeachingState {
  return {
    version: 1,
    taskId: task.id,
    activeStepId: 'main',
    phase: 'asking',
    returnStack: [],
    completedStepIds: [],
    skippedStepIds: [],
    attempts: [],
    hintLevel: 0,
    assisted,
    mainRevealed: false,
    revision: 0,
  };
}

/** Restore only references from this task's checked blueprint; persisted answer text is never trusted. */
export function hydrateTeachingState(
  raw: unknown,
  task: Task,
  legacyIndex?: number,
  assisted = false,
): TeachingState {
  const initial = createTeachingState(task, assisted);
  const steps = getTeachingSteps(task);
  const allowed = new Set(['main', ...flatSteps(steps).map((step) => step.id)]);
  if (
    !raw ||
    typeof raw !== 'object' ||
    (raw as TeachingState).version !== 1 ||
    (raw as TeachingState).taskId !== task.id
  ) {
    if (Number.isInteger(legacyIndex) && steps[legacyIndex!])
      initial.activeStepId = steps[legacyIndex!].id;
    return initial;
  }
  const value = raw as Partial<TeachingState>;
  const phase = (p: unknown): TeachingState['phase'] =>
    p === 'answered' || p === 'revealed' ? p : 'asking';
  const ids = (list: unknown) =>
    Array.isArray(list)
      ? [
          ...new Set(
            list.filter(
              (item): item is string =>
                typeof item === 'string' && allowed.has(item) && item !== 'main',
            ),
          ),
        ]
      : [];
  initial.activeStepId =
    typeof value.activeStepId === 'string' && allowed.has(value.activeStepId)
      ? value.activeStepId
      : 'main';
  initial.phase =
    typeof value.activeStepId === 'string' && allowed.has(value.activeStepId)
      ? phase(value.phase)
      : 'asking';
  initial.returnStack = Array.isArray(value.returnStack)
    ? value.returnStack
        .filter(
          (entry) =>
            entry &&
            typeof entry.stepId === 'string' &&
            allowed.has(entry.stepId) &&
            entry.stepId !== initial.activeStepId,
        )
        .slice(0, 6)
        .map((entry) => ({ stepId: entry.stepId, phase: phase(entry.phase) }))
    : [];
  initial.completedStepIds = ids(value.completedStepIds);
  initial.skippedStepIds = ids(value.skippedStepIds);
  initial.hintLevel =
    Number.isSafeInteger(value.hintLevel) && value.hintLevel! >= 0
      ? Math.min(value.hintLevel!, 10000)
      : 0;
  initial.revision =
    Number.isSafeInteger(value.revision) && value.revision! >= 0 ? value.revision! : 0;
  initial.assisted = assisted || value.assisted === true || initial.activeStepId !== 'main';
  initial.mainRevealed = value.mainRevealed === true;
  initial.attempts = Array.isArray(value.attempts)
    ? value.attempts
        .filter(
          (a) =>
            a &&
            typeof a.id === 'string' &&
            typeof a.stepId === 'string' &&
            allowed.has(a.stepId) &&
            a.stepId !== 'main' &&
            typeof a.text === 'string' &&
            typeof a.correct === 'boolean' &&
            typeof a.assisted === 'boolean' &&
            Number.isFinite(Date.parse(a.at)),
        )
        .slice(-500)
        .map((a) => ({
          id: a.id.slice(0, 200),
          stepId: a.stepId,
          questionId: `${task.id}:${a.stepId}`,
          text: a.text.slice(0, 4000),
          correct: a.correct,
          assisted: a.assisted,
          uncertain: a.uncertain === true,
          at: new Date(a.at).toISOString(),
        }))
    : [];
  const checked = new Map(initial.attempts.map((attempt) => [attempt.stepId, attempt.correct]));
  initial.completedStepIds = initial.completedStepIds.filter(
    (stepId) => checked.get(stepId) === true,
  );
  if (initial.phase === 'answered' && !initial.completedStepIds.includes(initial.activeStepId))
    initial.phase = 'asking';
  initial.returnStack = initial.returnStack.map((entry) => ({
    ...entry,
    phase:
      entry.phase === 'answered' && !initial.completedStepIds.includes(entry.stepId)
        ? 'asking'
        : entry.phase,
  }));
  if (initial.activeStepId === 'main' && initial.mainRevealed) initial.phase = 'revealed';
  else if (initial.activeStepId === 'main') initial.phase = 'asking';
  return initial;
}

export function getTeachingContext(session: Session, task: Task): TeachingContext {
  const state = hydrateTeachingState(
    session.teaching,
    task,
    session.scaffoldIndex,
    session.hintsUsed > 0,
  );
  const steps = getTeachingSteps(task);
  const step = flatSteps(steps).find((item) => item.id === state.activeStepId);
  const mainQuestion: Task = { ...task, answerMeaning: inferMeaning(task) };
  const activeQuestion: Task = step
    ? {
        id: `${task.id}:${step.id}`,
        ...step.question,
        hint: step.question.hint ?? step.hints?.[0] ?? '',
        explanation: step.question.explanation ?? step.success ?? '',
        kind:
          step.question.kind ??
          (parseAnswerNumber(step.question.answer) === undefined ? 'text' : 'number'),
      }
    : mainQuestion;
  return {
    task,
    activeQuestion,
    stepId: step?.id ?? 'main',
    mode: step ? (state.returnStack.length ? 'detour' : 'assisted') : 'main',
    title: step?.title ?? 'Самостоятельный вопрос',
    explanation: step?.explanation ?? safeHelp(task.hints?.[0] ?? task.hint),
    visual: step?.visual ?? (step ? undefined : mainVisual(task)),
    completed: state.phase === 'answered',
    revealed: state.phase === 'revealed',
    revision: state.revision,
    steps,
    state,
  };
}

/** No grading answers in the model's list of authorized next questions. */
export function getTeachingChoices(context: TeachingContext): TeachingChoice[] {
  const current = flatSteps(context.steps).find((step) => step.id === context.stepId);
  const allowed = new Set([
    context.stepId,
    'main',
    ...context.steps.map((step) => step.id),
    ...(current?.detours ?? []).map((step) => step.id),
    ...context.state.returnStack.map((entry) => entry.stepId),
  ]);
  return [
    {
      id: 'main',
      title: 'Исходное задание',
      explanation: 'Вернуться к исходному самостоятельному вопросу.',
      question: context.task.prompt,
      action: context.stepId === 'main' ? ('stay' as const) : ('focus-step' as const),
      purpose: 'Исходный вопрос; после помощи ответ отмечается как выполненный с помощью.',
    },
    ...flatSteps(context.steps)
      .filter((step) => allowed.has(step.id))
      .map((step) => ({
        id: step.id,
        title: step.title,
        explanation: step.explanation,
        question: step.question.prompt,
        action: step.id === context.stepId ? ('stay' as const) : ('focus-step' as const),
        purpose: context.steps.some((primary) => primary.id === step.id)
          ? 'Проверяемый шаг исходной задачи.'
          : 'Более простой пример; после него вернуться к предыдущему шагу.',
      })),
  ];
}

function syncLegacy(session: Session, task: Task) {
  const index =
    task.scaffolds &&
    getTeachingSteps(task).findIndex((step) => step.id === session.teaching?.activeStepId);
  if (index !== undefined && index >= 0 && session.teaching?.activeStepId.startsWith('legacy-'))
    session.scaffoldIndex = index;
  else delete session.scaffoldIndex;
}

/** Pure selection. Callers may add their own verified paraphrase; selection adds no chat message. */
export function selectTeachingStep(session: Session, task: Task, stepId: string): Session {
  const context = getTeachingContext(session, task);
  if (!getTeachingChoices(context).some((choice) => choice.id === stepId)) return session;
  const next = structuredClone(session);
  const state = context.state;
  const current = flatSteps(context.steps).find((step) => step.id === context.stepId);
  if (stepId !== context.stepId) {
    let restoredPhase: TeachingState['phase'] | undefined;
    if (current?.detours?.some((step) => step.id === stepId))
      state.returnStack.push({ stepId: context.stepId, phase: state.phase });
    else {
      const returning = state.returnStack.findIndex((entry) => entry.stepId === stepId);
      if (returning >= 0) {
        restoredPhase = state.returnStack[returning].phase;
        state.returnStack = state.returnStack.slice(0, returning);
      } else state.returnStack = [];
    }
    state.activeStepId = stepId;
    state.phase =
      restoredPhase ??
      (stepId === 'main' && state.mainRevealed
        ? 'revealed'
        : state.completedStepIds.includes(stepId)
          ? 'answered'
          : 'asking');
    state.hintLevel = 0;
  }
  state.assisted = true;
  state.revision += 1;
  next.teaching = state;
  next.hintsUsed = Math.max(1, next.hintsUsed);
  syncLegacy(next, task);
  return next;
}

export interface TeachingInput {
  intent: TutorInputIntent;
  assessment: AnswerAssessment;
  uncertain: boolean;
}

/** A request about the meaning of the instruction, not merely a request to compute its answer. */
export function isExpressionValueRequest(input: string): boolean {
  const text = normalizeAnswerText(input);
  const term = /чему\s+равн[оа]|вычисли(?:ть)?|значени[ея]\s+(?:этого\s+)?выражения/u.test(text);
  const meaning =
    /что\s+(?:это\s+)?(?:означает|обозначает|значит|такое)|смысл\s+(?:слова|фразы|задания)|как\s+понимать|объясни\s+(?:слово|фразу|значение)/u.test(
      text,
    );
  const unclearTerm =
    /не\s+(?:понимаю|понял[а]?|знаю).{0,32}(?:чему\s+равно|значени[ея]\s+выражения)/u.test(text);
  return term && (meaning || unclearTerm);
}

/** Narrow conversational wrappers around an answer, while retaining negations and alternatives. */
export function interpretTeachingInput(task: Task, input: string): TeachingInput {
  const direct = assessAnswer(task, input);
  if (direct.status === 'correct')
    return { intent: 'answer', assessment: direct, uncertain: false };
  const normalized = normalizeAnswerText(input);
  const uncertain = /(?:не знаю|не уверен|сомневаюсь|наверное|вроде|\?)/u.test(input.toLowerCase());
  let candidate = normalized
    .replace(/^[\s,]*(?:(?:ну|наверное|вроде|кажется|думаю|я думаю|может быть)\s*[, :]?\s*)+/u, '')
    .replace(/\s*[,?;!()]*(?:я\s+)?(?:не знаю|не уверен[а]?|сомневаюсь)[\s!?.,()]*$/u, '')
    .trim()
    .replace(/[?!]+$/u, '')
    .trim();
  const meaning = inferMeaning(task);
  // "... не?" is a request for confirmation. An assertion "не 0" remains a negation.
  if (/(?:^|\s)не\s*\?\s*$/u.test(input)) candidate = candidate.replace(/\s+не$/u, '').trim();
  if (meaning === 'expression') {
    const normalizeExpression = (value: string) =>
      normalizeAnswerText(value)
        .replace(/х/g, 'x')
        .replace(/а/g, 'a')
        .replace(/²/g, '^2')
        .replace(/\)2/g, ')^2')
        .replace(/\s+/g, '');
    candidate = normalizeExpression(candidate.replace(/^(?:это|получается|будет|ответ)\s+/u, ''));
    const allowed = [task.answer, ...(task.accepted ?? [])].map(normalizeExpression);
    const pieces = candidate.split('=');
    const given = normalizeExpression(task.prompt);
    const allEquivalent =
      pieces.length <= 6 &&
      pieces.every(
        (piece, index) =>
          allowed.includes(piece) ||
          (pieces.length > 1 &&
            index === 0 &&
            /[+\-*/|()^]/u.test(piece) &&
            piece.length >= 3 &&
            given.includes(piece)),
      );
    if (allEquivalent && allowed.includes(pieces.at(-1)!))
      return {
        intent: 'answer',
        assessment: { status: 'correct', normalizedAnswer: pieces.at(-1) },
        uncertain,
      };
    // An incorrect final link cannot be rescued by a correct expression earlier in the chain.
    if (pieces.length > 1 && pieces.every((piece) => /^[0-9a-z+\-*/|()^.,]+$/u.test(piece)))
      return {
        intent: 'answer',
        assessment: {
          status: 'incorrect',
          feedback: 'Проверь последний переход: все части цепочки должны быть равны.',
        },
        uncertain,
      };
  }
  if (meaning === 'sign' && !/(?:^|\s)(?:или|либо|но)(?:\s|$)/u.test(candidate)) {
    const signClass = (value: string) =>
      /неотрицательн|не отрицательн|не меньше нуля|больше или равно нулю/u.test(value)
        ? 'nonnegative'
        : /неположительн|не положительн|не больше нуля/u.test(value)
          ? 'nonpositive'
          : /отрицательн|меньше нуля/u.test(value)
            ? 'negative'
            : /положительн|больше нуля/u.test(value)
              ? 'positive'
              : undefined;
    const expected = signClass(task.answer);
    const [assertion, reason = ''] = candidate.split(/\s+(?:так как|потому что|ведь)\s+/u);
    const actual = signClass(assertion);
    const shortAssertion = assertion.replace(/^(?:оно|он|она|это|выражение|число)\s+/u, '');
    const recognizedAssertion =
      /^(?:не)?(?:отрицательн|положительн)[а-я]*$/u.test(shortAssertion) ||
      /^(?:меньше|больше) нуля$/u.test(shortAssertion);
    const simpleReason =
      !reason ||
      /^[xха0-9.,\s<>=−–-]+$/u.test(reason) ||
      /^(?:x|х)\s+(?:меньше|больше|не меньше|не больше)\s+(?:-?\d+(?:[.,]\d+)?|a|а)$/u.test(reason);
    const bound = task.prompt.match(/x\s*([<>])\s*(-?\d+(?:[.,]\d+)?)/u);
    const reasonBound = reason.match(/(?:x|х)\s+(меньше|больше)\s+(-?\d+(?:[.,]\d+)?)/u);
    const contradictsCondition = !!(
      bound &&
      reasonBound &&
      (Number(bound[2].replace(',', '.')) !== Number(reasonBound[2].replace(',', '.')) ||
        (bound[1] === '<') !== (reasonBound[1] === 'меньше'))
    );
    if (actual && expected && recognizedAssertion && simpleReason)
      return {
        intent: 'answer',
        assessment: {
          status: !contradictsCondition && actual === expected ? 'correct' : 'incorrect',
          ...(contradictsCondition
            ? {
                feedback:
                  'Знак назван, но объяснение противоречит сравнению из условия. Проверь направление неравенства.',
              }
            : {}),
        },
        uncertain,
      };
  }
  if (task.kind === 'number' && !/(?:^|\s)(?:не|ни)(?:\s|$)|или|либо/u.test(candidate)) {
    const wordValues: Record<string, string> = {
      ноль: '0',
      нулю: '0',
      нуле: '0',
      нулевой: '0',
      один: '1',
      одна: '1',
      одно: '1',
      два: '2',
      две: '2',
    };
    if (wordValues[candidate]) candidate = wordValues[candidate];
    // A coordinate statement is not an answer to a question about the NUMBER of roots.
    const coordinateStatement = /координат|точк|находит|от нуля/u.test(candidate);
    if (meaning === 'count' && coordinateStatement)
      return {
        intent: 'answer',
        assessment: {
          status: 'ambiguous',
          feedback:
            'Ты описываешь координату точки. Сейчас спрашивается количество разных корней: значение x и число корней — разные ответы.',
        },
        uncertain,
      };
    if (meaning === 'coordinate' || meaning === 'distance') {
      candidate = candidate
        .replace(/от нуля/gu, ' ')
        .replace(
          /(?:координат(?:а|ой|е)?|точк(?:а|и|е|у)|находится|находиться|будет|получается|равн[ао]|в|нуле|ноль|это|там)/gu,
          ' ',
        )
        .replace(/\s+/g, ' ')
        .trim();
    }
    const assessed = assessAnswer(task, candidate);
    if (assessed.status === 'correct' || (candidate && assessed.status === 'incorrect'))
      return { intent: 'answer', assessment: assessed, uncertain };
  }
  return { intent: classifyTutorInput(input, task), assessment: direct, uncertain };
}

function nextStep(session: Session, task: Task): Session {
  const context = getTeachingContext(session, task);
  const state = context.state;
  let target = 'main';
  let restorePhase: TeachingState['phase'] | undefined;
  if (state.returnStack.length) {
    const back = state.returnStack.at(-1)!;
    target = back.stepId;
    restorePhase = back.phase;
  } else {
    const step = context.steps.find((item) => item.id === context.stepId);
    const index = context.steps.findIndex((item) => item.id === context.stepId);
    target = step?.nextStepId ?? context.steps[index + 1]?.id ?? 'main';
  }
  const next = selectTeachingStep(session, task, target);
  if (next === session) return session;
  if (restorePhase) next.teaching!.phase = restorePhase;
  return next;
}

function promptCurrent(session: Session, task: Task, prefix: string) {
  const context = getTeachingContext(session, task);
  session.messages.push(
    say(
      `${prefix} ${context.mode === 'main' ? 'Теперь попробуй исходное задание. ' : ''}${context.explanation} ${context.activeQuestion.prompt}`,
      context.mode === 'main' ? 'scaffold-complete' : 'hint',
    ),
  );
}

export function handleTeachingTurn(
  original: Session,
  task: Task,
  input: string,
  now: Date | string | number = new Date(),
): TeachingTurn {
  let session = structuredClone(original);
  const context = getTeachingContext(session, task);
  session.teaching = context.state;
  const interpreted = interpretTeachingInput(context.activeQuestion, input);
  const { intent, assessment, uncertain } = interpreted;
  session.messages.push({
    id: uid(),
    role: 'student',
    text: input.trim().slice(0, 4000),
    kind: intent === 'answer' ? 'answer' : 'request',
  });
  session.teaching.revision += 1;
  const done = (completion?: TeachingTurn['completion']): TeachingTurn => ({
    session,
    handled: true,
    action: intent,
    ...(completion ? { completion } : {}),
  });

  if (intent === 'reveal') {
    session = selectTeachingStep(session, task, 'main');
    session.teaching!.mainRevealed = true;
    session.teaching!.phase = 'revealed';
    session.messages.push(
      say(
        `Разберём исходное задание вместе. ${task.explanation} Ответ: ${task.answer}. Это разбор с готовым ответом, без зачёта самостоятельного решения. Можно написать «дальше» и перейти к новому примеру.`,
        'solution',
      ),
    );
    return done();
  }
  if (intent === 'next') {
    if (context.mode === 'main')
      return done({ answer: '', correct: false, assisted: true, skipped: true });
    const currentStep = context.steps.find((step) => step.id === context.stepId);
    if (
      context.completed &&
      currentStep?.completesTask &&
      context.steps.every((step) => context.state.completedStepIds.includes(step.id)) &&
      context.state.skippedStepIds.length === 0
    ) {
      return done({
        answer: context.activeQuestion.answer,
        correct: true,
        assisted: true,
        skipped: false,
        feedback:
          'Ты завершил все проверяемые шаги этой задачи. Повторять уже принятый итоговый ответ не нужно.',
      });
    }
    if (context.state.phase === 'asking')
      session.teaching!.skippedStepIds = [
        ...new Set([...session.teaching!.skippedStepIds, context.stepId]),
      ];
    session = nextStep(session, task);
    promptCurrent(
      session,
      task,
      context.state.phase === 'asking'
        ? 'Продолжим без проверки этого маленького шага.'
        : 'Этот шаг понятен. Идём дальше.',
    );
    return done();
  }
  if (intent === 'hint' || intent === 'why') {
    session.hintsUsed += 1;
    session.teaching.assisted = true;
    const available = context.steps.find(
      (step) =>
        !session.teaching!.completedStepIds.includes(step.id) &&
        !session.teaching!.skippedStepIds.includes(step.id),
    );
    const rootDefinitionRequest =
      /действительн|(?:что|значит|понятие|смысл).{0,35}(?:корень|корни|корней)|(?:корень|корни|корней).{0,35}(?:означает|значит)/u.test(
        input.toLowerCase(),
      );
    const definitionOwner = context.steps.find((step) =>
      step.detours?.some((detour) => detour.id.includes('root-definition')),
    );
    const currentStep = flatSteps(context.steps).find((step) => step.id === context.stepId);
    const valuePrerequisite =
      currentStep?.concept === 'expression-value'
        ? currentStep
        : currentStep?.detours?.find((step) => step.concept === 'expression-value');
    if (isExpressionValueRequest(input) && valuePrerequisite && !context.revealed) {
      session = selectTeachingStep(session, task, valuePrerequisite.id);
      promptCurrent(
        session,
        task,
        'Сначала разберём смысл этой просьбы на простом примере. После него вернёмся ровно к тому вопросу, где остановились.',
      );
    } else if (rootDefinitionRequest && definitionOwner && !context.revealed) {
      if (context.stepId !== definitionOwner.id)
        session = selectTeachingStep(session, task, definitionOwner.id);
      session = selectTeachingStep(
        session,
        task,
        definitionOwner.detours!.find((step) => step.id.includes('root-definition'))!.id,
      );
      promptCurrent(
        session,
        task,
        'Сначала разберём, что означает слово «корень». После простого примера вернёмся к задаче.',
      );
    } else if (context.mode === 'main' && available && !context.revealed) {
      session = selectTeachingStep(session, task, available.id);
      session.teaching!.hintLevel = 1;
      promptCurrent(session, task, 'Начнём с одного понятного шага.');
    } else {
      session.teaching.hintLevel += 1;
      const step = flatSteps(context.steps).find((item) => item.id === context.stepId);
      const smaller = step?.detours?.find(
        (item) => !session.teaching!.completedStepIds.includes(item.id),
      );
      if (smaller && session.teaching.hintLevel >= 2 && !context.completed) {
        session = selectTeachingStep(session, task, smaller.id);
        promptCurrent(
          session,
          task,
          'Давай временно возьмём более простой пример, затем вернёмся.',
        );
      } else {
        const help =
          step?.hints?.[Math.min(session.teaching.hintLevel - 1, (step.hints?.length ?? 1) - 1)] ??
          (step
            ? step.explanation
            : safeHelp(
                task.hints?.[
                  Math.min(session.teaching.hintLevel - 1, (task.hints?.length ?? 1) - 1)
                ] ?? task.hint,
              ));
        const prefix = context.completed
          ? 'Твой ответ на этот маленький вопрос уже принят. Поясню его смысл.'
          : session.teaching.hintLevel <= 2
            ? 'Посмотрим на первый шаг внимательнее.'
            : 'Попробуем связать вопрос с тем, что видно на сцене.';
        session.messages.push(
          say(
            `${prefix} ${help} ${context.completed ? 'Когда будешь готов продолжить, напиши «дальше».' : `Сейчас проверяем только этот вопрос: ${context.activeQuestion.prompt}`}`,
          ),
        );
      }
    }
    return done();
  }
  if (intent === 'repeat') {
    session.messages.push(
      say(
        `Повторю текущий вопрос. ${context.activeQuestion.prompt}${context.completed ? 'Твой ответ на него уже принят; можно уточнить объяснение или идти дальше.' : ''}`,
        'repeated-question',
      ),
    );
    return done();
  }
  if (intent === 'discussion') {
    session.messages.push(
      say(
        `Можем обсудить это. Учебный вопрос останется на месте: ${context.activeQuestion.prompt}`,
        'guidance',
      ),
    );
    return done();
  }
  if (assessment.status === 'ambiguous' || assessment.status === 'not-answer') {
    session.messages.push(
      say(
        assessment.feedback ??
          `Пока не могу однозначно прочитать ответ. Сейчас вопрос такой: ${context.activeQuestion.prompt}`,
        'clarification',
      ),
    );
    return done();
  }
  if (context.mode === 'main')
    return done({
      answer: input,
      correct: assessment.status === 'correct',
      assisted: context.state.assisted || session.hintsUsed > 0,
      skipped: false,
      feedback: assessment.feedback,
    });
  // Re-confirming a completed step never creates a second attempt or a main-task mistake.
  if (context.completed || context.revealed) {
    session.messages.push(
      say(
        `Ответ на этот шаг уже разобран. ${context.activeQuestion.explanation} Можно уточнить объяснение или написать «дальше».`,
        'feedback',
      ),
    );
    return done();
  }
  const correct = assessment.status === 'correct';
  session.teaching.attempts.push({
    id: uid(),
    stepId: context.stepId,
    questionId: context.activeQuestion.id,
    text: input,
    correct,
    assisted: true,
    uncertain,
    at: new Date(now).toISOString(),
  });
  if (correct) {
    session.teaching.completedStepIds = [
      ...new Set([...session.teaching.completedStepIds, context.stepId]),
    ];
    session.teaching.phase = 'answered';
    session.messages.push(
      say(
        `${uncertain ? 'Ты сомневаешься, но этот маленький шаг верный.' : 'Да, этот шаг верный.'} ${context.activeQuestion.explanation} Напиши «дальше», когда будешь готов продолжить.`,
        'feedback',
      ),
    );
  } else {
    session.hintsUsed += 1;
    session.teaching.assisted = true;
    session.messages.push(
      say(
        `Проверим именно маленький вопрос. ${context.explanation} ${context.activeQuestion.prompt}`,
        'feedback',
      ),
    );
  }
  syncLegacy(session, task);
  return done();
}
