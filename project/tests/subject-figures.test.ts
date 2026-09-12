import { describe, expect, it } from 'vitest';
import { renderSubjectFigure, subjectFigures } from '../shared/subject-figures.mjs';
import { cleanDrawing } from '../src/domain/cloud-learning';
import { documentDrawings, drawingPages } from '../shared/document-scenes.mjs';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DialogueArt } from '../src/scenes/DialogueArt';
import type { TutorDrawing } from '../src/domain/cloud-learning';
const { parseTutorOutput, OUTPUT_SCHEMA, tutorBaseInstructions } = createRequire(import.meta.url)(
  '../desktop/openai-tutor.cjs',
);
const samples = [
  ['right-triangle', [3, 4], ['Катеты']],
  ['circuit', [6, 3], ['Резистор']],
  ['wave', [2, 2], ['Волна']],
  ['particles', [12], ['Вещество']],
  ['food-chain', [], ['Трава', 'Кузнечик', 'Лягушка']],
  ['earth-layers', [], ['Кора', 'Мантия', 'Ядро']],
  ['timeline', [1380, 1480], ['Куликовская битва', 'Стояние на Угре']],
  ['cycle', [], ['Испарение', 'Конденсация', 'Осадки']],
  ['tree', [], ['Треугольники', 'Остроугольный', 'Прямоугольный', 'Тупоугольный']],
  ['interval', [-2, 2, 0, 0, 1], ['Множество решений']],
] as const;
describe('shared subject figures', () => {
  it('keeps graph axes fixed so a lower activation barrier visibly falls while endpoint energy stays put', () => {
    const d: TutorDrawing = {
      kind: 'function',
      title: 'Катализатор',
      steps: [
        { caption: 'Без катализатора', values: [0, 0, 1, 6, 2, -2] },
        { caption: 'С катализатором', values: [0, 0, 1, 3, 2, -2] },
      ],
    };
    const positions = (i: number) =>
      [
        ...renderToStaticMarkup(
          createElement(DialogueArt, { drawing: d, step: d.steps[i], index: i, progress: 1 }),
        ).matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g),
      ].map((m) => [Number(m[1]), Number(m[2])]);
    const first = positions(0),
      second = positions(1);
    expect(first).toHaveLength(3);
    expect(second[0]).toEqual(first[0]);
    expect(second[2]).toEqual(first[2]);
    expect(second[1][1]).toBeGreaterThan(first[1][1]);
  });
  it.each(samples)(
    '%s survives model parsing, storage and exports with the same final SVG',
    (figure, values, labels) => {
      const scene = {
        kind: 'concept',
        figure,
        title: 'Пример',
        steps: Array.from({ length: 2 }, () => ({
          caption: 'Авторский пример',
          values: [...values],
          labels: [...labels],
        })),
      };
      const parsed = parseTutorOutput(JSON.stringify({ text: 'Объяснение', scene }));
      const clean = cleanDrawing(parsed.scene)!;
      expect(clean.figure).toBe(figure);
      const doc = documentDrawings([clean])[0];
      const screenSvg = renderSubjectFigure(clean, 1, 1)!;
      expect(screenSvg).toContain(`data-subject-figure="${figure}"`);
      expect(screenSvg).not.toContain('уточнённые данные');
      expect(renderSubjectFigure(doc, 1, 1)).toBe(screenSvg);
      const printed = drawingPages([clean], (x) => x)
        .map((p) => p.body || '')
        .join('');
      expect(printed).toContain(screenSvg);
      expect(printed).not.toContain('Значения кадра:');
    },
  );
  it('uses the same permitted vocabulary in the model schema and renderers', () => {
    expect(OUTPUT_SCHEMA.properties.scene.anyOf[1].properties.figure.enum).toEqual([
      ...subjectFigures,
      null,
    ]);
    expect(OUTPUT_SCHEMA.properties.scene.anyOf[1].required).toContain('figure');
    expect(tutorBaseInstructions({ mode: 'school', subject: 'physics', grade: 7 })).toContain(
      'circuit',
    );
  });
  it('does not fabricate a triangle or a current from missing, negative or non-finite data', () => {
    for (const figure of ['right-triangle', 'circuit'])
      for (const values of [[], [3], [3, -4], [NaN, 4], [Infinity, 2]]) {
        expect(
          renderSubjectFigure({ figure, title: 'Ошибочные данные', steps: [{ values }] })!,
        ).toContain('уточнённые данные');
      }
    expect(
      renderSubjectFigure({ figure: 'particles', steps: [{ values: [50000000] }] })!,
    ).toContain('уточнённые данные');
  });
  it('never treats labels or a figure id as SVG markup', () => {
    const malicious = '</text><script>alert(1)</script><text onload="alert(1)">';
    const svg = renderSubjectFigure({
      figure: 'tree',
      title: malicious,
      steps: [{ labels: [malicious, 'Ветка'] }],
    })!;
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('<text onload=');
    expect(svg).toContain('&lt;script&gt;');
    expect(renderSubjectFigure({ figure: malicious, steps: [] })).toBeNull();
  });
  it('animates the same data without altering the supplied circuit or triangle dimensions', () => {
    const d = { figure: 'right-triangle', steps: [{ values: [3, 4] }] };
    const before = renderSubjectFigure(d, 0, 0)!,
      after = renderSubjectFigure(d, 0, 1)!;
    expect(before).toContain('stroke-dashoffset="1"');
    expect(after).toContain('stroke-dashoffset="0"');
    expect(after).toContain('a = 3');
    expect(after).toContain('b = 4');
    expect(after).not.toContain('c = 5');
  });
  it('distinguishes an open interval from closed endpoints without revealing the solution before the sign check', () => {
    const d = {
      figure: 'interval',
      steps: [
        { values: [-2, 2, 0, 0, 0] },
        { values: [-2, 2, 0, 0, 1] },
        { values: [-3, 3, 1, 1, 1] },
      ],
    };
    expect(renderSubjectFigure(d, 0, 1)).not.toContain('(-2; 2)');
    expect(renderSubjectFigure(d, 1, 1)).toContain('(-2; 2)');
    expect(renderSubjectFigure(d, 2, 1)).toContain('[-3; 3]');
  });
});
