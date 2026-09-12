/** A deliberately small arithmetic grammar: no identifiers, exponentiation, or executable code. */
function arithmeticValue(input) {
  if (!input || input.length > 160) return { kind: 'unsupported' };
  const expression = input
    .replace(/[×·⋅∙]/gu, '*')
    .replace(/[÷:]/gu, '/')
    .replace(/[−–]/gu, '-');
  const tokens = expression.match(/\d+(?:[.,]\d+)?|[()+\-*/]|\S/gu) ?? [];
  if (tokens.length > 96 || tokens.filter((token) => /^[+\-*/]$/u.test(token)).length > 32)
    return { kind: 'unsupported' };
  let position = 0;
  let invalid = false;
  let nonFinite = false;
  const checked = (value) => {
    if (!Number.isFinite(value)) nonFinite = true;
    else if (Number.isInteger(value) && !Number.isSafeInteger(value)) invalid = true;
    return value;
  };
  const primary = (depth) => {
    if (depth > 12) {
      invalid = true;
      return 0;
    }
    const token = tokens[position++];
    if (token === '+' || token === '-') return (token === '-' ? -1 : 1) * primary(depth + 1);
    if (token === '(') {
      const value = sum(depth + 1);
      if (tokens[position++] !== ')') invalid = true;
      return value;
    }
    if (token && /^\d+(?:[.,]\d+)?$/u.test(token)) {
      // Do not certify equality after silently losing literal precision.
      if (/[.,]/.test(token) && token.replace(/[.,]/g, '').replace(/^0+/, '').length > 15)
        invalid = true;
      return checked(Number(token.replace(',', '.')));
    }
    invalid = true;
    return 0;
  };
  const product = (depth) => {
    let value = primary(depth);
    while (tokens[position] === '*' || tokens[position] === '/') {
      const operator = tokens[position++];
      const right = primary(depth);
      value = checked(operator === '*' ? value * right : value / right);
    }
    return value;
  };
  const sum = (depth) => {
    let value = product(depth);
    while (tokens[position] === '+' || tokens[position] === '-') {
      const operator = tokens[position++];
      const right = product(depth);
      value = checked(operator === '+' ? value + right : value - right);
    }
    return value;
  };
  const value = sum(0);
  if (invalid || position !== tokens.length) return { kind: 'unsupported' };
  return nonFinite ? { kind: 'non-finite' } : { kind: 'value', value };
}
const unitPattern =
  /(\d|\))(\s*)(км|см|мм|мкм|кг|мг|мл|руб(?:лей|ля|ль)?|коп(?:еек|ейки|ейка)?|м|г|л|ч|с)(?:[²³]|\^[23])?(?![\p{L}\p{N}])/giu;
function maskUnits(text) {
  // Preserve offsets. This permits numeric checks with common units, but does not
  // prove dimensional consistency or perform unit conversion (7 cm = 7 m is out of scope).
  return text.replace(
    unitPattern,
    (match, number) => number + ' '.repeat(match.length - number.length),
  );
}
function numericChar(text, index) {
  const character = text[index] ?? '';
  if (character === '.' || character === ',')
    return /\d/u.test(text[index - 1] ?? '') && /\d/u.test(text[index + 1] ?? '');
  return /^[\d+\-*/:×÷·⋅∙−–()% \t]$/u.test(character);
}
function checkArithmetic(text, onCheck = (_value) => {}) {
  // Bound parsing cost even if an imported transcript is unexpectedly large.
  const masked = maskUnits(text.slice(0, 20_000));
  let count = 0;
  for (let equal = masked.indexOf('='); equal !== -1; equal = masked.indexOf('=', equal + 1)) {
    if (++count > 64) break;
    if (/[!<>≈~]/u.test(masked[equal - 1] ?? '') || /[=>]/u.test(masked[equal + 1] ?? '')) continue;
    let start = equal - 1;
    while (start >= 0 && numericChar(masked, start)) start--;
    let end = equal + 1;
    while (end < masked.length && numericChar(masked, end)) end++;
    let left = masked.slice(start + 1, equal).trim();
    const right = masked.slice(equal + 1, end).trim();
    const prefix = masked.slice(0, start + 1);
    const suffix = masked.slice(end);
    const precedingWord = prefix.match(/([\p{L}]+)\s*$/u)?.[1];
    const labelled = left.startsWith(':') && precedingWord && precedingWord.length > 2;
    if (labelled) left = left.slice(1).trim();
    if (!left || !right) continue;
    // A subscript is part of an identifier, never a numeric operand: x_1 = 3
    // must not become 1 = 3. The same applies to fragments of absolute values,
    // indexed expressions and unsupported TeX commands. A later fully numeric
    // member of a chain (x_1 = (4+2)/2 = 3) can still be checked independently.
    if (/[_{\[\]}|\\]\s*$/u.test(prefix) || /^\s*[_{\[\]}|\\]/u.test(suffix)) continue;
    if (
      /\\[a-z]+\s*$/iu.test(prefix) ||
      /(?:^|[^\p{L}])(?:sqrt|sin|cos|tan|log|ln)\s*$/iu.test(prefix)
    )
      continue;
    // Do not isolate a numeric tail from x+7, 2^3, sqrt(9), or a natural-language
    // percent expression. Unsupported expressions must remain unjudged.
    if (/[%^√²³]$/u.test(prefix) || /^[%^√²³]/u.test(suffix)) continue;
    if (precedingWord && (/^[+\-*/:×÷·⋅∙−–]/u.test(left) || precedingWord.length <= 2)) continue;
    if (!labelled && /[\p{L}]$/u.test(prefix) && !/^\s/u.test(masked.slice(start + 1, equal)))
      continue;
    if (/^[\p{L}]/u.test(suffix) && !/\s$/u.test(masked.slice(equal + 1, end))) continue;
    if (/^\s*[\p{L}](?:\s|$|[+\-*/])/u.test(suffix)) continue;
    const nearby = text.slice(Math.max(0, start - 45), Math.min(text.length, end + 55));
    if (/≈|~|…|\.\.\.|округл|приблиз|примерно/iu.test(nearby)) continue;
    const units = new Set(
      [...text.slice(start + 1, end).matchAll(unitPattern)].map((match) =>
        match[3].toLocaleLowerCase('ru-RU'),
      ),
    );
    if (units.size > 1) continue; // A conversion such as 1 m = 100 cm is not 1 = 100.
    const a = arithmeticValue(left);
    const b = arithmeticValue(right);
    if (a.kind === 'unsupported' || b.kind === 'unsupported') continue;
    if (a.kind === 'non-finite' || b.kind === 'non-finite') {
      onCheck({
        expression: left + ' = ' + right,
        status: 'conflict',
        correction: 'Деление на ноль не определено.',
      });
      return 'non-finite-arithmetic';
    }
    // A fixed 1e-10 floor would certify a small nonzero number as zero.
    // Distinct integer results also must not become equal merely because their
    // magnitude makes a relative floating-point allowance exceed one.
    const tolerance =
      Number.isInteger(a.value) && Number.isInteger(b.value)
        ? 0
        : Number.EPSILON * 8 * Math.max(Math.abs(a.value), Math.abs(b.value));
    const wrong = Math.abs(a.value - b.value) > tolerance;
    onCheck({
      expression: left + ' = ' + right,
      status: wrong ? 'conflict' : 'matched',
      correction: wrong
        ? /^[-+]?\d+(?:[.,]\d+)?$/u.test(left)
          ? `Левая часть равна ${Number(a.value.toPrecision(12))}, правая — ${Number(b.value.toPrecision(12))}. Эти значения не равны.`
          : left + ' = ' + Number(a.value.toPrecision(12))
        : undefined,
    });
    if (wrong) return 'incorrect-numeric-equality';
  }
  return null;
}

module.exports = { checkArithmetic, arithmeticValue };
