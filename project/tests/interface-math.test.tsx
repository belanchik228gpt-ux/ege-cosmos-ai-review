import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TutorMarkdown } from '../src/ui/TutorMarkdown';
import { LessonHeading } from '../src/ui/LessonHeading';

describe('Учебный текст в интерфейсе', () => {
  it.each(['$(0;0)$', '$1$', String.raw`\(x^2\)`, String.raw`\[x=1\]`])(
    'рисует формулу %s через KaTeX',
    (text) => {
      const html = renderToStaticMarkup(<TutorMarkdown text={text} />);
      expect(html).toContain('class="katex"');
      expect(html).not.toContain('katex-error');
    },
  );
  it('сохраняет таблицу, формулы и обычный текст', () => {
    const html = renderToStaticMarkup(
      <TutorMarkdown
        text={'| Точка | Значение |\n|---|---|\n| $1$ | $(0;0)$ |\n\nПроверь знак.'}
      />,
    );
    expect(html).toContain('Проверь знак.');
    expect(html.match(/class="katex"/g)).toHaveLength(2);
  });
  it('не исполняет HTML и javascript ссылки', () => {
    const html = renderToStaticMarkup(
      <TutorMarkdown text={'<script>alert(1)</script>\n\n[ссылка](javascript:alert(1))'} />,
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
  });
  it('отделяет раздел от названия темы и сохраняет одиночное название', () => {
    expect(renderToStaticMarkup(<LessonHeading title="Раздел · Тема" />)).toContain(
      'studio-eyebrow',
    );
    const html = renderToStaticMarkup(<LessonHeading title="Математика" />);
    expect(html).not.toContain('studio-eyebrow');
    expect(html).toContain('Математика');
  });
});
