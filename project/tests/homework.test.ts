import { describe, expect, it } from 'vitest';
import { createState, hydrateState, startSession } from '../src/domain/learning';
import { getTopic } from '../src/domain/catalog';
import {
  advanceHomework,
  answerHomework,
  createHomework,
  getSubjectHomework,
  hintHomework,
  homeworkMemory,
  hydrateHomework,
  repeatHomework,
} from '../src/domain/homework';
import { startDiagnostic } from '../src/domain/diagnostics';
import type { LearningState } from '../src/domain/types';

const START = '2026-09-08T08:00:00.000Z';
function finish(state: LearningState, id: string, wrongFirst = false): LearningState {
  let next = state;
  for (let index = 0; index < next.homework![id]!.items.length; index++) {
    const assignment = next.homework![id]!,
      item = assignment.items[assignment.currentIndex]!;
    const answer = getTopic(item.topicId)!.tasks.find((task) => task.id === item.taskId)!.answer;
    next = answerHomework(
      next,
      id,
      item.id,
      wrongFirst && index === 0 ? '999' : answer,
      `submit-${index}`,
      START,
    );
    next = advanceHomework(next, id, START);
  }
  return next;
}
describe('homework assignments and later repetition', () => {
  it('remembers a revealed solution as assistance and lets next skip it without measuring knowledge', () => {
    const result = createHomework(createState(), 'math', undefined, START);
    const id = result.assignmentId;
    let state = result.state;
    for (let index = 0; index < 3; index++) {
      const itemId = state.homework![id].items[state.homework![id].currentIndex].id;
      state = answerHomework(state, id, itemId, 'дай подсказку', `hint-${index}`, START);
      state = answerHomework(state, id, itemId, 'напиши ответ', `reveal-${index}`, START);
      expect(state.homework![id].responses).toHaveLength(index);
      state = hydrateState(JSON.stringify(state));
      state = answerHomework(state, id, itemId, 'дальше', `next-${index}`, START);
    }
    expect(state.homework![id].phase).toBe('completed');
    expect(state.homework![id].summary).toMatchObject({
      independentCorrect: 0,
      assistedCorrect: 0,
      skippedCount: 3,
    });
    expect(state.homework![id].repeatAt).toBe('2026-09-09T08:00:00.000Z');
    expect(state.progress).toEqual({});
    expect(state.diagnostics).toEqual({});
    expect(hydrateState(JSON.stringify(state)).homework![id]).toEqual(state.homework![id]);
  });
  it('distinguishes a copied answer after reveal from independent successful homework', () => {
    const result = createHomework(createState(), 'social', undefined, START);
    const id = result.assignmentId;
    let state = result.state;
    const first = state.homework![id].items[0];
    state = answerHomework(state, id, first.id, 'напиши ответ', 'reveal', START);
    const answer = getTopic(first.topicId)!.tasks.find((task) => task.id === first.taskId)!.answer;
    state = answerHomework(state, id, first.id, answer, 'answer', START);
    expect(state.homework![id].responses[0]).toMatchObject({
      correct: true,
      assisted: true,
      revealed: true,
    });
    state = advanceHomework(state, id, START);
    for (let index = 1; index < 3; index++) {
      const item = state.homework![id].items[index];
      const task = getTopic(item.topicId)!.tasks.find((task) => task.id === item.taskId)!;
      state = answerHomework(state, id, item.id, task.answer, `actual-${index}`, START);
      state = advanceHomework(state, id, START);
    }
    expect(state.homework![id].summary).toMatchObject({
      independentCorrect: 2,
      assistedCorrect: 1,
      revealedCorrect: 1,
    });
    expect(state.homework![id].summary!.text).toContain('не самостоятельная проверка');
    expect(state.progress).toEqual({});
  });
  it('creates a durable assignment from its own lesson once and rejects a foreign session', () => {
    const lesson = startSession(createState('Алексей'), 'math-rectangle', START);
    const result = createHomework(lesson.state, 'math', lesson.sessionId, START);
    const assignment = result.state.homework![result.assignmentId]!;
    expect(assignment.items).toHaveLength(3);
    expect(assignment.items.every((item) => item.topicId === 'math-rectangle')).toBe(true);
    expect(assignment.dueAt).toBe('2026-09-09T08:00:00.000Z');
    expect(assignment.sourceSessionId).toBe(lesson.sessionId);
    expect(createHomework(result.state, 'math', lesson.sessionId, START).assignmentId).toBe(
      result.assignmentId,
    );
    expect(Object.values(result.state.homework!)).toHaveLength(1);
    expect(() => createHomework(result.state, 'history', lesson.sessionId, START)).toThrow();
    expect(homeworkMemory(result.state, 'math')).toContain('09.09.2026');
    expect(homeworkMemory(result.state, 'history')).toBe('');
  });
  it('grades the selected assignment only and does not merge diagnostic or lesson evidence', () => {
    const diagnostic = startDiagnostic(createState(), 'math', START);
    const math = createHomework(diagnostic.state, 'math', undefined, START);
    const history = createHomework(math.state, 'history', undefined, START);
    const assignment = history.state.homework![math.assignmentId]!,
      item = assignment.items[0]!;
    const task = getTopic(item.topicId)!.tasks.find((candidate) => candidate.id === item.taskId)!;
    expect(
      answerHomework(
        history.state,
        math.assignmentId,
        history.state.homework![history.assignmentId]!.items[0]!.id,
        '988',
        'foreign',
        START,
      ),
    ).toBe(history.state);
    const hinted = hintHomework(history.state, math.assignmentId, START);
    const graded = answerHomework(hinted, math.assignmentId, item.id, task.answer, 'click', START);
    expect(graded.homework![math.assignmentId]!.responses[0]).toMatchObject({
      correct: true,
      assisted: true,
    });
    expect(graded.homework![history.assignmentId]).toEqual(
      history.state.homework![history.assignmentId],
    );
    expect(graded.diagnostics).toEqual(history.state.diagnostics);
    expect(graded.progress).toEqual(history.state.progress);
    expect(answerHomework(graded, math.assignmentId, item.id, task.answer, 'click', START)).toBe(
      graded,
    );
  });
  it('survives restart between answer and next question and ignores reused submission ids', () => {
    const result = createHomework(createState(), 'math', undefined, START);
    const item = result.state.homework![result.assignmentId]!.items[0]!;
    const task = getTopic(item.topicId)!.tasks.find((candidate) => candidate.id === item.taskId)!;
    let state = answerHomework(
      result.state,
      result.assignmentId,
      item.id,
      task.answer,
      'click',
      START,
    );
    state = hydrateState(JSON.parse(JSON.stringify(state)));
    expect(state.homework![result.assignmentId]!.phase).toBe('feedback');
    expect(state.homework![result.assignmentId]!.responses[0]!.text).toBe(task.answer);
    state = advanceHomework(state, result.assignmentId, START);
    const second = state.homework![result.assignmentId]!.items[1]!;
    expect(answerHomework(state, result.assignmentId, second.id, '12', 'click', START)).toBe(state);
    expect(state.homework![result.assignmentId]!.currentIndex).toBe(1);
    expect(getSubjectHomework(state, 'math')).toHaveLength(1);
  });
  it('retains the completed result and creates one distinct later repeat with no automatic mastery', () => {
    const result = createHomework(createState(), 'math', undefined, START);
    const completed = finish(result.state, result.assignmentId, true);
    const assignment = completed.homework![result.assignmentId]!;
    expect(assignment.phase).toBe('completed');
    expect(assignment.repeatAt).toBe('2026-09-09T08:00:00.000Z');
    expect(assignment.summary!.skills.some((skill) => skill.needsPractice)).toBe(true);
    expect(homeworkMemory(completed, 'math')).toContain('Повторить 09.09.2026');
    const repetition = repeatHomework(completed, result.assignmentId, '2026-09-09T08:00:00.000Z');
    expect(repetition.assignmentId).not.toBe(result.assignmentId);
    expect(repetition.state.homework![result.assignmentId]).toEqual(assignment);
    expect(repetition.state.homework![repetition.assignmentId]!.responses).toEqual([]);
    expect(repetition.state.homework![repetition.assignmentId]!.repeatedFromId).toBe(
      result.assignmentId,
    );
    expect(repeatHomework(repetition.state, result.assignmentId).assignmentId).toBe(
      repetition.assignmentId,
    );
    expect(repetition.state.progress).toEqual({});
    expect(hydrateState(JSON.parse(JSON.stringify(repetition.state))).homework).toEqual(
      repetition.state.homework,
    );
    const clean = createHomework(createState(), 'social', undefined, START);
    expect(finish(clean.state, clean.assignmentId).homework![clean.assignmentId]!.repeatAt).toBe(
      '2026-09-11T08:00:00.000Z',
    );
  });
  it('migrates absent data and prevents cross-subject assignment/repetition links', () => {
    const lesson = startSession(createState(), 'history-baptism', START);
    const result = createHomework(lesson.state, 'history', lesson.sessionId, START);
    const foreign = structuredClone(result.state.homework!);
    foreign[result.assignmentId]!.subject = 'russian';
    expect(hydrateHomework(foreign, result.state.sessions)).toEqual({});
    const orphan = structuredClone(result.state.homework!);
    orphan[result.assignmentId]!.sourceSessionId = 'missing-session';
    expect(
      hydrateHomework(orphan, result.state.sessions)[result.assignmentId]!.sourceSessionId,
    ).toBeUndefined();
    expect(hydrateHomework(undefined)).toEqual({});
    expect(hydrateHomework([])).toEqual({});
    expect(homeworkMemory(createState(), 'social')).toBe('');
  });
});
