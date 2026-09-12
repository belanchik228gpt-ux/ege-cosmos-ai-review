import { subjects, topics } from './catalog';
import { sources, materialLabels, type LearningSource } from './sources';
import type { Attempt, LearningState, Message, Session, SubjectId, Task, Topic } from './types';
import { authoredTopicMarkdown } from '../../shared/document-topics.mjs';

export const documentTypes = [
  'Конспект занятия',
  'Решение задачи',
  'Карточки повторения',
  'Отчёт о прогрессе',
  'Недельный план',
  'Диагностический отчёт',
  'Подборка ошибок',
  'Индивидуальная программа',
  'Тренировочный вариант',
  'Разбор темы',
  'Пользовательский документ',
] as const;
export type DocumentKind = (typeof documentTypes)[number];
export interface DocumentSourceSnapshot {
  id: string;
  title: string;
  url: string;
  version: string;
  checkedAt: string;
  publisher: string;
  status: string;
  note?: string;
  purpose: 'topic' | 'exam-reference' | 'local-material';
}
export interface DocumentRequest {
  type: DocumentKind;
  subject: SubjectId;
  topicId: string;
  sessionId?: string;
  includeAnswers?: boolean;
  includeModelReplies?: boolean;
  now?: string | Date;
}
export interface DocumentContent {
  title: string;
  content: string;
  subject: SubjectId;
  topicId: string;
  topic: string;
  sessionId?: string;
  type: DocumentKind;
  sources: string[];
  sourceSnapshot: DocumentSourceSnapshot[];
  status: 'training';
}
interface Dependencies {
  topics?: readonly Topic[];
  sources?: readonly LearningSource[];
}
const dateText = (value: string | Date) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Дата не сохранена';
};
const section = (title: string, body: string) => `## ${title}\n${body}`;
const nonempty = <T>(value: T | undefined): value is T => value !== undefined;

export function documentSessions(
  state: LearningState,
  subject?: SubjectId,
  topicId?: string,
): Session[] {
  return Object.values(state.sessions)
    .filter(
      (session) =>
        (!subject || session.subject === subject) &&
        (!topicId || session.topicId === topicId) &&
        topics.some((topic) => topic.id === session.topicId && topic.subject === session.subject),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function sourceSnapshots(
  topic: Topic,
  registry: readonly LearningSource[],
  additionalIds: string[] = [],
): DocumentSourceSnapshot[] {
  const ids = new Set([
    topic.sourceId,
    ...(topic.sourceIds ?? []),
    ...additionalIds,
    'fipi-demo',
    'fipi-navigator',
  ]);
  return [...ids]
    .map((id) =>
      registry.find((source) => source.id === id && source.subjects.includes(topic.subject)),
    )
    .filter(nonempty)
    .filter((source) => !source.url || /^https:\/\//i.test(source.url))
    .map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      version: source.version,
      checkedAt: source.checkedAt,
      publisher: source.publisher,
      status: source.status,
      note: source.note,
      purpose:
        source.role === 'fact'
          ? 'topic'
          : source.status === 'official-reference'
            ? 'exam-reference'
            : source.status === 'local-training'
              ? 'local-material'
              : 'topic',
    }));
}

function sourcesText(snapshot: DocumentSourceSnapshot[]): string {
  if (!snapshot.length)
    return section('Источники', 'Проверенные ссылки для этой темы пока не добавлены.');
  const groups: Array<[DocumentSourceSnapshot['purpose'], string, string]> = [
    [
      'local-material',
      'Учебный материал Cosmos',
      'Авторские объяснения и упражнения. Они не становятся официальными заданиями из-за наличия ссылок ФИПИ.',
    ],
    [
      'topic',
      'Материалы по теме',
      'Ссылки для проверки учебных фактов. Они не подтверждают автоматически все реплики языковой модели.',
    ],
    [
      'exam-reference',
      'ФИПИ: формат экзамена и программа',
      'Эти ссылки нужны для сверки программы, структуры и требований экзамена; они не указаны как источник каждого факта этого конспекта.',
    ],
  ];
  const statusText: Record<string, string> = {
    'official-reference': 'официальный справочный материал',
    'primary-reference': 'материал учреждения или первичный источник',
    'local-training': 'тренировочный материал Cosmos',
  };
  return [
    section(
      'Источники и статус материала',
      'Документ подготовлен из локального учебного материала и сохранённых данных. Статус документа: тренировочный материал Cosmos. Это не официальное задание ФИПИ. Сведения об источниках зафиксированы при создании черновика.',
    ),
    ...groups.flatMap(([purpose, title, description]) => {
      const entries = snapshot.filter((source) => source.purpose === purpose);
      if (!entries.length) return [];
      return [
        `### ${title}\n${description}\n\n${entries.map((source) => `${source.title}\nИздатель: ${source.publisher}\nСтатус: ${statusText[source.status] || source.status}\nВерсия: ${source.version}\nДата проверки: ${source.checkedAt}\n${source.url ? `Ссылка: ${source.url}` : 'Источник установлен вместе с приложением.'}${source.note ? `\nПримечание: ${source.note}` : ''}`).join('\n\n')}`,
      ];
    }),
  ].join('\n\n');
}

function taskAttempts(attempts: Attempt[], task: Task) {
  return attempts.filter((attempt) => attempt.taskId === task.id);
}
function attemptLabel(attempt: Attempt) {
  if (!attempt.correct)
    return attempt.assisted
      ? 'ответ пока неверный, использовалась помощь'
      : 'самостоятельная попытка с ошибкой';
  return attempt.assisted
    ? 'верно с помощью — не самостоятельное освоение'
    : 'верно самостоятельно';
}
function counters(attempts: Attempt[], session?: Session) {
  const independent = attempts.filter((attempt) => attempt.correct && !attempt.assisted);
  const assisted = attempts.filter((attempt) => attempt.correct && attempt.assisted);
  const errors = attempts.filter((attempt) => !attempt.correct);
  const hints =
    session?.messages.filter(
      (message) =>
        message.role === 'cosmos' && ['hint', 'scaffold-complete'].includes(message.kind ?? ''),
    ).length || 0;
  const modelReplies =
    session?.messages.filter((message) => message.role === 'cosmos' && message.kind === 'model')
      .length || 0;
  return { independent, assisted, errors, hints, modelReplies };
}

function evidenceSummary(session: Session | undefined, attempts: Attempt[], topic: Topic): string {
  if (!session)
    return section(
      'Данные занятия',
      'Занятие не выбрано. Это учебный шаблон: самостоятельные ответы, ошибки и результаты в него не подставлены.',
    );
  const count = counters(attempts, session);
  return section(
    'Что сохранено в этом занятии',
    [
      `Состояние: ${session.completedAt ? 'занятие завершено' : 'занятие ещё продолжается; данные промежуточные'}.`,
      `Начато: ${dateText(session.startedAt)}.`,
      session.completedAt ? `Завершено: ${dateText(session.completedAt)}.` : '',
      `Проверенных попыток: ${attempts.length}.`,
      `Самостоятельных верных ответов: ${count.independent.length}.`,
      `Верных ответов с помощью: ${count.assisted.length}.`,
      `Попыток с ошибкой: ${count.errors.length}.`,
      `Разных заданий, решённых самостоятельно: ${new Set(count.independent.map((attempt) => attempt.taskId)).size} из ${topic.tasks.length}.`,
      `Сообщений с подсказками: ${count.hints}. Ответов локальной модели: ${count.modelReplies}.`,
      session.hintsUsed ? 'Для текущего задания уже использовалась помощь.' : '',
      !attempts.length
        ? 'Проверенных ответов пока нет. Прочитанное объяснение и просмотр сцены не считаются решёнными заданиями.'
        : 'Верный ответ с помощью не приравнивается к самостоятельному. Одно занятие не подтверждает освоение темы.',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

function attemptLog(topic: Topic, attempts: Attempt[]): string {
  if (!attempts.length)
    return section('Проверка ответов', 'В выбранном занятии пока нет проверенных попыток.');
  return section(
    'Проверка ответов',
    attempts
      .map((attempt, index) => {
        const task = topic.tasks.find((task) => task.id === attempt.taskId)!;
        return `### Попытка ${index + 1}\nЗадание: ${task.prompt}\nРезультат: ${attemptLabel(attempt)}.\nДата: ${dateText(attempt.at)}.`;
      })
      .join('\n\n'),
  );
}

function referenceTask(task: Task, includeAnswers: boolean): string {
  return `Условие: ${task.prompt}\nПервый шаг: ${task.hint}${
    includeAnswers
      ? `\n\nУчебный ответ для самопроверки: ${task.answer}\nРазбор из учебной базы: ${task.explanation}\nЭто справочный разбор, а не запись собственного решения ученика.`
      : '\nМоё решение:\n\nМой ответ:\n'
  } `;
}

function errorReview(topic: Topic, attempts: Attempt[], includeAnswers: boolean): string {
  const errors = attempts.filter((attempt) => !attempt.correct);
  if (!errors.length)
    return section(
      'Что разобрать',
      attempts.length
        ? 'В проверенных попытках этого занятия ошибок не зафиксировано. Ответы с помощью всё равно нужно повторить самостоятельно.'
        : 'Проверенных попыток пока нет. Нельзя утверждать, что ошибок нет или тема освоена.',
    );
  const tasks = topic.tasks.filter((task) => errors.some((attempt) => attempt.taskId === task.id));
  return section(
    'Разбор затруднений',
    tasks
      .map((task, index) => {
        const history = taskAttempts(attempts, task),
          last = history.at(-1)!;
        return `### Задание ${index + 1}\n${referenceTask(task, includeAnswers)}\nПопыток с ошибкой: ${history.filter((attempt) => !attempt.correct).length}.\nПоследний проверенный результат: ${attemptLabel(last)}.\nТочный ход рассуждения не прикреплён к записи попытки; причину ошибки по одному несовпадению ответа не определяем.\nЧто я изменю при следующей попытке:\n`;
      })
      .join('\n\n'),
  );
}

function repeatCards(topic: Topic, attempts: Attempt[], includeAnswers: boolean): string {
  if (!attempts.length)
    return section(
      'Карточки повторения',
      'Карточки по результатам занятия появятся после проверенных попыток. Пока можно записать свой вопрос:\n\nВопрос:\nПодсказка:\n',
    );
  const practiced = topic.tasks.filter((task) =>
    attempts.some((attempt) => attempt.taskId === task.id),
  );
  practiced.sort(
    (a, b) =>
      Number(taskAttempts(attempts, b).some((attempt) => !attempt.correct || attempt.assisted)) -
      Number(taskAttempts(attempts, a).some((attempt) => !attempt.correct || attempt.assisted)),
  );
  return section(
    'Карточки для самостоятельного повторения',
    practiced
      .map((task, index) => {
        const history = taskAttempts(attempts, task);
        const reason = history.some((attempt) => !attempt.correct)
          ? 'В занятии были ошибки.'
          : history.some((attempt) => attempt.assisted)
            ? 'Ответ получен с помощью: повтори самостоятельно.'
            : 'Проверь сохранение навыка после перерыва.';
        return `### Карточка ${index + 1}\nПочему повторяем: ${reason}\n${referenceTask(task, includeAnswers)}`;
      })
      .join('\n\n'),
  );
}

const educationalKinds = new Set([
  'answer',
  'request',
  'discussion',
  'hint',
  'scaffold-complete',
  'clarification',
  'guidance',
  'repeated-question',
  'solution',
  'feedback',
  'question',
  'teaching',
  'greeting',
  'summary',
  'material',
  'model',
]);
function dialogueNotes(
  session: Session | undefined,
  includeModelReplies: boolean,
  includeAnswers: boolean,
): string {
  if (!session) return '';
  const allowed = session.messages.filter(
    (message) => message.kind && educationalKinds.has(message.kind),
  );
  const student = allowed
    .filter(
      (message) =>
        message.role === 'student' &&
        ['answer', 'discussion', 'request'].includes(message.kind || ''),
    )
    .slice(-5);
  const hints = allowed
    .filter(
      (message) =>
        message.role === 'cosmos' &&
        (message.kind === 'hint' ||
          message.kind === 'scaffold-complete' ||
          (includeAnswers && message.kind === 'solution')),
    )
    .slice(-3);
  const model = includeModelReplies
    ? allowed.filter((message) => message.kind === 'model' && message.role === 'cosmos').slice(-2)
    : [];
  const list = (messages: Message[], label: string) =>
    messages.map((message) => `${label}: ${message.text}`).join('\n\n');
  return [
    student.length
      ? section(
          'Мои реплики в занятии',
          `${list(student, 'Ученик')}\n\nЭто выдержки из переписки; они не привязаны автоматически к отдельным проверенным попыткам.`,
        )
      : '',
    hints.length ? section('Подсказки из занятия', list(hints, 'Cosmos')) : '',
    model.length
      ? section(
          'Объяснения локальной модели — не проверены',
          `${list(model, 'Локальная модель')}\n\nЭти реплики сохранены для обсуждения и могут содержать ошибки. Ссылки ниже не подтверждают их автоматически.`,
        )
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function proposedPlan(topic: Topic, attempts: Attempt[], dailyMinutes: number, now: Date): string {
  const needsHelp = topic.tasks.filter((task) =>
    taskAttempts(attempts, task).some((attempt) => !attempt.correct || attempt.assisted),
  );
  const focus = needsHelp[0]?.prompt || topic.question;
  const minutes = Math.max(5, Math.min(15, dailyMinutes));
  return section(
    'Предлагаемый маршрут',
    `План относится к теме «${topic.title}». Это предложение, а не запись выполненных занятий.\n\n${[
      0, 1, 3, 6,
    ]
      .map((offset, index) => {
        const date = new Date(now);
        date.setDate(date.getDate() + offset);
        return `### ${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}\n${minutes} минут. ${['Вернись к первому шагу и выбери одно затруднение.', 'Реши знакомое задание без подсказки.', 'Попробуй похожий пример после перерыва.', 'Проверь себя и реши, что повторить ещё.'][index]}\n${index === 0 ? `Ориентир: ${focus}` : 'Результат нужно будет проверить и сохранить в новом занятии.'}`;
      })
      .join(
        '\n\n',
      )}\n\nОсвоение подтверждается несколькими самостоятельными ответами и повторением после перерыва.`,
  );
}

/** Build a draft from one explicitly selected, subject-isolated session. Never mutate learning state. */
export function buildDocumentContent(
  state: LearningState,
  request: DocumentRequest,
  dependencies: Dependencies = {},
): DocumentContent {
  const catalog = dependencies.topics ?? topics,
    registry = dependencies.sources ?? sources;
  const topic = catalog.find(
    (topic) => topic.id === request.topicId && topic.subject === request.subject,
  );
  if (!topic) throw new Error('Выбранная тема не относится к этому предмету.');
  const session = request.sessionId ? state.sessions[request.sessionId] : undefined;
  if (
    request.sessionId &&
    (!session || session.subject !== request.subject || session.topicId !== topic.id)
  )
    throw new Error('Выбери занятие по текущей теме и предмету.');
  const now = new Date(request.now ?? new Date());
  if (!Number.isFinite(now.getTime())) throw new Error('Не удалось определить дату документа.');
  const attempts = session
    ? (state.progress[topic.id]?.attempts ?? [])
        .filter(
          (attempt) =>
            attempt.sessionId === session.id &&
            topic.tasks.some((task) => task.id === attempt.taskId),
        )
        .slice()
        .sort((a, b) => a.at.localeCompare(b.at))
    : [];
  const citedIds =
    session?.messages
      .filter(
        (message) =>
          message.kind &&
          educationalKinds.has(message.kind) &&
          (message.kind !== 'model' || request.includeModelReplies),
      )
      .flatMap((message) => message.sourceIds ?? []) ?? [];
  const snapshot = sourceSnapshots(topic, registry, citedIds),
    includeAnswers = !!request.includeAnswers;
  const title =
    request.type === 'Пользовательский документ'
      ? `Мои заметки · ${topic.title}`
      : `${request.type} · ${topic.title}`;
  const intro = `# ${title}\n\nУченик: ${state.profile.name}\nПредмет: ${subjects.find((subject) => subject.id === request.subject)?.title}\nТема: ${topic.title}\nСоздано: ${dateText(now)}\nМатериал темы: ${materialLabels[topic.materialStatus]} · версия ${topic.version}`;
  const material = section(
    'Опорный материал темы',
    `${topic.explanation}\n\nЧто нужно понять: ${topic.goal}\nПервый шаг: ${topic.firstStep}\nФормула или вывод: ${topic.formula}`,
  );
  const summary = evidenceSummary(session, attempts, topic);
  const teachingSpread = authoredTopicMarkdown(topic.id) || material;
  let parts: string[];
  switch (request.type) {
    case 'Подборка ошибок':
      parts = [summary, errorReview(topic, attempts, includeAnswers)];
      break;
    case 'Карточки повторения':
      parts = [summary, repeatCards(topic, attempts, includeAnswers)];
      break;
    case 'Отчёт о прогрессе':
    case 'Диагностический отчёт':
      parts = [
        summary,
        attemptLog(topic, attempts),
        section(
          'Как читать результат',
          'Отчёт описывает только выбранное занятие. Это не прогноз балла ЕГЭ и не полная предметная диагностика.',
        ),
        errorReview(topic, attempts, includeAnswers),
      ];
      break;
    case 'Решение задачи': {
      const task =
        topic.tasks.find((task) => attempts.some((attempt) => attempt.taskId === task.id)) ||
        topic.tasks[session?.taskIndex ?? 0] ||
        topic.tasks[0];
      parts = [
        summary,
        section('Разбор задания', referenceTask(task, includeAnswers)),
        section(
          'Мой ход решения',
          'Запиши свои рассуждения. Приложение не восстанавливает полный ход решения из одного числового ответа.\n',
        ),
      ];
      break;
    }
    case 'Недельный план':
    case 'Индивидуальная программа':
      parts = [summary, proposedPlan(topic, attempts, state.profile.dailyMinutes, now)];
      break;
    case 'Тренировочный вариант':
      parts = [
        summary,
        section(
          'Учебная подборка по теме',
          `Это авторская подборка по одной теме, не полный вариант ЕГЭ.\n\n${topic.tasks.map((task, index) => `### Задание ${index + 1}\n${referenceTask(task, includeAnswers)}`).join('\n\n')}`,
        ),
      ];
      break;
    case 'Пользовательский документ':
      parts = [summary, section('Мои заметки', 'Запиши то, что хочешь сохранить.\n')];
      break;
    case 'Разбор темы':
      parts = [
        teachingSpread,
        summary,
        material,
        section('Самостоятельный вопрос', topic.question),
      ];
      break;
    default:
      parts = [
        teachingSpread,
        summary,
        material,
        attemptLog(topic, attempts),
        section(
          'Следующий шаг',
          attempts.length
            ? 'Повтори одно из заданий самостоятельно после перерыва. Подсказка помогает понять, но не подтверждает самостоятельный навык.'
            : topic.firstStep,
        ),
      ];
  }
  return {
    title,
    subject: request.subject,
    topicId: topic.id,
    topic: topic.title,
    sessionId: session?.id,
    type: request.type,
    status: 'training',
    sourceSnapshot: snapshot,
    sources: snapshot.map((source) => source.url).filter(Boolean),
    content: [
      intro,
      ...parts,
      dialogueNotes(session, !!request.includeModelReplies, includeAnswers),
      session?.note?.trim() ? section('Моя заметка из занятия', session.note.trim()) : '',
      section('Мои выводы', 'Что стало понятнее:\n\nЧто ещё нужно разобрать:\n'),
      sourcesText(snapshot),
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}
