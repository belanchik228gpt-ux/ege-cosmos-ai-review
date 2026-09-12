import { expect, it } from 'vitest';
import {
  visibleSubtopics,
  schoolSearchScore,
  matchingSchoolUnits,
} from '../src/domain/school-topic-search';
import { schoolUnits } from '../src/domain/school-program';
it('does not hide the causes of the Reformation when its section title is searched', () => {
  const unit = schoolUnits.find((u) => u.title === 'Реформация и Контрреформация')!;
  expect(unit).toBeDefined();
  const visible = visibleSubtopics(unit, unit.title, false);
  expect(visible.map((x) => x.text)).toContain('Причины Реформации');
  expect(visible).toHaveLength(unit.topics.length);
});
it('matches reordered words, punctuation, ё and equivalent math names', () => {
  for (const [title, query] of [
    ['Стереометрия', 'геометрия в пространстве'],
    ['Геометрия в пространстве', 'стереометрия'],
    ['Пространственная геометрия', 'геометрия пространственная'],
    ['Модуль числа', 'абсолютное значение числа'],
    ['Модуль', '|x|'],
    ['Квадратные уравнения', 'уравнение, квадратное!'],
    ['Объём цилиндра', 'цилиндра объем'],
    ['Геометрия на плоскости', 'планиметрия'],
    ['Принадлежность точки прямой', 'принадлежит'],
    ['Принадлежность точки прямой', '∈'],
  ])
    expect(schoolSearchScore(title, query), `${query} → ${title}`).toBeGreaterThan(0);
  expect(schoolSearchScore('Модуль числа', 'фотосинтез')).toBe(0);
  expect(schoolSearchScore('НЕ с причастиями', 'НИ с причастиями')).toBe(0);
});
it('ranks a precise section heading before an incidental child match and preserves original ordering for empty searches', () => {
  const base = schoolUnits[0];
  const items = [
    { ...base, id: 'child', title: 'Разные темы', topics: ['Модуль числа'] },
    { ...base, id: 'heading', title: 'Модуль числа', topics: ['Расстояние'] },
  ];
  expect(matchingSchoolUnits(items, 'абсолютная величина числа').map((u) => u.id)).toEqual([
    'heading',
    'child',
  ]);
  expect(matchingSchoolUnits(items, '')).toBe(items);
});
it('keeps targeted search and explicitly expanded contents distinct', () => {
  const unit = schoolUnits.find((u) => u.title === 'Реформация и Контрреформация')!;
  expect(
    visibleSubtopics(unit, 'причины', false).every((x) => x.text.toLowerCase().includes('причины')),
  ).toBe(true);
  expect(visibleSubtopics(unit, 'причины', true)).toHaveLength(unit.topics.length);
});
