import { getTopic, topics } from './catalog';
import type { LearningState, Session, SubjectId } from './types';
import {
  advanceDiagnostic,
  answerDiagnostic,
  hintDiagnostic,
  latestDiagnostic,
  afterPracticeDays,
  makePracticeItem,
  practiceId,
  practiceObject,
  practiceTime,
  practiceTurn,
  sanitizePracticeRecord,
  validPracticeDate,
  type DiagnosticRecord,
  type PracticeClock,
  type PracticeItem,
} from './diagnostics';

export interface HomeworkAssignment extends DiagnosticRecord {
  title: string;
  sourceSessionId?: string;
  dueAt: string;
  repeatAt?: string;
  repeatedFromId?: string;
}

export function getSubjectHomework(state: LearningState, subject: SubjectId): HomeworkAssignment[] {
  return Object.values(state.homework ?? {})
    .filter((assignment) => assignment.subject === subject)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
function selectHomeworkItems(
  state: LearningState,
  subject: SubjectId,
  sourceSessionId?: string,
): PracticeItem[] {
  const session = sourceSessionId ? state.sessions[sourceSessionId] : undefined;
  if (sourceSessionId && (!session || session.subject !== subject))
    throw new Error('Homework session does not belong to this subject');
  const weakTopics =
    latestDiagnostic(state, subject, true)
      ?.summary?.skills.filter((skill) => skill.needsPractice)
      .map((skill) => skill.topicId) ?? [];
  const selectedTopics = session
    ? [session.topicId]
    : [
        ...new Set([
          ...weakTopics,
          ...topics.filter((topic) => topic.subject === subject).map((topic) => topic.id),
        ]),
      ].slice(0, 3);
  const previous = getSubjectHomework(state, subject);
  const items: PracticeItem[] = [];
  // Start with unattempted tasks; if this small catalogue is exhausted, assign explicit repetition.
  for (let round = 0; items.length < 3 && round < 4; round++) {
    for (const topicId of selectedTopics) {
      const topic = getTopic(topicId);
      if (!topic || topic.subject !== subject) continue;
      const usedInLesson = new Set(
        (state.progress[topicId]?.attempts ?? [])
          .filter((attempt) => attempt.sessionId === sourceSessionId)
          .map((attempt) => attempt.taskId),
      );
      const usedInHomework = new Map<string, number>();
      for (const assignment of previous)
        for (const response of assignment.responses) {
          const item = assignment.items.find((candidate) => candidate.id === response.itemId);
          if (item?.topicId === topicId)
            usedInHomework.set(item.taskId, (usedInHomework.get(item.taskId) ?? 0) + 1);
        }
      const ordered = topic.tasks
        .map((task, index) => ({
          task,
          index,
          rank: (usedInLesson.has(task.id) ? 2 : 0) + (usedInHomework.get(task.id) ?? 0),
        }))
        .sort((a, b) => a.rank - b.rank || a.index - b.index);
      const candidate = ordered.find(({ task }) => !items.some((item) => item.taskId === task.id));
      if (candidate && items.length < 3) items.push(makePracticeItem(topic.id, candidate.task.id));
    }
  }
  return items;
}
function newHomework(
  state: LearningState,
  subject: SubjectId,
  sourceSessionId: string | undefined,
  now: PracticeClock | undefined,
  repeatedFrom?: HomeworkAssignment,
): { state: LearningState; assignmentId: string } {
  const at = practiceTime(now),
    id = practiceId('homework');
  const items = repeatedFrom
    ? repeatedFrom.items
        .filter((item) =>
          repeatedFrom.summary?.skills.some(
            (skill) => skill.topicId === item.topicId && skill.needsPractice,
          ),
        )
        .map((item) => makePracticeItem(item.topicId, item.taskId))
    : selectHomeworkItems(state, subject, sourceSessionId);
  if (repeatedFrom && items.length < 2) {
    for (const item of repeatedFrom.items) {
      if (items.length >= 3) break;
      if (!items.some((selected) => selected.taskId === item.taskId))
        items.push(makePracticeItem(item.topicId, item.taskId));
    }
  }
  if (items.length < 2) throw new Error('Insufficient homework content');
  const title = repeatedFrom
    ? `Повторение: ${repeatedFrom.items[0]!.topicTitle}`
    : sourceSessionId
      ? `Закрепление: ${items[0]!.topicTitle}`
      : 'Небольшая работа для закрепления';
  const assignment: HomeworkAssignment = {
    id,
    version: 1,
    subject,
    createdAt: at,
    dueAt: afterPracticeDays(at, 1),
    title,
    ...(sourceSessionId ? { sourceSessionId } : {}),
    ...(repeatedFrom ? { repeatedFromId: repeatedFrom.id } : {}),
    items,
    responses: [],
    hintedItemIds: [],
    currentIndex: 0,
    phase: 'question',
    materialStatus: 'training',
    transcript: [
      practiceTurn(
        'cosmos',
        `${state.profile.name}, ${repeatedFrom ? 'вернёмся к знакомым заданиям после перерыва' : 'я сохранил для тебя небольшую домашнюю работу'}. Здесь ${items.length} задания, по одному. Можно попросить подсказку. Результат останется в этом предмете, и на занятии мы к нему вернёмся.`,
        'greeting',
        at,
      ),
      practiceTurn('cosmos', items[0]!.prompt, 'question', at, items[0]!.id),
    ],
  };
  return {
    state: { ...state, homework: { ...state.homework, [id]: assignment } },
    assignmentId: id,
  };
}
export function createHomework(
  state: LearningState,
  subject: SubjectId,
  sourceSessionId?: string,
  now?: PracticeClock,
): { state: LearningState; assignmentId: string } {
  if (!topics.some((topic) => topic.subject === subject)) throw new Error('Unknown subject');
  if (sourceSessionId && state.sessions[sourceSessionId]?.subject !== subject)
    throw new Error('Homework session does not belong to this subject');
  const existing = getSubjectHomework(state, subject).find((assignment) =>
    sourceSessionId
      ? assignment.sourceSessionId === sourceSessionId && !assignment.repeatedFromId
      : !assignment.sourceSessionId &&
        assignment.phase !== 'completed' &&
        !assignment.repeatedFromId,
  );
  if (existing) return { state, assignmentId: existing.id };
  return newHomework(state, subject, sourceSessionId, now);
}
export function repeatHomework(
  state: LearningState,
  assignmentId: string,
  now?: PracticeClock,
): { state: LearningState; assignmentId: string } {
  const previous = state.homework?.[assignmentId];
  if (!previous || previous.phase !== 'completed') return { state, assignmentId };
  const existing = Object.values(state.homework ?? {}).find(
    (assignment) => assignment.repeatedFromId === assignmentId,
  );
  if (existing) return { state, assignmentId: existing.id };
  return newHomework(state, previous.subject, previous.sourceSessionId, now, previous);
}
function applyToHomework(
  state: LearningState,
  assignmentId: string,
  operation: (temporary: LearningState) => LearningState,
): LearningState {
  const assignment = state.homework?.[assignmentId];
  if (!assignment) return state;
  // Reuse the exact one-question conversation transitions without creating a diagnostic record.
  const temporary: LearningState = { ...state, diagnostics: { [assignmentId]: assignment } };
  const processed = operation(temporary);
  if (processed === temporary) return state;
  const next = processed.diagnostics?.[assignmentId];
  if (!next) return state;
  return { ...state, homework: { ...state.homework, [assignmentId]: { ...assignment, ...next } } };
}
export function hintHomework(
  state: LearningState,
  assignmentId: string,
  now?: PracticeClock,
): LearningState {
  return applyToHomework(state, assignmentId, (temporary) =>
    hintDiagnostic(temporary, assignmentId, now),
  );
}
export function answerHomework(
  state: LearningState,
  assignmentId: string,
  itemId: string,
  text: string,
  submissionId = practiceId('submission'),
  now?: PracticeClock,
  skip = false,
): LearningState {
  const assignment = state.homework?.[assignmentId];
  if (!assignment || assignment.items[assignment.currentIndex]?.id !== itemId) return state;
  const next = applyToHomework(state, assignmentId, (temporary) =>
    answerDiagnostic(temporary, assignmentId, text, submissionId, now, skip),
  );
  return scheduleHomeworkRepeat(next, assignmentId);
}
export function advanceHomework(
  state: LearningState,
  assignmentId: string,
  now?: PracticeClock,
): LearningState {
  const next = applyToHomework(state, assignmentId, (temporary) =>
    advanceDiagnostic(temporary, assignmentId, now),
  );
  return scheduleHomeworkRepeat(next, assignmentId);
}
function scheduleHomeworkRepeat(next: LearningState, assignmentId: string): LearningState {
  const assignment = next.homework?.[assignmentId];
  if (!assignment || assignment.phase !== 'completed' || assignment.repeatAt) return next;
  const at = assignment.completedAt!;
  const repeatAt = afterPracticeDays(
    at,
    assignment.summary?.skills.some((skill) => skill.needsPractice) ? 1 : 3,
  );
  return {
    ...next,
    homework: {
      ...next.homework,
      [assignmentId]: {
        ...assignment,
        repeatAt,
        transcript: [
          ...assignment.transcript,
          practiceTurn(
            'cosmos',
            `Домашняя работа сохранена. Я предложу повторение ${new Date(repeatAt).toLocaleDateString('ru-RU')}. На следующем занятии учтём этот результат.`,
            'summary',
            at,
          ),
        ],
      },
    },
  };
}
export function homeworkMemory(state: LearningState, subject: SubjectId): string {
  const assignments = getSubjectHomework(state, subject);
  const active = assignments
    .filter((assignment) => assignment.phase !== 'completed')
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  const completed = assignments.find((assignment) => assignment.phase === 'completed');
  const pieces: string[] = [];
  if (active)
    pieces.push(
      `Назначено «${active.title}» к ${new Date(active.dueAt).toLocaleDateString('ru-RU')}: пройдено вопросов ${active.responses.length}/${active.items.length}.`,
    );
  if (completed)
    pieces.push(
      `Домашняя работа ${new Date(completed.completedAt!).toLocaleDateString('ru-RU')}: ${completed.summary?.text ?? 'выполнена'}.${completed.repeatAt ? ` Повторить ${new Date(completed.repeatAt).toLocaleDateString('ru-RU')}.` : ''}`,
    );
  return pieces.join(' ').slice(0, 450);
}
export function hydrateHomework(
  value: unknown,
  sessions?: Record<string, Session>,
): Record<string, HomeworkAssignment> {
  const raw = practiceObject(value),
    result: Record<string, HomeworkAssignment> = {};
  if (!raw) return result;
  for (const [key, candidate] of Object.entries(raw).slice(-1000)) {
    const data = practiceObject(candidate),
      base = sanitizePracticeRecord(candidate);
    if (!data || !base || base.id !== key || !validPracticeDate(data.dueAt)) continue;
    const sourceSessionId =
      typeof data.sourceSessionId === 'string' &&
      (!sessions || sessions[data.sourceSessionId]?.subject === base.subject)
        ? data.sourceSessionId
        : undefined;
    const assignment: HomeworkAssignment = {
      ...base,
      title: typeof data.title === 'string' ? data.title.slice(0, 200) : 'Домашняя работа',
      dueAt: data.dueAt,
      ...(sourceSessionId ? { sourceSessionId } : {}),
    };
    if (base.phase === 'completed' && base.completedAt)
      assignment.repeatAt = validPracticeDate(data.repeatAt)
        ? data.repeatAt
        : afterPracticeDays(
            base.completedAt,
            base.summary?.skills.some((skill) => skill.needsPractice) ? 1 : 3,
          );
    if (typeof data.repeatedFromId === 'string' && data.repeatedFromId !== key)
      assignment.repeatedFromId = data.repeatedFromId.slice(0, 120);
    result[key] = assignment;
  }
  for (const assignment of Object.values(result))
    if (
      assignment.repeatedFromId &&
      result[assignment.repeatedFromId]?.subject !== assignment.subject
    )
      delete assignment.repeatedFromId;
  return result;
}
