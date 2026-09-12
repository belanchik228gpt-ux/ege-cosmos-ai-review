import { describe, expect, it } from 'vitest';
import { topicDrawing } from '../src/domain/school-topic-drawings';
import { cleanDrawing } from '../src/domain/cloud-learning';
import type { SchoolUnit } from '../src/domain/school-program/types';
const unit = (subject: SchoolUnit['subject'], title: string): SchoolUnit => ({
  id: 'fixture',
  subject,
  title,
  grade: 10,
  order: 1,
  section: title,
  topics: [title],
  sourceId: 'fixture',
  pages: [1],
  objectives: [],
  intro: 'Вводная',
  keyIdea: 'Идея',
  example: 'Пример',
  question: 'Вопрос',
  answer: 'Ответ',
  visual: 'concept',
});
describe('authored topic drawings', () => {
  it.each([
    ['math', 'Модуль числа', 'number-line'],
    ['math', 'Обыкновенные дроби', 'number-line'],
    ['math', 'Линейные уравнения', 'algebra'],
    ['math', 'Линейная функция', 'function'],
    ['math', 'Площадь треугольника', 'geometry'],
    ['math', 'Площадь прямоугольника', 'geometry'],
    ['physics', 'Второй закон Ньютона', 'concept'],
    ['physics', 'Закон Ома', 'algebra'],
    ['chemistry', 'Строение атома', 'concept'],
    ['chemistry', 'Ковалентная связь', 'algebra'],
    ['biology', 'Строение клетки', 'concept'],
    ['informatics', 'Двоичная система счисления', 'algebra'],
    ['russian', 'Сложноподчинённое предложение', 'syntax'],
    ['english', 'Present Simple', 'syntax'],
    ['history', 'Отмена крепостного права', 'history'],
  ] as const)('%s: %s has bounded validated data', (subject, title, kind) => {
    const drawing = topicDrawing(unit(subject, title));
    expect(drawing.kind).toBe(kind);
    expect(drawing.title).toContain('Авторский пример');
    expect(cleanDrawing(drawing)).toEqual(drawing);
    expect(drawing.steps.length).toBeGreaterThanOrEqual(2);
  });
  it('plots only correct points on the declared linear function', () => {
    for (const step of topicDrawing(unit('math', 'Линейная функция')).steps) {
      for (let i = 0; i < step.values!.length; i += 2)
        expect(step.values![i + 1]).toBe(2 * step.values![i] + 1);
    }
  });
  it('keeps rectangle dimensions and triangle height separate from their verified areas', () => {
    const r = topicDrawing(unit('math', 'Площадь прямоугольника')),
      t = topicDrawing(unit('math', 'Площадь треугольника'));
    expect(r.steps.every((s) => JSON.stringify(s.values) === '[7,4]')).toBe(true);
    expect(r.steps.at(-1)!.formula).toContain('=28');
    expect(t.steps.at(-1)!.values).toEqual([6, 4]);
    expect(t.steps.at(-1)!.formula).toContain('=12');
  });
  it('has consistent fractional positions, binary value and force direction', () => {
    expect(topicDrawing(unit('math', 'Дроби')).steps.map((s) => s.values?.[1])).toEqual([
      1,
      1 / 4,
      3 / 4,
    ]);
    expect(topicDrawing(unit('informatics', 'Двоичная система')).steps.at(-1)!.formula).toContain(
      '(11)_{10}',
    );
    const force = topicDrawing(unit('physics', 'Результирующая сила'));
    expect(
      force.steps.every((s) => s.values![1] / s.values![0] === 3 && s.caption.includes('вправо')),
    ).toBe(true);
  });
  it('does not replace an unsupported focus with the broad unit template', () => {
    const drawing = topicDrawing(unit('math', 'Модуль числа'), 'Уравнения с параметром');
    expect(drawing.title).toContain('Схема содержания');
    expect(JSON.stringify(drawing)).not.toContain('|-3|');
    expect(drawing.steps[0].labels).toEqual(['Уравнения с параметром']);
  });
  it('does not claim animal-cell parts for bacteria or invent historical events', () => {
    expect(topicDrawing(unit('biology', 'Прокариотическая клетка')).title).toContain(
      'Схема содержания',
    );
    const history = topicDrawing(unit('history', 'Культура XX века'));
    expect(history.title).toContain('Схема содержания');
    expect(JSON.stringify(history)).not.toContain('1861');
  });
});
