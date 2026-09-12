import { describe, expect, it } from 'vitest';
import {
  naturalSciencesDrawing,
  naturalSciencesExamples,
} from '../src/domain/topic-scenes/natural-sciences';
import { cleanDrawing } from '../src/domain/cloud-learning';
import type { SchoolUnit } from '../src/domain/school-program/types';
import { stemTopics } from '../src/domain/school-program/stem';

const unit = (subject: SchoolUnit['subject']): SchoolUnit => ({
  id: 'qa-only',
  subject,
  grade: 8,
  order: 1,
  title: 'Не влияет на выбранную подтему',
  section: 'QA',
  topics: ['Неподходящая широкая тема'],
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
const drawing = (subject: SchoolUnit['subject'], topic: string) =>
  naturalSciencesDrawing(unit(subject), topic)!;
const text = (subject: SchoolUnit['subject'], topic: string) =>
  JSON.stringify(drawing(subject, topic));
const last = (subject: SchoolUnit['subject'], topic: string) =>
  drawing(subject, topic).steps.at(-1)!;

describe('30 bounded natural-science scene families', () => {
  it('exposes distinct authored families with an explicit subject distribution', () => {
    expect(naturalSciencesExamples).toHaveLength(30);
    expect(new Set(naturalSciencesExamples.map((e) => `${e.subject}:${e.topic}`)).size).toBe(30);
    expect(
      ['physics', 'chemistry', 'biology', 'geography'].map(
        (s) => naturalSciencesExamples.filter((e) => e.subject === s).length,
      ),
    ).toEqual([10, 8, 7, 5]);
  });
  it.each(naturalSciencesExamples)(
    '$subject · $topic validates, delays formulas and ends with an unanswered question',
    ({ subject, topic }) => {
      const scene = drawing(subject, topic);
      expect(scene.title).toMatch(/^Авторский пример/);
      expect(scene.steps.length).toBeGreaterThanOrEqual(3);
      expect(scene.steps.length).toBeLessThanOrEqual(5);
      expect(scene.steps[0].formula).toBeUndefined();
      expect(scene.steps.at(-1)!.formula).toBeUndefined();
      expect(scene.steps.at(-1)!.caption).toMatch(/\?$/);
      expect(cleanDrawing(scene)).toEqual(scene);
      for (const step of scene.steps) {
        expect(step.caption.length).toBeLessThanOrEqual(1200);
        expect(step.values?.every(Number.isFinite) ?? true).toBe(true);
        if (scene.figure === 'circuit')
          expect(step.values?.length === 2 && step.values.every((v) => v > 0)).toBe(true);
        if (scene.figure === 'wave')
          expect(
            step.values?.length === 2 &&
              step.values[0] > 0 &&
              step.values[1] > 0 &&
              step.values[1] <= 6,
          ).toBe(true);
        if (scene.figure === 'particles')
          expect(
            step.values?.length === 1 &&
              Number.isInteger(step.values[0]) &&
              step.values[0] >= 1 &&
              step.values[0] <= 36,
          ).toBe(true);
        if (scene.figure === 'earth-layers')
          expect(step.labels).toEqual(['Кора', 'Мантия', 'Ядро']);
        if (scene.figure === 'cycle' || scene.figure === 'food-chain')
          expect(step.labels!.length >= 2 && step.labels!.length <= 6).toBe(true);
      }
    },
  );
  it.each([
    ['physics', 'Период полураспада атомных ядер'],
    ['physics', 'Равномерное движение по окружности'],
    ['physics', 'Осмотическое давление'],
    ['physics', 'Давление жидкости'],
    ['physics', 'Последовательное соединение проводников'],
    ['physics', 'Диффузия'],
    ['chemistry', 'Массовая доля элемента в соединении'],
    ['chemistry', 'Строение РНК'],
    ['biology', 'Синтез РНК'],
    ['biology', 'Пищевые цепи и фотосинтез неизвестного организма'],
    ['biology', 'Бактериальная клетка'],
    ['geography', 'Круговорот углерода'],
    ['geography', 'Часовые зоны неизвестной страны'],
    ['math', 'Количество вещества'],
    ['english', 'Клеточное дыхание'],
  ] as const)('refuses a different or unknown narrow topic: %s / %s', (subject, topic) => {
    expect(naturalSciencesDrawing(unit(subject), topic)).toBeUndefined();
  });
  it('normalizes harmless PDF spelling/punctuation without substring guessing', () => {
    expect(drawing('physics', '  УДЕЛЬНАЯ ТЕПЛОЕМКОСТЬ   ВЕЩЕСТВА. ').title).toContain(
      'Нагрев воды',
    );
    expect(drawing('chemistry', 'Окислительно‑восстановительные реакции.').title).toContain(
      'электронов',
    );
    expect(
      naturalSciencesDrawing(
        unit('physics'),
        'Объясни количество теплоты для неизвестного процесса',
      ),
    ).toBeUndefined();
    expect(naturalSciencesDrawing(unit('physics'), '')).toBeUndefined();
  });
  it.each(naturalSciencesExamples)(
    '$subject · $topic is reachable from an actual catalog title or subtopic',
    ({ subject, topic }) => {
      const target = drawing(subject, topic);
      const matches = stemTopics
        .filter((u) => u.subject === subject)
        .flatMap((u) =>
          [u.title, ...u.topics].filter(
            (t) => naturalSciencesDrawing(u, t)?.title === target.title,
          ),
        );
      expect(matches.length, `Unreachable family: ${subject} / ${topic}`).toBeGreaterThan(0);
    },
  );
  it('labels the DNA-only scope of a combined curriculum entry without matching RNA separately', () => {
    const topic =
      'Строение и функции ДНК. Строение и функции РНК. Виды РНК. АТФ: строение и функции.';
    expect(drawing('biology', topic).steps[0].caption).toContain('только строение ДНК');
    expect(drawing('biology', topic).steps[0].caption).toContain('РНК и АТФ');
    expect(naturalSciencesDrawing(unit('biology'), 'Строение и функции РНК')).toBeUndefined();
  });
  it('computes time-zone offsets for one moment without inventing real city zones', () => {
    const scene = drawing('geography', 'Время на территории России');
    expect(scene.steps[0].caption).toContain('UTC+3');
    expect(scene.steps[0].caption).toContain('UTC+5');
    expect(scene.steps[1].formula).toContain('5-3=2');
    expect(scene.steps[2].formula).toContain('12{:}00');
    expect(scene.steps[2].caption).toContain('по актуальной карте');
    expect(scene.steps[0].caption).toContain('один и тот же момент');
  });
  it('keeps ocean and tectonic examples within the scope explicitly shown', () => {
    const plates = drawing('geography', 'Литосферные плиты и их движение.');
    expect(plates.steps[0].caption).toContain('не карта границ');
    expect(plates.steps[1].caption).toContain('Плиты медленно перемещаются');
    const ocean = drawing('geography', 'Мировой океан ‒ основная часть гидросферы.');
    expect(ocean.figure).toBe('cycle');
    expect(ocean.steps[0].caption).toContain('один путь');
    expect(ocean.steps[0].caption).toContain('Полный круговорот включает также сушу');
    expect(
      naturalSciencesDrawing(
        unit('geography'),
        'Соленость поверхностных вод Мирового океана, ее измерение.',
      ),
    ).toBeUndefined();
  });
  it('does not share mutable frame arrays across calls or touch the unit', () => {
    const source = unit('physics'),
      snapshot = JSON.stringify(source);
    const a = naturalSciencesDrawing(source, 'Мощность электрического тока')!;
    a.steps[0].values![0] = 999;
    a.steps[0].labels!.push('foreign');
    a.steps.push({ caption: 'foreign' });
    const b = naturalSciencesDrawing(source, 'Мощность электрического тока')!;
    expect(b.steps).toHaveLength(4);
    expect(b.steps[0].values).toEqual([6, 3]);
    expect(b.steps[0].labels).not.toContain('foreign');
    expect(JSON.stringify(source)).toBe(snapshot);
  });
  it('retains the same circuit and particle data in the final question', () => {
    const electricity = drawing('physics', 'Мощность электрического тока');
    expect(electricity.steps.every((s) => JSON.stringify(s.values) === '[6,3]')).toBe(true);
    const [u, r] = electricity.steps[0].values!;
    expect((u * u) / r).toBe(12);
    expect(electricity.steps[2].formula).toContain('12');
    expect(
      drawing('physics', 'Плотность вещества').steps.every(
        (s) => JSON.stringify(s.values) === '[12]',
      ),
    ).toBe(true);
  });
  it('plots a constant speed with consistent dimensions rather than arbitrary points', () => {
    for (const frame of drawing('physics', 'Равномерное прямолинейное движение').steps) {
      const values = frame.values!;
      for (let i = 0; i < values.length; i += 2) expect(values[i + 1]).toBe(values[i] * 3);
    }
  });
  it('keeps melting conditions explicit and the phase plateau at zero', () => {
    const scene = drawing('physics', 'Плавление и кристаллизация');
    expect(scene.steps[0].caption).toContain('чистый лёд');
    expect(scene.steps[0].caption).toContain('нормальном атмосферном давлении');
    expect(scene.steps[1].values?.slice(-4)).toEqual([1, 0, 4, 0]);
    expect(scene.steps[0].caption).toContain('не измеренный');
  });
  it('changes activation barrier while preserving both reaction endpoints', () => {
    const scene = drawing('chemistry', 'Катализ');
    const before = scene.steps[0].values!,
      after = scene.steps[1].values!;
    expect(before.slice(0, 2)).toEqual(after.slice(0, 2));
    expect(before.slice(-2)).toEqual(after.slice(-2));
    expect(after[3]).toBeLessThan(before[3]);
    expect(scene.steps[0].caption).toContain('не зависимость скорости от времени');
  });
  it('conserves atoms in the displayed full chemical equations', () => {
    function atoms(side: string) {
      const totals: Record<string, number> = {};
      for (const term of side
        .replace(/\\mathrm\{([^}]+)\}/g, '$1')
        .replace(/_/g, '')
        .split('+')) {
        const clean = term.replace(/[{}\s]/g, ''),
          coefficient = Number(clean.match(/^\d+/)?.[0] || 1);
        for (const match of clean.replace(/^\d+/, '').matchAll(/([A-Z][a-z]?)(\d*)/g))
          totals[match[1]] = (totals[match[1]] || 0) + coefficient * Number(match[2] || 1);
      }
      return totals;
    }
    const formulas = [
      drawing('chemistry', 'Закон сохранения массы веществ').steps[1].formula!,
      drawing('chemistry', 'Нейтрализация').steps[1].formula!,
      drawing('biology', 'Клеточное дыхание').steps[1].formula!,
      drawing('biology', 'Фотосинтез').steps[1].formula!.replace(
        '\\xrightarrow{\\text{свет}}',
        '\\longrightarrow',
      ),
    ];
    for (const formula of formulas) {
      const [left, right] = formula.split('\\longrightarrow');
      expect(atoms(left)).toEqual(atoms(right));
    }
  });
  it('does not confuse mass fraction with solvent mass or humidity with real evaporation', () => {
    expect(drawing('chemistry', 'Массовая доля вещества в растворе').steps[2].formula).toContain(
      '10}{100}',
    );
    expect(text('geography', 'Коэффициент увлажнения')).toContain(
      'не равна автоматически фактическому испарению',
    );
    expect(drawing('geography', 'Коэффициент увлажнения').steps[2].formula).toContain('600}{400}');
  });
  it('distinguishes matter cycles from energy flow and avoids universal transfer percentages', () => {
    const food = drawing('biology', 'Пищевые цепи');
    expect(food.figure).toBe('food-chain');
    expect(food.steps[0].labels).toEqual(['Трава', 'Кузнечик', 'Лягушка', 'Уж']);
    expect(food.steps[1].caption).toContain('от пищи к её потребителю');
    expect(food.steps[2].caption).toContain('точный процент');
    const cycle = drawing('biology', 'Круговорот веществ в экосистеме');
    expect(cycle.steps[2].caption).toContain('Энергия проходит потоком');
    expect(cycle.steps[2].caption).toContain('рассеивается как тепло');
  });
  it('qualifies Earth layers and never calls the whole mantle liquid', () => {
    const scene = drawing('geography', 'Внутреннее строение Земли');
    expect(scene.figure).toBe('earth-layers');
    expect(scene.steps[2].caption).toContain('Мантия преимущественно твёрдая');
    expect(scene.steps[1].caption).toContain('не совпадает только с корой');
  });
  it('keeps a partial climate plot honest instead of inventing precipitation or a climate type', () => {
    const scene = drawing('geography', 'Температурная кривая климатограммы');
    expect(scene.steps[2].caption).toContain('только температурная часть');
    expect(scene.steps[2].caption).toContain('нельзя уверенно назвать тип климата');
    expect(last('geography', 'Температурная кривая климатограммы').values).toEqual(
      scene.steps[0].values,
    );
  });
});
