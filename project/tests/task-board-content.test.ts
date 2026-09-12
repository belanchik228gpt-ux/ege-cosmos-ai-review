import { describe, it, expect } from 'vitest';
import { taskBoardContent } from '../src/scenes/task-board-content';
describe('Task board uses actual prompt parts', () => {
  it('does not add a missing comma or reveal its position', () => {
    const m = taskBoardContent(
      'russian',
      '«Когда наступила весна птицы вернулись домой». После какого слова нужна запятая?',
    );
    expect(m.tokens.map((t) => t.text).join(' ')).toBe(
      'Когда наступила весна птицы вернулись домой',
    );
    expect(m.tokens.some((t) => t.text.includes(','))).toBe(false);
    expect(m.tokens[0].focus).toBe(true);
    expect(m.question).toContain('После какого слова');
  });
  it('preserves punctuation present in the condition', () => {
    const m = taskBoardContent(
      'russian',
      '«Когда наступила весна, птицы вернулись домой». Сколько основ?',
    );
    expect(m.tokens.find((t) => t.text === 'весна,')?.part).toBe(0);
    expect(m.tokens.find((t) => t.text === 'птицы')?.part).toBe(1);
  });
  it('does not select the answer token', () => {
    const m = taskBoardContent('russian', '«Тихий дождь начался утром». Назови сказуемое.');
    expect(m.facts[0].text).toBe('сказуемое');
    expect(m.tokens.every((t) => !t.focus)).toBe(true);
  });
  it('does not invent a prince or date', () => {
    const m = JSON.stringify(
      taskBoardContent('history', 'С каким князем связывают Крещение Руси? Назови имя.'),
    );
    expect(m).toContain('Крещение Руси');
    expect(m).toContain('князем');
    expect(m).not.toContain('Владимир');
    expect(m).not.toContain('988');
  });
  it('keeps supplied dates', () => {
    expect(
      taskBoardContent(
        'history',
        'В 1861 году произошла реформа. Назови её последствие.',
      ).facts.find((f) => f.icon === 'date')?.text,
    ).toContain('1861');
  });
  it('does not insert another familiar historical event', () => {
    const m = JSON.stringify(
      taskBoardContent('history', 'Какое культурное изменение описано в документе?'),
    );
    expect(m).not.toContain('Крещение');
    expect(m).not.toContain('Александр');
  });
  it('keeps quantities per market participant', () => {
    const m = taskBoardContent(
      'social',
      'Покупатели хотят купить 100 единиц, а продавцы предлагают 80 по той же цене. Это равновесие?',
    );
    expect(m.facts.find((f) => f.icon === 'buyer')?.text).toContain('100');
    expect(m.facts.find((f) => f.icon === 'seller')?.text).toContain('80');
    expect(m.question).toBe('Это равновесие?');
  });
  it('does not select the effect on demand', () => {
    const m = taskBoardContent('social', 'Цена товара выросла. Спрос увеличится или уменьшится?');
    expect(m.question).toBe('Спрос увеличится или уменьшится?');
    expect(m.facts.some((f) => f.text === 'Цена товара выросла')).toBe(true);
    expect(m.facts.every((f) => !f.text.includes('увеличится или уменьшится'))).toBe(true);
    expect(m.facts.every((f) => !f.text.includes('спрос уменьшится'))).toBe(true);
  });
  it.each([
    'Сколько корней у |x| = 0?',
    'Сколько корней у |x| = −3?',
    'Какое действие заменяет 7 + 7 + 7?',
  ])('extracts literal expressions %s', (prompt) => {
    const m = taskBoardContent('math', prompt);
    expect(m.facts.some((f) => f.icon === 'expression')).toBe(true);
    expect(m.facts.every((f) => prompt.includes(f.text))).toBe(true);
  });
  it('keeps supplied geometry labels', () => {
    const m = taskBoardContent('math', 'AM — медиана, BC = 14 см. Чему равно BM?');
    expect(m.facts[0].text).toBe('BC = 14 см');
    expect(m.facts.some((f) => f.text === 'AM — медиана')).toBe(true);
    expect(m.question).toContain('Чему равно BM');
  });
  it('keeps a fallback question without guesses', () => {
    const prompt =
      'Отрезок соединяет вершину с серединой противоположной стороны. Как он называется?';
    const m = taskBoardContent('math', prompt);
    expect(m.facts.length).toBeGreaterThan(0);
    expect(m.source).toBe(prompt);
    expect(m.question).toBe('Как он называется?');
  });
});
