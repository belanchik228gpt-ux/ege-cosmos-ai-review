import { it, expect } from 'vitest';
import { sceneFormulaMarkdown } from '../shared/scene-formula.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DialogueArt } from '../src/scenes/DialogueArt';
import { drawingPages } from '../shared/document-scenes.mjs';
import { createDocumentMathRenderer } from '../shared/document-math.mjs';
import type { TutorDrawing } from '../src/domain/cloud-learning';
it('renders the raw formula actually returned by OpenAI in the circuit smoke check, both on screen and in notes', () => {
  const d: TutorDrawing = {
    kind: 'concept',
    figure: 'circuit',
    title: 'Резистор',
    steps: [
      {
        caption: 'Не вычисляем новый ток',
        values: [12, 3],
        formula: String.raw`R=3\text{ Ом},\quad I=\frac{U}{R}`,
      },
    ],
  };
  const html = renderToStaticMarkup(
    createElement(DialogueArt, { drawing: d, step: d.steps[0], index: 0, progress: 1 }),
  );
  expect(html).toContain('class="katex"');
  expect(html).not.toContain('class="katex-error"');
  const m = createDocumentMathRenderer();
  const pages = drawingPages([d], m.inline)
    .map((p) => p.body || '')
    .join('');
  expect(pages).toContain('class="katex"');
  expect(pages).not.toContain('class="katex-error"');
});
it('preserves history prose and existing math delimiters instead of wrapping everything in mathematics', () => {
  for (const s of ['1861: личная свобода', '$I=U/R$', '$$x=2$$', String.raw`\(a+b\)`])
    expect(sceneFormulaMarkdown('concept', s)).toBe(s);
  expect(sceneFormulaMarkdown('algebra', '$x=2$')).toBe('$x=2$');
});
it('typesets the plane relation from the real geometry dialogue without duplicate parameter chips', () => {
  const d: TutorDrawing = { kind: 'concept', figure: 'spatial-plane', title: 'Прямая в плоскости', steps: [{ caption: 'Две различные точки', values: [1, 3], labels: ['α', 'A', 'B', 'C', 'a', 'β'], formula: String.raw`AB\subset\alpha` }] };
  const html = renderToStaticMarkup(createElement(DialogueArt, { drawing: d, step: d.steps[0], index: 0, progress: 1 }));
  expect(html).toContain('class="katex"');
  expect(html).not.toContain('ds-figure-labels');
  expect(html).not.toContain('ШАГ 4 / 4');
  expect(sceneFormulaMarkdown('concept', String.raw`AB,\ BC,\ AC`)).toBe('$$\n' + String.raw`AB,\ BC,\ AC` + '\n$$');
  const m = createDocumentMathRenderer();
  expect(drawingPages([d], m.inline).map(p => p.body || '').join('')).toContain('class="katex"');
});
