import type { Task } from './types';

export interface AnswerAssessment {
  status: 'correct' | 'incorrect' | 'ambiguous' | 'not-answer';
  feedback?: string;
  normalizedAnswer?: string;
}

export const normalizeAnswerText = (text: string) =>
  text
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[−–]/g, '-')
    .replace(/[«»“”"']/g, '')
    .trim()
    .replace(/[.!?;:]+$/g, '')
    .replace(/\s+/g, ' ');

/** A small arithmetic grammar. Student input is never passed to eval or Function. */
export function parseAnswerNumber(input: string): number | undefined {
  if (input.length > 160) return undefined;
  const text = input
    .replace(/[×·⋅∙]/g, '*')
    .replace(/[÷:]/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/,/g, '.');
  const tokens = text.match(/(?:\d+(?:\.\d+)?|\.\d+)|[()+*/-]/g) ?? [];
  if (!tokens.length || tokens.length > 96 || tokens.join('') !== text.replace(/\s/g, ''))
    return undefined;
  let position = 0;
  let operations = 0;
  let invalid = false;
  const atom = (depth: number): number => {
    if (depth > 12 || position >= tokens.length) {
      invalid = true;
      return 0;
    }
    const token = tokens[position++];
    if (token === '+' || token === '-') {
      if (++operations > 32) invalid = true;
      return (token === '-' ? -1 : 1) * atom(depth + 1);
    }
    if (token === '(') {
      const value = sum(depth + 1);
      if (tokens[position++] !== ')') invalid = true;
      return value;
    }
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) invalid = true;
    return Number(token);
  };
  const product = (depth: number): number => {
    let value = atom(depth);
    while (tokens[position] === '*' || tokens[position] === '/') {
      if (++operations > 32) invalid = true;
      const operation = tokens[position++];
      const other = atom(depth);
      value = operation === '*' ? value * other : value / other;
    }
    return value;
  };
  const sum = (depth: number): number => {
    let value = product(depth);
    while (tokens[position] === '+' || tokens[position] === '-') {
      if (++operations > 32) invalid = true;
      const operation = tokens[position++];
      const other = product(depth);
      value = operation === '+' ? value + other : value - other;
    }
    return value;
  };
  const value = sum(0);
  return !invalid && position === tokens.length && Number.isFinite(value) ? value : undefined;
}

const close = (left: number, right: number) =>
  Math.abs(left - right) < 1e-10 * Math.max(1, Math.abs(right));
const result = (
  status: AnswerAssessment['status'],
  feedback?: string,
  normalizedAnswer?: string,
): AnswerAssessment => ({ status, feedback, normalizedAnswer });

function isReduced(text: string): boolean {
  const match = text.replace(/\s/g, '').match(/^([+-]?\d+)\/([+-]?\d+)$/);
  if (!match) return true;
  let a = Math.abs(Number(match[1]));
  let b = Math.abs(Number(match[2]));
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !b) return false;
  while (b) [a, b] = [b, a % b];
  return a === 1;
}

const unitPattern =
  /(?:квадратн(?:ый|ая|ое|ые|ых|ую|ыми|ого|ом)?\s+(?:сантиметр\p{L}*|метр\p{L}*|клет\p{L}*)|кубическ\p{L}*\s+(?:сантиметр\p{L}*|метр\p{L}*)|(?:кв\.?\s*)?(?:см|дм|мм|км|м)(?:\s*(?:\^?2|²|\^?3|³))?(?!\p{L})|сантиметр\p{L}*|метр\p{L}*|клет(?:ка|ки|ок|ку|ками|ках)|руб(?:лей|ля|ль|\.)?|процент\p{L}*|%|год(?:а|у|ом|ы|ов)?)(?!\p{L})/gu;

function unitKey(unit: string): string {
  if (/клет/.test(unit)) return 'cells';
  if (/год/.test(unit)) return 'year';
  if (/руб/.test(unit)) return 'money';
  if (/процент|%/.test(unit)) return 'percent';
  const dimension = /квадрат|кв\.|[2²]/.test(unit) ? '2' : /кубическ|[3³]/.test(unit) ? '3' : '1';
  const length = /см|сантиметр/.test(unit)
    ? 'cm'
    : /дм/.test(unit)
      ? 'dm'
      : /мм/.test(unit)
        ? 'mm'
        : /км/.test(unit)
          ? 'km'
          : 'm';
  return length + dimension;
}

function numericAssessment(task: Task, text: string): AnswerAssessment {
  const expected = parseAnswerNumber(task.answer);
  if (expected === undefined) return result('not-answer');
  // An explicit denial, alternatives or an approximation cannot confirm one exact answer.
  if (/(?:^|\s)(?:не|ни|нет)(?:\s|[,.:])/u.test(text))
    return result(
      'ambiguous',
      'Уточни свой окончательный ответ без отрицания: какое значение ты получил?',
    );
  if (/(?:^|\s)(?:или|либо|or)(?:\s|$)|≈|примерно|около/u.test(text))
    return result(
      'ambiguous',
      'Пока вижу несколько вариантов или приближение. Запиши один точный ответ.',
    );
  const units: string[] = [];
  const withoutUnits = text.replace(unitPattern, (unit, offset: number) => {
    // Do not strip the letter «м» from ordinary words or letters inside identifiers.
    if (offset > 0 && /\p{L}/u.test(text[offset - 1])) return unit;
    units.push(unitKey(unit));
    return ' ';
  });
  const expectedUnits = (task.accepted ?? []).flatMap((entry) =>
    [...normalizeAnswerText(entry).matchAll(unitPattern)].map((match) => unitKey(match[0])),
  );
  if (!expectedUnits.length && /сколько всего клеток|квадратн\p{L}* клет/iu.test(task.prompt))
    expectedUnits.push('cells');
  if (!expectedUnits.length && /(?:каком|какой) год|назови год/iu.test(task.prompt))
    expectedUnits.push('year');
  if (units.length && expectedUnits.length && units.some((unit) => !expectedUnits.includes(unit))) {
    return result(
      'incorrect',
      'Проверь единицы: они должны соответствовать величине, которую нужно найти.',
    );
  }
  const chunks: { text: string; start: number; end: number; value?: number }[] = [];
  const pattern = /[+-]?(?:\d+(?:[.,]\d+)?|\.\d+|\(\s*[+-]?\d)[\d\s.,+*/()×·⋅∙÷:-]*/gu;
  const remainder = withoutUnits.replace(pattern, (raw, offset: number) => {
    const part = raw
      .trim()
      .replace(/[.,:]+$/g, '')
      .trim();
    chunks.push({
      text: part,
      start: offset,
      end: offset + raw.length,
      value: parseAnswerNumber(part),
    });
    return ' ';
  });
  if (!chunks.length)
    return result('not-answer', 'Запиши числовой результат или короткое вычисление.');
  if (chunks.some((chunk) => chunk.value === undefined))
    return result(
      'ambiguous',
      'Не удалось однозначно разобрать вычисление. Запиши его, например, как 7 * 4 = 28.',
    );
  // Only familiar answer wording is accepted; a number embedded in an unrelated sentence is not a solution.
  const words = remainder
    .replace(/[=,.:;!?—–-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const answerWords =
    /^(?:я|думаю|считаю|получил|получила|получили|получается|получится|получилось|будет|вышло|итого|всего|ответ|результат|равно|равен|равна|равняется|это|что|то|есть|площадь|длина|ширина|высота|число|значение|x|х|s|a|b|в|году|составляет|должно|быть|наверное|квадратных|квадратные)$/u;
  if (words.some((word) => !answerWords.test(word)))
    return result(
      'not-answer',
      'Я вижу число, но не уверен, что это твой ответ. Напиши результат или равенство отдельно.',
    );
  const values = chunks.map((chunk) => chunk.value!);
  for (let index = 1; index < chunks.length; index++) {
    const between = withoutUnits.slice(chunks[index - 1].end, chunks[index].start);
    if (!/=/.test(between))
      return result(
        'ambiguous',
        'В сообщении несколько чисел. Свяжи вычисление знаком «=» или оставь один окончательный ответ.',
      );
    if (!close(values[index - 1], values[index]))
      return result(
        'incorrect',
        'В записанном равенстве левая и правая части дают разные значения. Пересчитай действие.',
      );
  }
  const final = chunks.at(-1)!;
  if (task.requireSimplified && !isReduced(final.text))
    return result(
      'incorrect',
      'Значение дроби можно проверить, но в этом задании её ещё нужно сократить.',
    );
  return close(final.value!, expected)
    ? result('correct', undefined, String(final.value))
    : result('incorrect');
}

/** Bounded checking of authored tasks, not a general natural-language or symbolic grader. */
export function assessAnswer(task: Task, input: string): AnswerAssessment {
  if (!input.trim() || input.length > 4000) return result('not-answer');
  const text = normalizeAnswerText(input);
  const candidates = [task.answer, ...(task.accepted ?? [])].map(normalizeAnswerText);
  if (candidates.includes(text) && (!task.requireSimplified || isReduced(text)))
    return result('correct', undefined, text);
  const gap = task.prompt.match(/[«“"]([^»”"]*…[^»”"]*)[»”"]/u)?.[1];
  if (gap) {
    const [before, after] = normalizeAnswerText(gap).split('…');
    if (text.startsWith(before) && text.endsWith(after)) {
      const supplied = text.slice(before.length, text.length - after.length).trim();
      if (candidates.includes(supplied)) return result('correct', undefined, supplied);
      if (supplied === 'не' || supplied === 'ни') return result('incorrect');
    }
  }
  if (task.kind === 'number') return numericAssessment(task, text);

  const isDecrease = /^(?:уменьшится|уменьшается|снизится|меньше)$/.test(
    normalizeAnswerText(task.answer),
  );
  if (isDecrease) {
    const positive = /(?:уменьш\p{L}*|сниз\p{L}*|меньше|маленьк\p{L}*)/u.test(text);
    const opposite = /(?:увелич\p{L}*|возраст\p{L}*|выраст\p{L}*|больше|большим|большой)/u.test(
      text,
    );
    if ((opposite && positive) || /(?:^|\s)(?:не|ни|нет|или|либо)(?:\s|[,.:]|$)/u.test(text))
      return result(
        'ambiguous',
        'Уточни одно направление: величина спроса станет больше или меньше?',
      );
    if (opposite) return result('incorrect');
    const remaining = text
      .replace(/(?:уменьш\p{L}*|сниз\p{L}*|меньше|маленьк\p{L}*)/gu, ' ')
      .replace(/[,.!?:—-]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const allowed =
      /^(?:спрос|величина|величину|спроса|он|она|будет|станет|становится|должен|должна|стать|думаю|я|что|ответ|это|то|есть|наверно|наверное|при|росте|цены)$/u;
    if (positive && remaining.every((word) => allowed.test(word))) {
      return result(
        'correct',
        /спрос/u.test(task.prompt) && /спрос|маленьк/u.test(text)
          ? 'Точнее: уменьшается величина спроса — количество, которое готовы купить при данной цене. Это движение по кривой.'
          : undefined,
        task.answer,
      );
    }
  }
  const unwrapped = text
    .replace(
      /^(?:(?:я\s+)?(?:думаю|считаю),?\s+(?:что\s+)?|(?:мой\s+)?ответ\s*[:—-]?\s*|это\s+)/u,
      '',
    )
    .trim();
  if (candidates.includes(unwrapped)) return result('correct', undefined, unwrapped);
  if (/\?|(?:^|\s)(?:или|либо)(?:\s|$)/u.test(text))
    return result(
      'ambiguous',
      'Сформулируй один окончательный ответ; если нужна помощь, можно попросить подсказку.',
    );
  return /\s/.test(text)
    ? result(
        'not-answer',
        'Я не уверен, что правильно понял формулировку. Назови сам ответ одной короткой фразой; это уточнение не считается ошибкой.',
      )
    : result('incorrect');
}
