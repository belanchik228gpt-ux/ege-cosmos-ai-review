import katex from 'katex';

export const DOCUMENT_MATH_LIMITS = Object.freeze({
  expression: 1200,
  expressions: 240,
  total: 40000,
});
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const plain = (value) => String(value).replace(/\*\*([^*]+)\*\*/g, '$1');

// Emphasis may span inline mathematics. Protect formula/code tokens before
// removing paired prose markers, so x_1 and literal multiplication stay intact.
export function withoutDocumentEmphasis(value) {
  const protectedTokens = [];
  const masked = tokenizeDocumentMath(value).map(token => {
    if (token.type === 'text') return token.raw;
    const index = protectedTokens.push(token.raw) - 1;
    return `\uE000${index}\uE001`;
  }).join('');
  return masked
    .replace(/(^|[\s([{])(\*{3}|\*{2}|__)(?=\S)([\s\S]*?\S)\2(?=$|[\s.,;:!?)}\]])/g, '$1$3')
    .replace(/(^|[\s([{])([*_])(?=\S)([^*\n]*?\S)\2(?=$|[\s.,;:!?)}\]])/g, '$1$3')
    .replace(/\uE000(\d+)\uE001/g, (raw, index) => protectedTokens[Number(index)] ?? raw);
}

/** Delimiters are parsed before escaping. Code spans and escaped dollar signs stay text. */
export function tokenizeDocumentMath(value) {
  const text = String(value),
    tokens = [];
  let start = 0,
    i = 0;
  const flush = (end) => {
    if (end > start) tokens.push({ type: 'text', raw: text.slice(start, end) });
  };
  while (i < text.length) {
    if (text[i] === '`') {
      const ticks = text.slice(i).match(/^`+/)[0],
        end = text.indexOf(ticks, i + ticks.length);
      if (end >= 0) {
        flush(i);
        tokens.push({
          type: 'code',
          raw: text.slice(i, end + ticks.length),
          text: text.slice(i + ticks.length, end),
        });
        i = start = end + ticks.length;
        continue;
      }
    }
    if (text[i] === '\\' && ['$', '\\', '`'].includes(text[i + 1])) {
      i += 2;
      continue;
    }
    let opening,
      closing,
      display = false;
    if (text.startsWith('\\[', i)) {
      opening = '\\[';
      closing = '\\]';
      display = true;
    } else if (text.startsWith('\\(', i)) {
      opening = '\\(';
      closing = '\\)';
    } else if (text.startsWith('$$', i)) {
      opening = closing = '$$';
      display = true;
    } else if (text[i] === '$' && text[i + 1] && !/\s/.test(text[i + 1])) {
      opening = closing = '$';
    }
    if (!opening) {
      i++;
      continue;
    }
    const from = i + opening.length;
    const search = text.slice(from, from + DOCUMENT_MATH_LIMITS.expression + closing.length + 1);
    let offset = search.indexOf(closing);
    while (offset >= 0 && search[offset - 1] === '\\')
      offset = search.indexOf(closing, offset + closing.length);
    const formula = offset >= 0 ? search.slice(0, offset) : '';
    if (
      offset < 0 ||
      !formula.trim() ||
      formula.length > DOCUMENT_MATH_LIMITS.expression ||
      (!display && formula.includes('\n'))
    ) {
      i += opening.length;
      continue;
    }
    flush(i);
    const end = from + offset + closing.length;
    tokens.push({ type: 'math', raw: text.slice(i, end), formula, display });
    i = start = end;
  }
  flush(text.length);
  return tokens;
}

/** One bounded renderer per document. No macro state survives between expressions. */
export function createDocumentMathRenderer() {
  let count = 0,
    characters = 0,
    rendered = false;
  const formula = (token) => {
    if (
      ++count > DOCUMENT_MATH_LIMITS.expressions ||
      (characters += token.formula.length) > DOCUMENT_MATH_LIMITS.total
    )
      return escape(token.raw);
    try {
      const html = katex.renderToString(token.formula, {
        displayMode: token.display,
        output: 'htmlAndMathml',
        trust: false,
        strict: 'ignore',
        throwOnError: false,
        maxSize: 12,
        maxExpand: 1000,
        macros: {},
      });
      // Invalid TeX remains editable source; do not expose parser stack/detail in tooltips.
      if (html.includes('class="katex-error"')) return escape(token.raw);
      rendered = true;
      return `<span class="document-math${token.display ? ' display' : ''}">${html}</span>`;
    } catch {
      return escape(token.raw);
    }
  };
  return {
    inline(value) {
      return tokenizeDocumentMath(withoutDocumentEmphasis(value))
        .map((token) =>
          token.type === 'math'
            ? formula(token)
            : escape(token.type === 'code' ? token.text : plain(token.raw)),
        )
        .join('');
    },
    hasMath: () => rendered,
  };
}

/** Keep a supported formula intact when long prose flows into another column. */
export function chunkMathParagraph(value, limit = 450) {
  const chunks = [];
  let chunk = '';
  const push = () => {
    if (chunk.trim()) chunks.push(chunk.trim());
    chunk = '';
  };
  for (const token of tokenizeDocumentMath(value)) {
    const parts = token.type !== 'text' ? [token.raw] : token.raw.match(/\S+\s*|\s+/g) || [];
    for (const part of parts) {
      if (token.type === 'text' && part.length > limit) {
        push();
        for (let i = 0; i < part.length; i += limit) chunks.push(part.slice(i, i + limit));
      } else {
        if (chunk.length + part.length > limit) push();
        chunk += part;
      }
    }
  }
  push();
  return chunks;
}
