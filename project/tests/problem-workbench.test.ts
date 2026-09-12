import { describe, expect, it } from 'vitest';
import {
  checkProblemAnswer,
  parseProblem,
  validateProblemProposal,
  verifyProblem,
} from '../src/domain/problem-workbench';

describe('one condition feeds solver, scene and checking', () => {
  it('asks to choose one photographed task rather than change a valid equation', () => {
    const problem = parseProblem('Вычислите: 3/8 + 1/4. Решите уравнение: |x - 2| = 5.');
    expect(problem.verified).toBe(false);
    expect(problem.question).toContain('Оставь одно условие');
    expect(parseProblem('3/8 + 1/4').verified).toBe(true);
  });
  it.each([
    ['7 * 4', 'arithmetic', '28'],
    ['7 × 3', 'arithmetic', '21'],
    ['Вычисли 1/2 * 2/5.', 'arithmetic', '1/5'],
    ['Сократи дробь 6/8.', 'arithmetic', '3/4'],
    ['−2,5 + 1/2', 'arithmetic', '−2'],
    ['(2+3)*4', 'arithmetic', '20'],
    ['-2^2', 'arithmetic', '−4'],
    ['Вычисли |−7|.', 'arithmetic', '7'],
    ['|−2,5|', 'arithmetic', '5/2'],
    ['Найди 20% от 150.', 'percent', '30'],
    ['2,5% от 200', 'percent', '5'],
    ['150% от 20', 'percent', '30'],
    ['0% от 70', 'percent', '0'],
    ['В прямоугольнике 7 клеток в каждом ряду и 3 ряда. Сколько всего клеток?', 'rectangle', '21'],
    ['Длина прямоугольника 8 см, ширина 5 см. Чему равна площадь в см²?', 'rectangle', '40'],
    ['Площадь прямоугольника со сторонами 7 и 4 см', 'rectangle', '28'],
    ['Основание треугольника 6 см, высота к нему 4 см. Найди площадь в см².', 'triangle', '12'],
    ['Высота треугольника 4 см, основание 6 см. Найди площадь.', 'triangle', '12'],
    ['2x + 3 = 11', 'linear', '4'],
    ['2(x-1)=6', 'linear', '4'],
    ['x/2=3', 'linear', '6'],
    ['0x=0', 'linear', 'любое действительное число'],
    ['0x=1', 'linear', 'нет решений'],
    ['|x-2|=3', 'absolute', '−1; 5'],
    ['|x+2|=3', 'absolute', '−5; 1'],
    ['|x|=0', 'absolute', '0'],
    ['|x|=-2', 'absolute', 'нет решений'],
    ['x^2 - 5x + 6 = 0', 'quadratic', '2; 3'],
    ['x²=0', 'quadratic', '0'],
    ['x²+1=0', 'quadratic', 'нет решений'],
  ])('%s has the same verified answer everywhere', (text, kind, answer) => {
    const p = parseProblem(text);
    expect(p.status, p.question).toBe('verified');
    expect(p.kind).toBe(kind);
    expect(p.expectedAnswer).toBe(answer);
    expect(verifyProblem(p)).toEqual({ valid: true });
    expect(checkProblemAnswer(p, answer).correct).toBe(true);
    expect(p.steps.length).toBeGreaterThan(3);
    const recovered = parseProblem(p.confirmedText);
    expect(recovered.verified, `Saved confirmedText failed: ${p.confirmedText}`).toBe(true);
    expect(recovered.parameters).toEqual(p.parameters);
    expect(recovered.expectedAnswer).toBe(p.expectedAnswer);
  });
  it('cannot keep a 7×4 scene when the current question changed to 7×3', () => {
    const a = parseProblem('Площадь прямоугольника со сторонами 7 и 4 см');
    const b = parseProblem(
      'В прямоугольнике 7 клеток в каждом ряду и 3 ряда. Сколько всего клеток?',
    );
    expect(a.parameters).toMatchObject({ a: 7, b: 4, result: 28 });
    expect(b.parameters).toMatchObject({ a: 7, b: 3, result: 21 });
    expect(a.id).not.toBe(b.id);
    expect(checkProblemAnswer(b, '28').correct).toBe(false);
    expect(b.steps.some((s) => s.formula === 'S = 7 · 3')).toBe(true);
  });
  it.each([
    '1/0',
    '2/(1-1)',
    '2 + alert(1)',
    '<svg onload=alert(1)>',
    'x/ x = 1',
    'x^3=0',
    '|2x-1|=3',
    'sin(30)',
    'Площадь треугольника: стороны 7 и 4',
    'Площадь прямоугольника со сторонами 7 см и 4 м',
    'Прямоугольник 7 и 4',
    'Площадь прямоугольника 36 см², длина 9 см. Найди ширину.',
    'Расскажи про уравнения',
    '7 4',
    '',
    '2**3',
  ])('requires clarification for unsupported/ambiguous %s', (text) => {
    const p = parseProblem(text);
    expect(p.status).toBe('clarification');
    expect(p.verified).toBe(false);
    expect(p.expectedAnswer).toBe('');
    expect(p.steps).toEqual([]);
  });
  it('rejects edited parameters, result, instructions and manufactured model answers', () => {
    const p = parseProblem('7*3');
    expect(verifyProblem({ ...p, expectedAnswer: '28' }).valid).toBe(false);
    expect(verifyProblem({ ...p, parameters: { ...p.parameters, right: 4 } }).valid).toBe(false);
    expect(verifyProblem({ ...p, steps: [{ ...p.steps[0], narration: 'answer 28' }] }).valid).toBe(
      false,
    );
    expect(
      validateProblemProposal({ kind: 'arithmetic', expectedAnswer: '28' }, '7*3').status,
    ).toBe('clarification');
    expect(validateProblemProposal(p, '7*3')).toEqual(p);
    expect(validateProblemProposal(p, 'какая площадь фигуры на фотографии?').status).toBe(
      'clarification',
    );
  });
  it('checks complete root sets, exact fractions and decimal answers', () => {
    expect(checkProblemAnswer(parseProblem('|x-2|=3'), '−1').correct).toBe(false);
    expect(checkProblemAnswer(parseProblem('|x-2|=3'), '5; -1').correct).toBe(true);
    expect(checkProblemAnswer(parseProblem('1/2*2/5'), '0,2').correct).toBe(true);
    expect(checkProblemAnswer(parseProblem('x²=2'), '-1,414214; 1,414214').correct).toBe(true);
    expect(checkProblemAnswer(parseProblem('x²=2'), '-1; 1').correct).toBe(false);
  });
  it('limits hostile nesting and magnitude without hanging or solving by eval', () => {
    for (const text of [
      '('.repeat(35) + '2' + ')'.repeat(35),
      '9^6^6',
      '999999999*999999999',
      'x'.repeat(1500),
    ])
      expect(parseProblem(text).verified).toBe(false);
  });
  it('does not loosen numeric checking as numbers become large', () => {
    expect(checkProblemAnswer(parseProblem('1000000000000'), '1000000000001').correct).toBe(false);
    expect(checkProblemAnswer(parseProblem('1/1000000000000'), '0').correct).toBe(false);
    expect(checkProblemAnswer(parseProblem('x=0.000001'), '0').correct).toBe(false);
    expect(parseProblem('x^2+100000000x+1=0').verified).toBe(false);
  });
  it.each([
    'будет площадь 28 см2',
    'получится 28 см²',
    '7*4=28',
    'я думаю 7 · 4 = 28',
    'ответ: 28',
    'S = 28 см²',
  ])('accepts a meaningful student answer: %s', (answer) => {
    expect(
      checkProblemAnswer(parseProblem('Площадь прямоугольника со сторонами 7 и 4 см'), answer)
        .correct,
    ).toBe(true);
  });
  it.each([
    'будет не 28',
    '7*3=28',
    '7*4=27',
    '28 или 21',
    'я живу в 28 квартире',
    'площадь 28 м²',
  ])('does not pull a correct number out of false wording: %s', (answer) => {
    expect(
      checkProblemAnswer(parseProblem('Площадь прямоугольника со сторонами 7 и 4 см'), answer)
        .correct,
    ).toBe(false);
  });
  it('recognizes root introductions without swallowing a minus or a denial', () => {
    const p = parseProblem('|x-2|=3');
    expect(checkProblemAnswer(p, 'корни: -1; 5').correct).toBe(true);
    expect(checkProblemAnswer(p, 'корни -1; 5').correct).toBe(true);
    expect(checkProblemAnswer(p, 'корни не -1; 5').correct).toBe(false);
  });
});
