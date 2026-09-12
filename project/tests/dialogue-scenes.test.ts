import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TutorDrawing } from '../src/domain/cloud-learning';
import { DialogueArt, geometryDrawingData, historyDrawingTheme } from '../src/scenes/DialogueArt';

const drawing = (
  kind: TutorDrawing['kind'],
  title: string,
  steps: TutorDrawing['steps'],
): TutorDrawing => ({ kind, title, steps });
const render = (scene: TutorDrawing, index = 0, progress = 1) =>
  renderToStaticMarkup(
    createElement(DialogueArt, { drawing: scene, step: scene.steps[index], index, progress }),
  );

describe('Bounded dialogue drawing semantics', () => {
  it('shows matching numeric concept values in cards even for a civics price comparison', () => {
    const d = drawing('concept', 'Стоимость корзины', [{ caption: 'Тот же набор', values: [100, 100, 200], labels: ['Яблоки', 'Хлеб', 'Весь набор'] }]);
    const html = renderToStaticMarkup(createElement(DialogueArt, { drawing: d, step: d.steps[0], index: 0, progress: 1, subject: 'social' }));
    expect(html).toContain('Яблоки: 100');
    expect(html).toContain('Хлеб: 100');
    expect(html).toContain('Весь набор: 200');
    expect(html).not.toContain('ds-person');
  });
  it('keeps rectangle 7×4 distinct from a later independent 7×3 example', () => {
    const a = drawing('geometry', 'Прямоугольник', [{ caption: 'Стороны 7 и 4', values: [7, 4] }]);
    const b = drawing('geometry', 'Прямоугольник', [{ caption: 'Стороны 7 и 3', values: [7, 3] }]);
    expect(geometryDrawingData(a, a.steps[0])).toEqual({ shape: 'rectangle', a: 7, b: 4 });
    expect(geometryDrawingData(b, b.steps[0])).toEqual({ shape: 'rectangle', a: 7, b: 3 });
    expect(render(a)).toContain('b = 4');
    expect(render(b)).toContain('b = 3');
    expect(render(a).replace(/<[^>]+>/g, '')).not.toContain('28');
  });
  it('uses supplied perpendicular height, radius and square side without invented values', () => {
    for (const [title, values, expected] of [
      ['Треугольник', [6, 4], { shape: 'triangle', a: 6, b: 4 }],
      ['Круг', [3], { shape: 'circle', a: 3, b: undefined }],
      ['Квадрат', [5], { shape: 'rectangle', a: 5, b: 5 }],
      ['Прямоугольник', [], { shape: 'rectangle', a: undefined, b: undefined }],
      ['Треугольник', [-3, Infinity], { shape: 'triangle', a: undefined, b: undefined }],
    ] as const) {
      const d = drawing('geometry', title, [{ caption: title, values: [...values] }]);
      expect(geometryDrawingData(d, d.steps[0])).toEqual(expected);
    }
  });
  it('does not confuse serfdom with a fortress, or lose an already supplied ruler', () => {
    const d = drawing('history', 'Отмена крепостного права', [
      { caption: 'Правитель', labels: ['Александр II'] },
      { caption: 'Личная свобода', labels: ['Манифест', '1861'] },
    ]);
    expect(historyDrawingTheme(d, d.steps[1])).toEqual({
      city: false,
      battle: false,
      ruler: true,
      document: true,
    });
    const fort = drawing('history', 'Войско у крепости', [{ caption: 'Условная сцена' }]);
    expect(historyDrawingTheme(fort, fort.steps[0])).toMatchObject({ city: true, battle: true });
  });
  it('does not create a comma, historical name or date absent from the current data', () => {
    const sentence = drawing('syntax', 'Части предложения', [
      {
        caption: 'Найди границу частей',
        labels: ['Когда наступила весна', 'птицы вернулись домой'],
      },
    ]);
    const markup = render(sentence);
    expect(markup).not.toContain('весна,');
    expect(markup).not.toContain('ds-punctuation');
    const history = render(
      drawing('history', 'Князь и город', [
        { caption: 'Рассмотри участников', labels: ['Город', 'Князь'] },
      ]),
    );
    expect(history).not.toMatch(/Владимир|988|1861/);
  });
  it('plots given points as segments, and does not evaluate a formula or invent missing point pairs', () => {
    const valid = render(
      drawing('function', 'Точки', [{ caption: 'Сравни', values: [-2, 4, 0, 0, 2, 4] }]),
    );
    expect(valid).toContain('<polyline');
    expect(valid).toContain('Заданные точки, соединённые отрезками.');
    const incomplete = render(
      drawing('function', 'Точки', [{ caption: 'Нужны координаты', values: [1, 2, 3] }]),
    );
    expect(incomplete).not.toContain('<polyline');
    expect(incomplete).toContain('Нужны координаты');
  });
  it('preserves small numbers and derives visual movement from the scene cursor', () => {
    const d = drawing('number-line', 'Малое смещение', [
      { caption: 'Пройди вправо', values: [0, 0.0001] },
    ]);
    expect(render(d)).toContain('0,0001');
    expect(render(d, 0, 0.25)).not.toEqual(render(d, 0, 0.75));
    expect(render(d, 0, 0.25)).toEqual(render(d, 0, 0.25));
  });
  it('escapes labels and keeps supplied formula rendering separate from HTML execution', () => {
    const d = drawing('syntax', 'Текст', [
      {
        caption: 'Проверка',
        labels: ['<script>alert(1)</script>'],
        formula: '<img src=x onerror=alert(1)>',
      },
    ]);
    const markup = render(d);
    expect(markup).toContain('&lt;script&gt;');
    expect(markup).not.toContain('<script>');
    expect(markup).not.toContain('<img');
  });
});
