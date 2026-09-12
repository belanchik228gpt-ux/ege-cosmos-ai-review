import { describe, expect, it } from 'vitest';
import { createState, startSession, submitAnswer, finishSession, topics } from '../src/domain';
import {
  buildDocumentContent,
  documentSessions,
  documentTypes,
  type DocumentRequest,
} from '../src/domain/document-content';
import { sources } from '../src/domain/sources';

const NOW = '2026-09-08T09:00:00.000Z';
const topic = topics.find((topic) => topic.id === 'math-rectangle')!;
function fixture() {
  const started = startSession(createState('Ученик теста'), topic.id, '2026-09-07T09:00:00.000Z');
  let state = submitAnswer(started.state, started.sessionId, '9999', NOW);
  state = submitAnswer(state, started.sessionId, 'не знаю', NOW);
  // The answer belongs to the small question until that checked step is completed.
  state = submitAnswer(state, started.sessionId, '7', NOW);
  state = submitAnswer(state, started.sessionId, 'дальше', NOW);
  state = submitAnswer(state, started.sessionId, 'умножение', NOW);
  state = submitAnswer(state, started.sessionId, 'дальше', NOW);
  state = submitAnswer(state, started.sessionId, topic.tasks[0].answer, NOW);
  state.sessions[started.sessionId].note = 'Моя заметка: площадь измеряется квадратными единицами.';
  state.sessions[started.sessionId].messages.push(
    {
      id: 'local-model',
      role: 'cosmos',
      kind: 'model',
      text: 'Модельная фраза для отдельного раздела.',
    },
    { id: 'private-probe', role: 'cosmos', kind: 'probe', text: 'PRIVATE_RPC_PROBE_SENTINEL' },
    { id: 'private-login', role: 'student', kind: 'login', text: 'PRIVATE_LOGIN_SENTINEL' },
    { id: 'private-error', role: 'cosmos', kind: 'error', text: 'PRIVATE_ERROR_SENTINEL' },
  );
  const otherMath = startSession(state, topic.id, '2026-09-08T10:00:00.000Z');
  state = submitAnswer(otherMath.state, otherMath.sessionId, topic.tasks[0].answer, NOW);
  state.sessions[otherMath.sessionId].note = 'OTHER_MATH_SESSION_SENTINEL';
  const historyTopic = topics.find((topic) => topic.subject === 'history')!;
  const history = startSession(state, historyTopic.id, '2026-09-08T11:00:00.000Z');
  state = submitAnswer(history.state, history.sessionId, historyTopic.tasks[0].answer, NOW);
  state.sessions[history.sessionId].note = 'OTHER_SUBJECT_SENTINEL';
  return {
    state,
    sessionId: started.sessionId,
    otherId: otherMath.sessionId,
    historyId: history.sessionId,
  };
}
const request = (sessionId?: string, changes: Partial<DocumentRequest> = {}): DocumentRequest => ({
  type: 'Конспект занятия',
  subject: 'math',
  topicId: topic.id,
  sessionId,
  now: NOW,
  ...changes,
});

describe('documents from saved lesson evidence', () => {
  it('isolates one session and never converts assistance into independent success', () => {
    const { state, sessionId } = fixture();
    const before = JSON.stringify(state);
    const doc = buildDocumentContent(state, request(sessionId, { type: 'Отчёт о прогрессе' }));
    expect(doc.content).toContain('Проверенных попыток: 2.');
    expect(doc.content).toContain('Самостоятельных верных ответов: 0.');
    expect(doc.content).toContain('Верных ответов с помощью: 1.');
    expect(doc.content).toContain('Попыток с ошибкой: 1.');
    expect(doc.content).not.toContain('OTHER_');
    expect(doc.sessionId).toBe(sessionId);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('rejects a session belonging to another subject or topic instead of silently using it', () => {
    const { state, historyId } = fixture();
    expect(() => buildDocumentContent(state, request(historyId))).toThrow('Выбери занятие');
    expect(() => buildDocumentContent(state, request('missing-session'))).toThrow('Выбери занятие');
    expect(() => buildDocumentContent(state, request(undefined, { subject: 'history' }))).toThrow(
      'Выбранная тема',
    );
  });

  it('uses an honest template when no session is selected even if other attempts exist', () => {
    const { state } = fixture();
    const doc = buildDocumentContent(state, request(undefined, { type: 'Подборка ошибок' }));
    expect(doc.content).toContain('Занятие не выбрано. Это учебный шаблон');
    expect(doc.content).toContain('Проверенных попыток пока нет. Нельзя утверждать');
    expect(doc.content).not.toContain('Самостоятельных верных ответов:');
    expect(doc.content).not.toContain('OTHER_');
    expect(doc.content).not.toContain('Моя заметка:');
    expect(doc.sessionId).toBeUndefined();
  });

  it('builds revision cards only for practiced tasks, with optional clearly labelled answers', () => {
    const { state, sessionId } = fixture();
    const plain = buildDocumentContent(state, request(sessionId, { type: 'Карточки повторения' }));
    expect(plain.content).toContain(topic.tasks[0].prompt);
    expect(plain.content).not.toContain(topic.tasks[1].prompt);
    expect(plain.content).toContain('Почему повторяем: В занятии были ошибки.');
    expect(plain.content).not.toContain('Учебный ответ для самопроверки:');
    const answers = buildDocumentContent(
      state,
      request(sessionId, { type: 'Карточки повторения', includeAnswers: true }),
    );
    expect(answers.content).toContain(`Учебный ответ для самопроверки: ${topic.tasks[0].answer}`);
    expect(answers.content).toContain(
      'Это справочный разбор, а не запись собственного решения ученика.',
    );
  });

  it('never invents a reasoning trace or a precise error cause from the verdict alone', () => {
    const { state, sessionId } = fixture();
    const doc = buildDocumentContent(state, request(sessionId, { type: 'Подборка ошибок' }));
    expect(doc.content).toContain('Точный ход рассуждения не прикреплён к записи попытки');
    expect(doc.content).toContain('Последний проверенный результат: верно с помощью');
    expect(doc.content).not.toContain('Ученик перепутал');
  });

  it('includes a learner note and educational dialogue but excludes technical and unverified model messages by default', () => {
    const { state, sessionId } = fixture();
    const doc = buildDocumentContent(state, request(sessionId));
    expect(doc.content).toContain('Моя заметка: площадь');
    // The document intentionally includes the last five utterances, not the whole transcript.
    expect(doc.content).toContain('Ученик: умножение');
    expect(
      state.sessions[sessionId].messages.find((message) => message.text === 'не знаю')?.kind,
    ).toBe('request');
    expect(doc.content).toContain('Подсказки из занятия');
    expect(doc.content).not.toContain('PRIVATE_');
    expect(doc.content).not.toContain('Модельная фраза');
    const model = buildDocumentContent(state, request(sessionId, { includeModelReplies: true }));
    expect(model.content).toContain('Объяснения локальной модели — не проверены');
    expect(model.content).toContain('Модельная фраза');
    expect(model.content).toContain('Ссылки ниже не подтверждают их автоматически');
  });

  it('omits full supplied solutions while answer keys are disabled', () => {
    const { state, sessionId } = fixture();
    state.sessions[sessionId].messages.push({
      id: 'given-solution',
      role: 'cosmos',
      kind: 'solution',
      text: 'SOLUTION_SENTINEL',
    });
    expect(buildDocumentContent(state, request(sessionId)).content).not.toContain(
      'SOLUTION_SENTINEL',
    );
    expect(
      buildDocumentContent(state, request(sessionId, { includeAnswers: true })).content,
    ).toContain('SOLUTION_SENTINEL');
  });

  it('marks a current lesson as interim, a completed lesson as completed and never treats completion as mastery', () => {
    const { state, sessionId } = fixture();
    expect(buildDocumentContent(state, request(sessionId)).content).toContain(
      'данные промежуточные',
    );
    const finished = finishSession(state, sessionId, NOW);
    const doc = buildDocumentContent(finished, request(sessionId));
    expect(doc.content).toContain('Состояние: занятие завершено');
    expect(doc.content).toContain('Одно занятие не подтверждает освоение темы.');
  });

  it('excludes attempts whose task is not in the selected topic', () => {
    const { state, sessionId } = fixture();
    state.progress[topic.id].attempts.push({
      taskId: 'foreign-task',
      correct: true,
      assisted: false,
      at: NOW,
      sessionId,
    });
    expect(buildDocumentContent(state, request(sessionId)).content).toContain(
      'Самостоятельных верных ответов: 0.',
    );
  });

  it('lists sessions by date with subject and topic isolation', () => {
    const { state, sessionId, otherId, historyId } = fixture();
    expect(documentSessions(state, 'math', topic.id).map((session) => session.id)).toEqual([
      otherId,
      sessionId,
    ]);
    expect(documentSessions(state, 'math').some((session) => session.id === historyId)).toBe(false);
  });

  it('supports all requested document types without claiming a full exam or completed proposed plan', () => {
    const { state, sessionId } = fixture();
    for (const type of documentTypes) {
      const doc = buildDocumentContent(state, request(sessionId, { type }));
      expect(doc.content).toContain('Источники и статус материала');
      expect(doc.status).toBe('training');
    }
    expect(
      buildDocumentContent(state, request(sessionId, { type: 'Недельный план' })).content,
    ).toContain('предложение, а не запись выполненных занятий');
    expect(
      buildDocumentContent(state, request(sessionId, { type: 'Тренировочный вариант' })).content,
    ).toContain('не полный вариант ЕГЭ');
  });

  it('snapshots source versions and dates into editable text and separates exam references from factual materials', () => {
    const { state, sessionId } = fixture();
    const registry = sources.map((source) => ({ ...source, subjects: [...source.subjects] }));
    const doc = buildDocumentContent(state, request(sessionId), { sources: registry });
    const source = registry.find((source) => source.id === 'fipi-demo')!;
    expect(doc.content).toContain(source.url);
    expect(doc.content).toContain(`Версия: ${source.version}`);
    expect(doc.content).toContain(`Дата проверки: ${source.checkedAt}`);
    expect(doc.content).toContain('ФИПИ: формат экзамена и программа');
    expect(doc.content).toContain('не указаны как источник каждого факта');
    const saved = doc.sourceSnapshot.find((entry) => entry.id === source.id)!;
    expect(saved.purpose).toBe('exam-reference');
    source.version = 'CHANGED_LATER';
    expect(saved.version).not.toBe('CHANGED_LATER');
    expect(doc.content).not.toContain('CHANGED_LATER');
  });

  it('does not print unknown source ids or borrow a source from another subject', () => {
    const { state, sessionId } = fixture();
    const foreign = sources.find((source) => source.id === 'history-baptism-source')!;
    const selected = { ...topic, sourceIds: ['UNKNOWN_SOURCE_SENTINEL', foreign.id] };
    const doc = buildDocumentContent(state, request(sessionId), { topics: [selected] });
    expect(doc.content).not.toContain('UNKNOWN_SOURCE_SENTINEL');
    expect(doc.content).not.toContain(foreign.url);
    expect(doc.sourceSnapshot.some((source) => source.id === foreign.id)).toBe(false);
  });

  it('resolves saved dialogue references through the registry and includes model citations only with their section', () => {
    const { state, sessionId } = fixture();
    const model = state.sessions[sessionId].messages.find((message) => message.kind === 'model')!;
    model.sourceIds = ['fipi-bank', 'UNKNOWN_MODEL_SOURCE'];
    const normal = buildDocumentContent(state, request(sessionId));
    expect(normal.sourceSnapshot.some((source) => source.id === 'fipi-bank')).toBe(false);
    const included = buildDocumentContent(state, request(sessionId, { includeModelReplies: true }));
    expect(included.sourceSnapshot.some((source) => source.id === 'fipi-bank')).toBe(true);
    expect(included.content).not.toContain('UNKNOWN_MODEL_SOURCE');
  });
});
