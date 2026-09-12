import { describe, expect, it } from 'vitest';
import {
  ASSIGNMENT_LIMITS,
  assignmentCheckContext,
  cleanSheetAssignment,
  wrapAssignmentText,
} from '../src/ui/math-sheet-assignment';

describe('assignment reference attached to handwritten solution', () => {
  const image = { dataUrl: 'data:image/png;base64,aGVsbG8=', name: 'Уравнение.png' };
  it('leaves existing sheets and plain contexts backward compatible', () => {
    expect(cleanSheetAssignment()).toBeUndefined();
    expect(cleanSheetAssignment({ text: '  ' })).toBeUndefined();
    expect(assignmentCheckContext(undefined, 'Мой шаг')).toBe('Мой шаг');
  });
  it('accepts bounded embedded raster photographs and plain task text', () => {
    expect(cleanSheetAssignment({ text: '  2x + 3 = 11  ', image })).toEqual({
      text: '2x + 3 = 11',
      image,
    });
    for (const mime of ['png', 'jpeg', 'webp'])
      expect(
        cleanSheetAssignment({ image: { ...image, dataUrl: `data:image/${mime};base64,aGVsbG8=` } })
          ?.image,
      ).toBeDefined();
  });
  it('does not fetch remote URLs or accept SVG, markup, malformed or oversized payloads', () => {
    for (const dataUrl of [
      'https://example.com/task.png',
      'file:///task.png',
      'data:image/svg+xml;base64,aGVsbG8=',
      'data:image/png;base64,<script>',
      'data:image/png;base64,' + 'a'.repeat(ASSIGNMENT_LIMITS.dataUrl),
    ])
      expect(cleanSheetAssignment({ image: { ...image, dataUrl } })).toBeUndefined();
    expect(cleanSheetAssignment({ text: '<script>solve()</script>' })?.text).toBe(
      '<script>solve()</script>',
    );
  });
  it('separates task, learner ink, and learner commentary in the model context', () => {
    const context = assignmentCheckContext({ text: '2x + 3 = 11', image }, 'Я вычел 3');
    expect(context).toContain('Верхняя «УСЛОВИЕ ЗАДАНИЯ»');
    expect(context).toContain('Нижняя «МОЁ РЕШЕНИЕ»');
    expect(context).toContain('Не засчитывай напечатанные ответы');
    expect(context).toContain('Текст условия: 2x + 3 = 11');
    expect(context).toContain('Моё пояснение: Я вычел 3');
    expect(context).not.toContain('data:image');
  });
  it('wraps long formulas without losing or inventing symbols and bounds text input', () => {
    const text = 'abcdefghijklmnop 2x + 3 = 11';
    const lines = wrapAssignmentText(text, (s) => s.length, 8);
    expect(lines.every((s) => s.length <= 8)).toBe(true);
    expect(lines.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
    expect(cleanSheetAssignment({ text: 'x'.repeat(5000) })?.text?.length).toBe(4000);
  });
});
