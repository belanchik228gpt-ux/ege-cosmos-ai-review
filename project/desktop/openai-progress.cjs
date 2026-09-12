// Parse only JSON syntax; never eval, repair, or execute generated data. A valid
// prefix may expose top-level `text`, but the complete reply remains authoritative.
function extractPartialTutorText(raw) {
  if (typeof raw !== 'string' || raw.length > 32000) return { valid: false, text: '' };
  let at = 0,
    text = '',
    found = false,
    textClosed = false;
  const incomplete = Symbol('incomplete'),
    invalid = Symbol('invalid');
  const space = () => {
    while (/[\x20\t\r\n]/.test(raw[at] || '\0')) at++;
  };
  const expect = (char) => {
    if (at >= raw.length) throw incomplete;
    if (raw[at++] !== char) throw invalid;
  };
  const string = (capture = false) => {
    expect('"');
    let value = '';
    if (capture) {
      found = true;
      text = '';
    }
    while (at < raw.length) {
      let char = raw[at++];
      if (char === '"') {
        if (capture) textClosed = true;
        return value;
      }
      if (char.charCodeAt(0) < 32) throw invalid;
      if (char === '\\') {
        if (at >= raw.length) throw incomplete;
        char = raw[at++];
        if (char === 'u') {
          const digits = raw.slice(at, at + 4);
          if (!/^[0-9a-f]*$/i.test(digits)) throw invalid;
          if (digits.length < 4) throw incomplete;
          char = String.fromCharCode(parseInt(digits, 16));
          at += 4;
        } else {
          const escaped = {
            '"': '"',
            '\\': '\\',
            '/': '/',
            b: '\b',
            f: '\f',
            n: '\n',
            r: '\r',
            t: '\t',
          };
          if (!Object.hasOwn(escaped, char)) throw invalid;
          char = escaped[char];
        }
      }
      value += char;
      if (capture) {
        if (value.length > 16000) throw invalid;
        text = value;
      }
    }
    throw incomplete;
  };
  const value = (depth = 0) => {
    if (depth > 12) throw invalid;
    space();
    if (at >= raw.length) throw incomplete;
    const char = raw[at];
    if (char === '"') {
      string();
      return;
    }
    if (char === '{') {
      object(depth + 1);
      return;
    }
    if (char === '[') {
      at++;
      space();
      if (raw[at] === ']') {
        at++;
        return;
      }
      while (true) {
        value(depth + 1);
        space();
        if (at >= raw.length) throw incomplete;
        if (raw[at] === ']') {
          at++;
          return;
        }
        expect(',');
        space();
      }
    }
    if (char === '-' || /[0-9]/.test(char)) {
      const rest = raw.slice(at),
        token = rest.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)?.[0];
      if (!token) {
        if (rest === '-') throw incomplete;
        throw invalid;
      }
      at += token.length;
      // An unfinished exponent/fraction is a valid prefix, but not a complete value.
      if (/^[.eE+-]/.test(raw[at] || '')) {
        const pending = raw.slice(at);
        if (/^(?:\.|[eE][+-]?)$/.test(pending)) throw incomplete;
        throw invalid;
      }
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      const rest = raw.slice(at);
      if (rest.startsWith(literal)) {
        at += literal.length;
        return;
      }
      if (literal.startsWith(rest)) throw incomplete;
    }
    throw invalid;
  };
  const object = (depth, root = false) => {
    expect('{');
    space();
    if (raw[at] === '}') {
      at++;
      return;
    }
    const keys = new Set();
    while (true) {
      const key = string();
      if (keys.has(key)) throw invalid;
      keys.add(key);
      space();
      expect(':');
      space();
      if (root && key === 'text') string(true);
      else value(depth);
      space();
      if (at >= raw.length) throw incomplete;
      if (raw[at] === '}') {
        at++;
        return;
      }
      expect(',');
      space();
    }
  };
  let complete = false;
  try {
    space();
    object(0, true);
    space();
    if (at !== raw.length) throw invalid;
    complete = true;
  } catch (error) {
    if (error !== incomplete) return { valid: false, text: '' };
  }
  // Withhold a split high surrogate; reject malformed pairs rather than emitting
  // replacement characters or half an emoji into the student's temporary answer.
  let visible = '';
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 === text.length && !complete && !textClosed) break;
      const low = text.charCodeAt(++index);
      if (!(low >= 0xdc00 && low <= 0xdfff)) return { valid: false, text: '' };
      visible += text[index - 1] + text[index];
    } else if (code >= 0xdc00 && code <= 0xdfff) return { valid: false, text: '' };
    else visible += text[index];
  }
  return { valid: true, text: found ? visible : '', complete };
}
module.exports = { extractPartialTutorText };
