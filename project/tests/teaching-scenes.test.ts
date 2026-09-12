import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeachingScene } from '../src/scenes/TeachingScene';
import { isTeachingVisual, type TeachingVisual } from '../src/domain/teaching-visual';
import {
  buildTeachingScene,
  teachingConclusion,
  teachingFrame,
  teachingRoots,
} from '../src/scenes/teaching-frames';

describe('Semantic teaching frames', () => {
  it('counts distinct coordinates, not two copies of zero', () => {
    const visual: TeachingVisual = { kind: 'zero-root', center: 0 };
    expect(teachingRoots(visual)).toEqual([0]);
    expect(teachingFrame(visual, 'build', 0.5).positions).toEqual([-1, 1]);
    expect(teachingFrame(visual, 'compare').positions).toEqual([0, 0]);
    expect(teachingFrame(visual, 'conclude', 1, true).distinctCount).toBe(1);
    expect(teachingFrame(visual, 'conclude').distinctCount).toBeUndefined();
  });
  it('never constructs a negative distance as a root', () => {
    const visual: TeachingVisual = { kind: 'negative-radius', center: 2, radius: -3 };
    expect(teachingRoots(visual)).toEqual([]);
    expect(teachingFrame(visual, 'build', 0.8).positions).toEqual([]);
    expect(teachingConclusion(visual)).toContain('Корней нет');
  });
  it('shifts both roots with the actual centre and picks the requested one', () => {
    const visual: TeachingVisual = {
      kind: 'shifted-modulus',
      center: -1,
      radius: 4,
      focus: 'larger',
    };
    expect(teachingRoots(visual)).toEqual([-5, 3]);
    expect(teachingFrame(visual, 'build', 0.5).positions).toEqual([-3, 1]);
    expect(teachingConclusion(visual)).toBe('x = 3');
  });
  it.each([
    [3, 5, -2],
    [3, -5, 8],
    [-4, 2, -6],
  ])('subtracts %s − (%s) in the right direction', (start, subtract, end) => {
    const frame = teachingFrame({ kind: 'subtraction', start, subtract }, 'build', 1);
    expect(frame.positions).toEqual([end]);
    expect(frame.pointAt(end)).toBeGreaterThan(0);
    expect(frame.pointAt(end)).toBeLessThan(700);
  });
  it('supports fractional distance and a zero length path', () => {
    expect(teachingConclusion({ kind: 'distance', value: -2.5 })).toBe('Расстояние = 2,5');
    expect(teachingFrame({ kind: 'distance', value: 0 }, 'build', 0.5).positions).toEqual([0]);
  });
  it.each([
    ['lt', 5, 5, 'x − 5 < 0'],
    ['le', 5, 5, 'x − 5 ≤ 0'],
    ['gt', 5, 5, 'x − 5 > 0'],
    ['ge', 5, 5, 'x − 5 ≥ 0'],
    ['lt', 3, 5, 'x − 5 < 0'],
    ['ge', 7, 5, 'x − 5 > 0'],
  ] as const)(
    'infers sign only from a sufficient bound %s %s offset %s',
    (relation, boundary, offset, answer) => {
      expect(teachingConclusion({ kind: 'sign', relation, boundary, offset })).toBe(answer);
    },
  );
  it('does not invent the sign when the allowed region crosses zero', () => {
    expect(teachingConclusion({ kind: 'sign', boundary: 5, relation: 'lt', offset: 2 })).toContain(
      'недостаточно',
    );
  });
  it('compares a nonnegative radical with a real number', () => {
    expect(teachingConclusion({ kind: 'compare', left: { radicand: 7 }, right: 4 })).toBe('√7 < 4');
    expect(teachingConclusion({ kind: 'compare', left: { radicand: 9 }, right: 3 })).toBe('√9 = 3');
  });
  it('keeps hidden results out of independent expression markup and conclusions', () => {
    const visual: TeachingVisual = {
      kind: 'expression',
      lines: [{ text: '√((x − a)²)', focus: 'x − a' }, { text: '|x − a|' }, { text: '−x + a' }],
    };
    const markup = renderToStaticMarkup(
      createElement(TeachingScene, { visual, revealAnswer: false }),
    );
    expect(markup).toContain('√((');
    expect(markup).not.toContain('−x + a');
    expect(markup).not.toContain('|x − a|');
    expect(buildTeachingScene(visual, false).steps.some((s) => s.formula === '−x + a')).toBe(false);
  });
  it('explicit authored worked example may show all transformations', () => {
    const visual: TeachingVisual = {
      kind: 'expression',
      workedExample: true,
      lines: [{ text: '3 − 5' }, { text: '−2' }],
    };
    const markup = renderToStaticMarkup(
      createElement(TeachingScene, { visual, initialStage: 'conclude' }),
    );
    expect(markup).toContain('Пример для объяснения');
    expect(markup).toContain('−2');
  });
  it.each([
    { kind: 'distance', value: -3 },
    { kind: 'zero-root', center: 0 },
    { kind: 'root-count', center: 0, radius: 3 },
    { kind: 'shifted-modulus', center: 2, radius: 3 },
    { kind: 'negative-radius', center: 0, radius: -2 },
    { kind: 'sign', boundary: 5, relation: 'lt', offset: 5 },
    { kind: 'subtraction', start: 3, subtract: 5 },
  ] as TeachingVisual[])(
    'constructs %j before the student answers while hiding the final result',
    (visual) => {
      const render = (initialStage: 'orient' | 'build' | 'compare' | 'conclude') =>
        renderToStaticMarkup(
          createElement(TeachingScene, { visual, initialStage, revealAnswer: false }),
        );
      const opening = render('orient'),
        building = render('build'),
        compared = render('compare'),
        final = render('conclude');
      const svg = (markup: string) =>
        markup.match(/<svg viewBox="0 0 700 400"[\s\S]*?<\/svg>/)?.[0];
      expect(svg(building)).not.toBe(svg(opening));
      expect(svg(compared)).not.toBe(svg(opening));
      expect(building).toContain('data-move="true"');
      expect(final).not.toContain('class="ts-count"');
      expect(final).not.toContain(teachingConclusion(visual));
      expect(final).not.toContain('На рисунке оставлены исходные данные');
    },
  );
  it('initial stage creates a bounded local route', () => {
    const scene = buildTeachingScene({ kind: 'zero-root', center: 0 }, false, 'compare');
    expect(scene.steps.map((s) => s.id)).toEqual(['compare', 'conclude']);
    expect(scene.durationMs).toBe(scene.steps.reduce((a, s) => a + s.durationMs, 0));
  });
  it.each([
    { kind: 'distance', value: Infinity },
    { kind: 'distance', value: 1001 },
    { kind: 'negative-radius', center: 0, radius: 3 },
    { kind: 'compare', left: { radicand: -1 }, right: 0 },
    { kind: 'expression', lines: [{ text: '<script>x</script>' }] },
    { kind: 'expression', lines: [{ text: 'x − a', focus: 'missing' }] },
    { kind: 'distance', value: 2, workedExample: 'true' },
  ])('rejects invalid transport input %j', (input) => expect(isTeachingVisual(input)).toBe(false));
  it('accepts authored inequality strings without treating them as markup', () => {
    expect(
      isTeachingVisual({ kind: 'expression', lines: [{ text: 'x < a' }, { text: 'x − a < 0' }] }),
    ).toBe(true);
  });
});
