import { describe, expect, it } from 'vitest';
import { paginateText, renderDocument } from '../shared/document-renderer.mjs';
import { getSchoolUnit } from '../src/domain/school-program';
import {
  createSchoolState,
  schoolDocumentFromLesson,
  startSchoolLesson,
} from '../src/domain/school-state';

function pythagorasNote() {
  const unit = getSchoolUnit('program-math-8-geometry')!;
  const state = startSchoolLesson(createSchoolState(), unit, 'lesson', 'Теорема Пифагора');
  return schoolDocumentFromLesson(state.lessons[state.activeLessonId!]);
}

describe('short formula and paragraph pagination', () => {
  it('keeps the actual Pythagoras note and its material status on one two-column text page', () => {
    const doc = pythagorasNote();
    const pages = paginateText(doc.content);
    expect(pages).toHaveLength(1);
    const blocks = pages.flat(2);
    expect(blocks.filter((block) => block.type === 'math').map((block) => block.text)).toEqual([
      '$$\nc^2=a^2+b^2\n$$',
      '$$\nc^2=3^2+4^2=9+16=25\n$$',
      '$$\nc=\\sqrt{25}=5\\text{ см}\n$$',
    ]);
    expect(blocks.at(-1)?.text).toBe(doc.content.split('\n\n').at(-1));
    expect(blocks.at(-1)?.text).toContain('Разобрано не означает освоено.');
    expect(renderDocument(doc).match(/class="album-page notes"/g)).toHaveLength(1);
  });

  it.each(['comfortable', 'large'])('retains every original paragraph and formula at %s size', (scale) => {
    const doc = pythagorasNote();
    const blocks = paginateText(doc.content, scale).flat(2);
    const expected = doc.content.replace(/^# [^\n]+\n+/, '').split(/\n\n+/).filter(Boolean)
      .map((paragraph) => paragraph.replace(/^## /, ''));
    // Sources are deliberately separate newline-delimited paragraphs in the renderer.
    expect(blocks.map((block) => block.text).join('\n')).toBe(expected.join('\n'));
    expect(blocks.filter((block) => block.type === 'heading')).toHaveLength(5);
  });

  it.each(['comfortable', 'large'])('does not apply the short-formula allowance to stacked or multiline math at %s size', (scale) => {
    const formulas = [
      String.raw`$$\frac{1+\frac{2}{3}}{\sqrt{5}}$$`,
      String.raw`$$\begin{aligned}x+3&=7\\x&=4\end{aligned}$$`,
      String.raw`$$\sum_{n=1}^{\infty}\frac{1}{n^2}$$`,
    ];
    for (const formula of formulas) {
      const prefix = Array.from({ length: scale === 'large' ? 12 : 14 }, (_, i) => `Строка ${i}.`).join('\n');
      const columns = paginateText(`${prefix}\n${formula}\nСледующий абзац.`, scale).flat();
      expect(columns.findIndex((column) => column.some((block) => block.type === 'math'))).toBe(1);
      expect(columns.flat().filter((block) => block.type === 'math').map((block) => block.text)).toEqual([formula]);
      expect(columns.flat().at(-1)?.text).toBe('Следующий абзац.');
    }
  });
});
