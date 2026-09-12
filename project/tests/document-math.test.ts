import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createDocumentMathRenderer,
  tokenizeDocumentMath,
  DOCUMENT_MATH_LIMITS,
} from '../shared/document-math.mjs';
import { paginateText, renderDocument } from '../shared/document-renderer.mjs';
import { katexExportCss } from '../shared/katex-export-assets.mjs';
const require = createRequire(import.meta.url);
const { exportDocument } = require('../desktop/documents.cjs');

describe('offline mathematical document export', () => {
  it('removes prose emphasis across inline formulas without changing code or multiplication', () => {
    const html = createDocumentMathRenderer().inline('**Граница \\(x_1=2\\) важна**; *это пример*. `x**2` и 2*3*4.');
    expect(html).toContain('class="katex"');
    expect(html).not.toContain('**Граница');
    expect(html).not.toContain('важна**');
    expect(html).not.toContain('*это пример*');
    expect(html).toContain('x**2');
    expect(html).toContain('2*3*4');
    expect(html).toContain('x_1=2');
  });
  it.each([
    ['$x^2+1$', false],
    ['$$\\frac{3}{8}$$', true],
    ['\\(\\sqrt{16}=4\\)', false],
    ['\\[\\frac{a\\cdot h}{2}\\]', true],
  ])('renders %s with server KaTeX and preserves accessible source', (input, display) => {
    const renderer = createDocumentMathRenderer();
    const html = renderer.inline(input);
    expect(html).toContain('class="katex"');
    expect(html).toContain('<math');
    expect(html).toContain('application/x-tex');
    expect(html.includes('class="katex-display"')).toBe(display);
    expect(renderer.hasMath()).toBe(true);
  });
  it('keeps multiline display math together during page flow', () => {
    const source =
      '# Тема\n## Решение\nОбъяснение.\n\\[\n\\begin{aligned}x+3&=7\\\\x&=4\\end{aligned}\n\\]\nСледующий шаг.';
    const blocks = paginateText(source).flat(2);
    expect(blocks.filter((block) => block.type === 'math')).toHaveLength(1);
    expect(blocks.find((block) => block.type === 'math')!.text).toContain('x&=4');
    const html = renderDocument({ title: 'Тема', content: source });
    expect(html).toContain('class="katex-display"');
    expect(html).toContain('Следующий шаг.');
  });
  it('does not cut a formula at the prose chunk boundary', () => {
    const formula = '$\\frac{1}{2}+\\frac{3}{4}=\\frac{5}{4}$';
    const blocks = paginateText('Начало '.repeat(63) + formula + ' Конец.').flat(2);
    expect(blocks.filter((block) => block.text.includes(formula))).toHaveLength(1);
    expect(
      renderDocument({ title: 'Формула', content: blocks.map((block) => block.text).join('\n') }),
    ).toContain('class="katex"');
  });
  it('leaves code spans, escaped dollars, and unmatched delimiters as text', () => {
    const input = '`$x=4$` и \\$50, конец \\(без пары';
    expect(tokenizeDocumentMath(input).filter((token) => token.type === 'math')).toHaveLength(0);
    const html = createDocumentMathRenderer().inline(input);
    expect(html).not.toContain('katex');
    expect(html).toContain('$x=4$');
  });
  it.each([
    '$\\href{javascript:alert(1)}{click}$',
    '$\\includegraphics{https://example.invalid/image.png}$',
    '$\\htmlStyle{background:url(https://example.invalid)}{x}$',
    '$\\htmlId{malicious}{x}$',
    '$\\text{<img src=x onerror=alert(1)>}$',
  ])('rejects active user markup or trusted-only commands: %s', (formula) => {
    const html = createDocumentMathRenderer().inline(formula);
    expect(html).not.toMatch(/<(?:script|img|iframe|a)\b/i);
    expect(html).not.toMatch(/(?:href|src)=["'](?:javascript:|https:)/i);
    expect(html).not.toContain('id="malicious"');
    expect(html).not.toContain('style="background:url');
  });
  it('escapes ordinary HTML beside rendered expressions and prohibits network resources', () => {
    const html = renderDocument({
      title: '<script>x</script>',
      content: '$x=4$\n<img src=x onerror=alert(1)>\n<iframe>unsafe</iframe>',
    });
    expect(html).not.toMatch(/<(?:script|img|iframe)\b/);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('font-src data:');
    expect(html).toContain("default-src 'none'");
    expect(katexExportCss.match(/data:font\/woff2;base64,/g)).toHaveLength(20);
    expect(katexExportCss).not.toMatch(/url\((?!data:)/);
    expect(html).not.toMatch(/<script\b|<link\b/);
  });
  it('keeps macro definitions isolated between formulas and bounds recursive expansion', () => {
    const renderer = createDocumentMathRenderer();
    renderer.inline('$\\gdef\\mycosmos{73}\\mycosmos$');
    const unrelated = renderer.inline('$\\mycosmos$');
    expect(unrelated).toContain('\\mycosmos');
    expect(unrelated).not.toContain('>73<');
    expect(renderer.inline('$\\def\\loop{\\loop}\\loop$')).toBe('$\\def\\loop{\\loop}\\loop$');
  });
  it('preserves oversized and excess expressions as escaped source', () => {
    const oversized = '$' + 'x'.repeat(DOCUMENT_MATH_LIMITS.expression + 1) + '$';
    expect(createDocumentMathRenderer().inline(oversized)).toBe(oversized);
    const renderer = createDocumentMathRenderer();
    for (let i = 0; i < DOCUMENT_MATH_LIMITS.expressions; i++) renderer.inline('$x$');
    expect(renderer.inline('$y$ <script>')).toBe('$y$ &lt;script&gt;');
  });
  it('actually writes HTML with math while Markdown/TXT/DOCX retain textual exports', async () => {
    const documentsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cosmos-math-export-'));
    try {
      const content = '# Дроби\nФормула: $\\frac{3}{8}$.\nМоя запись.';
      for (const format of ['html', 'md', 'txt', 'docx']) {
        const result = await exportDocument(
          { title: 'Дроби', subject: 'math', content, format },
          { documentsDir },
        );
        expect(result.ok).toBe(true);
        const bytes = await fs.readFile(result.path);
        expect(bytes.length).toBeGreaterThan(50);
        if (format === 'html') expect(bytes.toString()).toContain('class="katex"');
        else if (format === 'docx') expect(bytes.subarray(0, 2).toString()).toBe('PK');
        else expect(bytes.toString()).toContain('$\\frac{3}{8}$');
      }
    } finally {
      await fs.rm(documentsDir, { recursive: true, force: true });
    }
  });
});
