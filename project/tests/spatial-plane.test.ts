import { describe, expect, it } from 'vitest';
import {
  renderSpatialPlane,
  spatialPlaneNames,
  validSpatialPlaneValues,
} from '../shared/spatial-plane.mjs';
import { cleanFigure, renderSubjectFigure } from '../shared/subject-figures.mjs';
import { cleanDrawing } from '../src/domain/cloud-learning';

describe('bounded live spatial-plane diagrams', () => {
  it('registers for the player, drawing validation and shared document SVG', () => {
    expect(cleanFigure('spatial-plane')).toBe('spatial-plane');
    const drawing = {
      kind: 'concept',
      figure: 'spatial-plane',
      title: 'Точки в плоскости',
      steps: [
        {
          id: 's1',
          caption: 'Точка A на прямой a в плоскости α',
          durationMs: 2200,
          values: [0, 3],
          labels: ['α', 'A', 'B', 'C', 'a', 'β'],
        },
      ],
    };
    expect(cleanDrawing(drawing)?.figure).toBe('spatial-plane');
    expect(cleanDrawing(drawing)?.steps[0].values).toEqual([0, 3]);
    expect(renderSubjectFigure(drawing, 0, 1)).toBe(
      renderSpatialPlane([0, 3], drawing.steps[0].labels, 1),
    );
  });
  for (let kind = 0; kind < 4; kind++)
    it(`case ${kind}: progressive geometry, animation and complete static frame`, () => {
      const frames = Array.from({ length: 4 }, (_, stage) => renderSpatialPlane([kind, stage])!);
      expect(new Set(frames).size).toBe(4);
      for (let stage = 0; stage < 4; stage++) {
        const svg = frames[stage];
        expect(svg).toContain(`data-spatial-stage="${stage}"`);
        expect(svg).toContain('<polygon');
        expect(svg).toContain('<desc>');
        expect(svg).not.toMatch(/NaN|Infinity|undefined|<script|<foreignObject|href=/);
        expect(renderSpatialPlane([kind, stage], [], 0)).not.toBe(svg);
        expect(renderSpatialPlane([kind, stage], [], NaN)).toBe(svg);
        expect(renderSpatialPlane([kind, stage], [], 4)).toBe(svg);
      }
    });
  it('rejects unknown or malformed case/stage values', () => {
    for (const values of [
      undefined,
      [],
      [0],
      [0, 0, 0],
      [-1, 0],
      [4, 0],
      [0, 4],
      [0, 0.5],
      ['0', 1],
      [Infinity, 0],
      [NaN, 0],
    ]) {
      expect(validSpatialPlaneValues(values)).toBe(false);
      expect(renderSpatialPlane(values)).toBeNull();
      expect(
        renderSubjectFigure({ figure: 'spatial-plane', steps: [{ values: values as number[] }] }),
      ).toBeNull();
    }
  });
  it('uses safe short names in their original positions and escapes apostrophes', () => {
    const names = ['плоскость γ', 'точка M', 'N′', 'P1', 'прямая b', 'δ'];
    expect(spatialPlaneNames(names)).toEqual(['γ', 'M', 'N′', 'P1', 'b', 'δ']);
    const svg = renderSpatialPlane([0, 3], names)!;
    expect(svg).toContain('M ∈ b');
    expect(svg).toContain('N′ ∈ γ');
    expect(renderSpatialPlane([1, 1], ['γ', "A'", 'B', 'C', 'a', 'δ'])).toContain('A&apos;');
    expect(spatialPlaneNames(['<svg/onload=evil>', 'A'.repeat(900), null, 'C', 'a', 'β'])).toEqual([
      'α',
      'A',
      'B',
      'C',
      'a',
      'β',
    ]);
    expect(spatialPlaneNames(['α', 'P', 'P', 'C', 'a', 'β'])).toEqual([
      'α',
      'A',
      'B',
      'C',
      'a',
      'β',
    ]);
    expect(spatialPlaneNames(['γ', 'M', 'N', 'P', 'b', 'γ'])).toEqual([
      'α',
      'A',
      'B',
      'C',
      'a',
      'β',
    ]);
  });
  it('states required assumptions and distinguishes a full line from a finite patch', () => {
    expect(renderSpatialPlane([0, 3])).toContain('Здесь задано');
    expect(renderSpatialPlane([1, 1])).toContain('не лежащие на одной прямой');
    expect(renderSpatialPlane([1, 3])).toContain('ровно одна плоскость');
    expect(renderSpatialPlane([1, 3])).toContain('data-spatial-full-line="AB"');
    expect(renderSpatialPlane([1, 3])).toContain('вся прямая AB, а не только отрезок');
    expect(renderSpatialPlane([2, 3])).toContain('бесконечно много плоскостей');
    expect(renderSpatialPlane([3, 3])).toContain('вся прямая');
    expect(renderSpatialPlane([3, 3])).toContain(
      'края изображения не являются границами плоскости',
    );
  });
});
