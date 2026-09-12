import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  normalizeCoordinateDrawing,
  labelCoordinates,
  numberLineMarkers,
} from '../shared/drawing-coordinate-points.cjs';
import { cleanDrawing, type TutorDrawing } from '../src/domain/cloud-learning';
import { documentDrawings } from '../shared/document-scenes.mjs';
import { renderDocument } from '../shared/document-renderer.mjs';
import { DialogueArt } from '../src/scenes/DialogueArt';

const { parseTutorOutput } = createRequire(import.meta.url)('../desktop/openai-tutor.cjs');
const original: TutorDrawing = {
  kind: 'number-line',
  figure: 'interval',
  title: 'Отдельный пример: граница и решения — не одно и то же',
  steps: [
    {
      caption: 'У x−2 знак меняется в границе x=2.',
      formula: 'x-2=0',
      values: [-1, 5, 0, 0, 0],
      labels: ['−1', '2 — смена знака', '5'],
    },
    {
      caption: 'В уравнении |x−2|=3 решения находятся по обе стороны от границы.',
      formula: '|x-2|=3',
      values: [-1, 5, 1, 1, 1],
      labels: ['−1 — решение', '2 — граница', '5 — решение'],
    },
  ],
};

describe('coordinate labels repair misleading interval contracts', () => {
  it('keeps all three supplied coordinates and distinguishes boundaries from roots without filling a solution interval', () => {
    const before = JSON.stringify(original);
    const fixed = normalizeCoordinateDrawing(original);
    expect(fixed.figure).toBeUndefined();
    expect(fixed.kind).toBe('number-line');
    expect(fixed.steps.map((s) => s.values)).toEqual([
      [-1, 2, 5],
      [-1, 2, 5],
    ]);
    expect(fixed.steps.map((s) => [s.caption, s.formula, s.labels])).toEqual(
      original.steps.map((s) => [s.caption, s.formula, s.labels]),
    );
    expect(JSON.stringify(original)).toBe(before);
    expect(normalizeCoordinateDrawing(fixed)).toBe(fixed);
    const markup = renderToStaticMarkup(
      createElement(DialogueArt, { drawing: fixed, step: fixed.steps[1], index: 1, progress: 1 }),
    );
    expect(markup.match(/class="ds-point"/g)).toHaveLength(3);
    expect(markup).not.toContain('ds-travel');
    expect(markup).not.toContain('Выделено множество решений');
    expect(markup).toContain('2 — граница');
  });
  it('uses the identical repair in desktop decoding, persisted drawings, and document export', () => {
    const expected = normalizeCoordinateDrawing(original).steps.map((s) => s.values);
    const decoded = parseTutorOutput(JSON.stringify({ text: 'Объяснение', scene: original })).scene;
    const stored = cleanDrawing(original)!;
    const exported = documentDrawings([original])[0];
    for (const value of [decoded, stored, exported]) {
      expect(value.figure).toBeUndefined();
      expect(value.steps.map((s: { values: number[] }) => s.values)).toEqual(expected);
    }
    const document = renderDocument({ title: 'Конспект', content: '', drawings: [original] });
    expect(document.includes('Подписанные точки: -1, 2, 5')).toBe(true);
    expect(document).toContain('2 — граница');
    expect(document).not.toContain('Выделено множество решений');
  });
  it('shows zero as a test point in the middle interval and does not turn interval flag slots into points', () => {
    const drawing: TutorDrawing = {
      kind: 'number-line',
      figure: 'interval',
      title: 'Пробные числа',
      steps: [
        {
          caption: 'Пробное число слева',
          formula: 'x<-4, x=-5',
          values: [-5, -4, 0, 0, 0],
          labels: ['−5 — пробное число', '−4 — граница'],
        },
        {
          caption: 'Ноль внутри',
          formula: '-4<0<5',
          values: [-4, 5, 0, 0, 0],
          labels: ['−4 — граница', '0 — пробное число внутри', '5 — граница'],
        },
      ],
    };
    const fixed = normalizeCoordinateDrawing(drawing);
    expect(fixed.steps.map((s) => s.values)).toEqual([
      [-5, -4],
      [-4, 0, 5],
    ]);
    expect(numberLineMarkers(fixed.steps[1])?.map((p) => p.value)).toEqual([-4, 0, 5]);
    const markup = renderToStaticMarkup(
      createElement(DialogueArt, { drawing: fixed, step: fixed.steps[1], index: 1, progress: 1 }),
    );
    expect(markup.match(/class="ds-point"/g)).toHaveLength(3);
    expect(markup).toContain('0 — пробное число внутри');
    expect(markup).not.toContain('ds-travel');
  });
  it('converts a filled simple absolute equation only using supplied endpoints that satisfy it', () => {
    const drawing = {
      ...original,
      steps: [
        {
          caption: 'Корни уравнения',
          formula: String.raw`\(\left|x-2\right|=3\)`,
          values: [-1, 5, 1, 1, 1],
          labels: ['Левый корень', 'Правый корень'],
        },
      ],
    };
    const fixed = normalizeCoordinateDrawing(drawing);
    expect(fixed.figure).toBeUndefined();
    expect(fixed.steps[0].values).toEqual([-1, 5]);
    expect(numberLineMarkers(fixed.steps[0])?.map((p) => p.value)).toEqual([-1, 5]);
    const incorrectEndpoint = {
      ...drawing,
      steps: [{ ...drawing.steps[0], values: [0, 5, 1, 1, 1] }],
    };
    expect(normalizeCoordinateDrawing(incorrectEndpoint).steps[0].values).toEqual([5]);
  });
  it.each(['-4<x<5', '|x-2|<3', '|2x+8|-|x-5|=12', '|x|=-0.00000000000000001'])(
    'does not guess equation roots for %s',
    (formula) => {
      const drawing = {
        ...original,
        steps: [
          {
            caption: 'Множество решений',
            formula,
            values: [-4, 5, 0, 0, 1],
            labels: ['−4 — граница', '5 — граница'],
          },
        ],
      };
      expect(normalizeCoordinateDrawing(drawing)).toBe(drawing);
    },
  );
  it('supports signed decimal coordinate labels but refuses ambiguous or partially parsed expressions', () => {
    expect(labelCoordinates(['−0,5 — точка', '+2.5: точка', '.25 — точка'])).toEqual([
      -0.5, 2.5, 0.25,
    ]);
    for (const label of ['1/2', '2^3', '1e3', '2 + 3', '2 - 3', '±2', 'x=2', 'граница 2'])
      expect(labelCoordinates([label])).toBeUndefined();
    expect(normalizeCoordinateDrawing({ figure: 'interval', steps: [null] })).toEqual({
      figure: 'interval',
      steps: [null],
    });
  });
});
