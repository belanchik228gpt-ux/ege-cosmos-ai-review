import { describe, expect, it } from 'vitest';
import { assessAnswer, parseAnswerNumber } from '../src/domain/answer-check';
import { checkAnswer, topics, type Task } from '../src/domain';

const area: Task = {
  id: 'written-area',
  prompt: 'Найди площадь прямоугольника 7 см на 4 см. Ответ в см².',
  answer: '28',
  accepted: ['28 см²', '28 см2'],
  kind: 'number',
  hint: 'Посчитай одинаковые ряды.',
  explanation: '7 · 4 = 28 см².',
};
const demand = topics.find((topic) => topic.id === 'social-demand')!.tasks[0];

describe('bounded conversational answers', () => {
  it.each([
    '28',
    'Я думаю, что ответ 28.',
    'Получается 28 см²',
    'Площадь равна 28 квадратных сантиметров',
    '7*4=28',
    'S = 7 × 4 = 28 см2',
    '(3 + 4) * 4 = 28',
    'Ответ: 28,0 см²',
  ])('accepts a scalar answer with wording or checked working: %s', (text) => {
    expect(assessAnswer(area, text).status).toBe('correct');
  });
  it.each([
    '21 или 28',
    '28 21',
    'не 28',
    '28, но не 21',
    '7 + 4 = 28',
    '7 * 4 = 29',
    '28 см',
    '28 м²',
    'alert(28)',
    'fetch(28)',
    'В словаре 28 слов',
    '28 ≈ 27',
    'около 28',
  ])('does not accept contradiction, wrong working, wrong units or unrelated prose: %s', (text) => {
    expect(checkAnswer(area, text)).toBe(false);
  });
  it('clarifies incompatible alternatives without labeling either an answer', () => {
    expect(assessAnswer(area, '21 или 28').status).toBe('ambiguous');
    expect(assessAnswer(area, '7+4=28').status).toBe('incorrect');
  });
  it('accepts a year in its normal Russian phrasing', () => {
    const baptism = topics.find((topic) => topic.id === 'history-baptism')!.tasks[0];
    expect(checkAnswer(baptism, 'В 988 году')).toBe(true);
    expect(checkAnswer(baptism, '988 или 989')).toBe(false);
  });
  it('preserves fraction simplification and decimal equivalence inside an answer', () => {
    const fraction = topics.find((topic) => topic.id === 'math-fraction')!;
    expect(checkAnswer(fraction.tasks[0], 'получилось 0,4')).toBe(true);
    expect(checkAnswer(fraction.tasks[1], 'Ответ 6/8')).toBe(false);
    expect(checkAnswer(fraction.tasks[1], '6/8 = 3/4')).toBe(true);
    expect(checkAnswer(fraction.tasks[1], '6/8 = 3/5')).toBe(false);
  });
  it.each([
    'спрос уменьшится',
    'величина спроса снизится',
    'станет меньше',
    'станет маленьким',
    'спрос будет меньше',
    'Я думаю, что спрос уменьшится',
  ])('accepts the direction of demand expressed naturally: %s', (text) => {
    expect(assessAnswer(demand, text).status).toBe('correct');
  });
  it('adds precise terminology rather than rejecting the right direction', () => {
    expect(assessAnswer(demand, 'спрос станет маленьким').feedback).toContain('величина спроса');
  });
  it.each([
    'спрос увеличится',
    'станет больше',
    'не уменьшится',
    'спрос уменьшится или увеличится',
    'не станет меньше',
    'станет меньше, нет больше',
    'цена уменьшится',
  ])('does not award a contradicted or different economic quantity: %s', (text) => {
    expect(checkAnswer(demand, text)).toBe(false);
  });
});

describe('arithmetic parser limits', () => {
  it.each([
    ['-2,5', -2.5],
    ['(3 + 4) * 4', 28],
    ['−3 + 1', -2],
    ['6/8', 0.75],
    ['100 * 1.2', 120],
    ['2 * (5 - 2)', 6],
  ])('safely evaluates %s', (text, answer) => {
    expect(parseAnswerNumber(String(text))).toBe(answer);
  });
  it.each([
    '4/0',
    '1e309',
    '2**3',
    'Math.random()',
    'globalThis.process.exit()',
    '1 2',
    '('.repeat(20) + '1' + ')'.repeat(20),
    '1+'.repeat(40) + '1',
  ])('rejects unsupported or excessive syntax: %s', (text) => {
    expect(parseAnswerNumber(text)).toBeUndefined();
  });
});
