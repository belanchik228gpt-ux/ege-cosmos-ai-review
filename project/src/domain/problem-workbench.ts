import { assessAnswer } from './answer-check';

/** Local, bounded mathematics. Text recognition and a model may propose text, never a trusted solution. */
export type ProblemKind =
  | 'arithmetic'
  | 'percent'
  | 'rectangle'
  | 'triangle'
  | 'linear'
  | 'absolute'
  | 'quadratic'
  | 'unsupported';
export type ProblemStep = {
  id: string;
  title: string;
  narration: string;
  durationMs: number;
  visual: string;
  formula?: string;
};
export type ProblemSpec = {
  id: string;
  subject: 'math';
  originalText: string;
  confirmedText: string;
  kind: ProblemKind;
  parameters: Record<string, number | string | number[]>;
  steps: ProblemStep[];
  expectedAnswer: string;
  explanation: string;
  question: string;
  verified: boolean;
  status: 'verified' | 'clarification';
};
type Q = { n: number; d: number };
type Poly = [Q, Q, Q];
type Calculation = { left: Q; right: Q; op: string; result: Q };
const LIMIT = 1e12;
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
function q(n: number, d = 1): Q {
  if (
    !Number.isSafeInteger(n) ||
    !Number.isSafeInteger(d) ||
    !d ||
    Math.abs(n) > LIMIT ||
    Math.abs(d) > LIMIT
  )
    throw Error('Числа выходят за пределы точной локальной проверки.');
  const factor = gcd(Math.abs(n), Math.abs(d));
  return { n: (n / factor) * Math.sign(d), d: Math.abs(d) / factor };
}
const add = (a: Q, b: Q): Q => q(a.n * b.d + b.n * a.d, a.d * b.d);
const neg = (a: Q): Q => q(-a.n, a.d);
const mul = (a: Q, b: Q): Q => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q): Q => q(a.n * b.d, a.d * b.n);
const value = (a: Q) => a.n / a.d;
const z = () => q(0);
const constant = (a: Q): Poly => [a, z(), z()];
const nonconstant = (p: Poly) => !!(p[1].n || p[2].n);
function decimal(s: string): Q {
  if (!/^-?\d{1,13}(?:\.\d{1,6})?$/.test(s))
    throw Error('Уточни запись числа: поддерживаются до шести знаков после запятой.');
  const digits = s.split('.')[1]?.length || 0;
  return q(Number(s.replace('.', '')), 10 ** digits);
}
function polyMultiply(a: Poly, b: Poly): Poly {
  const out = [z(), z(), z(), z(), z()];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) out[i + j] = add(out[i + j], mul(a[i], b[j]));
  if (out[3].n || out[4].n)
    throw Error('Локальная проверка поддерживает уравнения не выше второй степени.');
  return out.slice(0, 3) as Poly;
}
/** Recursive descent, no eval/Function and no symbol execution. */
function polynomial(source: string, allowX = false, trace?: Calculation[]): Poly {
  if (source.length > 180) throw Error('Раздели длинное выражение на несколько шагов.');
  if (/\d\s+\d/.test(source)) throw Error('Между числами нужен знак действия.');
  const clean = source.replace(/\s+/g, '');
  let tokens: string[] = clean.match(/\d+(?:\.\d+)?|[x+*/^()\-]/g) || [];
  if (tokens.join('') !== clean || !tokens.length || tokens.length > 100)
    throw Error('Не удалось однозначно прочитать выражение.');
  if (!allowX && tokens.includes('x')) throw Error('Для неизвестного x укажи полное уравнение.');
  // Conventional implicit multiplication: 2x, 2(...), (...)(...), x(...).
  tokens = tokens.flatMap((token, index) => {
    const next = tokens[index + 1];
    return next &&
      ((/^(?:\d|x|\))/.test(token) && /^(?:x|\()$/.test(next)) ||
        (token === ')' && /^\d/.test(next)))
      ? [token, '*']
      : [token];
  });
  let at = 0;
  const take = (s: string) => (tokens[at] === s ? (at++, true) : false);
  let depth = 0;
  function atom(): Poly {
    if (++depth > 20) throw Error('Слишком много вложенных скобок.');
    let result: Poly;
    if (take('(')) {
      result = sum();
      if (!take(')')) throw Error('Проверь парные скобки.');
    } else if (take('x')) result = [z(), q(1), z()];
    else {
      const token = tokens[at++];
      if (!token || !/^\d/.test(token)) throw Error('После знака нужно число или выражение.');
      result = constant(decimal(token));
    }
    depth--;
    return result;
  }
  function power(): Poly {
    let p = atom();
    if (take('^')) {
      const exponent = tokens[at++];
      if (!/^[0-6]$/.test(exponent || '')) throw Error('Поддерживаются целые степени от 0 до 6.');
      const base = p;
      p = constant(q(1));
      for (let n = 0; n < Number(exponent); n++) p = polyMultiply(p, base);
      if (trace && !nonconstant(base))
        trace.push({ left: base[0], right: q(Number(exponent)), op: '^', result: p[0] });
    }
    return p;
  }
  function unary(): Poly {
    if (take('+')) return unary();
    if (take('-')) return unary().map(neg) as Poly;
    return power();
  }
  function product(): Poly {
    let p = unary();
    while (tokens[at] === '*' || tokens[at] === '/') {
      const op = tokens[at++],
        other = unary(),
        before = p;
      if (op === '*') p = polyMultiply(p, other);
      else {
        if (nonconstant(other))
          throw Error(
            'Деление на выражение с x требует отдельного разбора области допустимых значений.',
          );
        p = p.map((a) => div(a, other[0])) as Poly;
      }
      if (trace && !nonconstant(before) && !nonconstant(other))
        trace.push({ left: before[0], right: other[0], op, result: p[0] });
    }
    return p;
  }
  function sum(): Poly {
    let p = product();
    while (tokens[at] === '+' || tokens[at] === '-') {
      const op = tokens[at++],
        other = product(),
        before = p;
      p = p.map((a, i) => add(a, op === '+' ? other[i] : neg(other[i]))) as Poly;
      if (trace && !nonconstant(before) && !nonconstant(other))
        trace.push({ left: before[0], right: other[0], op, result: p[0] });
    }
    return p;
  }
  const result = sum();
  if (at !== tokens.length) throw Error('Уточни знаки между числами и выражениями.');
  return result;
}
function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/[×·⋅]/g, '*')
    .replace(/÷|:/g, '/')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/х/g, 'x')
    .replace(/(\d),(\d)/g, '$1.$2')
    .trim();
}
export function formatProblemNumber(n: number): string {
  return (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(6))))
    .replace('-', '−')
    .replace('.', ',');
}
const exact = (a: Q) =>
  a.d === 1 ? formatProblemNumber(a.n) : `${formatProblemNumber(a.n)}/${a.d}`;
const display = (s: string) =>
  s
    .replace(/\s*\*\s*/g, ' · ')
    .replace(/-/g, '−')
    .replace(/\./g, ',')
    .replace(/\^2/g, '²');
function idFor(s: string) {
  let hash = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `problem-${(hash >>> 0).toString(16)}`;
}
function step(title: string, narration: string, visual: string, formula?: string): ProblemStep {
  return { id: '', title, narration, visual, formula, durationMs: 4100 };
}
function build(
  originalText: string,
  confirmedText: string,
  kind: ProblemKind,
  parameters: ProblemSpec['parameters'],
  steps: ProblemStep[],
  expectedAnswer: string,
  question: string,
): ProblemSpec {
  return {
    id: idFor(confirmedText),
    subject: 'math',
    originalText,
    confirmedText,
    kind,
    parameters,
    steps: steps.map((s, i) => ({ ...s, id: `step-${i + 1}` })),
    expectedAnswer,
    explanation: steps.map((s) => s.narration).join(' '),
    question,
    verified: true,
    status: 'verified',
  };
}
function clarify(originalText: string, question: string): ProblemSpec {
  return {
    id: idFor(originalText),
    subject: 'math',
    originalText,
    confirmedText: originalText.trim(),
    kind: 'unsupported',
    parameters: {},
    steps: [],
    expectedAnswer: '',
    explanation: 'Решение ещё не проверено: сначала уточним условие.',
    question,
    verified: false,
    status: 'clarification',
  };
}
function cleanExpression(s: string) {
  return s
    .replace(
      /^(?:пожалуйста[, ]*|реши(?:те)?\s*(?:уравнение)?\s*|вычисли(?:те)?\s*|посчитай\s*|сократи\s+дробь\s*|найди(?:те)?\s*(?:значение\s*(?:выражения)?)?\s*|сколько(?:\s+будет)?\s*)+/g,
      '',
    )
    .replace(/[?.;!]+$/g, '')
    .trim();
}
function geometry(original: string, s: string): ProblemSpec | undefined {
  const kind = /прямоугольник/.test(s)
    ? 'rectangle'
    : /треугольник/.test(s)
      ? 'triangle'
      : undefined;
  if (!kind) return undefined;
  const cells =
    kind === 'rectangle' &&
    /клеток\s+в\s+каждом\s+ряду/.test(s) &&
    /сколько\s+всего\s+клеток/.test(s);
  if (!cells && !/площад|\bs\s*=/.test(s))
    return clarify(
      original,
      'Что нужно найти: площадь, периметр или другую величину? Напиши это вместе с размерами.',
    );
  if (
    /площад[ьи]\s+(?:(?:прямоугольника|треугольника)\s+)?\d|найди\s+(?:ширину|длину|высоту|основание)/.test(
      s,
    )
  )
    return clarify(
      original,
      'В этой задаче неизвестен размер, а не площадь. Уточни известную площадь и нужную сторону: для такого обратного случая нужен отдельный разбор.',
    );
  if (/периметр|объ[её]м|диагонал|боков|гипотенуз/.test(s))
    return clarify(
      original,
      'Для этой сцены укажи только площадь: две стороны прямоугольника или основание и высоту треугольника.',
    );
  if (/отношени|соотношени|увелич|уменьш|больше|меньше|раза|раз\b/.test(s))
    return clarify(
      original,
      'Здесь размеры связаны дополнительным условием. Запиши уже известные длины отдельно, чтобы мы не приняли отношение за размер.',
    );
  if (
    kind === 'rectangle' &&
    !cells &&
    !/сторон|длин|ширин|размер|\ba\s*=|\bb\s*=|\d\s*(?:на|\*)\s*\d/.test(s)
  )
    return clarify(original, 'Уточни, что оба числа — длины соседних сторон прямоугольника.');
  const numberText = s.replace(/(мм|см|дм|км|м)\s*\^2/g, '$1');
  const lengths = [...numberText.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => decimal(m[0]));
  const all = lengths.map(value);
  if (all.length !== 2 || all.some((n) => n <= 0 || !Number.isFinite(n) || n > 1e6))
    return clarify(
      original,
      'Нужны ровно два положительных размера без готового ответа. Например: «Площадь прямоугольника со сторонами 7 и 4 см».',
    );
  if ((kind === 'triangle' && !/основан/.test(s)) || (kind === 'triangle' && !/высот/.test(s)))
    return clarify(
      original,
      'Укажи основание и высоту, проведённую именно к этому основанию. Двух произвольных сторон недостаточно.',
    );
  const units = [...s.matchAll(/(?:^|[\s\d])(мм|см|дм|км|м)(?![а-я])/g)].map((m) => m[1]);
  if (new Set(units).size > 1)
    return clarify(original, 'Приведи оба размера к одной единице измерения и уточни условие.');
  const unit = units[0] || 'ед.';
  let [a, b] = all;
  if (kind === 'triangle' && s.indexOf('высот') < s.indexOf('основан')) [a, b] = [b, a];
  const answerQ = div(mul(lengths[0], lengths[1]), q(kind === 'triangle' ? 2 : 1));
  const answer = value(answerQ);
  const A = formatProblemNumber(a),
    B = formatProblemNumber(b),
    R = exact(answerQ);
  const confirmed =
    kind === 'rectangle'
      ? `Найти площадь прямоугольника: a = ${A} ${unit}, b = ${B} ${unit}.`
      : `Найти площадь треугольника: основание a = ${A} ${unit}, высота h = ${B} ${unit}.`;
  return build(
    original,
    confirmed,
    kind,
    { a, b, unit, result: answer },
    [
      step(
        'Читаем условие',
        `${kind === 'rectangle' ? 'Две стороны' : 'Основание и высота'}: ${A} и ${B} ${unit}. Изображение построено по этим данным.`,
        'shape',
      ),
      step(
        kind === 'rectangle' ? 'Первая сторона' : 'Основание',
        `Выделим длину ${A} ${unit}.`,
        'base',
      ),
      step(
        kind === 'rectangle' ? 'Вторая сторона' : 'Высота к основанию',
        `${kind === 'rectangle' ? 'Поперечная сторона' : 'Перпендикуляр от вершины к линии основания'} равна ${B} ${unit}.`,
        'height',
      ),
      step(
        'Связываем размеры',
        kind === 'rectangle'
          ? 'Площадь равна произведению длин двух сторон. Сетка помогает увидеть строки и столбцы.'
          : 'Два одинаковых таких треугольника составляют параллелограмм с теми же основанием и высотой. Берём половину произведения.',
        'grid',
        kind === 'rectangle' ? 'S = a · b' : 'S = a · h / 2',
      ),
      step(
        'Подставь свои числа',
        `Вычисли ${A} · ${B}${kind === 'triangle' ? ' / 2' : ''}. Сначала попробуй самостоятельно.`,
        'substitute',
        `S = ${A} · ${B}${kind === 'triangle' ? ' / 2' : ''}`,
      ),
      step(
        'Проверяем вычисление',
        `Площадь: ${R} ${unit === 'ед.' ? 'кв. ед.' : unit + '²'}. Проверка использует именно размеры из условия.`,
        'result',
        `S = ${R} ${unit === 'ед.' ? 'кв. ед.' : unit + '²'}`,
      ),
    ],
    R,
    `Какова площадь ${kind === 'rectangle' ? 'прямоугольника' : 'треугольника'} с размерами ${A} и ${B} ${unit}?`,
  );
}
function absolute(original: string, s: string): ProblemSpec {
  const match = s.match(/^\|([^|]+)\|\s*=\s*([^|=]+)$/);
  if (!match)
    return clarify(original, 'Запиши уравнение в виде |x − c| = r, например |x − 2| = 3.');
  const p = polynomial(match[1], true),
    r = polynomial(match[2]);
  if (p[2].n || value(p[1]) !== 1)
    return clarify(
      original,
      'Эта сцена пока проверяет модуль вида |x − c|. Для множителя перед x нужен отдельный разбор.',
    );
  const center = -value(p[0]),
    radius = value(r[0]);
  const roots = radius < 0 ? [] : radius === 0 ? [center] : [center - radius, center + radius];
  const C = formatProblemNumber(center),
    R = exact(r[0]);
  const expression = `|x ${center >= 0 ? '−' : '+'} ${formatProblemNumber(Math.abs(center))}| = ${R}`;
  const answer = roots.length ? roots.map(formatProblemNumber).join('; ') : 'нет решений';
  return build(
    original,
    expression,
    'absolute',
    { center, radius, roots },
    [
      step('Смысл модуля', 'Модуль разности показывает расстояние между двумя точками.', 'axis'),
      step('Найди центр', `В этом условии центр находится в точке ${C}.`, 'center'),
      step(
        'Проверь расстояние',
        radius < 0
          ? `Расстояние не бывает отрицательным, а справа ${R}.`
          : `Нужно отложить ${R} единиц от центра.`,
        'radius',
        expression,
      ),
      step(
        'Рассмотри направления',
        radius < 0
          ? 'Ни одной точки с отрицательным расстоянием не существует.'
          : radius === 0
            ? 'Нулевое расстояние оставляет нас в самом центре.'
            : 'При положительном расстоянии есть два направления: влево и вправо.',
        'candidates',
      ),
      step(
        'Прочитай координаты',
        roots.length ? `Получаем ${answer}.` : 'В действительных числах решений нет.',
        'result',
        roots.length ? `x = ${answer}` : 'Нет решений',
      ),
      step(
        'Проверь подстановкой',
        roots.length
          ? roots
              .map(
                (x) =>
                  `|${formatProblemNumber(x)} − (${C})| = ${formatProblemNumber(Math.abs(x - center))}`,
              )
              .join('; ')
          : 'Модуль всегда неотрицателен: отрицательная правая часть невозможна.',
        'verify',
        roots.length
          ? roots.map((x) => `|${formatProblemNumber(x)} − (${C})| = ${R}`).join('; ')
          : '|x − c| ≥ 0',
      ),
    ],
    answer,
    `Назови все действительные решения ${expression}.`,
  );
}
function equation(original: string, s: string): ProblemSpec {
  const sides = s.split('=');
  if (sides.length !== 2)
    return clarify(original, 'Нужно одно уравнение с одним знаком равенства.');
  const left = polynomial(sides[0], true),
    right = polynomial(sides[1], true);
  const coeff = left.map((a, i) => add(a, neg(right[i]))) as Poly;
  const [c, b, a] = coeff.map(value),
    quadratic = !!a;
  const kind = quadratic ? 'quadratic' : 'linear';
  const discriminant = quadratic
    ? value(add(mul(coeff[1], coeff[1]), neg(mul(q(4), mul(coeff[2], coeff[0])))))
    : 0;
  let roots: number[] = [],
    solution = 'finite';
  if (!a && !b) solution = c ? 'none' : 'all';
  else if (!a) roots = [-c / b];
  else if (discriminant < 0) solution = 'none';
  else if (!discriminant) roots = [-b / (2 * a)];
  else {
    const stable = -0.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(discriminant));
    roots = [...new Set([stable / a, c / stable])].sort((x, y) => x - y);
  }
  if (
    roots.some((x) => !Number.isFinite(x) || Math.abs(x) > 1e9 || (x !== 0 && Math.abs(x) < 1e-6))
  )
    throw Error(
      'Корни выходят за пределы надёжного числового отображения. Нужен отдельный точный разбор без округления.',
    );
  const answer =
    solution === 'all'
      ? 'любое действительное число'
      : solution === 'none'
        ? 'нет решений'
        : roots.map(formatProblemNumber).join('; ');
  const reduced = `${quadratic ? `${formatProblemNumber(a)}x² + ` : ''}${formatProblemNumber(b)}x + (${formatProblemNumber(c)}) = 0`;
  const formula = quadratic
    ? `D = b² − 4ac = ${formatProblemNumber(discriminant)}`
    : `${formatProblemNumber(b)}x = ${formatProblemNumber(-c)}`;
  return build(
    original,
    display(s),
    kind,
    { a, b, c, roots, solution, discriminant },
    [
      step(
        'Прочитай уравнение',
        'Равенство должно выполняться для одного и того же x с обеих сторон.',
        'equation',
        display(s),
      ),
      step(
        'Собери подобные',
        'Вычти правую часть из левой и собери коэффициенты при одинаковых степенях x.',
        'coefficients',
        reduced,
      ),
      step(
        quadratic ? 'Вычисли дискриминант' : 'Изолируй неизвестное',
        quadratic
          ? 'Знак дискриминанта определяет число действительных корней.'
          : b
            ? 'Перенеси свободный член; затем раздели обе части на ненулевой коэффициент при x.'
            : c
              ? 'Получилось неверное числовое равенство.'
              : 'Получилось тождество: равенство выполняется при любом x.',
        'method',
        formula,
      ),
      step(
        'Определи число решений',
        solution === 'all'
          ? 'Подходит любое действительное число.'
          : solution === 'none'
            ? 'Действительных решений нет.'
            : `Количество различных действительных корней: ${roots.length}.`,
        'candidates',
      ),
      step('Запиши ответ', answer, 'result', roots.length ? `x = ${answer}` : answer),
      step(
        'Проверь исходное равенство',
        roots.length
          ? 'Локальный вычислитель подставил каждый корень в исходные обе части. Для иррациональных корней на экране показано приближение до шести знаков.'
          : 'Проверены коэффициенты после переноса; деление на ноль не применялось.',
        'verify',
        roots.length
          ? `${roots.map((x) => `x = ${formatProblemNumber(x)}`).join('; ')} — проверено`
          : answer,
      ),
    ],
    answer,
    `Найди все действительные решения: ${display(s)}.`,
  );
}

/** Only supported, unambiguous input receives verified:true. Photo text enters this same function after user confirmation. */
export function parseProblem(text: string): ProblemSpec {
  const original = typeof text === 'string' ? text : '';
  if (!original.trim()) return clarify(original, 'Напиши выражение или условие задачи.');
  if (original.length > 1200 || /[<>{}\[\]`]|https?:\/\//i.test(original))
    return clarify(
      original.slice(0, 1200),
      'Пришли только математическое условие обычным текстом.',
    );
  if (
    /(?:вычисли(?:те)?|найди(?:те)?|реши(?:те)?)[\s\S]*[.\n]\s*(?:вычисли(?:те)?|найди(?:те)?|реши(?:те)?)/i.test(
      original,
    )
  )
    return clarify(
      original,
      'В записи несколько заданий. Оставь одно условие в поле — разберём его отдельно, затем перейдём к следующему.',
    );
  const normalized = normalize(original);
  try {
    const shape = geometry(original, normalized);
    if (shape) return shape;
    const s = cleanExpression(normalized);
    if (s.includes('|') && s.includes('=')) return absolute(original, s);
    const percent = s.match(
      /^(?:найди\s*)?(-?\d+(?:\.\d+)?)\s*(?:%|процент(?:а|ов)?)\s*от\s*(-?\d+(?:\.\d+)?)$/,
    );
    if (percent) {
      const rate = decimal(percent[1]),
        base = decimal(percent[2]),
        result = div(mul(rate, base), q(100));
      const P = formatProblemNumber(value(rate)),
        B = formatProblemNumber(value(base)),
        R = exact(result);
      if (value(rate) < 0 || value(base) < 0)
        return clarify(original, 'Уточни смысл отрицательного значения в процентной задаче.');
      return build(
        original,
        `${P}% от ${B}`,
        'percent',
        { rate: value(rate), base: value(base), result: value(result) },
        [
          step('Определи целое', `За 100% принято ${B}.`, 'whole'),
          step('Найди один процент', 'Один процент — одна сотая целого.', 'one', `1% = ${B} / 100`),
          step(
            'Выдели нужную долю',
            `Нужно взять ${P} таких сотых.`,
            'portion',
            `${P}% = ${P} / 100`,
          ),
          step(
            'Выполни умножение',
            'Сначала попробуй вычислить самостоятельно.',
            'substitute',
            `${B} · ${P} / 100`,
          ),
          step('Сверь результат', `Получено ${R}.`, 'result', `${P}% от ${B} = ${R}`),
        ],
        R,
        `Сколько составляет ${P}% от ${B}?`,
      );
    }
    if (s.includes('=')) return equation(original, s);
    const literalAbsolute = s.match(/^\|([^|x=]+)\|$/);
    const trace: Calculation[] = [];
    const rawResult = polynomial(literalAbsolute ? literalAbsolute[1] : s, false, trace)[0];
    if (trace.length > 16)
      return clarify(
        original,
        'Разделим длинное вычисление на части. Пришли одну часть выражения для пошагового разбора.',
      );
    const result = literalAbsolute ? q(Math.abs(rawResult.n), rawResult.d) : rawResult,
      R = exact(result);
    if (literalAbsolute)
      return build(
        original,
        display(s),
        'arithmetic',
        {
          expression: s.replace(/\s+/g, ''),
          result: value(result),
          numerator: result.n,
          denominator: result.d,
          absoluteValue: value(rawResult),
        },
        [
          step(
            'Модуль — это расстояние',
            'Нужна длина пути между точкой числа и нулём, а не направление движения.',
            'axis',
          ),
          step(
            'Отметь число',
            `Твоя точка имеет координату ${exact(rawResult)}. Ноль служит началом отсчёта.`,
            'point',
          ),
          step(
            'Измерь путь до нуля',
            'Расстояние не бывает отрицательным. Сосчитай длину выделенного отрезка.',
            'distance',
          ),
          step('Запиши длину', `Расстояние равно ${R}.`, 'result', `${display(s)} = ${R}`),
          step(
            'Проверь смысл',
            'Модуль неотрицателен. Нулевое расстояние возможно только для самого нуля.',
            'verify',
            R,
          ),
        ],
        R,
        `Чему равно ${display(s)}?`,
      );
    const binary = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*\*\s*(-?\d+(?:\.\d+)?)\s*$/);
    return build(
      original,
      display(s),
      'arithmetic',
      {
        expression: s.replace(/\s+/g, ''),
        result: value(result),
        numerator: result.n,
        denominator: result.d,
        ...(binary ? { left: Number(binary[1]), right: Number(binary[2]) } : {}),
      },
      [
        step(
          'Прочитай выражение',
          `Вычисляем только твоё выражение: ${display(s)}.`,
          'expression',
          display(s),
        ),
        step(
          'Порядок действий',
          'Сначала скобки и степени; затем умножение и деление слева направо; после — сложение и вычитание.',
          'order',
        ),
        step(
          'Вычисляй по шагам',
          binary
            ? `${display(binary[1])} · ${display(binary[2])}: модель групп ниже показывает именно эти множители.`
            : 'Дроби считаются как точные отношения числителя и знаменателя, без раннего округления.',
          'groups',
          display(s),
        ),
        ...trace.map((action, i) => {
          const calculation = `${exact(action.left)} ${action.op === '*' ? '·' : action.op === '-' ? '−' : action.op} ${action.right.n < 0 ? `(${exact(action.right)})` : exact(action.right)} = ${exact(action.result)}`;
          return step(
            `Действие ${i + 1}`,
            calculation,
            i === trace.length - 1 ? 'result' : 'calculation',
            calculation,
          );
        }),
        step('Сверь вычисление', `Точный результат: ${R}.`, 'result', `${display(s)} = ${R}`),
        step(
          'Проверка результата',
          result.d === 1
            ? 'Получено целое число. Попробуй объяснить ход вычислений своими словами.'
            : `Дробь сокращена. Приближённо это ${formatProblemNumber(value(result))}; точный ответ — ${R}.`,
          'verify',
          R,
        ),
      ],
      R,
      `Чему равно ${display(s)}?`,
    );
  } catch (error) {
    return clarify(
      original,
      error instanceof Error ? error.message : 'Уточни математическую запись.',
    );
  }
}

/** Re-derive from the original condition. Untrusted JSON cannot change a side length or declare a result verified. */
export function verifyProblem(spec: ProblemSpec): { valid: boolean; reason?: string } {
  if (
    !spec ||
    spec.status !== 'verified' ||
    !spec.verified ||
    typeof spec.originalText !== 'string'
  )
    return { valid: false, reason: 'Нет проверенного условия.' };
  const local = parseProblem(spec.originalText);
  const same =
    local.verified &&
    [
      'id',
      'subject',
      'kind',
      'confirmedText',
      'parameters',
      'steps',
      'expectedAnswer',
      'question',
      'explanation',
    ].every(
      (key) =>
        JSON.stringify(local[key as keyof ProblemSpec]) ===
        JSON.stringify(spec[key as keyof ProblemSpec]),
    );
  if (!same)
    return {
      valid: false,
      reason: 'Числа или решение не совпадают с локально проверенным условием.',
    };
  if (spec.kind === 'linear' || spec.kind === 'quadratic') {
    const { a, b, c, roots } = spec.parameters;
    if (
      !Array.isArray(roots) ||
      roots.some(
        (x) =>
          Math.abs(Number(a) * x * x + Number(b) * x + Number(c)) >
          1e-8 *
            Math.max(1, Math.abs(Number(a) * x * x), Math.abs(Number(b) * x), Math.abs(Number(c))),
      )
    )
      return { valid: false, reason: 'Подстановка корней не прошла проверку.' };
  }
  return { valid: true };
}
export function validateProblemProposal(proposal: unknown, originalText: string): ProblemSpec {
  // A suggestion is only an interpretation of text; trusted numbers must be present in confirmed user input.
  const local = parseProblem(originalText);
  if (!local.verified) return local;
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal))
    return clarify(
      originalText,
      'Предложение модели не имеет допустимой структуры. Подтверди условие для локального разбора.',
    );
  const candidate = proposal as Partial<ProblemSpec>;
  if (
    (candidate.kind !== undefined && candidate.kind !== local.kind) ||
    (candidate.parameters !== undefined &&
      JSON.stringify(candidate.parameters) !== JSON.stringify(local.parameters)) ||
    (candidate.expectedAnswer !== undefined && candidate.expectedAnswer !== local.expectedAnswer)
  )
    return clarify(
      originalText,
      'Предложенные моделью числа или ответ расходятся с условием. Проверь распознанный текст и запусти локальный разбор.',
    );
  return local;
}
export function checkProblemAnswer(
  problem: ProblemSpec,
  input: string,
): { correct: boolean; feedback: string } {
  if (!verifyProblem(problem).valid)
    return {
      correct: false,
      feedback: 'Сначала нужно подтвердить условие и получить проверенный разбор.',
    };
  if (typeof input !== 'string' || input.length > 4000)
    return { correct: false, feedback: 'Запиши один ответ или короткое вычисление.' };
  const raw = normalize(String(input || '')).trim();
  const roots = problem.parameters.roots;
  if (Array.isArray(roots)) {
    if (problem.parameters.solution === 'all') {
      const correct =
        /^(?:любое (?:действительное )?число|все (?:действительные )?числа|любое x|r|ℝ)$/.test(raw);
      return {
        correct,
        feedback: correct
          ? 'Верно: равенство выполняется для любого действительного x.'
          : 'Проверь, не получилось ли тождество после переноса.',
      };
    }
    if (!roots.length) {
      const correct = /^(?:нет (?:решений|корней)|решений нет|корней нет|∅)$/.test(raw);
      return {
        correct,
        feedback: correct
          ? 'Верно: действительных решений нет.'
          : 'Проверь, возможно ли требуемое равенство в действительных числах.',
      };
    }
    try {
      const parts = raw
        .replace(/^(?:корни|решения|ответ)\s*[:/]?\s*/, '')
        .replace(/x(?:[12₁₂])?\s*=/g, '')
        .split(/;|\s+(?:и|или)\s+|,\s+/)
        .map((v) => v.trim())
        .filter(Boolean);
      const values = [...new Set(parts.map((p) => value(polynomial(p)[0])))].sort((a, b) => a - b);
      const correct =
        roots.length === values.length &&
        [...roots].sort((a, b) => a - b).every((r, i) => Math.abs(r - values[i]) <= 0.500001e-6);
      return {
        correct,
        feedback: correct
          ? 'Верно: названы все решения, подстановка подтверждает ответ.'
          : 'Проверь каждую координату подстановкой и учти все решения.',
      };
    } catch {
      return {
        correct: false,
        feedback: 'Запиши корни числами или дробями через точку с запятой. Например: −1; 5.',
      };
    }
  }
  try {
    const answer = polynomial(raw)[0],
      result = polynomial(normalize(problem.expectedAnswer))[0];
    const correct = BigInt(answer.n) * BigInt(result.d) === BigInt(result.n) * BigInt(answer.d);
    return {
      correct,
      feedback: correct
        ? 'Верно. Ответ совпадает с проверенным вычислением по твоему условию.'
        : 'Пока не совпало. Проверь числа из условия и порядок действий; ответ сцены относится только к этой задаче.',
    };
  } catch {
    const unit = String(problem.parameters.unit || '');
    const assessment = assessAnswer(
      {
        id: problem.id,
        prompt: problem.originalText,
        answer: problem.expectedAnswer,
        kind: 'number',
        accepted: unit && unit !== 'ед.' ? [`${problem.expectedAnswer} ${unit}²`] : [],
        hint: problem.question,
        explanation: problem.explanation,
      },
      input,
    );
    if (assessment.status !== 'correct')
      return {
        correct: false,
        feedback:
          assessment.feedback || 'Пока не совпало. Проверь число, единицы и записанное равенство.',
      };
    // The shared grader checks familiar wording and units. Recheck each numeric equality exactly:
    // its floating point tolerance must not accept a different large integer here.
    try {
      const withoutUnits = raw.replace(
        /(?:квадратн[а-я]*\s+|кв\.?\s*)?(?:сантиметр[а-я]*|метр[а-я]*|клет[а-я]*|руб[а-я]*|процент[а-я]*|ед\.?|см|мм|дм|км|м|%)(?:\s*\^?[23])?(?![а-я])/g,
        (unitText, offset: number) => (offset && /[а-яa-z]/.test(raw[offset - 1]) ? unitText : ' '),
      );
      const chunks =
        withoutUnits.match(/[+-]?(?:\d+(?:\.\d+)?|\(\s*[+-]?\d)[\d\s.+*/^()\-]*/g) || [];
      const expected = polynomial(normalize(problem.expectedAnswer))[0];
      const correct =
        chunks.length > 0 &&
        chunks.every((chunk) => {
          const answer = polynomial(chunk.trim().replace(/[.]+$/, ''))[0];
          return BigInt(answer.n) * BigInt(expected.d) === BigInt(expected.n) * BigInt(answer.d);
        });
      return {
        correct,
        feedback: correct
          ? 'Верно. И результат, и записанное вычисление совпадают с твоим условием.'
          : 'В вычислении есть неточность. Проверь каждую часть равенства без округления.',
      };
    } catch {
      return {
        correct: false,
        feedback: 'Уточни вычисление: можно написать «7 * 4 = 28» или один точный результат.',
      };
    }
  }
}
