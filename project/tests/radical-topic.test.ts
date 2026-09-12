import { describe, expect, it } from 'vitest';
import { radicalTopic } from '../src/domain/radical-topic';
import { isTeachingVisual } from '../src/domain/teaching-visual';
import type { TeachingStep } from '../src/domain/teaching-types';
import {
  getTeachingContext,
  handleTeachingTurn,
  isExpressionValueRequest,
  interpretTeachingInput,
  selectTeachingStep,
} from '../src/domain/teaching';
import {
  createState,
  hydrateState,
  startSession,
  submitAnswer,
  topicStatus,
} from '../src/domain/learning';
import { parseAnswerNumber } from '../src/domain/answer-check';
import type { Task } from '../src/domain/types';

const flatten = (steps: TeachingStep[]): TeachingStep[] =>
  steps.flatMap((s) => [s, ...flatten(s.detours || [])]);
describe('root and modulus teaching material', () => {
  it('provides a checked question and meaningful visual at every authored step', () => {
    const all = radicalTopic.tasks.flatMap((t) => flatten(t.teachingSteps || []));
    expect(all.length).toBeGreaterThan(25);
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    for (const step of all) {
      expect(step.question.answer).not.toBe('');
      expect(isTeachingVisual(step.visual), step.id).toBe(true);
      const task: Task = { id: step.id, ...step.question, hint: '', explanation: '' };
      expect(interpretTeachingInput(task, step.question.answer).assessment.status, step.id).toBe(
        'correct',
      );
    }
  });
  it('keeps the six final simplifications valid throughout the stated domains', () => {
    expect(Math.sqrt((-5) ** 2)).toBe(5);
    for (const x of [-12, -6, -2, 0, 2, 3.5, 4.5]) {
      if (x < 6) expect(Math.sqrt((x - 6) ** 2)).toBeCloseTo(6 - x);
      if (x >= -4) expect(Math.sqrt(x * x + 8 * x + 16)).toBeCloseTo(x + 4);
      if (x < 7) expect(Math.sqrt(x * x - 14 * x + 49)).toBeCloseTo(7 - x);
      if (x >= -2 && x <= 5)
        expect(Math.sqrt(x * x + 4 * x + 4) + Math.sqrt(x * x - 10 * x + 25)).toBeCloseTo(7);
      if (x < 5) expect(Math.sqrt(x * x - 10 * x + 25) / (x - 5)).toBeCloseTo(-1);
    }
  });

  it('checks every authored final answer form against the actual radicals, including interval endpoints', () => {
    const inputs = [-12, -4, -2, 0, 0.25, 2, 4.5, 5, 6, 6.999];
    const original = [
      (_x: number) => Math.sqrt((-5) ** 2),
      (x: number) => Math.sqrt((x - 6) ** 2),
      (x: number) => Math.sqrt(x * x + 8 * x + 16),
      (x: number) => Math.sqrt(x * x - 14 * x + 49),
      (x: number) => Math.sqrt(x * x + 4 * x + 4) + Math.sqrt(x * x - 10 * x + 25),
      (x: number) => Math.sqrt(x * x - 10 * x + 25) / (x - 5),
    ];
    const inDomain = [
      (_x: number) => true,
      (x: number) => x < 6,
      (x: number) => x >= -4,
      (x: number) => x < 7,
      (x: number) => x >= -2 && x <= 5,
      (x: number) => x < 5,
    ];
    for (const [index, task] of radicalTopic.tasks.entries()) {
      for (const x of inputs.filter(inDomain[index])) {
        for (const answer of [task.answer, ...(task.accepted ?? [])]) {
          const numeric = answer
            .replace('минус один', '-1')
            .replace(/х/g, 'x')
            .replace(/x/g, `(${x})`);
          const value = parseAnswerNumber(numeric);
          expect(value, `${task.id}, x=${x}, answer=${answer}`).toBeDefined();
          expect(value!).toBeCloseTo(original[index](x), 7);
        }
      }
    }
  });

  it('does not mistake the constant in a binomial for the full expression inside the square', () => {
    const specifications = [
      ['radicals-3-square', '4', 'x+4'],
      ['radicals-4-square', '7', 'x-7'],
      ['radicals-5-first', '2', 'x+2'],
      ['radicals-5-second', '5', 'x-5'],
      ['radicals-6-square', '5', 'x-5'],
    ];
    const all = radicalTopic.tasks.flatMap((task) => flatten(task.teachingSteps!));
    for (const [id, constant, inside] of specifications) {
      const step = all.find((item) => item.id === id)!;
      const active: Task = { id, ...step.question, hint: '', explanation: '' };
      expect(interpretTeachingInput(active, constant).assessment.status, id).not.toBe('correct');
      expect(interpretTeachingInput(active, inside).assessment.status, id).toBe('correct');
      // An explicitly written whole square is an unambiguous expression of the same binomial.
      expect(
        interpretTeachingInput(active, `(${inside.replace('x', 'х')})2`).assessment.status,
        id,
      ).toBe('correct');
    }
  });

  it('requires the resulting expression rather than an ambiguous instruction to leave something unchanged', () => {
    const positiveSteps = [
      radicalTopic.tasks[2].teachingSteps!.at(-1)!,
      radicalTopic.tasks[4].teachingSteps![2],
    ];
    for (const step of positiveSteps) {
      const active: Task = { id: step.id, ...step.question, hint: '', explanation: '' };
      for (const vague of ['оставить', 'оставить как есть'])
        expect(interpretTeachingInput(active, vague).assessment.status).not.toBe('correct');
      expect(interpretTeachingInput(active, step.question.answer).assessment.status).toBe(
        'correct',
      );
    }
  });

  it('preserves x≤5 and its zero boundary in the right-radical sign detour', () => {
    const right = radicalTopic.tasks[4].teachingSteps!.find(
      (step) => step.id === 'radicals-5-right',
    )!;
    expect(right.question.prompt).toContain('x ≤ 5');
    const sign = right.detours![0];
    expect(sign.question.prompt).toContain('x ≤ 5');
    expect(sign.question.answer).toBe('неположительное');
    const active: Task = { id: sign.id, ...sign.question, hint: '', explanation: '' };
    expect(interpretTeachingInput(active, 'отрицательное').assessment.status).not.toBe('correct');
    expect(interpretTeachingInput(active, 'отрицательное или ноль').assessment.status).toBe(
      'correct',
    );
    expect(Math.abs(5 - 5)).toBeCloseTo(-(5 - 5));
  });

  it('marks only the true primary conclusions as task-completing questions', () => {
    const expected = [
      undefined,
      'radicals-2-brackets',
      'radicals-3-remove',
      'radicals-4-brackets',
      'radicals-5-collect',
      'radicals-6-cancel',
    ];
    for (const [index, task] of radicalTopic.tasks.entries()) {
      expect(
        flatten(task.teachingSteps!)
          .filter((step) => step.completesTask)
          .map((step) => step.id),
      ).toEqual(expected[index] ? [expected[index]] : []);
      if (expected[index]) expect(task.teachingSteps!.at(-1)!.id).toBe(expected[index]);
    }
  });

  it('finishes all six real teaching chains without asking for the already verified final result twice', () => {
    const at = '2026-09-08T18:00:00Z';
    const started = startSession(createState(), radicalTopic.id, at);
    let state = started.state;
    for (const [index, task] of radicalTopic.tasks.entries()) {
      for (const step of task.teachingSteps!) {
        expect(getTeachingContext(state.sessions[started.sessionId], task).stepId).toBe(step.id);
        state = submitAnswer(state, started.sessionId, step.question.answer, at);
        state = submitAnswer(state, started.sessionId, 'что дальше?', at);
      }
      if (index === 0) {
        expect(state.sessions[started.sessionId].taskIndex).toBe(0);
        expect(
          getTeachingContext(state.sessions[started.sessionId], task).activeQuestion.answer,
        ).toBe('5');
        state = submitAnswer(state, started.sessionId, '5', at);
      }
      expect(state.sessions[started.sessionId].taskIndex).toBe(index + 1);
    }
    expect(state.sessions[started.sessionId].phase).toBe('summary');
    expect(topicStatus(state, radicalTopic.id).attempts).toHaveLength(6);
    expect(
      topicStatus(state, radicalTopic.id).attempts.every(
        (attempt) => attempt.correct && attempt.assisted,
      ),
    ).toBe(true);
    expect(topicStatus(state, radicalTopic.id).mastery).toBe('learning');
  });

  it('keeps solution text out of the first autonomous prompt and checks a small answer before a full-task answer', () => {
    const at = '2026-09-08T18:00:00Z';
    const started = startSession(createState(), radicalTopic.id, at);
    const firstReply = started.state.sessions[started.sessionId].messages.at(-1)!.text;
    expect(firstReply).not.toContain('√25 = 5');
    const squareToModule = radicalTopic.tasks[1].teachingSteps![0];
    const original = started.state.sessions[started.sessionId];
    const session = selectTeachingStep(original, radicalTopic.tasks[1], squareToModule.id);
    const active = getTeachingContext(session, radicalTopic.tasks[1]).activeQuestion;
    expect(interpretTeachingInput(active, '6-x').assessment.status).not.toBe('correct');
    expect(interpretTeachingInput(active, '|х-6|').assessment.status).toBe('correct');
  });

  it('handles the live first-square misunderstanding locally and returns after −2 and restart', () => {
    const at = '2026-09-08T18:00:00Z';
    const started = startSession(createState(), radicalTopic.id, at);
    let state = submitAnswer(
      started.state,
      started.sessionId,
      'не понимаю что означает чему равно',
      at,
    );
    const task = radicalTopic.tasks[0];
    let context = getTeachingContext(state.sessions[started.sessionId], task);
    expect(context.mode).toBe('detour');
    expect(context.activeQuestion.prompt).toBe('Сколько будет 3 − 5?');
    expect(context.activeQuestion.answer).toBe('-2');
    expect(context.state.returnStack).toEqual([{ stepId: 'radicals-1-square', phase: 'asking' }]);
    expect(state.sessions[started.sessionId].messages.at(-1)?.text).toContain(
      '«какое число получится»',
    );
    state = submitAnswer(state, started.sessionId, '−2', at);
    state = hydrateState(JSON.stringify(state));
    context = getTeachingContext(state.sessions[started.sessionId], task);
    expect(context.completed).toBe(true);
    expect(topicStatus(state, radicalTopic.id).attempts).toHaveLength(0);
    state = submitAnswer(state, started.sessionId, 'что дальше?', at);
    expect(getTeachingContext(state.sessions[started.sessionId], task)).toMatchObject({
      stepId: 'radicals-1-square',
      mode: 'assisted',
      completed: false,
      activeQuestion: { answer: '25', prompt: 'Сколько будет (−5) · (−5)?' },
    });
    expect(state.sessions[started.sessionId].taskIndex).toBe(0);
    expect(topicStatus(state, radicalTopic.id).attempts).toHaveLength(0);
  });

  it('offers the same registered prerequisite from every primary question while retaining its exact return target', () => {
    const at = '2026-09-08T18:00:00Z';
    const base = startSession(createState(), radicalTopic.id, at);
    for (const task of radicalTopic.tasks) {
      for (const step of task.teachingSteps!) {
        const original = selectTeachingStep(base.state.sessions[base.sessionId], task, step.id);
        let session = handleTeachingTurn(original, task, 'что значит «вычисли»?', at).session;
        const context = getTeachingContext(session, task);
        expect(context.mode, step.id).toBe('detour');
        expect(context.activeQuestion.answer, step.id).toBe('-2');
        expect(context.state.returnStack.at(-1)?.stepId, step.id).toBe(step.id);
        session = handleTeachingTurn(session, task, '-2', at).session;
        session = handleTeachingTurn(session, task, 'дальше', at).session;
        expect(getTeachingContext(session, task).stepId, step.id).toBe(step.id);
      }
    }
  });

  it('does not stack another detour when the learner repeats the explicit meaning question', () => {
    const at = '2026-09-08T18:00:00Z';
    const started = startSession(createState(), radicalTopic.id, at);
    let state = submitAnswer(started.state, started.sessionId, 'что означает чему равно?', at);
    const first = getTeachingContext(state.sessions[started.sessionId], radicalTopic.tasks[0]);
    state = submitAnswer(
      state,
      started.sessionId,
      'всё ещё не понимаю что означает чему равно',
      at,
    );
    const repeated = getTeachingContext(state.sessions[started.sessionId], radicalTopic.tasks[0]);
    expect(repeated.stepId).toBe(first.stepId);
    expect(repeated.state.returnStack).toEqual(first.state.returnStack);
    expect(repeated.revision).toBeGreaterThan(first.revision);
    expect(repeated.activeQuestion.answer).toBe('-2');
  });

  it.each([
    'не понимаю что означает чему равно',
    'Что значит «вычисли»?',
    'Объясни значение выражения',
    'Что такое значение выражения?',
    'Я не понимаю, чему равно',
  ])('recognizes an explicit instruction-meaning request: %s', (text) => {
    expect(isExpressionValueRequest(text)).toBe(true);
  });

  it.each(['Как вычислить дискриминант?', 'Объясни первый шаг', 'Вычисли 3 − 5', '25'])(
    'does not force the meaning prerequisite for %s',
    (text) => {
      expect(isExpressionValueRequest(text)).toBe(false);
    },
  );
});
