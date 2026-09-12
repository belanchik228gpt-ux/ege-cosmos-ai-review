import { describe, expect, it } from 'vitest';
import { emptySheet, readSheet, sheetPoint, SHEET_LIMITS } from '../src/domain/math-sheet';
describe('math sheet persistence and coordinates', () => {
  it('maps a scaled and scrolled sheet to unchanged export coordinates', () => {
    expect(sheetPoint(450, 225, { left: 100, top: 0, width: 700, height: 450 })).toEqual({
      x: 700,
      y: 450,
    });
    expect(sheetPoint(500, 300, { left: -200, top: -150, width: 1400, height: 900 })).toEqual({
      x: 700,
      y: 450,
    });
    expect(sheetPoint(-200, 800, { left: 0, top: 0, width: 700, height: 450 })).toEqual({
      x: 0,
      y: 900,
    });
  });
  it('restores tool strokes and lesson context without interpreting text as markup', () => {
    const d = {
      ...emptySheet(),
      context: '2x = 8',
      strokes: [
        {
          tool: 'text',
          color: '#18243b',
          size: 4,
          points: [{ x: 10, y: 20 }],
          text: '<script>1</script>',
        },
      ],
    };
    expect(readSheet(JSON.stringify(d))).toEqual(d);
  });
  it('rejects corrupt and nonfinite/out-of-bounds persisted coordinates', () => {
    for (const x of [-1, 1401, null])
      expect(() =>
        readSheet(
          JSON.stringify({
            ...emptySheet(),
            strokes: [{ tool: 'pen', color: '#123456', size: 3, points: [{ x, y: 1 }] }],
          }),
        ),
      ).toThrow();
    expect(() => readSheet('{')).toThrow();
  });
  it('bounds stored command and point collections', () => {
    const s = { tool: 'pen', color: '#123456', size: 3, points: [{ x: 1, y: 1 }] };
    expect(() =>
      readSheet(
        JSON.stringify({ ...emptySheet(), strokes: Array(SHEET_LIMITS.strokes + 1).fill(s) }),
      ),
    ).toThrow();
    expect(() =>
      readSheet(
        JSON.stringify({
          ...emptySheet(),
          strokes: [{ ...s, points: Array(SHEET_LIMITS.perStroke + 1).fill({ x: 1, y: 1 }) }],
        }),
      ),
    ).toThrow();
  });
});
