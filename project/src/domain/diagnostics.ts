import { getTopic, topics } from './catalog';
import { assessAnswer } from './answer-check';
import { classifyTutorInput } from './tutor-intent';
import { getKnowledgeForTopic } from './knowledge';
import type { LearningState, SubjectId, Task } from './types';

export type PracticeClock = Date | string | number;
export interface PracticeItem {
  id: string;
  topicId: string;
  taskId: string;
  topicTitle: string;
  prompt: string;
  taskVersion: string;
  sourceIds: string[];
}
export interface PracticeResponse {
  id: string;
  submissionId: string;
  itemId: string;
  text: string;
  correct: boolean;
  assisted: boolean;
  skipped: boolean;
  revealed?: boolean;
  at: string;
}
export interface PracticeTurn {
  id: string;
  role: 'cosmos' | 'student';
  text: string;
  at: string;
  itemId?: string;
  kind:
    | 'greeting'
    | 'question'
    | 'answer'
    | 'hint'
    | 'feedback'
    | 'summary'
    | 'request'
    | 'solution'
    | 'clarification';
}
export interface SkillObservation {
  topicId: string;
  topicTitle: string;
  independentCorrect: number;
  total: number;
  needsPractice: boolean;
}
export interface PracticeSummary {
  text: string;
  at: string;
  independentCorrect: number;
  assistedCorrect: number;
  revealedCorrect?: number;
  skippedCount?: number;
  total: number;
  skills: SkillObservation[];
  recommendations: string[];
  sourceIds: string[];
  limitation: string;
}
export interface DiagnosticRecord {
  id: string;
  version: 1;
  subject: SubjectId;
  createdAt: string;
  completedAt?: string;
  items: PracticeItem[];
  responses: PracticeResponse[];
  transcript: PracticeTurn[];
  hintedItemIds: string[];
  revealedItemIds?: string[];
  currentIndex: number;
  phase: 'question' | 'feedback' | 'completed';
  summary?: PracticeSummary;
  materialStatus: 'training';
  route?: DiagnosticRoute;
}
export interface DiagnosticRoute {
  kind: 'secondary-math';
  schoolGrade: number;
  mathLevel: 'basic' | 'profile' | 'undecided';
}
export function diagnosticRoute(
  state: LearningState,
  subject: SubjectId,
): DiagnosticRoute | undefined {
  const preferences = state.planning?.preferences;
  const schoolGrade = preferences?.schoolGrade ?? 10;
  return subject === 'math' && schoolGrade >= 9
    ? { kind: 'secondary-math', schoolGrade, mathLevel: preferences?.mathLevel ?? 'basic' }
    : undefined;
}
const SECONDARY_MATH_TASKS: Record<string, string[]> = {
  'math-absolute': ['absolute-7', 'absolute-8', 'absolute-4', 'absolute-6'],
  'math-radicals': ['radicals-2', 'radicals-3', 'radicals-4', 'radicals-5', 'radicals-6'],
};
// Old checks retain their original route and item snapshots after the start curriculum changes.
const HISTORICAL_SECONDARY_MATH_TOPICS = new Set([
  ...Object.keys(SECONDARY_MATH_TASKS), 'math-percent', 'math-multiply', 'math-fraction',
]);

const DAY = 86_400_000;
export const practiceId = (prefix: string) => `${prefix}-${globalThis.crypto.randomUUID()}`;
export function practiceTime(now: PracticeClock = new Date()): string {
  const value = new Date(now);
  if (!Number.isFinite(value.getTime())) throw new Error('Invalid practice clock');
  return value.toISOString();
}
export function afterPracticeDays(at: string, days: number): string {
  return new Date(Date.parse(at) + days * DAY).toISOString();
}
export function practiceTurn(
  role: PracticeTurn['role'],
  text: string,
  kind: PracticeTurn['kind'],
  at: string,
  itemId?: string,
): PracticeTurn {
  return { id: practiceId('turn'), role, text, kind, at, ...(itemId ? { itemId } : {}) };
}
export function makePracticeItem(
  topicId: string,
  taskId: string,
  itemId = practiceId('item'),
): PracticeItem {
  const topic = getTopic(topicId);
  const task = topic?.tasks.find((candidate) => candidate.id === taskId);
  if (!topic || !task) throw new Error('Unknown practice task');
  return {
    id: itemId,
    topicId,
    taskId,
    topicTitle: topic.title,
    prompt: task.prompt,
    taskVersion: topic.version,
    sourceIds: [
      ...new Set([
        topic.sourceId,
        ...(topic.sourceIds ?? []),
        ...getKnowledgeForTopic(topicId, topic.subject).flatMap((card) => card.sourceIds),
      ]),
    ],
  };
}
export function practiceTask(item: PracticeItem): Task | undefined {
  const topic = getTopic(item.topicId);
  return topic?.version === item.taskVersion
    ? topic.tasks.find((task) => task.id === item.taskId)
    : undefined;
}
export function isPracticeUncertainty(text: string, task?: Task): boolean {
  return classifyTutorInput(text, task) === 'hint';
}
export function isPracticeRevealed(
  record: DiagnosticRecord,
  itemId = record.items[record.currentIndex]?.id,
): boolean {
  return !!itemId && !!record.revealedItemIds?.includes(itemId);
}
export function summarizePractice(
  items: PracticeItem[],
  responses: PracticeResponse[],
  at: string,
): PracticeSummary {
  const skills = [...new Set(items.map((item) => item.topicId))].map((topicId) => {
    const selected = items.filter((item) => item.topicId === topicId);
    const answers = responses.filter((response) =>
      selected.some((item) => item.id === response.itemId),
    );
    const independentCorrect = answers.filter(
      (answer) => answer.correct && !answer.assisted,
    ).length;
    return {
      topicId,
      topicTitle: selected[0]!.topicTitle,
      independentCorrect,
      total: selected.length,
      needsPractice: independentCorrect < selected.length,
    };
  });
  const independentCorrect = responses.filter(
    (answer) => answer.correct && !answer.assisted,
  ).length;
  const assistedCorrect = responses.filter((answer) => answer.correct && answer.assisted).length;
  const revealedCorrect = responses.filter((answer) => answer.correct && answer.revealed).length;
  const skippedCount = responses.filter((answer) => answer.skipped).length;
  const weak = skills.filter((skill) => skill.needsPractice);
  const recommendations = weak.length
    ? weak.map(
        (skill) =>
          `Вернуться к теме «${skill.topicTitle}»: один пример по шагам, затем самостоятельная похожая задача.`,
      )
    : ['Проверить эти навыки на других заданиях и вернуться к ним после перерыва.'];
  const text = `Самостоятельно верно: ${independentCorrect} из ${items.length}.${assistedCorrect - revealedCorrect ? ` С подсказкой верно: ${assistedCorrect - revealedCorrect}.` : ''}${revealedCorrect ? ` После готового разбора записано верно: ${revealedCorrect}; это не самостоятельная проверка.` : ''}${skippedCount ? ` Без ответа: ${skippedCount}; знания по этим вопросам ещё не измерены.` : ''} ${weak.length ? `Вернёмся к темам: ${weak.map((skill) => skill.topicTitle).join(', ')}.` : 'В этих коротких заданиях ты справился самостоятельно.'}`;
  return {
    text,
    at,
    independentCorrect,
    assistedCorrect,
    revealedCorrect,
    skippedCount,
    total: items.length,
    skills,
    recommendations,
    sourceIds: [...new Set(items.flatMap((item) => item.sourceIds))],
    limitation:
      'Это наблюдение по нескольким тренировочным заданиям, не балл ЕГЭ и не подтверждение освоения темы.',
  };
}

export function latestDiagnostic(
  state: LearningState,
  subject: SubjectId,
  completedOnly = false,
): DiagnosticRecord | undefined {
  return Object.values(state.diagnostics ?? {})
    .filter(
      (record) => record.subject === subject && (!completedOnly || record.phase === 'completed'),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
}
function diagnosticItems(state: LearningState, subject: SubjectId): PracticeItem[] {
  const previous = Object.values(state.diagnostics ?? {}).filter(
    (record) => record.subject === subject && record.phase === 'completed',
  );
  const latest = previous.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const weak =
    latest?.summary?.skills.filter((skill) => skill.needsPractice).map((skill) => skill.topicId) ??
    [];
  const route = diagnosticRoute(state, subject);
  const rotation = route
    ? previous.filter((record) => record.route?.kind === 'secondary-math').length
    : previous.length;
  const baseline: Record<SubjectId, string[]> = {
    math: route
      ? ['math-absolute', 'math-radicals']
      : ['math-fraction', 'math-percent', 'math-rectangle'],
    russian: ['russian-syntax', 'russian-commas', 'russian-ne-ni'],
    history: ['history-baptism', 'history-reform'],
    social: ['social-demand', 'social-groups'],
  };
  const order = [
    ...new Set([
      ...(route ? ['math-absolute'] : []),
      ...weak.filter((topicId) => !route || Object.hasOwn(SECONDARY_MATH_TASKS, topicId)),
      ...baseline[subject],
      ...topics
        .filter(
          (topic) =>
            topic.subject === subject && (!route || Object.hasOwn(SECONDARY_MATH_TASKS, topic.id)),
        )
        .map((topic) => topic.id),
    ]),
  ];
  const selected: PracticeItem[] = [];
  for (let index = 0; selected.length < 3 && index < 12; index++) {
    const topic = getTopic(order[index % order.length]!);
    if (!topic || topic.subject !== subject) continue;
    const pool = route
      ? (SECONDARY_MATH_TASKS[topic.id]?.flatMap((id) =>
          topic.tasks.filter((task) => task.id === id),
        ) ?? [])
      : topic.tasks;
    if (!pool.length) continue;
    const taskIndex = (rotation + Math.floor(index / order.length)) % pool.length;
    const task = pool[taskIndex]!;
    if (!selected.some((item) => item.taskId === task.id))
      selected.push(makePracticeItem(topic.id, task.id));
  }
  return selected;
}
export function startDiagnostic(
  state: LearningState,
  subject: SubjectId,
  now?: PracticeClock,
): { state: LearningState; diagnosticId: string } {
  if (!topics.some((topic) => topic.subject === subject)) throw new Error('Unknown subject');
  const active = Object.values(state.diagnostics ?? {}).find(
    (record) => record.subject === subject && record.phase !== 'completed',
  );
  if (active) return { state, diagnosticId: active.id };
  const at = practiceTime(now),
    id = practiceId('diagnostic');
  const items = diagnosticItems(state, subject);
  const route = diagnosticRoute(state, subject);
  const record: DiagnosticRecord = {
    id,
    version: 1,
    subject,
    createdAt: at,
    items,
    responses: [],
    transcript: [
      practiceTurn(
        'cosmos',
        route
          ? `${state.profile.name}, начнём с трёх вопросов о модуле, корнях и знаках выражений. Я буду задавать вопросы по одному. Можно попросить подсказку или пропустить вопрос. Твой маршрут — ${route.schoolGrade} класс; это авторская проверка основ, а не официальный уровень сложности или полный пробник ЕГЭ.`
          : `${state.profile.name}, давай коротко познакомимся с тем, что уже получается. Я задам три вопроса по одному. Можно подумать, попросить подсказку или пропустить вопрос. Это поможет выбрать следующий шаг.`,
        'greeting',
        at,
      ),
      practiceTurn('cosmos', items[0]!.prompt, 'question', at, items[0]!.id),
    ],
    hintedItemIds: [],
    currentIndex: 0,
    phase: 'question',
    materialStatus: 'training',
    ...(route ? { route } : {}),
  };
  return {
    state: { ...state, diagnostics: { ...state.diagnostics, [id]: record } },
    diagnosticId: id,
  };
}
export function hintDiagnostic(
  state: LearningState,
  diagnosticId: string,
  now?: PracticeClock,
  studentText?: string,
): LearningState {
  const record = state.diagnostics?.[diagnosticId];
  if (!record || record.phase !== 'question') return state;
  const item = record.items[record.currentIndex],
    task = item && practiceTask(item);
  if (!item || !task) return state;
  const at = practiceTime(now);
  const next = structuredClone(record);
  if (!record.hintedItemIds.includes(item.id)) next.hintedItemIds.push(item.id);
  const hintIndex = record.transcript.filter(
    (turn) => turn.role === 'cosmos' && turn.itemId === item.id && turn.kind === 'hint',
  ).length;
  const authoredHint = task.hints?.[hintIndex];
  const scaffold = hintIndex > 0 ? task.scaffolds?.[hintIndex - 1] : undefined;
  const help = isPracticeRevealed(record)
    ? 'Готовый разбор уже открыт выше. Можно записать ответ с этой опорой или перейти дальше без проверки. Самостоятельным такой ответ не станет.'
    : authoredHint
      ? `${authoredHint} Теперь ответь на исходный вопрос.`
      : hintIndex === 0
        ? `${task.hint} Попробуй теперь свой ответ.`
        : scaffold
          ? `Покажу одну опору: ${scaffold.answer}. ${scaffold.explanation} Это маленький шаг, а твой основной вопрос остаётся таким: ${item.prompt}`
          : `Дополнительный ориентир: ${task.hint} Если пока не получается, можно написать «напиши ответ» для полного разбора или нажать «Пока пропустить». Разбор не будет выдан за самостоятельный результат.`;
  next.transcript.push(
    practiceTurn(
      'student',
      studentText?.trim().slice(0, 2000) || 'Нужна маленькая подсказка.',
      'request',
      at,
      item.id,
    ),
    practiceTurn('cosmos', help, 'hint', at, item.id),
  );
  return { ...state, diagnostics: { ...state.diagnostics, [diagnosticId]: next } };
}

function practiceDialogue(
  state: LearningState,
  record: DiagnosticRecord,
  input: string,
  response: string,
  kind: PracticeTurn['kind'],
  at: string,
): LearningState {
  const next = structuredClone(record);
  const itemId = next.items[next.currentIndex]!.id;
  next.transcript.push(
    practiceTurn('student', input, 'request', at, itemId),
    practiceTurn('cosmos', response, kind, at, itemId),
  );
  if (kind === 'solution') {
    next.revealedItemIds = [...new Set([...(next.revealedItemIds ?? []), itemId])];
    if (!next.hintedItemIds.includes(itemId)) next.hintedItemIds.push(itemId);
  }
  return { ...state, diagnostics: { ...state.diagnostics, [record.id]: next } };
}
export function answerDiagnostic(
  state: LearningState,
  diagnosticId: string,
  text: string,
  submissionId = practiceId('submission'),
  now?: PracticeClock,
  skip = false,
): LearningState {
  const record = state.diagnostics?.[diagnosticId];
  const input = text.trim().slice(0, 2000);
  if (
    !record ||
    record.phase !== 'question' ||
    (!input && !skip) ||
    record.responses.some((response) => response.submissionId === submissionId)
  )
    return state;
  const item = record.items[record.currentIndex],
    task = item && practiceTask(item);
  if (!item || !task || record.responses.some((response) => response.itemId === item.id))
    return state;
  const at = practiceTime(now);
  if (!skip) {
    const intent = classifyTutorInput(input, task);
    if (intent === 'hint' || intent === 'why')
      return hintDiagnostic(state, diagnosticId, now, input);
    if (intent === 'reveal')
      return practiceDialogue(
        state,
        record,
        input,
        `Разберём этот пример. ${task.explanation} Ответ: ${task.answer}. Это готовый разбор, а не измерение твоего самостоятельного ответа. Можешь записать ответ с опорой или написать «дальше» без проверки.`,
        'solution',
        at,
      );
    if (intent === 'next' && isPracticeRevealed(record))
      return advanceDiagnostic(
        answerDiagnostic(state, diagnosticId, input, submissionId, now, true),
        diagnosticId,
        now,
      );
    if (intent === 'next')
      return practiceDialogue(
        state,
        record,
        input,
        'Можно решить вопрос, попросить подсказку или нажать «Пока пропустить». Пропуск отметим отдельно от проверенных ответов.',
        'clarification',
        at,
      );
    if (intent === 'repeat')
      return practiceDialogue(
        state,
        record,
        input,
        `Повторю условие: ${item.prompt}`,
        'question',
        at,
      );
    if (intent === 'discussion')
      return practiceDialogue(
        state,
        record,
        input,
        'Этот вопрос оставим без оценки. Здесь можно ответить на текущее задание, попросить подсказку или готовый разбор. Для свободного обсуждения вернись в учебную комнату.',
        'clarification',
        at,
      );
    const assessment = assessAnswer(task, input);
    if (assessment.status === 'ambiguous' || assessment.status === 'not-answer')
      return practiceDialogue(
        state,
        record,
        input,
        assessment.feedback ??
          'Уточни один окончательный ответ. Это уточнение не считается ошибкой.',
        'clarification',
        at,
      );
  }
  const assessment = skip ? undefined : assessAnswer(task, input);
  const correct = assessment?.status === 'correct';
  const next = structuredClone(record);
  next.responses.push({
    id: practiceId('response'),
    submissionId,
    itemId: item.id,
    text: skip ? input || 'Пока пропущу этот вопрос.' : input,
    correct,
    assisted: skip || record.hintedItemIds.includes(item.id),
    skipped: skip,
    ...(isPracticeRevealed(record) ? { revealed: true } : {}),
    at,
  });
  next.phase = 'feedback';
  next.transcript.push(
    practiceTurn(
      'student',
      skip ? input || 'Пока пропущу этот вопрос.' : input,
      skip ? 'request' : 'answer',
      at,
      item.id,
    ),
    practiceTurn(
      'cosmos',
      correct
        ? `${isPracticeRevealed(record) ? 'Ответ записан после готового разбора; самостоятельным результатом его не считаем.' : record.hintedItemIds.includes(item.id) ? 'Получилось с опорой на подсказку.' : 'Верно, этот шаг получился самостоятельно.'} ${assessment?.feedback ?? task.explanation}`
        : skip
          ? 'Хорошо, отметим этот навык для спокойного разбора. Сейчас перейдём к другому вопросу.'
          : `Спасибо за попытку. Проверим этот момент: ${task.explanation} Я запомню, к чему стоит вернуться.`,
      'feedback',
      at,
      item.id,
    ),
  );
  return { ...state, diagnostics: { ...state.diagnostics, [diagnosticId]: next } };
}
export function advanceDiagnostic(
  state: LearningState,
  diagnosticId: string,
  now?: PracticeClock,
): LearningState {
  const record = state.diagnostics?.[diagnosticId];
  if (!record || record.phase !== 'feedback') return state;
  const at = practiceTime(now),
    next = structuredClone(record);
  if (next.currentIndex + 1 < next.items.length) {
    next.currentIndex++;
    next.phase = 'question';
    const item = next.items[next.currentIndex]!;
    next.transcript.push(
      practiceTurn('cosmos', `Следующий маленький шаг. ${item.prompt}`, 'question', at, item.id),
    );
  } else {
    next.phase = 'completed';
    next.completedAt = at;
    next.summary = summarizePractice(next.items, next.responses, at);
    next.transcript.push(
      practiceTurn(
        'cosmos',
        `${next.summary.text} Я сохраню этот ориентир и буду учитывать его в наших занятиях. ${next.summary.limitation}`,
        'summary',
        at,
      ),
    );
  }
  return { ...state, diagnostics: { ...state.diagnostics, [diagnosticId]: next } };
}
export function diagnosticMemory(state: LearningState, subject: SubjectId): string {
  const record = latestDiagnostic(state, subject);
  if (!record) return '';
  const date = new Date(record.createdAt).toLocaleDateString('ru-RU');
  const previous =
    record.phase !== 'completed' ? latestDiagnostic(state, subject, true) : undefined;
  return (
    record.summary
      ? `Короткая диагностика ${date}: ${record.summary.text} Это предварительное наблюдение, не освоение темы.`
      : `Короткая диагностика от ${date} не закончена: пройдено вопросов ${record.responses.length} из ${record.items.length}. ${previous?.summary ? `Предыдущий итог ${new Date(previous.completedAt!).toLocaleDateString('ru-RU')}: ${previous.summary.text}` : 'Можно продолжить с сохранённого вопроса.'}`
  ).slice(0, 450);
}

export function practiceObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
export function validPracticeDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
export function sanitizePracticeRecord(value: unknown): DiagnosticRecord | undefined {
  const raw = practiceObject(value);
  if (
    !raw ||
    raw.version !== 1 ||
    typeof raw.id !== 'string' ||
    raw.id.length > 120 ||
    !validPracticeDate(raw.createdAt) ||
    !topics.some((topic) => topic.subject === raw.subject) ||
    !Array.isArray(raw.items) ||
    raw.items.length < 2 ||
    raw.items.length > 3
  )
    return undefined;
  const subject = raw.subject as SubjectId;
  const items: PracticeItem[] = [];
  for (const candidate of raw.items) {
    const item = practiceObject(candidate),
      topic = item && typeof item.topicId === 'string' ? getTopic(item.topicId) : undefined;
    if (
      !item ||
      !topic ||
      topic.subject !== subject ||
      typeof item.id !== 'string' ||
      item.id.length > 120 ||
      typeof item.taskId !== 'string' ||
      !topic.tasks.some((task) => task.id === item.taskId) ||
      items.some((existing) => existing.id === item.id || existing.taskId === item.taskId)
    )
      return undefined;
    const clean = makePracticeItem(topic.id, item.taskId, item.id);
    // Keep the actual question snapshot for history; a changed curriculum version cannot be graded silently.
    if (typeof item.prompt === 'string') clean.prompt = item.prompt.slice(0, 2500);
    if (typeof item.taskVersion === 'string') clean.taskVersion = item.taskVersion.slice(0, 80);
    items.push(clean);
  }
  const responses: PracticeResponse[] = [];
  if (Array.isArray(raw.responses))
    for (const candidate of raw.responses.slice(0, 3)) {
      const answer = practiceObject(candidate);
      if (
        !answer ||
        typeof answer.id !== 'string' ||
        typeof answer.submissionId !== 'string' ||
        typeof answer.itemId !== 'string' ||
        typeof answer.text !== 'string' ||
        typeof answer.correct !== 'boolean' ||
        typeof answer.assisted !== 'boolean' ||
        !validPracticeDate(answer.at) ||
        !items.some((item) => item.id === answer.itemId) ||
        responses.some(
          (existing) =>
            existing.itemId === answer.itemId || existing.submissionId === answer.submissionId,
        )
      )
        continue;
      responses.push({
        id: answer.id.slice(0, 120),
        submissionId: answer.submissionId.slice(0, 120),
        itemId: answer.itemId,
        text: answer.text.slice(0, 2000),
        correct: answer.skipped === true ? false : answer.correct,
        assisted: answer.assisted || answer.skipped === true || answer.revealed === true,
        skipped: answer.skipped === true,
        ...(answer.revealed === true ? { revealed: true } : {}),
        at: answer.at,
      });
    }
  const transcript: PracticeTurn[] = [];
  if (Array.isArray(raw.transcript))
    for (const candidate of raw.transcript.slice(-100)) {
      const turn = practiceObject(candidate);
      if (
        !turn ||
        typeof turn.id !== 'string' ||
        !['cosmos', 'student'].includes(String(turn.role)) ||
        typeof turn.text !== 'string' ||
        !validPracticeDate(turn.at) ||
        ![
          'greeting',
          'question',
          'answer',
          'hint',
          'feedback',
          'summary',
          'request',
          'solution',
          'clarification',
        ].includes(String(turn.kind)) ||
        (turn.itemId !== undefined && !items.some((item) => item.id === turn.itemId))
      )
        continue;
      transcript.push({
        id: turn.id.slice(0, 120),
        role: turn.role as PracticeTurn['role'],
        text: turn.text.slice(0, 4000),
        at: turn.at,
        kind: turn.kind as PracticeTurn['kind'],
        ...(typeof turn.itemId === 'string' ? { itemId: turn.itemId } : {}),
      });
    }
  const completed =
    raw.phase === 'completed' &&
    responses.length === items.length &&
    validPracticeDate(raw.completedAt);
  const firstUnanswered = items.findIndex(
    (item) => !responses.some((answer) => answer.itemId === item.id),
  );
  const requestedIndex = typeof raw.currentIndex === 'number' ? raw.currentIndex : -1;
  const feedbackIndex =
    Number.isInteger(requestedIndex) &&
    requestedIndex >= 0 &&
    requestedIndex < items.length &&
    responses.some((answer) => answer.itemId === items[requestedIndex]!.id)
      ? requestedIndex
      : -1;
  const phase = completed
    ? 'completed'
    : raw.phase === 'feedback' && feedbackIndex >= 0
      ? 'feedback'
      : firstUnanswered < 0
        ? 'feedback'
        : 'question';
  const record: DiagnosticRecord = {
    id: raw.id,
    version: 1,
    subject,
    createdAt: raw.createdAt,
    items,
    responses,
    transcript,
    hintedItemIds: Array.isArray(raw.hintedItemIds)
      ? [
          ...new Set(
            raw.hintedItemIds.filter(
              (itemId): itemId is string =>
                typeof itemId === 'string' && items.some((item) => item.id === itemId),
            ),
          ),
        ]
      : [],
    currentIndex: completed
      ? items.length - 1
      : phase === 'feedback'
        ? Math.max(0, feedbackIndex >= 0 ? feedbackIndex : items.length - 1)
        : Math.max(0, firstUnanswered),
    phase,
    materialStatus: 'training',
  };
  const revealedItemIds = [
    ...new Set([
      ...(Array.isArray(raw.revealedItemIds)
        ? raw.revealedItemIds.filter(
            (value): value is string =>
              typeof value === 'string' && items.some((item) => item.id === value),
          )
        : []),
      ...responses.filter((response) => response.revealed).map((response) => response.itemId),
      ...transcript
        .filter((turn) => turn.role === 'cosmos' && turn.kind === 'solution' && turn.itemId)
        .map((turn) => turn.itemId!),
    ]),
  ];
  if (revealedItemIds.length) {
    record.revealedItemIds = revealedItemIds;
    record.hintedItemIds = [...new Set([...record.hintedItemIds, ...revealedItemIds])];
    for (const response of record.responses)
      if (revealedItemIds.includes(response.itemId)) {
        response.revealed = true;
        response.assisted = true;
      }
  }
  const route = practiceObject(raw.route);
  if (
    subject === 'math' &&
    route?.kind === 'secondary-math' &&
    Number.isInteger(route.schoolGrade) &&
    Number(route.schoolGrade) >= 9 &&
    Number(route.schoolGrade) <= 11 &&
    ['basic', 'profile', 'undecided'].includes(String(route.mathLevel)) &&
    items.every((item) => HISTORICAL_SECONDARY_MATH_TOPICS.has(item.topicId))
  )
    record.route = {
      kind: 'secondary-math',
      schoolGrade: route.schoolGrade as number,
      mathLevel: route.mathLevel as DiagnosticRoute['mathLevel'],
    };
  if (completed) {
    record.completedAt = raw.completedAt as string;
    record.summary = summarizePractice(items, responses, record.completedAt);
  }
  return record;
}
export function hydrateDiagnostics(value: unknown): Record<string, DiagnosticRecord> {
  const raw = practiceObject(value),
    result: Record<string, DiagnosticRecord> = {};
  if (!raw) return result;
  for (const [key, candidate] of Object.entries(raw).slice(-500)) {
    const record = sanitizePracticeRecord(candidate);
    if (record && record.id === key && record.items.length === 3) result[key] = record;
  }
  return result;
}
