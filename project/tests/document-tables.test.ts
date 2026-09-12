import { describe, expect, it } from 'vitest';
import { paginateText, renderDocument } from '../shared/document-renderer.mjs';

const temperatures = [
  '| Время | 6:00 | 9:00 | 12:00 | 15:00 | 18:00 | 21:00 |',
  '|---|---:|---:|---:|---:|---:|---:|',
  '| Температура, °C | −3 | 1 | 5 | 8 | 4 | −1 |',
].join('\n');
const tariffs = [
  '| Тариф | Прокат за час, руб. | Шлем на всё время, руб. |',
  '|---|---:|---:|',
  '| А | 180 | 100 |',
  '| Б | 210 | 0 |',
  '| В | 160 | 150 |',
].join('\n');

describe('editable document tables', () => {
  it.each(['comfortable', 'large'])(
    'keeps the real temperature header and values in one column at %s size',
    (scale) => {
      const content = '# Документ\n' + 'Предыдущая короткая строка.\n'.repeat(12) + temperatures;
      const columns = paginateText(content, scale).flat();
      const tableColumns = columns.filter((column) =>
        column.some((block) => block.type === 'table'),
      );
      expect(tableColumns).toHaveLength(1);
      const table = tableColumns[0].find((block) => block.type === 'table')!;
      expect(table.text).toContain('Время | 6:00 | 9:00 | 12:00 | 15:00 | 18:00 | 21:00');
      expect(table.text).toContain('Температура, °C | −3 | 1 | 5 | 8 | 4 | −1');
      const html = renderDocument({
        title: 'Таблицы',
        content: temperatures + '\n\n' + tariffs,
        scale: scale as 'comfortable' | 'large',
      });
      expect(html.match(/<table class="document-table">/g)).toHaveLength(2);
      expect(html.match(/<thead>/g)).toHaveLength(2);
      expect(html.match(/<td /g)).toHaveLength(16);
      expect(html).not.toContain('|---');
      expect(html).toContain('scope="col"');
      expect(html).toContain('>180</td>');
      expect(html).toContain('>150</td>');
    },
  );

  it.each(['comfortable', 'large'])(
    'repeats headers and preserves all rows of a multi-page table at %s size',
    (scale) => {
      const content =
        'Название | Значение\n:--- | ---:\n' +
        Array.from({ length: 55 }, (_, i) => `Строка_${i + 1} | Число_${i + 1}`).join('\n');
      const pages = paginateText(content, scale);
      expect(pages.length).toBeGreaterThan(2);
      const tables = pages.flat(2).filter((block) => block.type === 'table');
      expect(tables.length).toBeGreaterThan(4);
      for (const table of tables) expect(table.text.split('\n')[0]).toBe('Название | Значение');
      const html = renderDocument({
        title: 'Все строки',
        content,
        scale: scale as 'comfortable' | 'large',
      });
      expect(html.match(/<thead>/g)).toHaveLength(tables.length);
      for (let i = 1; i <= 55; i++) {
        expect(html.match(new RegExp(`>Строка_${i}</td>`, 'g'))).toHaveLength(1);
        expect(html.match(new RegExp(`>Число_${i}</td>`, 'g'))).toHaveLength(1);
      }
    },
  );

  it('preserves pipes in TeX, escaped content and code without introducing phantom columns', () => {
    const content =
      String.raw`| Выражение | Комментарий |
|---|---|
| $|x|=3$ | левая \| правая |
| $\frac{6}{24}=\frac{1}{4}$ | ` + '`a|b` |';
    const html = renderDocument({ title: 'Формулы', content });
    expect(html.match(/<td /g)).toHaveLength(4);
    expect(html).toContain('левая | правая');
    expect(html).toContain('a|b');
    expect(html).toContain('class="katex"');
    expect(html).toContain('mfrac');
  });

  it('escapes hostile headers and values and does not execute links, HTML or TeX extensions', () => {
    const content = String.raw`| <img src=x onerror=alert(1)> | " onclick="run() |
|---|---|
| <script>location=1</script> | $\href{javascript:alert(1)}{go}$ |`;
    const html = renderDocument({ title: 'Безопасная таблица', content });
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img ');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain(' onclick="run()');
  });

  it('does not lose malformed rows or interpret a table without a delimiter header', () => {
    const content =
      '| A | B |\n|---|---|\n| один | два |\n| лишняя | ячейка | сохранена |\n\nC | D\nтри | четыре';
    const html = renderDocument({ title: 'Неоднозначное редактирование', content });
    expect(html.match(/<table /g)).toHaveLength(1);
    expect(html).toContain('лишняя | ячейка | сохранена');
    expect(html).toContain('три | четыре');
  });

  it('retains very long cell text and whole formulas as labelled flowing records', () => {
    const note = 'Подробное рассуждение без потери слов. '.repeat(70) + 'КОНЕЦ_ЯЧЕЙКИ';
    const content = `| Название | Содержание |\n|---|---|\n| Личная запись | ${note} $\\frac{6}{24}=\\frac{1}{4}$ |`;
    const pages = paginateText(content, 'large');
    const text = pages
      .flat(2)
      .map((block) => block.text)
      .join(' ');
    expect(pages.length).toBeGreaterThan(1);
    expect(text).toContain('подробные значения');
    expect(text.match(/Подробное рассуждение без потери слов/g)).toHaveLength(70);
    expect(text).toContain('КОНЕЦ_ЯЧЕЙКИ');
    expect(text).toContain('$\\frac{6}{24}=\\frac{1}{4}$');
  });

  it('keeps fenced table examples as text instead of interpreting them as data', () => {
    const html = renderDocument({ title: 'Markdown', content: '```text\n' + tariffs + '\n```' });
    expect(html).not.toContain('<table ');
    expect(html).toContain('180');
    expect(html).toContain('150');
  });
});
