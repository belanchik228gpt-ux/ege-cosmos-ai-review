import { it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DialogueArt } from '../src/scenes/DialogueArt';
import type { TutorDrawing } from '../src/domain/cloud-learning';
it('never depicts Newton’s law as a state institution', () => {
  const drawing: TutorDrawing = {
    kind: 'concept',
    title: 'Второй закон Ньютона',
    steps: [
      {
        caption: 'Сила направлена вправо',
        labels: ['Масса, г', 'Результирующая сила, Н'],
        values: [200, 6],
      },
    ],
  };
  const html = renderToStaticMarkup(
    createElement(DialogueArt, {
      drawing,
      step: drawing.steps[0],
      progress: 1,
      index: 0,
      subject: 'physics',
    }),
  );
  expect(html).not.toContain('ds-institution');
  expect(html).not.toContain('ds-person');
  expect(html).toContain('Масса, г');
  expect(html).not.toContain('кг');
  expect(html).toContain('200');
});
it('shows supplied electron counts without drawing people in chemistry', () => {
  const drawing: TutorDrawing = {
    kind: 'concept',
    title: 'Связи в метане',
    steps: [
      {
        caption: 'Внешние электроны',
        labels: ['Внешние электроны C', 'Внешний электрон H'],
        values: [4, 1],
      },
    ],
  };
  const html = renderToStaticMarkup(
    createElement(DialogueArt, {
      drawing,
      step: drawing.steps[0],
      progress: 1,
      index: 0,
      subject: 'chemistry',
    }),
  );
  expect(html).not.toContain('ds-person');
  expect(html.match(/class="ds-point"/g)).toHaveLength(5);
  expect(html).toContain('Внешние электроны C: 4');
});
