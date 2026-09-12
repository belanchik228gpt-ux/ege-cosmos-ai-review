import { describe, expect, it } from 'vitest';
import { shouldOpenOwnProblem } from '../src/ui/tutor-routing';

describe('explicit own-problem navigation', () => {
  it.each([
    'объясни как решить |x| = 0',
    'реши |x| = 0',
    'почему надо вычислить 3 − 5?',
    'разбери √((x − 6)²) ещё раз',
    '-(x-6)=-x-6',
    '-(x-6)=-x+6',
    'x = -4',
    'я не понимаю мою задачу |x|=0',
    'почему новый пример оказался сложнее?',
    'не открывай новый пример',
    'В прямоугольнике 7 на 4 я умножил стороны: 7*4=28',
  ])('keeps the lesson context for %s', (text) => {
    expect(shouldOpenOwnProblem(text, 'math')).toBe(false);
  });
  it.each([
    'Мой пример: 7/8 − 3/4',
    'Моя задача: |x + 2| = 5',
    'Вот другая задача: 2x + 1 = 9',
    'Давай разберём новый пример: 3 − 5',
    'Реши вот: |x| = 4',
    'Реши мою задачу: прямоугольник 7 на 4',
    'У меня есть другой пример: 2x = 8',
    'Теперь открой новую задачу',
  ])('opens a separate condition only for %s', (text) => {
    expect(shouldOpenOwnProblem(text, 'math')).toBe(true);
    expect(shouldOpenOwnProblem(text, 'russian')).toBe(false);
  });
});
