import { describe, expect, it } from 'vitest';
import { sheetMathText } from '../src/ui/sheet-math-text';
import { assignmentCheckContext } from '../src/ui/math-sheet-assignment';

describe('readable assignment formulas in exported writing sheets', () => {
  it.each([
    [String.raw`\(\sqrt{(-7)^2}\)`, '√((-7)²)'],
    [String.raw`x_1=\frac{4+2}{2}=3`, 'x₁=(4+2)/(2)=3'],
    [String.raw`x_{2}=\dfrac{-b-\sqrt{D}}{2\cdot a}`, 'x₂=(-b-√(D))/(2· a)'],
    [String.raw`\frac{\frac{1}{2}+3}{x^{n+1}}\geq 0`, '((1)/(2)+3)/(xⁿ⁺¹)≥ 0'],
    [String.raw`$$\left|x-6\right|\neq \sqrt[3]{8}$$`, '|x-6|≠ ∛(8)'],
    [String.raw`a^{x+2}\le b_{unknown}`, 'a^(x+2)≤ b_(unknown)'],
    [String.raw`\sqrt[5]{x}\pm 2\times 3`, 'корень степени (5) из (x)± 2× 3'],
  ])('keeps operator meaning in %s', (source, readable) => {
    expect(sheetMathText(source)).toBe(readable);
  });
  it('preserves unknown commands, incomplete syntax and original model context', () => {
    expect(sheetMathText(String.raw`\unknown{x+2}=\frac{1}`)).toBe(
      String.raw`\unknown{x+2}=\frac{1}`,
    );
    expect(sheetMathText(String.raw`Цена $5, \sqrt{4`)).toBe(String.raw`Цена $5, \sqrt{4`);
    const raw = String.raw`\(\sqrt{(-7)^2}\)`;
    expect(assignmentCheckContext({ text: raw }, '')).toContain(raw);
    expect(sheetMathText('<script>text</script>')).toBe('<script>text</script>');
  });
  it('bounds recursive and oversized conversion without removing the remaining content', () => {
    const raw = String.raw`\sqrt{`.repeat(30) + '7' + '}'.repeat(30);
    expect(sheetMathText(raw)).toContain(String.raw`\sqrt{`);
    const long = 'x'.repeat(8001);
    expect(sheetMathText(long)).toBe(long);
  });
});
