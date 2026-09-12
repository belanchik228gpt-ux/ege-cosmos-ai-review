import { describe, expect, it } from 'vitest';
import {
  createProblemSession,
  hydrateProblemSessions,
  restoreProblem,
} from '../src/domain/problem-sessions';
import {
  applyProblemTeachingTurn,
  createProblemTask,
  getProblemTeachingContext,
  selectProblemTeachingStep,
} from '../src/domain/problem-teaching';
import { checkProblemAnswer, parseProblem } from '../src/domain/problem-workbench';
import { isTeachingVisual } from '../src/domain/teaching-visual';

const rectangle = 'Площадь прямоугольника со сторонами 7 и 4 см';
const turn = (own: ReturnType<typeof createProblemSession>, text: string) =>
  applyProblemTeachingTurn(own, text).session;

describe('own problems use tracked teaching questions', () => {
  it('checks rows, operation and the original result separately, without repeating the accepted final answer', () => {
    let own = createProblemSession(rectangle);
    own = turn(own, 'не знаю');
    expect(getProblemTeachingContext(own).stepId).toBe('own-rectangle-rows');
    own = turn(own, '4');
    expect(own.teaching?.attempts.at(-1)?.correct).toBe(false);
    expect(own.attempts).toBe(0);
    expect(own.solved).toBe(false);
    own = turn(own, '7?');
    expect(getProblemTeachingContext(own).completed).toBe(true);
    expect(own.teaching?.attempts.at(-1)?.correct).toBe(true);
    own = turn(own, 'дальше');
    expect(getProblemTeachingContext(own).stepId).toBe('own-rectangle-operation');
    own = turn(own, 'умножение');
    own = turn(own, 'дальше');
    expect(getProblemTeachingContext(own).stepId).toBe('own-final');
    own = turn(own, '28?');
    expect(getProblemTeachingContext(own).completed).toBe(true);
    expect(own.solved).toBe(false);
    own = turn(own, 'дальше');
    expect(own.solved).toBe(true);
    expect(own.attempts).toBe(1);
    expect(own.hints).toBeGreaterThan(0);
    const again = turn(own, 'дальше');
    expect(again.attempts).toBe(1);
  });

  it('restores the same photo-confirmed step and fresh grading key, ignoring forged answer fields', () => {
    let own = turn(createProblemSession(rectangle, true), 'подсказка');
    own = turn(own, '7');
    const raw = JSON.parse(JSON.stringify(own));
    raw.teaching.answer = '999';
    raw.teaching.activeQuestion = { answer: '999' };
    const restored = hydrateProblemSessions({ [own.id]: raw })[own.id];
    const context = getProblemTeachingContext(restored);
    expect(restored.fromPhoto).toBe(true);
    expect(context.stepId).toBe('own-rectangle-rows');
    expect(context.completed).toBe(true);
    expect(context.activeQuestion.answer).toBe('7');
    expect(context.state).not.toHaveProperty('activeQuestion');
    expect(context.state.attempts).toHaveLength(1);
    expect(restored.attempts).toBe(0);
  });

  it('does not copy another problem task state or accept its dimensions', () => {
    const first = turn(createProblemSession(rectangle), 'подсказка');
    const second = createProblemSession('Площадь прямоугольника со сторонами 3 и 4 см');
    second.teaching = first.teaching;
    const restored = hydrateProblemSessions({ [second.id]: second })[second.id];
    expect(getProblemTeachingContext(restored).mode).toBe('main');
    expect(restoreProblem(restored).expectedAnswer).toBe('12');
    expect(turn(restored, '28').solved).toBe(false);
  });

  it('never treats a hint, skip or explicit solution as an independent successful attempt', () => {
    const original = createProblemSession(rectangle);
    expect(turn(original, 'дальше').attempts).toBe(0);
    const revealed = turn(original, 'покажи ответ');
    expect(revealed.revealed).toBe(true);
    expect(revealed.solved).toBe(false);
    expect(revealed.attempts).toBe(0);
    expect(revealed.teaching?.mainRevealed).toBe(true);
    const hinted = turn(original, 'почему так');
    expect(hinted.solved).toBe(false);
    expect(hinted.teaching?.activeStepId).not.toBe('main');
    expect(hinted.messages.at(-1)?.text).not.toContain('результат всей задачи');
  });

  it('a repeated correct intermediate response never creates another attempt', () => {
    let own = turn(createProblemSession(rectangle), 'подсказка');
    own = turn(own, '7');
    own = turn(own, '7?');
    expect(own.teaching?.attempts).toHaveLength(1);
    expect(own.attempts).toBe(0);
  });

  it('checks root sets with the original exact checker, accepting reverse order and fractions', () => {
    const own = createProblemSession('|x − 2| = 3');
    const solved = turn(own, '5; -2/2?');
    expect(solved.solved).toBe(true);
    expect(solved.attempts).toBe(1);
    expect(checkProblemAnswer(restoreProblem(own), '5; -2/2').correct).toBe(true);
    expect(turn(own, '5').solved).toBe(false);
  });

  it('the terminal step also accepts reordered roots and completes on next', () => {
    let own = turn(createProblemSession('|x − 2| = 3'), 'подсказка');
    for (const answer of ['2', 'нет', 'влево', '5; -1?']) {
      own = turn(own, answer);
      expect(getProblemTeachingContext(own).completed).toBe(true);
      own = turn(own, 'дальше');
    }
    expect(own.solved).toBe(true);
    expect(own.attempts).toBe(1);
  });

  it('skipped required steps do not silently complete the original task', () => {
    let own = turn(createProblemSession(rectangle), 'подсказка');
    own = turn(own, 'дальше');
    own = turn(own, 'умножение');
    own = turn(own, 'дальше');
    own = turn(own, '28');
    own = turn(own, 'дальше');
    expect(own.solved).toBe(false);
    expect(getProblemTeachingContext(own).mode).toBe('main');
    expect(own.attempts).toBe(0);
  });

  it('unknown selection keeps the active question and unrelated records unchanged', () => {
    const own = turn(createProblemSession(rectangle), 'подсказка');
    const next = selectProblemTeachingStep(own, 'invented-step');
    expect(next.teaching?.activeStepId).toBe(own.teaching?.activeStepId);
    expect(next.messages).toEqual(own.messages);
    expect(next.attempts).toBe(own.attempts);
  });

  it('never replaces exact arithmetic with a floating-point approximate grading pass', () => {
    const original = createProblemSession('999999 × 1000000');
    const before = structuredClone(original);
    expect(turn(original, '999998999999').solved).toBe(false);
    let own = turn(original, 'подсказка');
    own = turn(own, '999998999999');
    expect(getProblemTeachingContext(own).completed).toBe(false);
    expect(own.solved).toBe(false);
    expect(original).toEqual(before);
  });

  it.each([
    rectangle,
    'Площадь треугольника: основание 8 см, высота 5 см',
    '15% от 240',
    '|x − 2| = 3',
    '|x + 4| = 0',
    '|x − 5| = −2',
    '2x + 5 = 17',
    'x² − 5x + 6 = 0',
    'x² + 1 = 0',
    'x = x',
    'x = x + 1',
    '2/3 + 1/4',
    '2/3 × 3/4',
    '7 × 4',
    '|−7|',
  ])('creates bounded checked steps and completes supported fixture %s', (text) => {
    let own = createProblemSession(text);
    const problem = restoreProblem(own);
    expect(problem.verified).toBe(true);
    const task = createProblemTask(problem);
    expect(task.teachingSteps!.length).toBeGreaterThan(0);
    for (const step of task.teachingSteps!) {
      expect(isTeachingVisual(step.visual)).toBe(true);
      expect(step.question.prompt.trim().length).toBeGreaterThan(0);
    }
    own = turn(own, 'подсказка');
    for (const step of task.teachingSteps!) {
      expect(getProblemTeachingContext(own).stepId).toBe(step.id);
      own = turn(own, step.question.answer);
      expect(getProblemTeachingContext(own).completed).toBe(true);
      own = turn(own, 'дальше');
    }
    expect(own.solved).toBe(true);
    expect(own.attempts).toBe(1);
    expect(own.hints).toBeGreaterThan(0);
  });

  it('rejects an unsupported or tampered problem blueprint', () => {
    expect(createProblemTask(parseProblem('Помоги с рисунком')).teachingSteps).toEqual([]);
    const tampered = parseProblem(rectangle);
    tampered.parameters.a = 8;
    expect(createProblemTask(tampered).teachingSteps).toEqual([]);
  });
});
