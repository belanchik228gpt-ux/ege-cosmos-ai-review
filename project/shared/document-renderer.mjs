import { documentTopics, topicIllustration } from './document-topics.mjs';
import {
  createDocumentMathRenderer,
  tokenizeDocumentMath,
  chunkMathParagraph,
  withoutDocumentEmphasis,
} from './document-math.mjs';
import { katexExportCss } from './katex-export-assets.mjs';
import { drawingPages, drawingPrintCss } from './document-scenes.mjs';

export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const plain = (value) =>
  String(value)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
const inline = (value) => escapeHtml(plain(value));
const linesHtml = (value, renderInline = inline) =>
  columnHtml(markdownBlocks(String(value)), renderInline);
const introHeading = /^#\s+[^\n]*\n?/;

/** Parse an editable Markdown section; unrecognised/oversize edits fall back to flowing text. */
export function extractTeachingSpread(content, topicId, scale = 'comfortable') {
  if (!documentTopics[topicId]) return null;
  const match = content.match(/(?:^|\n)## Учебный разворот\s*\n([\s\S]*?)(?=\n## |$)/);
  if (!match) return null;
  const segments = match[1].split(/^### /m);
  const explanation = segments.shift().trim();
  const fields = {},
    examples = [];
  for (const segment of segments) {
    const end = segment.indexOf('\n');
    if (end < 0) return null;
    const heading = segment.slice(0, end).trim(),
      text = segment.slice(end + 1).trim();
    if (/^Пример [1-3] · /.test(heading)) examples.push({ title: heading, text });
    else if (
      ['Определение', 'Полезный приём', 'Формула или вывод', 'Разобранные примеры'].includes(
        heading,
      ) &&
      !fields[heading]
    )
      fields[heading] = text;
    else return null;
  }
  // Long edits must remain readable: retain all text in normal paginated sections.
  const maxText = scale === 'large' ? 1550 : 2150;
  if (
    !explanation ||
    !fields['Определение'] ||
    !fields['Полезный приём'] ||
    !fields['Формула или вывод'] ||
    !fields['Разобранные примеры'] ||
    examples.length < 2 ||
    examples.length > 3 ||
    match[1].length > maxText ||
    explanation.length > 420 ||
    fields['Формула или вывод'].length > 160
  )
    return null;
  const estimateParagraphs = (text, chars = scale === 'large' ? 57 : 64) =>
    text
      .split(/\n+/)
      .filter((line) => line.trim())
      .reduce(
        (height, line) =>
          height + Math.ceil(line.length / chars) * (scale === 'large' ? 20 : 19) + 4,
        0,
      );
  const rightHeight =
    estimateParagraphs(fields['Определение']) +
    42 +
    estimateParagraphs(fields['Полезный приём']) +
    24 +
    estimateParagraphs(fields['Формула или вывод'], 44) +
    25 +
    examples.reduce(
      (height, example) =>
        height + estimateParagraphs(example.title) + estimateParagraphs(example.text) + 17,
      0,
    );
  if (rightHeight > 600) return null;
  return { explanation, fields, examples, remaining: content.replace(match[0], '\n') };
}

// Split only structural pipes. Pipes inside code, TeX or an escaped \| remain
// cell content. Every cell still passes through the safe inline renderer.
function tableCells(line) {
  const cells = [];
  let cell = '',
    separators = 0;
  for (const token of tokenizeDocumentMath(line.trim())) {
    if (token.type !== 'text') {
      cell += token.raw;
      continue;
    }
    for (let i = 0; i < token.raw.length; i++) {
      if (token.raw[i] === '\\' && ['|', '\\'].includes(token.raw[i + 1])) {
        cell += token.raw[i + 1];
        i++;
      } else if (token.raw[i] === '|') {
        cells.push(cell.trim());
        cell = '';
        separators++;
      } else cell += token.raw[i];
    }
  }
  cells.push(cell.trim());
  if (!separators) return null;
  if (cells[0] === '' && line.trim().startsWith('|')) cells.shift();
  if (cells.at(-1) === '' && /(?<!\\)\|\s*$/.test(line)) cells.pop();
  return cells;
}

function markdownBlocks(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(introHeading, '').split('\n');
  const blocks = [];
  let prose = [];
  const flush = () => {
    blocks.push(...proseBlocks(prose.join('\n')));
    prose = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^\s*(`{3,}|~{3,})[^`~]*$/);
    if (fence) {
      flush();
      const code = [];
      const close = new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`);
      while (++i < lines.length && !close.test(lines[i])) {
        // Keep code/ASCII diagrams literal and bound both dimensions for printing.
        const chars = Array.from(lines[i]);
        if (!chars.length) code.push('');
        for (let n = 0; n < chars.length; n += 56) code.push(chars.slice(n, n + 56).join(''));
      }
      for (let n = 0; n < code.length; n += 16)
        blocks.push({ type: 'code', text: code.slice(n, n + 16).join('\n') });
      continue;
    }
    const header = tableCells(lines[i]);
    const separator = header && tableCells(lines[i + 1] || '');
    if (
      !header ||
      header.length < 2 ||
      !separator ||
      separator.length !== header.length ||
      !separator.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      prose.push(lines[i]);
      continue;
    }
    const rows = [];
    let end = i + 2;
    for (; end < lines.length; end++) {
      const row = tableCells(lines[end]);
      // Malformed rows remain ordinary prose; values are never shifted or discarded.
      if (!row || row.length !== header.length) break;
      rows.push(row);
    }
    if (!rows.length) {
      prose.push(lines[i]);
      continue;
    }
    flush();
    blocks.push({
      type: 'table',
      text: lines.slice(i, end).join('\n'),
      header,
      rows,
      alignments: separator.map((cell) =>
        cell.startsWith(':') && cell.endsWith(':')
          ? 'center'
          : cell.endsWith(':')
            ? 'right'
            : 'left',
      ),
    });
    i = end - 1;
  }
  flush();
  return blocks;
}

function proseBlocks(content) {
  const result = [];
  let line = '';
  const flushLine = () => {
    if (line.trim() && !/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      const type = heading ? 'heading' : 'text';
      const list = heading
        ? undefined
        : /^\s*\d+[.)]\s+/.test(line)
          ? 'ordered'
          : /^\s*[-*]\s+/.test(line)
            ? 'unordered'
            : undefined;
      // Keep delimiters until rendering; split prose only between complete formulas.
      const text = heading ? heading[2] : line.replace(/^[-*]\s+/, '• ');
      chunkMathParagraph(text).forEach((part, index) =>
        result.push({ type: index === 0 ? type : 'text', text: part, ...(list ? { list } : {}) }),
      );
    }
    line = '';
  };
  for (const token of tokenizeDocumentMath(content)) {
    if (token.type === 'math' && token.display) {
      flushLine();
      result.push({ type: 'math', text: token.raw });
    } else {
      const parts = token.raw.split('\n');
      parts.forEach((part, index) => {
        if (index) flushLine();
        line += part;
      });
    }
  }
  flushLine();
  return result;
}

export function paginateText(content, scale = 'comfortable') {
  const perLine = scale === 'large' ? 48 : 60;
  const lineHeight = scale === 'large' ? 24 : 21;
  const capacity = 480;
  const blocks = markdownBlocks(content).flatMap((block) =>
    block.type === 'table' ? paginateTable(block, scale, capacity) : [block],
  );
  const height = (block) =>
    block.type === 'code'
      ? block.text.split('\n').length * 21 + 22
      : block.type === 'table'
        ? block.layoutHeight
        : block.type === 'math'
          ? displayMathHeight(block.text, scale)
          : block.type === 'heading'
            ? Math.ceil(block.text.length / (perLine * 0.85)) * (lineHeight + 2) + 18
            : Math.max(1, Math.ceil(block.text.length / perLine)) * lineHeight + 10;
  const columns = [];
  // Keep a short answer/checkpoint list together. Longer lists and personal notes
  // remain ordinary flowing blocks so they never overflow or lose their tail.
  const units = [];
  for (let index = 0; index < blocks.length; ) {
    const block = blocks[index];
    let end = index + 1;
    if (block.list) while (end < blocks.length && blocks[end].list === block.list) end++;
    const group = blocks.slice(index, end);
    const cost = group.reduce((sum, item) => sum + height(item), 0);
    if (block.list && group.length <= 8 && cost <= capacity * 0.65) units.push(group);
    else units.push(...group.map((item) => [item]));
    index = end;
  }
  const unitHeight = (unit) => unit.reduce((sum, block) => sum + height(block), 0);
  let column = [],
    used = 0;
  for (let index = 0; index < units.length; index++) {
    const unit = units[index],
      cost = unitHeight(unit);
    let keep = 0;
    if (unit.at(-1).type === 'heading') {
      // Reserve the whole next movable unit, not just three estimated lines:
      // otherwise its own pagination can strand this heading in the old column.
      for (let next = index + 1; next < units.length; next++) {
        keep += unitHeight(units[next]);
        if (units[next].at(-1).type !== 'heading') break;
      }
    }
    if (column.length && used + cost + keep > capacity) {
      columns.push(column);
      column = [];
      used = 0;
    }
    column.push(...unit);
    used += cost;
  }
  if (column.length) columns.push(column);
  const pages = [];
  for (let i = 0; i < columns.length; i += 2) pages.push([columns[i], columns[i + 1] || []]);
  return pages;
}

function displayMathHeight(text, scale) {
  const formula = tokenizeDocumentMath(text).find((token) => token.type === 'math')?.formula.trim();
  // In the 13/15px note columns a short, unstacked equation needs one line
  // plus its display margins, not the 72px allowance used for fractions.
  // Keep unfamiliar commands, nested expressions and long equations on the
  // conservative path; reducing their height could push content into the footer.
  if (formula && formula.length <= 64 && !/[\r\n]|\{[^{}]*\{/.test(formula)) {
    const visible = formula
      .replace(/\\(?:sqrt|text)\{([^{}]*)\}/g, '$1')
      .replace(/[{}^_]/g, '');
    if (!visible.includes('\\') && visible.length <= 32)
      return scale === 'large' ? 54 : 48;
  }
  return Math.max(72, (text.match(/\\frac|\\dfrac|\\\\/g)?.length || 0) * 20 + 55);
}

// Explicit row groups repeat the original header on each album column/page.
function tableWidths(block) {
  const count = block.header.length;
  const descriptiveFirst =
    count >= 5 && Math.max(block.header[0].length, ...block.rows.map((row) => row[0].length)) >= 10;
  return block.header.map((_, i) =>
    descriptiveFirst ? (i === 0 ? 24 : 76 / (count - 1)) : 100 / count,
  );
}

function paginateTable(block, scale, capacity) {
  const large = scale === 'large',
    font = large ? 14 : 12.3,
    line = large ? 22 : 19;
  const widths = tableWidths(block);
  const rowHeight = (row) =>
    Math.max(
      ...row.map((cell, index) => {
        const chars = Math.max(3, Math.floor(((500 * widths[index]) / 100 - 18) / (font * 0.6)));
        const tokens = tokenizeDocumentMath(cell);
        const length = tokens.reduce(
          (sum, t) =>
            sum + (t.type === 'math' ? Math.max(6, t.formula.length * 0.8) : t.raw.length),
          0,
        );
        const fraction = tokens.some(
          (t) => t.type === 'math' && /\\(?:d?frac|begin|sqrt)/.test(t.formula),
        );
        return Math.max(1, Math.ceil(length / chars)) * line + 18 + (fraction ? 28 : 0);
      }),
    );
  const headerHeight = rowHeight(block.header),
    result = [];
  let rows = [],
    used = headerHeight + 18;
  const flush = () => {
    if (!rows.length) return;
    result.push({
      ...block,
      rows,
      widths,
      layoutHeight: used,
      continued: result.length > 0,
      text: [block.header.join(' | '), ...rows.map((row) => row.join(' | '))].join('\n'),
    });
    rows = [];
    used = headerHeight + 18;
  };
  block.rows.forEach((row, index) => {
    const cost = rowHeight(row);
    if (block.header.length > 10 || headerHeight + cost + 18 > capacity) {
      // A single oversized cell must not be made unreadable by shrinking the font.
      // Preserve that record vertically with every column heading and formula.
      flush();
      result.push(...proseBlocks(`### Строка таблицы ${index + 1} · подробные значения`));
      row.forEach((cell, column) => {
        result.push(...proseBlocks(`### ${block.header[column]}`));
        result.push(...proseBlocks(cell || 'Пустая ячейка'));
      });
    } else {
      if (rows.length && used + cost > capacity) flush();
      rows.push(row);
      used += cost;
    }
  });
  flush();
  return result;
}

function tableHtml(block, renderInline) {
  const cell = (value, index, tag) =>
    `<${tag}${tag === 'th' ? ' scope="col"' : ''} style="text-align:${block.alignments[index]}">${renderInline(value)}</${tag}>`;
  return `<div class="document-table-block"><table class="document-table"><colgroup>${(block.widths || tableWidths(block)).map((width) => `<col style="width:${width}%">`).join('')}</colgroup><thead><tr>${block.header.map((value, i) => cell(value, i, 'th')).join('')}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((value, i) => cell(value, i, 'td')).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function columnHtml(blocks, renderInline) {
  return blocks
    .map((block) =>
      block.type === 'code'
        ? `<pre class="document-code"><code>${escapeHtml(block.text)}</code></pre>`
        : block.type === 'table'
          ? tableHtml(block, renderInline)
          : block.type === 'heading'
            ? `<h2>${renderInline(block.text)}</h2>`
            : block.type === 'math'
              ? `<div class="document-display-math">${renderInline(block.text)}</div>`
              : `<p>${renderInline(block.text)}</p>`,
    )
    .join('');
}

export function renderDocument(input) {
  const math = createDocumentMathRenderer();
  const inline = math.inline;
  const paragraphs = (value) => linesHtml(value, inline);
  const style = input.style === 'paper' ? 'paper' : 'cosmos';
  const scale = input.scale === 'large' ? 'large' : 'comfortable';
  const title = String(input.title || 'Учебный документ');
  const content = withoutDocumentEmphasis(String(input.content || ''));
  const topic = documentTopics[input.topicId];
  const spread = extractTeachingSpread(content, input.topicId, scale);
  const textPages = paginateText(spread ? spread.remaining : content, scale);
  const pages = [];
  if (spread) {
    const example = ({ title, text }) =>
      `<section class="example"><h3>${inline(title)}</h3>${paragraphs(text)}</section>`;
    pages.push({
      kind: 'teaching',
      body: `<div class="teaching-left"><div class="kicker">${inline(topic.subject)} · УЧЕБНЫЙ РАЗВОРОТ</div><h1>${inline(topic.title)}</h1><div class="illustration">${topicIllustration(input.topicId)}</div><div class="big-explanation">${paragraphs(spread.explanation)}</div><div class="material-label">${paragraphs(spread.fields['Разобранные примеры'])}</div></div><div class="teaching-right"><div class="rule"><div class="kicker">ОПРЕДЕЛЕНИЕ</div>${paragraphs(spread.fields['Определение'])}</div><div class="tip"><span>Полезный приём</span>${paragraphs(spread.fields['Полезный приём'])}</div><div class="formula">${inline(spread.fields['Формула или вывод'])}</div><div class="examples">${spread.examples.map(example).join('')}</div></div>`,
    });
  }
  for (const page of drawingPages(input.drawings, inline, paragraphs, { scale })) {
    if (page.content) {
      for (const columns of paginateText(page.content, scale))
        pages.push({
          kind: 'notes',
          body: `<div class="page-heading"><div class="kicker">ПОЯСНЕНИЕ К РИСУНКУ</div><h1>${inline(page.title)}</h1></div><div class="text-columns">${columns.map((column) => `<div class="text-column">${columnHtml(column, inline)}</div>`).join('')}</div>`,
        });
    } else pages.push(page);
  }
  textPages.forEach((columns, index) => {
    const first = !spread && index === 0;
    pages.push({
      kind: 'notes',
      body: `<div class="page-heading"><div class="kicker">${first ? 'ТВОЯ УЧЕБНАЯ БИБЛИОТЕКА' : 'ЗАНЯТИЕ · ЗАМЕТКИ · ИСТОЧНИКИ'}</div><h1>${inline(first ? title : topic?.title || 'Продолжение документа')}</h1></div><div class="text-columns">${columns.map((column) => `<div class="text-column">${columnHtml(column, inline)}</div>`).join('')}</div>`,
    });
  });
  if (!pages.length)
    pages.push({
      kind: 'notes',
      body: `<div class="page-heading"><div class="kicker">ТВОЯ УЧЕБНАЯ БИБЛИОТЕКА</div><h1>${inline(title)}</h1></div><p>Добавь содержание в редакторе.</p>`,
    });
  const mathCss = math.hasMath() ? katexExportCss : '';
  const css =
    drawingPrintCss +
    `
*{box-sizing:border-box}html{color-scheme:${style === 'paper' ? 'light' : 'dark'};background:#21172e}body{margin:0;font-family:'Segoe UI',Arial,sans-serif;color:var(--text);--page:#100b1c;--card:#1d142d;--text:#f1eaff;--muted:#bfafd4;--accent:#d1afff;--line:#4c375f;--cyan:#9fe1e8;--gold:#ffcf91}
.document-code{margin:0 0 10px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--cyan);white-space:pre-wrap;overflow-wrap:anywhere;font:12px/21px Consolas,monospace}.document-code code{font:inherit}
body.paper{--page:#fbf9fd;--card:#eee8f5;--text:#291b3e;--muted:#60506f;--accent:#633892;--line:#d1bfdf;--cyan:#246776;--gold:#765015}
.album-page{position:relative;width:1122px;height:793px;margin:28px auto;background:var(--page);padding:37px 43px 47px;overflow:visible;box-shadow:0 16px 65px #0005;break-after:page;page-break-after:always}
.album-page:last-child{break-after:auto;page-break-after:auto}.album-page:before{content:'';position:absolute;left:43px;right:43px;top:0;height:3px;background:linear-gradient(90deg,#9470d5,#e3b0ff,#76cbd8);opacity:.85}
.brand{height:32px;display:flex;align-items:start;justify-content:space-between;color:var(--muted);font-size:11px;letter-spacing:1.6px;border-bottom:1px solid var(--line);margin-bottom:24px}.brand b{color:var(--accent);letter-spacing:2.6px}.brand span{max-width:780px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.4px}
.page-body{height:612px}.teaching .page-body{display:grid;grid-template-columns:1fr 1.06fr;gap:32px}.kicker{font-size:10px;font-weight:700;letter-spacing:1.9px;color:var(--accent);margin:0 0 10px}
h1{font-size:32px;line-height:1.14;letter-spacing:-.65px;margin:0 0 20px;font-weight:650;overflow-wrap:anywhere}p{margin:0 0 8px;white-space:pre-wrap;overflow-wrap:anywhere}h2,h3{margin:0;font-weight:650;overflow-wrap:anywhere}
.illustration{width:100%;margin:18px 0 21px;border-radius:24px;border:1px solid var(--line);overflow:hidden}.illustration svg{width:100%;height:auto;display:block}
.big-explanation{font-size:16px;line-height:1.55;color:var(--text)}.material-label{font-size:11px;line-height:1.5;color:var(--muted);padding-top:12px;border-top:1px solid var(--line);margin-top:15px}
.teaching-right{font-size:12.6px;line-height:1.45}.rule{padding:14px 17px;background:var(--card);border:1px solid var(--line);border-radius:15px}.rule p:last-child,.tip p:last-child,.example p:last-child{margin-bottom:0}.rule .kicker{margin-bottom:7px}.tip{padding:10px 2px;color:var(--muted);font-size:11.8px}.tip span{font-weight:700;color:var(--cyan);display:block;margin-bottom:3px}.formula{border-left:3px solid var(--gold);padding:9px 13px;margin:1px 0 12px;background:var(--card);font-size:18px;line-height:1.3;color:var(--gold);font-weight:600;overflow-wrap:anywhere}
.examples{display:grid;gap:11px}.example{border-top:1px solid var(--line);padding:10px 0 0}.example h3{color:var(--accent);font-size:13px;line-height:1.35;margin-bottom:7px}.example p{margin-bottom:4px}.example p:last-child{color:var(--cyan);font-weight:600}
.page-heading{height:79px}.page-heading h1{font-size:24px;line-height:1.15;margin-bottom:14px}.text-columns{display:grid;grid-template-columns:1fr 1fr;gap:34px}.text-column{font-size:13px;line-height:21px;overflow-wrap:anywhere}.text-column h2{font-size:15px;line-height:23px;color:var(--accent);margin:0 0 9px;padding-top:8px;border-top:1px solid var(--line)}.text-column p{margin-bottom:10px}.text-column h2:not(:first-child){margin-top:11px}
.document-math{white-space:normal}.document-math .katex{font-size:1.12em;white-space:normal}.document-math .katex-display{margin:.45em 0;text-align:left}.document-math .katex-display>.katex{white-space:normal;text-align:left}.document-math .katex .base{margin-bottom:.2em}.document-math.display{display:block}.document-display-math{margin:4px 0 18px;line-height:1.5}.document-math .katex-error{color:var(--text)!important;font-family:inherit;white-space:pre-wrap;overflow-wrap:anywhere}
.document-table-block{margin:3px 0 15px;break-inside:avoid;page-break-inside:avoid}.document-table{border-collapse:collapse;table-layout:fixed;width:100%;font-size:12.3px;line-height:19px;overflow-wrap:anywhere}.document-table th,.document-table td{border:1px solid var(--line);padding:8px 8px;vertical-align:top;white-space:pre-wrap}.document-table th{background:var(--card);color:var(--accent);font-weight:650}.document-table tbody tr:nth-child(even){background:var(--card)}.document-table thead{display:table-header-group}.document-table tr{break-inside:avoid;page-break-inside:avoid}.document-table .document-math.display{margin:0}.document-table .katex-display{margin:.15em 0}.document-table .document-math .katex{font-size:1.02em}body.large .document-table{font-size:14px;line-height:22px}
.page-footer{position:absolute;left:43px;right:43px;bottom:22px;height:24px;padding-top:10px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:10px;color:var(--muted);letter-spacing:.7px}.page-footer strong{color:var(--accent)}
body.large .text-column{font-size:15px;line-height:24px}body.large .text-column h2{font-size:17px;line-height:26px}body.large .teaching-right{font-size:13.5px;line-height:1.48}body.large .big-explanation{font-size:17px}body.large .example h3{font-size:14px}body.large .tip{font-size:12.7px}
@page{size:A4 landscape;margin:0}@media print{html,body{margin:0;background:var(--page);-webkit-print-color-adjust:exact;print-color-adjust:exact}.album-page{width:297mm;height:210mm;margin:0;box-shadow:none}}
@media screen and (max-width:1150px){.album-page{zoom:calc((100vw - 24px) / 1122px);margin:18px auto}}
`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(title)}</title><style>${mathCss}\n${css}</style></head><body class="${style} ${scale}">${pages.map((page, index) => `<section class="album-page ${page.kind}" aria-label="Страница ${index + 1}"><header class="brand"><b>EGE / COSMOS</b><span>${inline(title)}</span></header><main class="page-body">${page.body}</main><footer class="page-footer"><span>УЧЕБНЫЙ АЛЬБОМ · АВТОРСКИЙ МАТЕРИАЛ И ЛИЧНЫЕ ЗАМЕТКИ</span><strong>${String(index + 1).padStart(2, '0')} / ${String(pages.length).padStart(2, '0')}</strong></footer></section>`).join('')}</body></html>`;
}
