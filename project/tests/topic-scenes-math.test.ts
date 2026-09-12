import { describe, expect, it } from 'vitest';
import { renderToString } from 'katex';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DialogueArt } from '../src/scenes/DialogueArt';
import { cleanDrawing } from '../src/domain/cloud-learning';
import { stemTopics } from '../src/domain/school-program/stem';
import { schoolUnits } from '../src/domain/school-program';
import { topicDrawing } from '../src/domain/school-topic-drawings';
import type { SchoolUnit } from '../src/domain/school-program/types';
import {
  mathInformaticsDrawing,
  mathInformaticsExamples,
} from '../src/domain/topic-scenes/math-informatics';
import { renderSubjectFigure } from '../shared/subject-figures.mjs';

const fixture = (subject: SchoolUnit['subject'] = 'math'): SchoolUnit => ({
  ...stemTopics.find((unit) => unit.subject === subject)!,
  title: 'Случайная широкая комната',
  topics: [],
});
const drawing = (topic: string, subject: SchoolUnit['subject'] = 'math') => {
  const result = mathInformaticsDrawing(fixture(subject), topic);
  expect(result, topic).toBeDefined();
  return result!;
};
const text = (topic: string, subject: SchoolUnit['subject'] = 'math') =>
  drawing(topic, subject)
    .steps.map((frame) =>
      [frame.caption, frame.formula, ...(frame.labels ?? [])].filter(Boolean).join(' '),
    )
    .join('\n');
const normalized = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '');

describe('bounded mathematics and informatics topic scenes', () => {
  it('reaches all 29 actual families through real catalogue focuses and the integrated dispatcher', () => {
    // Deliberately enumerate the real catalogue, not the exported example list or fixtures.
    const reached = new Map<string, { subject: string; focus: string; unitId: string }>();
    for (const unit of schoolUnits) {
      if (unit.subject !== 'math' && unit.subject !== 'informatics') continue;
      for (const focus of [unit.title, ...unit.topics]) {
        const scene = mathInformaticsDrawing(unit, focus);
        if (!scene) continue;
        reached.set(scene.title, { subject: unit.subject, focus, unitId: unit.id });
        // A legacy broad handler must not replace the matched subtopic with a different example.
        expect(topicDrawing(unit, focus), `${unit.id}: ${focus}`).toEqual(scene);
      }
    }
    expect(reached.size).toBe(29);
    expect([...reached.values()].filter((match) => match.subject === 'math')).toHaveLength(22);
    expect([...reached.values()].filter((match) => match.subject === 'informatics')).toHaveLength(
      7,
    );
    expect([...reached.values()].every((match) => match.unitId.startsWith('program-'))).toBe(true);
  });
  it('publishes 29 different authored families, with real catalogue names', () => {
    expect(mathInformaticsExamples).toHaveLength(29);
    expect(mathInformaticsExamples.filter((x) => x.subject === 'math')).toHaveLength(22);
    expect(
      new Set(mathInformaticsExamples.map((x) => `${x.subject}:${normalized(x.topic)}`)).size,
    ).toBe(29);
    const available = new Set(
      stemTopics.flatMap((unit) =>
        unit.topics.map((topic) => `${unit.subject}:${normalized(topic)}`),
      ),
    );
    const absent = mathInformaticsExamples.filter(
      (x) => !available.has(`${x.subject}:${normalized(x.topic)}`),
    );
    expect(absent).toEqual([]);
  });
  it.each(mathInformaticsExamples)(
    '$subject: $topic preserves validated data and an unanswered final question',
    ({ subject, topic }) => {
      const scene = drawing(topic, subject);
      expect(cleanDrawing(scene)).toEqual(scene);
      expect(scene.steps.length).toBeGreaterThanOrEqual(3);
      expect(scene.steps.length).toBeLessThanOrEqual(5);
      expect(scene.title).toMatch(/^Авторский пример/);
      const last = scene.steps.at(-1)!;
      expect(last.caption).toMatch(/^Твоя попытка:/);
      expect(last.formula).toBeUndefined();
      expect(last.caption).not.toMatch(/(?:Ответ|Решение):|равно\s+(?:13|48|16|18)\b/);
      expect(scene.steps.every((s) => !s.values || s.values.every(Number.isFinite))).toBe(true);
      for (const frame of scene.steps)
        if (frame.formula) {
          const latex = frame.formula!.replace(/^\$([\s\S]*)\$$/, '$1');
          expect(() => renderToString(latex, { throwOnError: true })).not.toThrow();
        }
    },
  );
  it('never uses a broad enclosing topic to hijack an unknown narrow focus', () => {
    const unit = { ...fixture(), title: 'Квадратный корень', topics: ['Теорема Виета'] };
    for (const focus of [
      '',
      'Квадратный корень из комплексного числа',
      'Сложные уравнения с параметром',
      'Логарифмические неравенства',
      'Тригонометрические неравенства',
      'Вероятность без возвращения',
      'Квадратные уравнения с параметром',
      'Площадь прямоугольника',
      'Модуль числа',
    ]) {
      expect(mathInformaticsDrawing(unit, focus), focus).toBeUndefined();
    }
    expect(mathInformaticsDrawing(fixture('physics'), 'Теорема Пифагора')).toBeUndefined();
    expect(mathInformaticsDrawing(fixture('math'), 'Бинарное дерево')).toBeUndefined();
    expect(
      mathInformaticsDrawing(fixture('informatics'), 'Двоичная система счисления'),
    ).toBeUndefined();
  });
  it('accepts harmless spelling and terminal punctuation, but not appended extra concepts', () => {
    expect(drawing('  ТЕОРЕМА   ВИЕТА. ').title).toContain('Сумма');
    expect(drawing('Разложение трехчлена на множители').title).toContain('Трёхчлен');
    expect(mathInformaticsDrawing(fixture(), 'Теорема Виета и параметры')).toBeUndefined();
  });
  it('isolates returned frames from registry mutations and other lessons', () => {
    const first = drawing('Теорема Пифагора');
    first.steps[0].values![0] = 99;
    first.steps[0].labels!.push('Внешний ответ');
    expect(drawing('Теорема Пифагора').steps[0].values).toEqual([3, 4]);
    expect(drawing('Теорема Пифагора').steps[0].labels).not.toContain('Внешний ответ');
  });
  it('keeps root and power identities within their real domains', () => {
    expect(text('Свойства арифметических квадратных корней')).toContain(
      'оба множителя неотрицательны',
    );
    expect(text('Свойства арифметических квадратных корней')).toContain('6\\sqrt2');
    expect(6 * Math.sqrt(2)).toBeCloseTo(Math.sqrt(72));
    expect(text('Степень с целым показателем')).toContain('ненулевого');
    expect(text('Степень с целым показателем')).toContain('\\frac18');
    expect(text('Степень с рациональным показателем и свойства')).toContain(
      'положительное основание',
    );
    expect(27 ** (2 / 3)).toBeCloseTo(9);
    expect(text('Квадратный корень')).toContain('неотрицательное');
  });
  it('uses both quadratic roots and checks their original equation', () => {
    const scene = drawing('Квадратное уравнение и формула корней');
    expect(scene.steps[1].formula).toContain('25-24=1');
    expect(scene.steps[2].formula).toContain('x_1=3');
    expect(scene.steps[2].formula).toContain('x_2=2');
    for (const x of [2, 3]) expect(x * x - 5 * x + 6).toBe(0);
    expect(scene.steps.at(-1)!.caption).toContain('x² − 7x + 12');
    expect(scene.steps.at(-1)!.caption).not.toContain('два корня');
  });
  it('does not forget excluded denominator values when solving a rational equation', () => {
    const scene = drawing('Дробно-рациональные уравнения');
    expect(scene.steps[0].formula).toContain('x\\ne2');
    expect(scene.steps[1].caption).toContain('Для допустимых x');
    expect((5 + 1) / (5 - 2)).toBe(2);
    expect(scene.steps[2].formula).toContain('5\\ne2');
    expect(scene.steps.at(-1)!.caption).toContain('(x+2)/(x−1)=3');
  });
  it('reverses the inequality on negative division and excludes strict quadratic endpoints', () => {
    const linear = drawing('Линейные неравенства и их системы');
    expect(linear.steps[1].formula).toBe('x>-2');
    for (const x of [-3, -2, -1, 0, 3]) expect(-2 * x + 3 < 7).toBe(x > -2);
    const quadratic = drawing('Квадратные неравенства');
    expect(quadratic.steps[2].formula).toContain('(-2;2)');
    for (const x of [-3, -2, 0, 2, 3]) expect(x * x - 4 < 0).toBe(x > -2 && x < 2);
  });
  it('renders a strict solution as an open interval, then resets to neutral new question data', () => {
    const scene = drawing('Квадратные неравенства');
    expect(scene.figure).toBe('interval');
    expect(scene.steps.map((frame) => frame.values)).toEqual([
      [-2, 2, 0, 0, 0],
      [-2, 2, 0, 0, 0],
      [-2, 2, 0, 0, 1],
      [-3, 3, 1, 1, 0],
    ]);
    const initial = renderSubjectFigure(scene, 0, 1)!;
    expect(initial).toContain('Решение пока не выделено');
    expect(initial).not.toContain('<circle');
    const solved = renderSubjectFigure(scene, 2, 1)!;
    expect(solved).toContain('(-2; 2)');
    expect(solved.match(/<circle[^>]+fill="#15111f"/g)).toHaveLength(2);
    expect(solved).toContain('множество, не движение точки');
    const next = renderSubjectFigure(scene, 3, 1)!;
    expect(next).toContain('>-3</text>');
    expect(next).toContain('>3</text>');
    expect(next).not.toContain('<circle');
    expect(next).not.toContain('[-3; 3]');
    expect(next).toContain('Решение пока не выделено');
  });
  it.each(['Логические операции', 'Ветвления', 'Цикл с переменной', 'Равномерный код'])(
    'renders actual concept formulas in %s through Markdown and KaTeX',
    (topic) => {
      const scene = drawing(topic, 'informatics');
      const formulas = scene.steps
        .map((frame, index) => ({ frame, index }))
        .filter(({ frame }) => frame.formula);
      expect(formulas.length).toBeGreaterThan(0);
      for (const { frame, index } of formulas) {
        expect(frame.formula).toMatch(/^\$[^$]+\$$/);
        const html = renderToStaticMarkup(
          createElement(DialogueArt, {
            drawing: scene,
            step: frame,
            index,
            progress: 1,
            subject: 'informatics',
          }),
        );
        expect(html).toContain('class="katex"');
        expect(html).toContain('class="katex-mathml"');
        expect(html).not.toContain('katex-error');
        // TeX may legitimately survive inside the accessibility annotation, never as visible prose.
        expect(html).not.toMatch(/<p>[^<]*\\(?:land|lor|qquad|quad|neg)/);
      }
    },
  );
  it('distinguishes n−1 progression transitions and compounded percentage growth', () => {
    expect(drawing('Арифметическая прогрессия').steps[1].formula).toContain('(5-1)');
    expect(drawing('Геометрическая прогрессия').steps[1].formula).toContain('4-1');
    expect(4 + (5 - 1) * 3).toBe(16);
    expect(3 * 2 ** (4 - 1)).toBe(24);
    expect(text('Сложные проценты')).toContain('уже от 1100');
    expect(1000 * 1.1 ** 2).toBeCloseTo(1210);
    expect(text('Три основные задачи на проценты, решение задач из реальной практики')).toContain(
      '=36',
    );
  });
  it('selects the trig sign from an acute-angle condition and spells out logarithm restrictions', () => {
    const trig = drawing('Основное тригонометрическое тождество');
    expect(trig.steps[0].formula).toContain('0<\\alpha<90');
    expect(trig.steps[2].caption).toContain('положителен');
    expect((3 / 5) ** 2 + (4 / 5) ** 2).toBeCloseTo(1);
    const log = drawing('Логарифм');
    expect(log.steps[0].caption).toContain('a>0 и a≠1');
    expect(log.steps[0].caption).toContain('аргумент положителен');
    expect(log.steps[2].formula).toContain('2^5=32');
  });
  it('distinguishes independent probability and unordered selection', () => {
    expect(text('Независимые события')).toContain('независимо');
    expect(drawing('Независимые события').steps[2].formula).toContain('\\frac14');
    expect(text('Сочетания')).toContain('Порядок выбранных книг не учитываем');
    const pairs = new Set<string>();
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) pairs.add(`${a},${b}`);
    expect(pairs.size).toBe(6);
    expect(drawing('Сочетания').steps[2].formula).toContain('=6');
  });
  it('shows correctly scaled legs and new exercise data without disclosing its hypotenuse', () => {
    const scene = drawing('Теорема Пифагора');
    expect(scene.figure).toBe('right-triangle');
    expect(scene.steps.slice(0, 3).every((s) => JSON.stringify(s.values) === '[3,4]')).toBe(true);
    expect(scene.steps.at(-1)!.values).toEqual([5, 12]);
    expect(Math.hypot(...scene.steps[0].values!)).toBe(5);
    const svg = renderSubjectFigure(scene, 3, 1)!;
    expect(svg).toContain('a = 5');
    expect(svg).toContain('b = 12');
    expect(svg).not.toMatch(/c\s*=\s*13/);
    expect(scene.steps.at(-1)!.formula).toBeUndefined();
  });
  it('uses explicit inputs, inclusive cycle bounds and complete logical conditions', () => {
    expect(text('Ветвления', 'informatics')).toContain('Вход x=−4');
    expect(text('Ветвления', 'informatics')).toContain('−4>0 ложно');
    expect(text('Цикл с переменной', 'informatics')).toContain('1, 2, 3 включительно');
    expect([1, 2, 3].reduce((sum, n) => sum + n, 0)).toBe(6);
    expect(text('Логические операции', 'informatics')).toContain('Включающее «или»');
    expect(drawing('Логические операции', 'informatics').steps[1].formula).toContain('=0');
  });
  it('demonstrates minimal uniform code length and copying direction without old binary-template substitution', () => {
    const coding = drawing('Равномерный код', 'informatics');
    expect(coding.steps[1].formula).toBe('$2^2=4<8$');
    expect(coding.steps[2].formula).toBe('$2^3=8$');
    expect(coding.steps.at(-1)!.caption).toContain('десяти');
    const spreadsheet = drawing('Относительная, абсолютная и смешанная адресация', 'informatics');
    expect(spreadsheet.steps[2].labels).toEqual(['C3: =A3*$B$1']);
    expect(spreadsheet.steps.at(-1)!.caption).toContain('на две строки вниз');
  });
  it('sorts by selecting a minimum and supplies a one-level binary tree compatible with the renderer', () => {
    const sort = drawing('Сортировка массива', 'informatics');
    expect(sort.steps.slice(0, 3).map((x) => x.values)).toEqual([
      [4, 1, 3],
      [1, 4, 3],
      [1, 3, 4],
    ]);
    expect(sort.steps.at(-1)!.caption).toContain('только первого обмена');
    const tree = drawing('Бинарное дерево', 'informatics');
    expect(tree.figure).toBe('tree');
    expect(tree.steps.every((s) => s.labels!.length >= 2 && s.labels!.length <= 3)).toBe(true);
    expect(tree.steps[2].caption).toContain('не вероятности');
    expect(tree.steps.at(-1)!.labels).toEqual(['K', 'L']);
    expect(tree.steps.at(-1)!.caption).not.toContain('L — лист');
  });
});
