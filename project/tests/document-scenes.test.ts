import { describe, expect, it } from 'vitest';
import { documentDrawings, drawingPages } from '../shared/document-scenes.mjs';
import { renderDocument, escapeHtml } from '../shared/document-renderer.mjs';

const draw = (kind: string, steps: any[], title = 'Тема') => ({ kind, title, steps });
const html = (drawing: any) =>
  renderDocument({ title: 'Мой конспект', content: '', drawings: [drawing] });

describe('actual lesson drawing export', () => {
  it('retains scientific quantities and draws an explicitly stated force without inventing units', () => {
    const output = html(
      draw('concept', [
        {
          caption: 'Результирующая сила направлена вправо.',
          values: [2, 6],
          labels: ['Масса, кг', 'Результирующая сила, Н'],
        },
      ]),
    );
    expect(output).toContain('Масса и результирующая сила из условия');
    expect(output).toContain('m = 2');
    expect(output).toContain('F = 6');
    expect(output).toContain('Значения кадра: 2; 6');
    const values = html(
      draw('concept', [
        { caption: 'Данные', values: [0, 3], labels: ['Время, с', 'Скорость, м/с'] },
      ]),
    );
    expect(values).toContain('Числовые данные кадра');
    expect(values).toContain('Значения кадра: 0; 3');
  });
  it('rejects unknown kinds, array frames, object text and malformed coordinates without shifting pairs', () => {
    expect(documentDrawings(null)).toEqual([]);
    expect(
      documentDrawings([{ kind: 'html', steps: [{}] }, draw('algebra', [[], null, 7])]),
    ).toEqual([]);
    const result = documentDrawings([
      draw('function', [
        {
          caption: {
            toString: () => {
              throw Error('must not coerce');
            },
          },
          values: [1, NaN, 2, 3],
        },
        { values: [1, 2, 3] },
      ]),
    ]);
    expect(result[0].steps.map((s: any) => s.values)).toEqual([[], []]);
    expect(result[0].steps[0].caption).toBe('');
  });
  it('escapes caller markup and retains the complete hostile text as readable content', () => {
    const attack = '<img src=x onerror="alert(1)"><script>fetch("https://x.test")</script>';
    const output = html(
      draw('concept', [{ caption: attack, formula: attack, labels: [attack] }], attack),
    );
    expect(output).not.toMatch(/<script|<img\s|<iframe|<foreignObject/i);
    expect(output).toContain('&lt;img src=x');
    expect(output).toContain("default-src 'none'");
    expect(output).toContain("img-src 'none'");
  });
  it('draws a real square and does not reinterpret unknown or ambiguous geometry as a rectangle', () => {
    const square = html(
      draw(
        'geometry',
        [{ values: [5], caption: 'Сторона квадрата', labels: ['квадрат'] }],
        'Квадрат',
      ),
    );
    expect(square).toContain('width="163" height="163"');
    for (const d of [
      draw('geometry', [{ values: [5, 3] }]),
      draw('geometry', [{ values: [5] }], 'Прямоугольник'),
      draw('geometry', [{ values: [5, 3] }], 'Квадрат'),
      draw('geometry', [{ values: [5, 3] }], 'Круг и треугольник'),
    ]) {
      const out = html(d);
      expect(out).toContain('Схема не построена');
      expect(out).not.toContain('<rect ');
    }
  });
  it('does not mistake square units for a square shape and never invents a result', () => {
    const output = html(
      draw(
        'geometry',
        [
          {
            values: [7, 4],
            caption: 'Площадь прямоугольника в квадратных сантиметрах',
            labels: ['прямоугольник'],
          },
        ],
        'Прямоугольник',
      ),
    );
    expect(output).toContain('a = 7');
    expect(output).toContain('b = 4');
    expect(output).not.toContain('Схема не построена');
    expect(output).not.toContain('S = 28');
  });
  it('draws triangle height perpendicular to its actual base, with given height, not a sloping side', () => {
    const output = html(
      draw('geometry', [{ values: [7, 4], labels: ['треугольник'] }], 'Площадь треугольника'),
    );
    expect(output).toContain('h = 4');
    expect(output).toContain('h13 v13');
    expect(output).toContain('перпендикулярной высотой');
  });
  it('uses one coordinate scale across all number-line frames and preserves additional values', () => {
    const d = draw('number-line', [{ values: [-3, 0, 2] }, { values: [3, 0] }]);
    const page = drawingPages([d], escapeHtml, escapeHtml)[0].body!;
    const circles = [...page.matchAll(/circle cx="([\d.]+)" cy="108"/g)].map((m) => m[1]);
    expect(circles).toHaveLength(2);
    expect(circles[0]).toBe(circles[1]);
    expect(page).toContain('Значения кадра: -3; 0; 2');
  });
  it('keeps x/y pair order, exact labels and the piecewise-line limitation on graph exports', () => {
    const output = html(
      draw(
        'function',
        [
          {
            values: [40, 60, 60, 40],
            labels: ['Горизонталь: количество, шт. в день', 'Вертикаль: цена, руб.'],
          },
        ],
        'Спрос',
      ),
    );
    expect(output).toContain('(40; 60); (60; 40)');
    expect(output).toContain('Вертикаль: цена, руб.');
    expect(output).toContain('плавная кривая не предполагается');
    expect(output).toContain('>x</text>');
    expect(output).toContain('>y</text>');
  });
  it('renders algebra as the actual KaTeX expression instead of generic placeholder cards', () => {
    const output = html(
      draw(
        'algebra',
        [{ caption: 'Сокращаем дробь', formula: String.raw`\frac{6}{24}=\frac{1}{4}` }],
        'Дроби',
      ),
    );
    expect(output).toContain('class="katex"');
    expect(output).toContain('mfrac');
    expect(output).not.toContain('Исходная запись');
  });
  it('preserves Russian syntax and punctuation literally instead of forcing it into math mode', () => {
    const output = html(
      draw(
        'syntax',
        [
          {
            caption: 'Найди две основы',
            formula: 'Я знаю что ты придёшь',
            labels: ['главное: Я знаю', 'придаточное: что ты придёшь'],
          },
        ],
        'Сложное предложение',
      ),
    );
    expect(output).toContain('Я знаю что ты придёшь');
    expect(output).not.toContain('Я знаю, что');
    expect(output).not.toContain('class="katex"');
  });
  it('preserves full long captions, all labels, formula tails and frame identity on continuation pages', () => {
    const caption =
      'Я проверяю каждое действие и сохраняю собственное рассуждение. '.repeat(55) +
      'ПОСЛЕДНЯЯ_СТРОКА';
    const labels = Array.from(
      { length: 10 },
      (_, i) => `Подпись ${i + 1}: ` + 'Смысл учебного шага. '.repeat(10) + ` КОНЕЦ_${i + 1}`,
    );
    const formula = String.raw`\begin{aligned}x+3&=7\\x+3-3&=7-3\\x&=4\end{aligned}`;
    const pages = drawingPages(
      [draw('algebra', [{ caption, labels, formula }])],
      escapeHtml,
      escapeHtml,
    );
    const detail = pages
      .filter((p: any) => p.content)
      .map((p: any) => p.content)
      .join('\n');
    expect(detail).toContain(caption);
    expect(detail).toContain(formula);
    expect(detail).toContain('Кадр 1 из 1');
    for (const label of labels) expect(detail).toContain(label);
    const output = html(draw('algebra', [{ caption, labels, formula }]));
    expect(output).toContain('ПОСЛЕДНЯЯ_СТРОКА');
    expect(output).toContain('КОНЕЦ_10');
  });
  it('keeps formulas above KaTeX length limit literal, without silently cutting the equation', () => {
    const formula = 'x+'.repeat(700) + 'z=123';
    const pages = drawingPages(
      [draw('algebra', [{ caption: 'Полная запись', formula }])],
      escapeHtml,
      escapeHtml,
    );
    expect(pages.find((p: any) => p.content)?.content).toContain(formula);
  });
  it('does not mutate input and keeps several topics and every supplied frame in order', () => {
    const input = [
      draw('number-line', [{ values: [-3, 0] }, { values: [3, 0] }], 'Первая тема'),
      draw(
        'algebra',
        [{ formula: 'x+3=7' }, { formula: 'x=4' }, { formula: '4+3=7' }],
        'Вторая тема',
      ),
    ];
    const before = JSON.stringify(input),
      output = renderDocument({ title: 'Две темы', drawings: input, content: '' });
    expect(JSON.stringify(input)).toBe(before);
    expect(output.match(/class="scene-print-row"/g)).toHaveLength(5);
    expect(output.indexOf('Первая тема')).toBeLessThan(output.indexOf('Вторая тема'));
    expect(output).not.toContain('Тема освоена');
  });
});
