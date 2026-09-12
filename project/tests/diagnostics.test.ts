import { describe, expect, it } from 'vitest';
import { createState, hydrateState } from '../src/domain/learning';
import { getTopic, subjects } from '../src/domain/catalog';
import {
  advanceDiagnostic,
  answerDiagnostic,
  diagnosticMemory,
  hintDiagnostic,
  hydrateDiagnostics,
  latestDiagnostic,
  startDiagnostic,
  isPracticeRevealed,
  practiceTask,
  makePracticeItem,
} from '../src/domain/diagnostics';
import type { LearningState } from '../src/domain/types';

const START = '2026-09-08T08:00:00.000Z';
function completeDiagnostic(state: LearningState, id: string): LearningState {
  let next = state;
  for (let index = 0; index < 3; index++) {
    const record = next.diagnostics![id]!;
    const item = record.items[record.currentIndex]!;
    const task = getTopic(item.topicId)!.tasks.find((candidate) => candidate.id === item.taskId)!;
    next = answerDiagnostic(next, id, task.answer, `submit-${index}`, START);
    next = advanceDiagnostic(next, id, START);
  }
  return next;
}
describe('short diagnostic conversations', () => {
  it('keeps requests, ambiguous phrases and explicit solutions out of measured answers', () => {
    const result = startDiagnostic(createState(), 'math', START);
    const id = result.diagnosticId;
    let state = result.state;
    for (const [index, input] of [
      '2 или 3',
      'почему?',
      'повтори задание',
      'напиши ответ',
    ].entries()) {
      state = answerDiagnostic(state, id, input, `request-${index}`, START);
      expect(state.diagnostics![id].responses).toHaveLength(0);
      expect(state.diagnostics![id].phase).toBe('question');
    }
    expect(isPracticeRevealed(state.diagnostics![id])).toBe(true);
    state = hydrateState(JSON.stringify(state));
    expect(isPracticeRevealed(state.diagnostics![id])).toBe(true);
    const task = practiceTask(state.diagnostics![id].items[0])!;
    state = answerDiagnostic(state, id, `Ответ: ${task.answer}`, 'assisted-answer', START);
    expect(state.diagnostics![id].responses[0]).toMatchObject({
      correct: true,
      assisted: true,
      revealed: true,
      skipped: false,
    });
    expect(state.diagnostics![id].transcript.at(-1)!.text).toContain('после готового разбора');
    expect(state.progress).toEqual({});
  });
  it('finishes viewed-only diagnostics as unmeasured and preserves skipped markers across restart', () => {
    const result = startDiagnostic(createState(), 'history', START);
    let state = result.state;
    for (let index = 0; index < 3; index++) {
      state = answerDiagnostic(
        state,
        result.diagnosticId,
        'напиши ответ',
        `reveal-${index}`,
        START,
      );
      expect(state.diagnostics![result.diagnosticId].responses).toHaveLength(index);
      state = answerDiagnostic(state, result.diagnosticId, 'дальше', `next-${index}`, START);
    }
    const saved = state.diagnostics![result.diagnosticId];
    expect(saved.phase).toBe('completed');
    expect(
      saved.responses.every(
        (response) => response.skipped && response.assisted && !response.correct,
      ),
    ).toBe(true);
    expect(saved.summary).toMatchObject({
      independentCorrect: 0,
      assistedCorrect: 0,
      skippedCount: 3,
    });
    expect(saved.summary!.text).toContain('знания по этим вопросам ещё не измерены');
    expect(hydrateState(JSON.stringify(state)).diagnostics![result.diagnosticId]).toEqual(saved);
    expect(state.progress).toEqual({});
  });
  it('accepts natural social wording and the filled Russian negative sentence', () => {
    const social = startDiagnostic(createState(), 'social', START);
    const socialAnswered = answerDiagnostic(
      social.state,
      social.diagnosticId,
      'спрос станет маленьким',
      'social',
      START,
    );
    expect(socialAnswered.diagnostics![social.diagnosticId].responses[0]).toMatchObject({
      correct: true,
      assisted: false,
    });
    const russian = startDiagnostic(socialAnswered, 'russian', START);
    let state = russian.state;
    for (let index = 0; index < 2; index++) {
      const record = state.diagnostics![russian.diagnosticId];
      const task = practiceTask(record.items[record.currentIndex])!;
      state = answerDiagnostic(state, russian.diagnosticId, task.answer, `ru-${index}`, START);
      state = advanceDiagnostic(state, russian.diagnosticId, START);
    }
    state = answerDiagnostic(
      state,
      russian.diagnosticId,
      'Я не знаю ответа.',
      'ru-negative',
      START,
    );
    expect(state.diagnostics![russian.diagnosticId].responses[2]).toMatchObject({
      correct: true,
      assisted: false,
    });
    expect(state.diagnostics![social.diagnosticId]).toEqual(
      socialAnswered.diagnostics![social.diagnosticId],
    );
  });
  it('offers three isolated authored questions in each subject and waits for each answer', () => {
    let state = createState('Алексей');
    for (const subject of subjects) {
      const result = startDiagnostic(state, subject.id, START);
      const record = result.state.diagnostics![result.diagnosticId]!;
      expect(record.items).toHaveLength(3);
      expect(new Set(record.items.map((item) => item.taskId)).size).toBe(3);
      expect(record.items.every((item) => getTopic(item.topicId)?.subject === subject.id)).toBe(
        true,
      );
      expect(record.transcript.filter((turn) => turn.kind === 'question')).toHaveLength(1);
      expect(record.transcript[0]!.text).toContain('Алексей');
      expect(record.responses).toHaveLength(0);
      expect(record.summary).toBeUndefined();
      expect(advanceDiagnostic(result.state, result.diagnosticId, START)).toBe(result.state);
      expect(record.materialStatus).toBe('training');
      state = result.state;
    }
    expect(Object.values(state.diagnostics!)).toHaveLength(4);
    expect(state.progress).toEqual({});
  });
  it('keeps an uncertain answer as dialogue, gives a hint and records assisted success', () => {
    const result = startDiagnostic(createState(), 'math', START);
    const id = result.diagnosticId,
      item = result.state.diagnostics![id]!.items[0]!;
    expect(item.taskId).toBe('absolute-7');
    let state = answerDiagnostic(result.state, id, 'Не знаю, помоги начать', 'unsure', START);
    expect(state.diagnostics![id]!.responses).toHaveLength(0);
    expect(state.diagnostics![id]!.phase).toBe('question');
    expect(state.diagnostics![id]!.transcript.at(-1)!.text).not.toContain('x = 4 − 2 = 2');
    const firstHint = state.diagnostics![id]!.transcript.at(-1)!.text;
    state = answerDiagnostic(state, id, 'Не знаю', 'unsure-again', START);
    expect(state.diagnostics![id]!.transcript.at(-1)!.text).not.toBe(firstHint);
    state = answerDiagnostic(state, id, '2', 'actual', START);
    const response = state.diagnostics![id]!.responses[0]!;
    expect(response).toMatchObject({ text: '2', correct: true, assisted: true, skipped: false });
    expect(state.diagnostics![id]!.currentIndex).toBe(0);
    expect(state.diagnostics![id]!.phase).toBe('feedback');
    expect(
      state.diagnostics![id]!.transcript.filter((turn) => turn.kind === 'question'),
    ).toHaveLength(1);
    expect(state.progress).toEqual({});
  });
  it('persists exact responses and the pending turn across restart without duplicate scoring', () => {
    const result = startDiagnostic(createState(), 'math', START);
    let state = answerDiagnostic(result.state, result.diagnosticId, '2', 'one-click', START);
    const original = JSON.stringify(state);
    state = hydrateState(JSON.parse(original));
    expect(state.diagnostics![result.diagnosticId]!.responses[0]!.text).toBe('2');
    expect(state.diagnostics![result.diagnosticId]!.phase).toBe('feedback');
    expect(startDiagnostic(state, 'math', START).diagnosticId).toBe(result.diagnosticId);
    expect(answerDiagnostic(state, result.diagnosticId, '2', 'one-click', START)).toBe(state);
    state = advanceDiagnostic(state, result.diagnosticId, START);
    expect(state.diagnostics![result.diagnosticId]!.currentIndex).toBe(1);
    expect(answerDiagnostic(state, result.diagnosticId, '20', 'one-click', START)).toBe(state);
    state = answerDiagnostic(state, result.diagnosticId, '20', 'second-click', START);
    expect(state.diagnostics![result.diagnosticId]!.responses).toHaveLength(2);
    expect(state.progress).toEqual({});
  });
  it('reports observed weaknesses and sources without claiming mastery or changing lesson evidence', () => {
    const result = startDiagnostic(createState(), 'math', START);
    const id = result.diagnosticId;
    let state = answerDiagnostic(result.state, id, '5', 'a', START);
    state = advanceDiagnostic(state, id, START);
    state = hintDiagnostic(state, id, START);
    state = answerDiagnostic(state, id, '6-x', 'b', START);
    state = advanceDiagnostic(state, id, START);
    state = answerDiagnostic(state, id, '3', 'c', START);
    state = advanceDiagnostic(state, id, START);
    const record = state.diagnostics![id]!;
    expect(record.phase).toBe('completed');
    expect(record.summary).toMatchObject({
      independentCorrect: 1,
      assistedCorrect: 1,
      total: 3,
      at: START,
    });
    expect(
      record.summary!.skills.filter((skill) => skill.needsPractice).map((skill) => skill.topicId),
    ).toEqual(['math-absolute', 'math-radicals']);
    expect(record.summary!.sourceIds.length).toBeGreaterThan(0);
    expect(record.summary!.limitation).toContain('не балл ЕГЭ');
    expect(diagnosticMemory(state, 'math')).toContain('08.09.2026');
    expect(diagnosticMemory(state, 'history')).toBe('');
    expect(diagnosticMemory(state, 'math').length).toBeLessThanOrEqual(450);
    expect(state.progress).toEqual({});
    expect(hydrateState(JSON.parse(JSON.stringify(state))).diagnostics![id]!.summary).toEqual(
      record.summary,
    );
  });
  it('rotates task variants on a later check and rejects malformed cross-subject records', () => {
    const first = startDiagnostic(createState(), 'history', START);
    const state = completeDiagnostic(first.state, first.diagnosticId);
    const second = startDiagnostic(state, 'history', '2026-09-09T08:00:00.000Z');
    expect(second.diagnosticId).not.toBe(first.diagnosticId);
    expect(second.state.diagnostics![second.diagnosticId]!.items[0]!.taskId).not.toBe(
      state.diagnostics![first.diagnosticId]!.items[0]!.taskId,
    );
    expect(latestDiagnostic(second.state, 'history')!.id).toBe(second.diagnosticId);
    expect(latestDiagnostic(second.state, 'history', true)!.id).toBe(first.diagnosticId);
    expect(diagnosticMemory(second.state, 'history')).toContain('Предыдущий итог');
    const corrupted = structuredClone(state.diagnostics!);
    corrupted[first.diagnosticId]!.subject = 'math';
    expect(hydrateDiagnostics(corrupted)).toEqual({});
    expect(hydrateDiagnostics(undefined)).toEqual({});
    expect(hydrateDiagnostics({ bad: { version: 99 } })).toEqual({});
    const old = createState();
    delete old.diagnostics;
    delete old.homework;
    expect(hydrateState(old).diagnostics).toEqual({});
  });
  it('starts grade-10 basic math with modulus equations and signed radical expressions, not earlier fraction lessons', () => {
    const state = createState('Ученик');
    expect(state.planning?.preferences).toMatchObject({ schoolGrade: 10, mathLevel: 'basic' });
    const started = startDiagnostic(state, 'math', START),
      record = started.state.diagnostics![started.diagnosticId];
    expect(record.items.map((item) => item.taskId)).toEqual([
      'absolute-7',
      'radicals-2',
      'absolute-8',
    ]);
    expect(record.route).toEqual({ kind: 'secondary-math', schoolGrade: 10, mathLevel: 'basic' });
    expect(record.transcript[0].text).toContain('авторская проверка основ');
    expect(record.transcript[0].text).toContain('не официальный уровень сложности');
    expect(
      record.items.some(
        (item) => item.taskId === 'fraction-1' || item.topicId === 'math-rectangle',
      ),
    ).toBe(false);
    const done = completeDiagnostic(started.state, started.diagnosticId);
    const second = startDiagnostic(done, 'math', '2026-09-09T08:00:00.000Z');
    expect(second.state.diagnostics![second.diagnosticId].items.map((item) => item.taskId)).toEqual(
      ['absolute-8', 'radicals-3', 'absolute-4'],
    );
    expect(second.state.diagnostics![started.diagnosticId]).toEqual(
      done.diagnostics![started.diagnosticId],
    );
  });
  it('resumes an old simpler check unchanged after route preferences change', () => {
    const old = createState();
    old.planning!.preferences.schoolGrade = 8;
    const started = startDiagnostic(old, 'math', START),
      id = started.diagnosticId;
    expect(started.state.diagnostics![id].items[0].taskId).toBe('fraction-1');
    let state = answerDiagnostic(started.state, id, '4/10', 'legacy-answer', START);
    state.planning!.preferences.schoolGrade = 10;
    const before = structuredClone(state.diagnostics![id]);
    state = hydrateState(JSON.stringify(state));
    expect(state.diagnostics![id]).toEqual(before);
    expect(state.diagnostics![id].route).toBeUndefined();
    expect(startDiagnostic(state, 'math', START).diagnosticId).toBe(id);
    state = advanceDiagnostic(state, id, START);
    for (let index = 1; index < 3; index++) {
      const item = state.diagnostics![id].items[index],
        task = getTopic(item.topicId)!.tasks.find((task) => task.id === item.taskId)!;
      state = answerDiagnostic(state, id, task.answer, 'legacy-' + index, START);
      state = advanceDiagnostic(state, id, START);
    }
    const saved = structuredClone(state.diagnostics![id]);
    const updated = startDiagnostic(state, 'math', '2026-09-09T08:00:00.000Z');
    expect(updated.state.diagnostics![id]).toEqual(saved);
    expect(updated.state.diagnostics![updated.diagnosticId].items[0].taskId).toBe('absolute-7');
  });
  it('retains an earlier secondary-route check containing prerequisite questions after the grade-10 start changes', () => {
    const started = startDiagnostic(createState(), 'math', START);
    const id = started.diagnosticId;
    let state = started.state;
    const record = state.diagnostics![id];
    const legacyTopics = ['math-absolute', 'math-percent', 'math-multiply'];
    record.items = legacyTopics.map((topicId, index) =>
      makePracticeItem(topicId, getTopic(topicId)!.tasks[0].id, record.items[index].id),
    );
    record.transcript = [];
    const first = practiceTask(record.items[0])!;
    state = answerDiagnostic(state, id, first.answer, 'legacy-secondary-answer', START);
    const saved = structuredClone(state.diagnostics![id]);
    const restored = hydrateState(JSON.stringify(state));
    expect(restored.diagnostics![id]).toEqual(saved);
    expect(restored.diagnostics![id].route).toEqual({ kind: 'secondary-math', schoolGrade: 10, mathLevel: 'basic' });
    expect(startDiagnostic(restored, 'math', START).diagnosticId).toBe(id);
    const continued = advanceDiagnostic(restored, id, START);
    expect(continued.diagnostics![id].items[continued.diagnostics![id].currentIndex].topicId).toBe('math-percent');
    expect(continued.diagnostics![id].responses).toHaveLength(1);
  });
});
