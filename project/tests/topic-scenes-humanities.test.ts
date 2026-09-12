import { describe, expect, it } from 'vitest';
import { humanitiesDrawing, humanitiesExamples } from '../src/domain/topic-scenes/humanities';
import { cleanDrawing } from '../src/domain/cloud-learning';
import { humanitiesTopics } from '../src/domain/school-program/humanities';
import type { SchoolUnit } from '../src/domain/school-program/types';

function unit(subject: SchoolUnit['subject'], title = 'Другая тема'): SchoolUnit {
  const actual = humanitiesTopics.find((candidate) => candidate.subject === subject)!;
  return { ...actual, title, topics: [title] };
}
function scene(subject: SchoolUnit['subject'], focus: string) {
  const value = humanitiesDrawing(unit(subject), focus);
  expect(value, `${subject}: ${focus}`).toBeDefined();
  return value!;
}
const content = (subject: SchoolUnit['subject'], focus: string) =>
  JSON.stringify(scene(subject, focus));

describe('bounded humanities teaching scenes', () => {
  it('makes every family reachable from an actual school unit title or subtopic', () => {
    const reachable = new Set<string>();
    for (const actual of humanitiesTopics) {
      for (const focus of [actual.title, ...actual.topics]) {
        const selected = humanitiesDrawing(actual, focus);
        if (selected) reachable.add(selected.title);
      }
    }
    for (const example of humanitiesExamples)
      expect(
        reachable.has(scene(example.subject, example.topic).title),
        `${example.subject}: ${example.topic}`,
      ).toBe(true);
    expect(reachable.size).toBe(32);
  });

  it('provides exactly32 independent families across the six assigned subjects', () => {
    expect(humanitiesExamples).toHaveLength(32);
    expect(new Set(humanitiesExamples.map((x) => `${x.subject}:${x.topic}`)).size).toBe(32);
    expect(
      humanitiesExamples.reduce<Record<string, number>>((counts, x) => {
        counts[x.subject] = (counts[x.subject] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ russian: 8, english: 7, history: 6, literature: 4, social: 4, project: 3 });
  });

  it.each(humanitiesExamples)(
    '$subject — $topic survives the drawing boundary and ends with an open question',
    ({ subject, topic }) => {
      const value = scene(subject, topic);
      expect(cleanDrawing(value)).toEqual(value);
      expect(value.title).toContain('Авторский пример');
      expect(value.steps.length).toBeGreaterThanOrEqual(3);
      expect(value.steps.length).toBeLessThanOrEqual(5);
      expect(new Set(value.steps.map((s) => s.caption)).size).toBe(value.steps.length);
      const final = value.steps.at(-1)!;
      expect(final.caption).toContain('?');
      expect(final.formula).toBeUndefined();
      expect(final.caption).not.toMatch(/ответ\s*:|правильный ответ|решение\s*:/iu);
      expect(final.labels?.length).toBeGreaterThan(0);
    },
  );

  it('honours supplied focus instead of a matching broad unit title or hidden keywords', () => {
    const cases = [
      ['russian', 'Причастный оборот', 'Н и НН в причастиях'],
      ['russian', 'Согласование', 'Согласование сказуемого с подлежащим'],
      ['russian', 'Управление', 'Государственное управление'],
      ['english', 'Past Perfect', 'Present Perfect Continuous'],
      ['english', 'Conditional I', 'Conditional III'],
      ['english', 'Used to', 'Complex Object'],
      ['english', 'Stop', 'Remember doing и remember to do'],
      ['history', 'Северная война', 'Культура XX века'],
      ['history', 'Смутное время', 'Крещение Руси'],
      ['history', 'НЭП', 'Коллективизация'],
      ['literature', 'Лирический герой', 'Лирический цикл'],
      ['social', 'Семейный бюджет', 'Государственный бюджет'],
      ['social', 'Социальный статус и роль', 'Правовой статус несовершеннолетних'],
      ['project', 'Гипотеза', 'Корректное цитирование'],
    ] as const;
    for (const [subject, title, focus] of cases) {
      const selected = {
        ...unit(subject, title),
        topics: [title, 'Северная война', 'Причастный оборот'],
      };
      expect(humanitiesDrawing(selected, focus), `${subject}: ${focus}`).toBeUndefined();
    }
  });

  it('uses the title only for empty focus and normalizes case, spaces and Ё', () => {
    expect(humanitiesDrawing(unit('russian', 'Прямая речь'), '   ')).toEqual(
      scene('russian', 'Прямая речь'),
    );
    expect(humanitiesDrawing(unit('history'), '  СЕВЕРНАЯ   ВОЙНА  ')).toEqual(
      scene('history', 'Северная война'),
    );
    expect(humanitiesDrawing(unit('russian'), 'ДЕЕПРИЧАСТНЫЙ ОБОРОТ')).toEqual(
      scene('russian', 'Деепричастный оборот'),
    );
  });

  it('keeps legacy scenes as fallback and never crosses subject boundaries', () => {
    for (const [subject, focus] of [
      ['russian', 'Сложноподчинённое предложение'],
      ['english', 'Present Simple'],
      ['history', 'Отмена крепостного права'],
    ] as const)
      expect(humanitiesDrawing(unit(subject), focus)).toBeUndefined();
    expect(humanitiesDrawing(unit('history'), 'Past Perfect')).toBeUndefined();
    expect(humanitiesDrawing(unit('english'), 'Северная война')).toBeUndefined();
  });

  it('reveals punctuation after parsing and gives a different unsolved example', () => {
    const participle = scene('russian', 'Причастный оборот');
    expect(participle.steps[0].labels!.join(' ')).toBe('Книга лежащая на столе принадлежит Ане');
    expect(participle.steps[1].labels).toContain('Определение: лежащая на столе');
    expect(participle.steps[2].formula).toBe('Книга, лежащая на столе, принадлежит Ане.');
    expect(participle.steps[3].labels!.join(' ')).toBe('Письмо написанное вчера лежало в конверте');
    expect(content('russian', 'Деепричастный оборот')).not.toContain('Причастие «лежащая»');
    expect(scene('russian', 'Однородные члены предложения').steps[2].labels!.join(' ')).toContain(
      'ручки, карандаши и ластик.',
    );
    expect(scene('russian', 'Прямая речь').steps[2].formula).toBe('Учитель сказал: «Начинаем».');
  });

  it('distinguishes phrase relations rather than applying agreement to every dependent word', () => {
    expect(content('russian', 'Согласование')).toContain('синей тетради');
    expect(content('russian', 'Управление')).toContain('читал книгу');
    expect(content('russian', 'Примыкание')).toContain('говорили тихо');
    expect(content('russian', 'Примыкание')).toContain('неизменяемым');
  });

  it('keeps English contrasts semantically and grammatically distinct', () => {
    expect(scene('english', 'Past Perfect').steps[2].labels).toEqual([
      'When I arrived,',
      'the lesson had started.',
    ]);
    expect(scene('english', 'Conditional I').steps[1].labels).toEqual([
      'If it rains tomorrow,',
      'we will stay at home.',
    ]);
    expect(content('english', 'Conditional I')).not.toContain('If it will rain');
    expect(content('english', 'Conditional II')).toContain('If I had more time,');
    const used = scene('english', 'Used to и be/get used to doing');
    expect(used.steps[2].labels).toEqual(['used to + walk', 'am used to + walking']);
    expect(used.steps[3].labels).toEqual(['I am used to … early.', 'get up / getting up']);
    const stop = scene('english', 'Stop/remember/forget с инфинитивом и герундием');
    expect(stop.steps[0].labels).toContain('He stopped talking.');
    expect(stop.steps[1].labels).toContain('He stopped to talk.');
    expect(stop.steps.at(-1)!.labels).toEqual(['She stopped reading.']);
    expect(content('english', 'Present/Past Simple Passive')).toContain('was repaired');
  });

  it('aligns each timeline value with the exact event, including the final question frame', () => {
    const expected = new Map([
      ['Начало Северной войны', 1700],
      ['Полтавская битва', 1709],
      ['Ништадтский мир', 1721],
      ['Освобождение Москвы', 1612],
      ['Избрание Михаила Романова', 1613],
    ]);
    for (const name of ['Северная война', 'Смутное время']) {
      const value = scene('history', name);
      expect(value.figure).toBe('timeline');
      for (const step of value.steps) {
        expect(step.values!.length).toBe(step.labels!.length);
        expect(step.values!.length).toBeGreaterThanOrEqual(1);
        expect(step.values!.length).toBeLessThanOrEqual(6);
        step.labels!.forEach((label, i) => expect(step.values![i]).toBe(expected.get(label)));
      }
    }
    expect(content('history', 'Северная война')).not.toMatch(/1861|988|1613/);
    expect(content('history', 'Смутное время')).not.toMatch(/1721|1709|1861/);
  });

  it('keeps historical mechanisms and chronology qualified', () => {
    expect(content('history', 'Продналог и НЭП')).toContain('В1921 году');
    expect(content('history', 'Продналог и НЭП')).toContain('сохранением государственной власти');
    expect(content('history', 'Причины Реформации')).toContain('В1517 году');
    expect(content('history', 'Первая мировая война')).toContain('июне1914');
    expect(content('history', 'Революции 1917 года')).toContain('старому стилю');
    expect(content('history', 'Революции 1917 года')).not.toContain('1945');
  });

  it('labels invented literary miniatures and avoids fabricated quotations from books', () => {
    for (const name of ['Контраст', 'Лирический герой', 'Гротеск', 'Авторские отступления'])
      expect(scene('literature', name).steps[0].caption).toMatch(/Авторск/);
    expect(content('literature', 'Контраст')).toContain('не цитата');
    expect(content('literature', 'Лирический герой')).toContain('не доказывает');
    expect(content('literature', 'Гротеск')).toContain('В данном примере');
  });

  it('checks worked arithmetic and withholds the new exercise result', () => {
    const profit = scene('social', 'Издержки, выручка и прибыль');
    expect(profit.steps[0].formula).toBe('R=10\\cdot120');
    expect(profit.steps[2].formula).toBe('\\Pi=1200-900=300');
    expect(JSON.stringify(profit.steps.at(-1))).not.toMatch(/(?<!\d)400(?!\d)/u);
    const budget = scene('social', 'Семейный бюджет');
    expect(budget.steps[2].formula).toBe('50000-42000=8000');
    expect(JSON.stringify(budget.steps.at(-1))).not.toMatch(/(?<!\d)2500(?!\d)/u);
  });

  it('draws role expectations as children, not chronological stages', () => {
    const role = scene('social', 'Социальный статус и роль');
    expect(role.figure).toBe('tree');
    expect(role.steps[1].labels).toEqual([
      'Роль учителя',
      'Объяснять материал',
      'Проверять работы',
      'Давать обратную связь',
    ]);
    for (const step of role.steps) {
      expect(step.labels!.length).toBeGreaterThanOrEqual(2);
      expect(step.labels!.length).toBeLessThanOrEqual(7);
    }
    expect(role.steps[2].caption).toContain('не порядок урока');
  });

  it('distinguishes movement on demand from an income-related shift using the stated axes', () => {
    const demand = scene('social', 'Спрос и неценовые факторы');
    expect(demand.steps[0].values).toEqual([2, 40, 6, 20]);
    expect(demand.steps[1].values).toEqual(demand.steps[0].values);
    expect(demand.steps[2].values).toEqual([4, 40, 8, 20]);
    expect(demand.steps[2].caption).toContain('товар нормальный');
    expect(demand.steps.at(-1)!.values).toBeUndefined();
  });

  it('uses observations without claiming a small sample represents the school', () => {
    const hypothesis = content('project', 'Гипотеза');
    expect(hypothesis).toContain('утром12');
    expect(hypothesis).toContain('днём18');
    expect(hypothesis).toContain('не получила подтверждения');
    expect(content('project', 'Ограничения метода')).toContain('не80% всех учащихся школы');
    expect(content('project', 'Критерий результата')).toContain('без подсказки автора');
  });

  it('returns independent frames for different lessons', () => {
    const changed = scene('history', 'Северная война');
    changed.steps[0].labels![0] = 'wrong';
    changed.steps[0].values![0] = 999;
    const next = scene('history', 'Северная война');
    expect(next.steps[0].labels).toEqual(['Начало Северной войны']);
    expect(next.steps[0].values).toEqual([1700]);
  });
});
