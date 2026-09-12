import { describe, it, expect } from 'vitest';
import { paginateText, renderDocument } from '../shared/document-renderer.mjs';

describe('literal school code and ASCII diagrams in exported documents', () => {
  it('keeps indentation and HTML literal without printing fences or parsing table/math syntax', () => {
    const content =
      'До\n```text\n  F → [m]\n<script>alert(1)</script>\n| a | b |\n|---|---|\n| $x$ | 2 |\n```\nПосле';
    const html = renderDocument({ title: 'Проверка', content });
    expect(html).toContain('<pre class="document-code"><code>  F → [m]');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('```text');
    expect(html).not.toContain('<table');
    expect(html).toContain('$x$');
    expect(html).toContain('После');
  });
  it('paginates long code without dropping its final lines', () => {
    const lines = Array.from({ length: 150 }, (_, i) => `  print(${i})`);
    const pages = paginateText('~~~python\n' + lines.join('\n') + '\n~~~');
    const blocks = pages.flat(2);
    expect(blocks.map((b: { text: string }) => b.text).join('\n')).toBe(lines.join('\n'));
    expect(pages.length).toBeGreaterThan(2);
    expect(blocks.every((b: { text: string }) => b.text.split('\n').length <= 16)).toBe(true);
  });
});
