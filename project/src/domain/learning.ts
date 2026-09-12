import { getTopic, subjects, topics } from './catalog';
import { cleanEgeTopicSkips } from './ege-topic-skips';
import { hydrateDiagnostics } from './diagnostics';
import { hydrateHomework } from './homework';
import { hydratePreferences } from './preferences';
import { createPlanningState, hydrateStudyPlanning } from './study-plan';
import { createStudyWorkspace, hydrateStudyWorkspace } from './workspace';
import { assessAnswer } from './answer-check';
import {
  createTeachingState,
  getTeachingContext,
  handleTeachingTurn,
  hydrateTeachingState,
  selectTeachingStep,
} from './teaching';
import { classifyTutorInput } from './tutor-intent';
import { hydrateProblemSessions } from './problem-sessions';
import { hydrateCloudLessons, cleanDrawing } from './cloud-learning';
import { hydrateSchoolState } from './school-state';
import { getGradeLessonIds } from './school-catalog';
export { assessAnswer } from './answer-check';
export { classifyTutorInput } from './tutor-intent';
export type { AnswerAssessment } from './answer-check';
export type { TutorInputIntent } from './tutor-intent';
import type {
  Attempt,
  LearningDocument,
  LearningFact,
  LearningState,
  Message,
  Session,
  SubjectId,
  Task,
  Topic,
  TopicProgress,
} from './types';

const DAY = 86_400_000;
const emptyProgress = (): TopicProgress => ({ attempts: [], mastery: 'new' });
let sequence = 0;
const id = (prefix: string) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${++sequence}`}`;
type Clock = Date | string | number;
const date = (now: Clock = new Date()) => {
  const value = new Date(now);
  if (!Number.isFinite(value.getTime())) throw new Error('Invalid clock');
  return value;
};
const iso = (now?: Clock) => date(now).toISOString();
const copy = (state: LearningState): LearningState => structuredClone(state);
const say = (text: string, kind = 'teaching'): Message => ({
  id: id('message'),
  role: 'cosmos',
  text,
  kind,
});

export function createState(name = 'Ученик'): LearningState {
  return {
    version: 1,
    egeTopicSkips: {},
    profile: {
      name: name.trim().slice(0, 60) || 'Ученик',
      dailyMinutes: 30,
      selectedSubjects: subjects.map((subject) => subject.id),
    },
    sessions: {},
    progress: {},
    documents: [],
    facts: [],
    settings: {
      quality: 'high',
      reducedMotion: false,
      voice: false,
      background: 'cosmos',
      palette: 'cosmos',
      accentColor: '#bca5f5',
      spaceColor: '#0e0d16',
      textScale: 'normal',
      contrast: 'soft',
      focusMode: false,
      uiMotion: 'expressive',
      motionSpeed: 'normal',
      glow: 'vivid',
      hoverEffects: true,
      animatedBackground: true,
      sceneAutoplay: true,
      sceneSpeed: 1,
      density: 'comfortable',
      cornerStyle: 'soft',
      contentWidth: 'wide',
      lessonLayout: 'balanced',
      fontFamily: 'system',
      documentStyle: 'cosmos',
      documentScale: 'comfortable',
      sourceDetailsExpanded: false,
      voiceRate: 1,
      voicePitch: 1,
      voiceVolume: 0.8,
      enterToSend: true,
      autoHomework: true,
      showReviewReminders: true,
    },
    bookmarks: [],
    diagnostics: {},
    homework: {},
    problemSessions: {},
    cloudSessions: {},
    preferenceProfiles: [],
    planning: createPlanningState(),
    studyWorkspace: createStudyWorkspace(),
  };
}

export function topicStatus(state: LearningState, topicId: string): TopicProgress {
  return state.progress[topicId] ?? emptyProgress();
}

export function startSession(
  state: LearningState,
  topicId: string,
  now?: Clock,
): { state: LearningState; sessionId: string } {
  const topic = getTopic(topicId);
  if (!topic) throw new Error('Unknown topic');
  const next = copy(state);
  const sessionId = id('lesson');
  const progress = topicStatus(next, topicId);
  const isRepeat = progress.attempts.length > 0;
  next.sessions[sessionId] = {
    id: sessionId,
    subject: topic.subject,
    topicId,
    startedAt: iso(now),
    taskIndex: 0,
    hintsUsed: 0,
    activeMs: 0,
    phase: 'practice',
    teaching: createTeachingState(topic.tasks[0]),
    messages: [
      say(
        `${next.profile.name}, ${isRepeat ? 'вернёмся к теме' : 'сегодня разберём тему'} «${topic.title}». ${topic.explanation} ${isRepeat ? 'Посмотрим, что ты можешь решить самостоятельно.' : 'Будем двигаться небольшими шагами.'}`,
        'greeting',
      ),
      say(`Для начала — короткая самостоятельная попытка. ${topic.tasks[0].prompt}`, 'question'),
    ],
  };
  if (topic.tasks[0].teachingSteps?.length) {
    next.sessions[sessionId] = selectTeachingStep(
      next.sessions[sessionId],
      topic.tasks[0],
      topic.tasks[0].teachingSteps[0].id,
    );
    const context = getTeachingContext(next.sessions[sessionId], topic.tasks[0]);
    next.sessions[sessionId].messages[1] = say(
      `${context.explanation} ${context.activeQuestion.prompt}`,
      'question',
    );
  }
  next.progress[topicId] ??= emptyProgress();
  return { state: next, sessionId };
}

export function checkAnswer(task: Task, answer: string): boolean {
  return assessAnswer(task, answer).status === 'correct';
}

function masteryFor(attempts: Attempt[]): TopicProgress['mastery'] {
  if (attempts.length === 0) return 'new';
  // Latest evidence for each task wins; correcting the same example does not create a new skill.
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) latest.set(attempt.taskId, attempt);
  const independent = [...latest.values()].filter(
    (attempt) => attempt.correct && !attempt.assisted,
  );
  if (independent.length < 3 || !attempts.at(-1)?.correct) return 'learning';
  const successful = attempts.filter((attempt) => attempt.correct && !attempt.assisted);
  const firstTime = Math.min(...successful.map((attempt) => Date.parse(attempt.at)));
  const reviewEvidence = successful.filter((attempt) => Date.parse(attempt.at) - firstTime >= DAY);
  const repeatedSkills = new Set(
    reviewEvidence
      .filter((attempt) =>
        successful.some(
          (previous) =>
            previous.taskId === attempt.taskId &&
            previous.sessionId !== attempt.sessionId &&
            Date.parse(attempt.at) - Date.parse(previous.at) >= DAY,
        ),
      )
      .map((attempt) => attempt.taskId),
  );
  return repeatedSkills.size >= 3 ? 'mastered' : 'review';
}

function scheduleReview(
  attempts: Attempt[],
  at: string,
  mastery: TopicProgress['mastery'],
): string {
  if (mastery !== 'mastered') return new Date(Date.parse(at) + DAY).toISOString();
  const days = new Set(
    attempts
      .filter((attempt) => attempt.correct && !attempt.assisted)
      .map((attempt) => attempt.at.slice(0, 10)),
  ).size;
  const interval = [1, 3, 7, 14, 30][Math.min(days - 1, 4)] ?? 1;
  return new Date(Date.parse(at) + interval * DAY).toISOString();
}

function currentTaskMessages(session: Session): Message[] {
  const latestQuestion = session.messages.reduce(
    (latest, message, index) => (message.kind === 'question' ? index : latest),
    -1,
  );
  return session.messages.slice(latestQuestion + 1);
}

/** Only an explicit authored reveal of the current task; prior tasks and model prose do not count. */
export function isTaskRevealed(session: Session): boolean {
  return (
    session.phase === 'practice' &&
    !session.completedAt &&
    (session.teaching?.mainRevealed === true ||
      currentTaskMessages(session).some(
        (message) => message.role === 'cosmos' && message.kind === 'solution',
      ))
  );
}

export function submitAnswer(
  state: LearningState,
  sessionId: string,
  text: string,
  now?: Clock,
): LearningState {
  const original = state.sessions[sessionId];
  const topic = original && getTopic(original.topicId);
  if (
    !original ||
    !topic ||
    original.subject !== topic.subject ||
    original.completedAt ||
    original.phase === 'summary' ||
    !text.trim()
  )
    return state;
  const currentTask = topic.tasks[original.taskIndex];
  if (!currentTask) return state;
  const next = copy(state);
  const turn = handleTeachingTurn(
    original,
    currentTask,
    text.trim().slice(0, 4000),
    now ?? new Date(),
  );
  const session = turn.session;
  next.sessions[sessionId] = session;
  const result = turn.completion;
  if (!result) return next;
  let attempts = topicStatus(next, topic.id).attempts;
  let mastery = topicStatus(next, topic.id).mastery;
  if (!result.skipped) {
    const at = iso(now);
    attempts = [
      ...attempts,
      { taskId: currentTask.id, correct: result.correct, assisted: result.assisted, at, sessionId },
    ];
    mastery = masteryFor(attempts);
    next.progress[topic.id] = {
      attempts,
      mastery,
      nextReviewAt: scheduleReview(attempts, at, mastery),
    };
    if (!result.correct) {
      session.hintsUsed += 1;
      session.teaching!.assisted = true;
      // Feedback stays on the current question. A new smaller question is activated only by the controller.
      session.messages.push(
        say(
          `${result.feedback ?? 'Этот ответ пока не совпал с условием.'} Проверь текущий вопрос ещё раз или попроси разобрать первый шаг. ${currentTask.prompt}`,
          'feedback',
        ),
      );
      return next;
    }
  }
  if (session.teaching) {
    session.teachingHistory = [
      ...(session.teachingHistory ?? []),
      structuredClone(session.teaching),
    ].slice(-100);
  }
  session.taskIndex += 1;
  session.hintsUsed = 0;
  delete session.scaffoldIndex;
  delete session.teaching;
  session.messages.push(
    say(
      result.skipped
        ? 'Перейдём дальше. По этому заданию самостоятельный ответ не засчитан; к нему можно вернуться на повторении.'
        : `${result.assisted ? 'Да, теперь получилось.' : 'Верно, ты справился самостоятельно.'} ${result.feedback ?? currentTask.explanation}`,
      result.skipped ? 'guidance' : 'feedback',
    ),
  );
  if (session.taskIndex < topic.tasks.length) {
    session.teaching = createTeachingState(topic.tasks[session.taskIndex]);
    const nextTask = topic.tasks[session.taskIndex];
    if (nextTask.teachingSteps?.length) {
      Object.assign(session, selectTeachingStep(session, nextTask, nextTask.teachingSteps[0].id));
      const context = getTeachingContext(session, nextTask);
      session.messages.push(
        say(
          `Перейдём к новому примеру. ${context.explanation} ${context.activeQuestion.prompt}`,
          'question',
        ),
      );
    } else
      session.messages.push(say(`Теперь попробуй новый пример. ${nextTask.prompt}`, 'question'));
  } else {
    session.phase = 'summary';
    const independent = attempts.filter(
      (attempt) => attempt.sessionId === sessionId && attempt.correct && !attempt.assisted,
    ).length;
    session.messages.push(
      say(
        `${next.profile.name}, последовательность заданий завершена. Самостоятельных правильных ответов: ${independent} из ${topic.tasks.length}. ${mastery === 'mastered' ? 'Ты подтвердил навык после перерыва. Следующее повторение уже запланировано.' : 'Разборы с помощью и пропуски не подтверждают самостоятельный навык. Вернёмся к теме после перерыва.'} Нажми «Завершить занятие», чтобы сохранить итог.`,
        'summary',
      ),
    );
  }
  return next;
}

export function finishSession(state: LearningState, sessionId: string, now?: Clock): LearningState {
  const original = state.sessions[sessionId];
  const topic = original && getTopic(original.topicId);
  if (!original || !topic || original.completedAt) return state;
  const next = copy(state);
  const session = next.sessions[sessionId];
  session.completedAt = iso(now);
  session.phase = 'summary';
  const attempts = topicStatus(next, topic.id).attempts.filter(
    (attempt) => attempt.sessionId === sessionId,
  );
  const independent = new Set(
    attempts
      .filter((attempt) => attempt.correct && !attempt.assisted)
      .map((attempt) => attempt.taskId),
  ).size;
  const errors = attempts.filter((attempt) => !attempt.correct).length;
  const checkedTasks = new Set(
    attempts.filter((attempt) => attempt.correct).map((attempt) => attempt.taskId),
  ).size;
  const viewedWithoutCheck = Math.max(0, session.taskIndex - checkedTasks);
  session.summary = `${topic.title}. Самостоятельно решено: ${independent} из ${topic.tasks.length}. ${errors ? `Попыток с ошибками: ${errors}.` : attempts.length ? 'В проверенных ответах ошибок нет.' : 'Ответы ещё не проверены.'} ${viewedWithoutCheck ? `Заданий завершено без проверки: ${viewedWithoutCheck}. ` : ''}${session.taskIndex < topic.tasks.length ? 'Практика завершена раньше; оставшиеся задания доступны в новом занятии.' : viewedWithoutCheck ? 'Последовательность завершена; разобранные или пропущенные задания ещё нужно проверить самостоятельной практикой.' : 'Практика пройдена.'}`;
  session.messages.push(say(`${state.profile.name}, итог сохранён. ${session.summary}`, 'summary'));
  return next;
}

function dayKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function practiceObservations(state: LearningState) {
  const observations = new Map<string, { at: number; needsPractice: boolean }>();
  const records = [
    ...Object.values(state.diagnostics ?? {}),
    ...Object.values(state.homework ?? {}),
  ];
  for (const record of records) {
    if (record.phase !== 'completed' || !record.summary) continue;
    const at = Date.parse(record.completedAt || record.summary.at);
    if (!Number.isFinite(at)) continue;
    for (const skill of record.summary.skills) {
      if (getTopic(skill.topicId)?.subject !== record.subject) continue;
      if ((observations.get(skill.topicId)?.at ?? -Infinity) <= at)
        observations.set(skill.topicId, { at, needsPractice: skill.needsPractice });
    }
  }
  return observations;
}

export function getStats(state: LearningState, now?: Clock) {
  const current = date(now);
  const completed = Object.values(state.sessions).filter((session) => session.completedAt);
  const allAttempts = Object.values(state.progress).flatMap((progress) => progress.attempts);
  const observations = practiceObservations(state);
  const activeDays = new Set([
    ...completed
      .filter((session) => allAttempts.some((attempt) => attempt.sessionId === session.id))
      .map((session) => dayKey(new Date(session.completedAt!))),
    ...[...Object.values(state.diagnostics ?? {}), ...Object.values(state.homework ?? {})]
      .filter(
        (record) => record.completedAt && record.responses.some((response) => !response.skipped),
      )
      .map((record) => dayKey(new Date(record.completedAt!))),
  ]);
  let streak = 0;
  const cursor = new Date(current);
  if (!activeDays.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (activeDays.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  const weakTopics = topics.filter((topic) => {
    const latest = new Map<string, Attempt>();
    for (const attempt of topicStatus(state, topic.id).attempts)
      latest.set(attempt.taskId, attempt);
    const newestAttempt = Math.max(
      -Infinity,
      ...[...latest.values()].map((attempt) => Date.parse(attempt.at)),
    );
    const observed = observations.get(topic.id);
    return (
      [...latest.values()].some((attempt) => !attempt.correct || attempt.assisted) ||
      !!(observed?.needsPractice && observed.at >= newestAttempt)
    );
  });
  const dueTopics = topics.filter((topic) => {
    const review = topicStatus(state, topic.id).nextReviewAt;
    return review && Date.parse(review) <= current.getTime();
  });
  const bySubject = Object.fromEntries(
    subjects.map((subject) => {
      const subjectTopics = topics.filter((topic) => topic.subject === subject.id);
      const attempts = subjectTopics.flatMap((topic) => topicStatus(state, topic.id).attempts);
      const mastered = subjectTopics.filter(
        (topic) => topicStatus(state, topic.id).mastery === 'mastered',
      ).length;
      return [
        subject.id,
        {
          totalTopics: subjectTopics.length,
          startedTopics: subjectTopics.filter(
            (topic) => topicStatus(state, topic.id).attempts.length > 0,
          ).length,
          masteredTopics: mastered,
          percent: Math.round((mastered / subjectTopics.length) * 100),
          attempts: attempts.length,
          correct: attempts.filter((attempt) => attempt.correct).length,
          completedSessions: completed.filter((session) => session.subject === subject.id).length,
        },
      ];
    }),
  ) as Record<
    SubjectId,
    {
      totalTopics: number;
      startedTopics: number;
      masteredTopics: number;
      percent: number;
      attempts: number;
      correct: number;
      completedSessions: number;
    }
  >;
  return {
    completedSessions: completed.length,
    totalAttempts: allAttempts.length,
    correctAttempts: allAttempts.filter((attempt) => attempt.correct).length,
    independentCorrect: allAttempts.filter((attempt) => attempt.correct && !attempt.assisted)
      .length,
    streak,
    totalMinutes: Math.round(
      completed.reduce(
        (sum, session) =>
          sum +
          (session.activeMs ??
            Math.min(
              getTopic(session.topicId)!.durationMinutes * 60_000,
              Math.max(0, Date.parse(session.completedAt!) - Date.parse(session.startedAt)),
            )),
        0,
      ) / 60_000,
    ),
    weakTopics,
    dueTopics,
    bySubject,
  };
}

/** Clear only one subject's evidence; saved documents and user preferences are independent. */
export function clearSubjectHistory(state: LearningState, subject: SubjectId): LearningState {
  return {
    ...state,
    sessions: Object.fromEntries(
      Object.entries(state.sessions).filter(([, record]) => record.subject !== subject),
    ),
    progress: Object.fromEntries(
      Object.entries(state.progress).filter(([topicId]) => getTopic(topicId)?.subject !== subject),
    ),
    diagnostics: Object.fromEntries(
      Object.entries(state.diagnostics ?? {}).filter(([, record]) => record.subject !== subject),
    ),
    homework: Object.fromEntries(
      Object.entries(state.homework ?? {}).filter(([, record]) => record.subject !== subject),
    ),
    cloudSessions: Object.fromEntries(
      Object.entries(state.cloudSessions ?? {}).filter(([, record]) => record.subject !== subject),
    ),
  };
}

export interface PlanItem {
  id: string;
  subject: SubjectId;
  topicId: string;
  title: string;
  minutes: number;
  kind: 'review' | 'practice' | 'diagnostic';
  reason: string;
}

export function buildPlan(state: LearningState, now?: Clock): PlanItem[] {
  const stats = getStats(state, now);
  const observations = practiceObservations(state);
  let remaining = Math.min(240, Math.max(5, state.profile.dailyMinutes));
  const selected = state.profile.selectedSubjects;
  const grade = state.planning?.preferences.schoolGrade ?? 10;
  const gradeLessonIds = new Set(selected.flatMap((subject) => getGradeLessonIds(subject, grade)));
  const allowed = (topic: Topic) =>
    selected.includes(topic.subject) && (grade < 8 || gradeLessonIds.has(topic.id));
  const available = topics
    .filter(allowed)
    .sort((a, b) => (a.id === 'math-absolute' ? -1 : b.id === 'math-absolute' ? 1 : 0));
  const due = stats.dueTopics.filter(allowed);
  const weak = stats.weakTopics.filter(allowed);
  const preferred = selected.flatMap((subject) => {
    const inSubject = available.filter((topic) => topic.subject === subject);
    return (
      inSubject.find((topic) => topicStatus(state, topic.id).mastery === 'new') ??
      inSubject.find((topic) => topicStatus(state, topic.id).mastery !== 'mastered') ??
      []
    );
  });
  const unique = [
    ...new Map([...due, ...weak, ...preferred].map((topic) => [topic.id, topic])).values(),
  ];
  return unique.reduce<PlanItem[]>((plan, topic) => {
    if (remaining < 5) return plan;
    const kind: PlanItem['kind'] = due.includes(topic)
      ? 'review'
      : topicStatus(state, topic.id).mastery === 'new' && !observations.has(topic.id)
        ? 'diagnostic'
        : 'practice';
    const minutes = Math.min(kind === 'review' ? 8 : topic.durationMinutes, remaining);
    remaining -= minutes;
    plan.push({
      id: `plan-${topic.id}`,
      topicId: topic.id,
      subject: topic.subject,
      title: topic.title,
      minutes,
      kind,
      reason:
        kind === 'review'
          ? 'Пришло время проверить знания после перерыва'
          : weak.includes(topic)
            ? 'Вернёмся к шагу, где понадобилась помощь'
            : kind === 'diagnostic'
              ? 'Короткая проверка перед изучением темы'
              : 'Закрепим самостоятельное решение',
    });
    return plan;
  }, []);
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const validText = (value: unknown, max = 20_000): value is string =>
  typeof value === 'string' && value.length <= max;
const validDate = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const validSubject = (value: unknown): value is SubjectId =>
  subjects.some((subject) => subject.id === value);
const finiteInteger = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** Rebuild known state fields from disk; invalid records cannot create mastery or cross-subject context. */
export function hydrateState(input: unknown): LearningState {
  if (typeof input === 'string') {
    try {
      return hydrateState(JSON.parse(input));
    } catch {
      return createState();
    }
  }
  if (!record(input) || input.version !== 1) return createState();
  const state = createState();
  state.egeTopicSkips = cleanEgeTopicSkips(input.egeTopicSkips);
  if (record(input.profile)) {
    if (validText(input.profile.name, 60) && input.profile.name.trim())
      state.profile.name = input.profile.name.trim();
    if (finiteInteger(input.profile.dailyMinutes, 5, 240))
      state.profile.dailyMinutes = input.profile.dailyMinutes;
    if (Array.isArray(input.profile.selectedSubjects))
      state.profile.selectedSubjects = [
        ...new Set(input.profile.selectedSubjects.filter(validSubject)),
      ];
  }
  if (record(input.settings)) {
    if (['high', 'medium', 'low', 'static'].includes(String(input.settings.quality)))
      state.settings.quality = input.settings.quality as LearningState['settings']['quality'];
    if (typeof input.settings.reducedMotion === 'boolean')
      state.settings.reducedMotion = input.settings.reducedMotion;
    if (typeof input.settings.voice === 'boolean') state.settings.voice = input.settings.voice;
    if (validText(input.settings.background, 200))
      state.settings.background = input.settings.background;
    if (
      ['cosmos', 'aurora', 'ocean', 'amber', 'rose', 'custom'].includes(
        String(input.settings.palette),
      )
    )
      state.settings.palette = input.settings.palette as LearningState['settings']['palette'];
    for (const key of ['accentColor', 'spaceColor'] as const)
      if (typeof input.settings[key] === 'string' && /^#[0-9a-f]{6}$/i.test(input.settings[key]))
        state.settings[key] = input.settings[key];
    if (['normal', 'comfortable', 'large'].includes(String(input.settings.textScale)))
      state.settings.textScale = input.settings.textScale as LearningState['settings']['textScale'];
    if (input.settings.contrast === 'high') state.settings.contrast = 'high';
    if (typeof input.settings.focusMode === 'boolean')
      state.settings.focusMode = input.settings.focusMode;
    state.settings = hydratePreferences(input.settings, state.settings);
  }
  if (Array.isArray(input.bookmarks))
    state.bookmarks = [
      ...new Set(
        input.bookmarks.filter((id): id is string => typeof id === 'string' && !!getTopic(id)),
      ),
    ];
  if (record(input.sessions)) {
    for (const [key, raw] of Object.entries(input.sessions)) {
      if (!record(raw) || !validText(key, 200) || raw.id !== key || !validText(raw.topicId, 200))
        continue;
      const topic = getTopic(raw.topicId);
      if (
        !topic ||
        raw.subject !== topic.subject ||
        !validDate(raw.startedAt) ||
        !Array.isArray(raw.messages)
      )
        continue;
      const messages: Message[] = raw.messages
        .filter((message): message is Record<string, unknown> => record(message))
        .filter(
          (message) =>
            validText(message.id, 200) &&
            ['cosmos', 'student'].includes(String(message.role)) &&
            validText(message.text) &&
            !['probe', 'login', 'diagnostic', 'technical', 'test'].includes(String(message.kind)),
        )
        .map((message) => ({
          id: message.id as string,
          role: message.role as Message['role'],
          text: message.text as string,
          ...(validText(message.kind, 100) ? { kind: message.kind } : {}),
          ...(Array.isArray(message.sourceIds)
            ? {
                sourceIds: message.sourceIds
                  .filter((s): s is string => validText(s, 200))
                  .slice(0, 20),
              }
            : {}),
          ...(Array.isArray(message.knowledgeIds)
            ? {
                knowledgeIds: message.knowledgeIds
                  .filter((s): s is string => validText(s, 200))
                  .slice(0, 10),
              }
            : {}),
          ...(message.role === 'cosmos' &&
          message.kind === 'model' &&
          record(message.verification) &&
          message.verification.method === 'local-model-review' &&
          validDate(message.verification.checkedAt) &&
          Array.isArray(message.verification.evidence)
            ? {
                verification: {
                  method: 'local-model-review' as const,
                  checkedAt: message.verification.checkedAt,
                  evidence: message.verification.evidence
                    .filter(record)
                    .filter(
                      (entry) =>
                        validText(entry.id, 200) &&
                        validText(entry.quote, 1600) &&
                        Array.isArray(entry.sourceIds),
                    )
                    .slice(0, 8)
                    .map((entry) => ({
                      id: entry.id as string,
                      quote: entry.quote as string,
                      sourceIds: (entry.sourceIds as unknown[])
                        .filter((source): source is string => validText(source, 200))
                        .slice(0, 12),
                    })),
                },
              }
            : {}),
        }));
      state.sessions[key] = {
        id: key,
        subject: topic.subject,
        topicId: topic.id,
        startedAt: raw.startedAt,
        messages,
        taskIndex: finiteInteger(raw.taskIndex, 0, topic.tasks.length) ? raw.taskIndex : 0,
        hintsUsed: finiteInteger(raw.hintsUsed, 0, 100_000) ? raw.hintsUsed : 0,
        ...(finiteInteger(
          raw.scaffoldIndex,
          0,
          (topic.tasks[Number(raw.taskIndex)]?.scaffolds?.length ?? 0) - 1,
        )
          ? { scaffoldIndex: raw.scaffoldIndex }
          : {}),
        phase: raw.phase === 'summary' ? 'summary' : 'practice',
        ...(validDate(raw.completedAt) && Date.parse(raw.completedAt) >= Date.parse(raw.startedAt)
          ? { completedAt: raw.completedAt, phase: 'summary' as const }
          : {}),
        ...(validText(raw.summary) ? { summary: raw.summary } : {}),
        ...(validText(raw.note, 20000) ? { note: raw.note } : {}),
        ...(finiteInteger(raw.activeMs, 0, 31_536_000_000) ? { activeMs: raw.activeMs } : {}),
        ...(validText(raw.learningMemoryKey, 1000)
          ? { learningMemoryKey: raw.learningMemoryKey }
          : {}),
      };
      const restoredSession = state.sessions[key];
      const activeTask = topic.tasks[restoredSession.taskIndex];
      if (activeTask && restoredSession.phase === 'practice') {
        restoredSession.teaching = hydrateTeachingState(
          raw.teaching,
          activeTask,
          restoredSession.scaffoldIndex,
          restoredSession.hintsUsed > 0,
        );
        if (!raw.teaching && isTaskRevealed(restoredSession)) {
          restoredSession.teaching.mainRevealed = true;
          restoredSession.teaching.phase = 'revealed';
        }
      }
      if (Array.isArray(raw.teachingHistory))
        restoredSession.teachingHistory = raw.teachingHistory
          .filter(record)
          .slice(-100)
          .flatMap((entry) => {
            const task = topic.tasks.find((candidate) => candidate.id === entry.taskId);
            return task ? [hydrateTeachingState(entry, task)] : [];
          });
    }
  }
  if (record(input.progress)) {
    for (const [key, raw] of Object.entries(input.progress)) {
      const topic = getTopic(key);
      if (!topic || !record(raw) || !Array.isArray(raw.attempts)) continue;
      const attempts: Attempt[] = raw.attempts
        .filter((attempt): attempt is Record<string, unknown> => record(attempt))
        .filter(
          (attempt) =>
            validText(attempt.taskId, 200) &&
            topic.tasks.some((task) => task.id === attempt.taskId) &&
            typeof attempt.correct === 'boolean' &&
            typeof attempt.assisted === 'boolean' &&
            validDate(attempt.at) &&
            validText(attempt.sessionId, 200) &&
            state.sessions[attempt.sessionId]?.topicId === topic.id &&
            Date.parse(attempt.at) >= Date.parse(state.sessions[attempt.sessionId].startedAt),
        )
        .map((attempt) => ({
          taskId: attempt.taskId as string,
          correct: attempt.correct as boolean,
          assisted: attempt.assisted as boolean,
          at: attempt.at as string,
          sessionId: attempt.sessionId as string,
        }))
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      state.progress[key] = {
        attempts,
        mastery: masteryFor(attempts),
        ...(attempts.length && validDate(raw.nextReviewAt)
          ? { nextReviewAt: raw.nextReviewAt }
          : {}),
      };
    }
  }
  if (Array.isArray(input.documents)) {
    state.documents = input.documents
      .filter((document): document is Record<string, unknown> => record(document))
      .filter(
        (document) =>
          validText(document.id, 200) &&
          validText(document.title, 500) &&
          (validSubject(document.subject) || document.subject === 'all') &&
          validDate(document.createdAt) &&
          validText(document.content, 2_000_000) &&
          validText(document.type, 200),
      )
      .map((document) => ({
        id: document.id as string,
        title: document.title as string,
        subject: document.subject as LearningDocument['subject'],
        createdAt: document.createdAt as string,
        content: document.content as string,
        type: document.type as string,
        drawings: Array.isArray(document.drawings)
          ? document.drawings
              .slice(0, 40)
              .map(cleanDrawing)
              .filter((d): d is NonNullable<ReturnType<typeof cleanDrawing>> => !!d)
          : undefined,
        sources: Array.isArray(document.sources)
          ? document.sources.filter((source): source is string => validText(source, 2000))
          : [],
        status: ['official', 'training', 'synthetic', 'model'].includes(String(document.status))
          ? (document.status as LearningDocument['status'])
          : 'training',
        ...(validText(document.topicId, 200) ? { topicId: document.topicId } : {}),
        ...(validText(document.topic, 500) ? { topic: document.topic } : {}),
        ...(validText(document.path, 2000) ? { path: document.path } : {}),
        ...(document.style === 'cosmos' || document.style === 'paper'
          ? { style: document.style }
          : {}),
        ...(document.scale === 'comfortable' || document.scale === 'large'
          ? { scale: document.scale }
          : {}),
        ...(validText(document.sessionId, 200) &&
        state.sessions[document.sessionId]?.subject === document.subject
          ? { sessionId: document.sessionId }
          : {}),
        ...(Array.isArray(document.sourceSnapshot)
          ? {
              sourceSnapshot: document.sourceSnapshot
                .filter(
                  (source): source is NonNullable<LearningDocument['sourceSnapshot']>[number] =>
                    record(source) &&
                    ['id', 'title', 'url', 'version', 'checkedAt', 'publisher', 'status'].every(
                      (key) => validText(source[key], 2000),
                    ) &&
                    ['topic', 'exam-reference', 'local-material'].includes(String(source.purpose)),
                )
                .slice(0, 30),
            }
          : {}),
        ...(validDate(document.updatedAt) ? { updatedAt: document.updatedAt } : {}),
      }));
  }
  if (Array.isArray(input.facts)) {
    state.facts = input.facts
      .filter((fact): fact is Record<string, unknown> => record(fact))
      .filter(
        (fact) =>
          validText(fact.id, 200) &&
          (validSubject(fact.subject) || fact.subject === 'all') &&
          validText(fact.text, 5000) &&
          validDate(fact.createdAt),
      )
      .map((fact) => ({
        id: fact.id as string,
        subject: fact.subject as LearningFact['subject'],
        text: fact.text as string,
        createdAt: fact.createdAt as string,
        ...(['student', 'model-summary'].includes(String(fact.origin))
          ? { origin: fact.origin as LearningFact['origin'] }
          : {}),
        ...(validText(fact.sourceSessionId, 200)
          ? { sourceSessionId: fact.sourceSessionId as string }
          : {}),
      }));
  }
  state.diagnostics = hydrateDiagnostics(input.diagnostics);
  state.planning = hydrateStudyPlanning(input.planning);
  state.studyWorkspace = hydrateStudyWorkspace(input.studyWorkspace);
  state.homework = hydrateHomework(input.homework, state.sessions);
  state.problemSessions = hydrateProblemSessions(input.problemSessions);
  state.cloudSessions = hydrateCloudLessons(input.cloudSessions);
  if (input.school !== undefined) state.school = hydrateSchoolState(input.school);
  if (input.homeworkDesk !== undefined)
    state.homeworkDesk = hydrateSchoolState(input.homeworkDesk, 'homework');
  if (Array.isArray(input.preferenceProfiles)) {
    state.preferenceProfiles = input.preferenceProfiles
      .filter(
        (profile) =>
          record(profile) &&
          validText(profile.id, 200) &&
          validText(profile.name, 40) &&
          validDate(profile.createdAt) &&
          record(profile.settings),
      )
      .slice(0, 12)
      .map((profile) => ({
        id: profile.id as string,
        name: profile.name as string,
        createdAt: profile.createdAt as string,
        settings: hydratePreferences(profile.settings, createState().settings),
      }));
  }
  return state;
}

export function currentTask(state: LearningState, sessionId: string): Task | undefined {
  const session = state.sessions[sessionId];
  return session && !session.completedAt && session.phase === 'practice'
    ? getTopic(session.topicId)?.tasks[session.taskIndex]
    : undefined;
}

export function subjectHistory(state: LearningState, subject: SubjectId): Session[] {
  return Object.values(state.sessions)
    .filter((session) => session.subject === subject)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export type DiscussionKind = 'model' | 'discussion' | 'material';

/** Store a conversation in its original lesson without turning model prose into assessment evidence. */
export function appendDiscussion(
  state: LearningState,
  sessionId: string,
  role: Message['role'],
  text: string,
  kind: DiscussionKind = 'model',
  references?: {
    sourceIds?: string[];
    knowledgeIds?: string[];
    verification?: Message['verification'];
  },
): LearningState {
  const session = state.sessions[sessionId];
  const topic = session && getTopic(session.topicId);
  if (
    !session ||
    !topic ||
    session.subject !== topic.subject ||
    !['cosmos', 'student'].includes(role) ||
    !['model', 'discussion', 'material'].includes(kind) ||
    typeof text !== 'string' ||
    !text.trim()
  )
    return state;
  const next = copy(state);
  next.sessions[sessionId].messages.push({
    id: id('message'),
    role,
    text: text.trim().slice(0, 20_000),
    kind,
    ...(references?.sourceIds
      ? { sourceIds: [...new Set(references.sourceIds)].slice(0, 20) }
      : {}),
    ...(references?.knowledgeIds
      ? { knowledgeIds: [...new Set(references.knowledgeIds)].slice(0, 10) }
      : {}),
    ...(kind === 'model' && role === 'cosmos' && references?.verification
      ? { verification: references.verification }
      : {}),
  });
  if (
    role === 'cosmos' &&
    (kind === 'model' || kind === 'material') &&
    !session.completedAt &&
    session.phase === 'practice'
  ) {
    // A model can reveal part of the active solution. The later submitted answer must not become
    // independent mastery evidence merely because help arrived through a different input mode.
    next.sessions[sessionId].hintsUsed += 1;
  }
  return next;
}
