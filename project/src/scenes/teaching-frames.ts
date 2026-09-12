import {
  isTeachingVisual,
  teachingStages,
  type TeachingStage,
  type TeachingVisual,
} from '../domain/teaching-visual';
import type { LessonScene } from './types';

export const teachingNumber = (n: number): string =>
  String(Number(n.toPrecision(6)))
    .replace('-', '−')
    .replace('.', ',');
const n = teachingNumber;
export function modulusExpression(center: number) {
  return center === 0 ? '|x|' : `|x ${center < 0 ? '+' : '−'} ${n(Math.abs(center))}|`;
}
export function teachingRoots(v: TeachingVisual): number[] | undefined {
  if (!['root-count', 'zero-root', 'negative-radius', 'shifted-modulus'].includes(v.kind))
    return undefined;
  const p = v as Extract<TeachingVisual, { center: number }>;
  const r = p.kind === 'zero-root' ? 0 : p.radius;
  return r < 0 ? [] : r === 0 ? [p.center] : [p.center - r, p.center + r];
}
export function teachingConclusion(v: TeachingVisual): string {
  const roots = teachingRoots(v);
  if (roots) {
    if (!roots.length) return 'Корней нет: расстояние не бывает отрицательным';
    if (v.kind === 'root-count' || v.kind === 'zero-root')
      return `${roots.length === 1 ? 'Один различный корень' : 'Два различных корня'}: ${roots.map(n).join('; ')}`;
    if (v.kind === 'shifted-modulus' && v.focus !== 'both' && v.focus)
      return `x = ${n(v.focus === 'smaller' ? roots[0] : roots.at(-1)!)}`;
    return `x = ${roots.map(n).join(' или ')}`;
  }
  if (v.kind === 'distance') return `Расстояние = ${n(Math.abs(v.value - (v.origin ?? 0)))}`;
  if (v.kind === 'subtraction')
    return `${n(v.start)} − (${n(v.subtract)}) = ${n(v.start - v.subtract)}`;
  if (v.kind === 'compare') {
    const left = typeof v.left === 'number' ? v.left : Math.sqrt(v.left.radicand);
    return `${typeof v.left === 'number' ? n(v.left) : `√${n(v.left.radicand)}`} ${left < v.right ? '<' : left > v.right ? '>' : '='} ${n(v.right)}`;
  }
  if (v.kind === 'sign') {
    const expression = `x ${v.offset < 0 ? '+' : '−'} ${n(Math.abs(v.offset))}`;
    if ((v.relation === 'lt' || v.relation === 'le') && v.boundary <= v.offset)
      return `${expression} ${v.relation === 'lt' || v.boundary < v.offset ? '<' : '≤'} 0`;
    if ((v.relation === 'gt' || v.relation === 'ge') && v.boundary >= v.offset)
      return `${expression} ${v.relation === 'gt' || v.boundary > v.offset ? '>' : '≥'} 0`;
    return 'Одного этого условия недостаточно для определения знака';
  }
  return v.kind === 'expression' ? v.lines.at(-1)!.text : '';
}

/** Deterministic positions for rendering and testing: progress has no hidden wall clock. */
export function teachingFrame(
  v: TeachingVisual,
  stage: TeachingStage,
  progress = 1,
  revealAnswer = false,
) {
  if (!isTeachingVisual(v)) throw new Error('Invalid teaching visual');
  const p = Math.max(0, Math.min(1, progress));
  const index = teachingStages.indexOf(stage);
  const roots = teachingRoots(v);
  let origin = 0,
    targets: number[] = [],
    starts: number[] = [],
    axisValues: number[] = [0];
  if (v.kind === 'distance') {
    origin = v.origin ?? 0;
    starts = [v.value];
    targets = [origin];
    axisValues = [0, origin, v.value];
  } else if (v.kind === 'subtraction') {
    origin = v.start;
    starts = [v.start];
    targets = [v.start - v.subtract];
    axisValues = [0, origin, ...targets];
  } else if (roots) {
    const item = v as Extract<TeachingVisual, { center: number }>;
    origin = item.center;
    const radius = item.kind === 'zero-root' ? 0 : item.radius;
    targets = roots.length === 1 ? [origin, origin] : roots;
    starts = radius === 0 ? [origin - 2, origin + 2] : targets.map(() => origin);
    axisValues = [0, origin, ...starts, ...targets];
  } else if (v.kind === 'compare') {
    targets = [typeof v.left === 'number' ? v.left : Math.sqrt(v.left.radicand), v.right];
    starts = [0, 0];
    axisValues = [0, ...targets];
  } else if (v.kind === 'sign') {
    origin = v.offset;
    const left = ['lt', 'le'].includes(v.relation);
    targets = [v.boundary + (left ? -2 : 2)];
    starts = [v.boundary];
    axisValues = [0, origin, v.boundary, ...targets];
  }
  const minValue = Math.min(...axisValues),
    maxValue = Math.max(...axisValues);
  const span = Math.max(4, maxValue - minValue),
    pad = span * 0.18;
  const middle = (minValue + maxValue) / 2;
  const min = middle - span / 2 - pad,
    max = middle + span / 2 + pad;
  const pointAt = (value: number) => 64 + ((value - min) / (max - min)) * 572;
  const positions = targets.map((target, i) =>
    index < 1 ? starts[i] : index === 1 ? starts[i] + (target - starts[i]) * p : target,
  );
  return {
    origin,
    targets,
    starts,
    positions,
    min,
    max,
    pointAt,
    roots,
    distinctCount: revealAnswer && index === 3 ? roots?.length : undefined,
    conclusion: revealAnswer && index === 3 ? teachingConclusion(v) : undefined,
  };
}

export function buildTeachingScene(
  v: TeachingVisual,
  revealAnswer: boolean,
  initialStage: TeachingStage = 'orient',
): LessonScene {
  if (!isTeachingVisual(v)) throw new Error('Invalid teaching visual');
  const roots = teachingRoots(v),
    negative = roots?.length === 0,
    zero = roots?.length === 1;
  let title = '',
    question = '',
    captions: string[] = [],
    headings: string[] = [],
    formulas: string[] = [];
  if (v.kind === 'distance') {
    const origin = v.origin ?? 0;
    title = 'Модуль — длина пути';
    question = `Какое расстояние между ${n(v.value)} и ${n(origin)}?`;
    headings = [
      'Найди две точки',
      'Пройди путь',
      'Отдели длину от направления',
      'Назови расстояние',
    ];
    captions = [
      `Точка ${n(v.value)} и точка отсчёта ${n(origin)} лежат на одной прямой.`,
      `Маркер движется от ${n(v.value)} к ${n(origin)}. Считаем длину пройденного пути.`,
      v.value === origin
        ? 'Начало и конец совпадают: никакого промежутка между ними нет.'
        : 'Движение влево или вправо меняет направление, но длина остаётся неотрицательной.',
      question,
    ];
  } else if (roots) {
    const item = v as Extract<TeachingVisual, { center: number }>,
      r = item.kind === 'zero-root' ? 0 : item.radius;
    title = negative
      ? 'Можно ли отложить отрицательное расстояние?'
      : zero
        ? 'Нулевое расстояние на прямой'
        : 'Точки на заданном расстоянии';
    question =
      v.kind === 'root-count' || v.kind === 'zero-root' || negative
        ? 'Сколько разных точек удовлетворяет этому условию?'
        : v.kind === 'shifted-modulus' && v.focus === 'smaller'
          ? 'Какова координата левой точки?'
          : v.kind === 'shifted-modulus' && v.focus === 'larger'
            ? 'Какова координата правой точки?'
            : 'Каковы координаты подходящих точек?';
    formulas = [`${modulusExpression(item.center)} = ${n(r)}`];
    headings = [
      'Определи центр',
      negative ? 'Проверь длину' : zero ? 'Уменьши длину до нуля' : 'Отложи расстояние',
      negative ? 'Сравни ограничения' : zero ? 'Посмотри, совпали ли точки' : 'Сравни координаты',
      'Сделай вывод',
    ];
    captions = [
      `Расстояние отсчитывается от точки ${n(item.center)}. Правая часть задаёт требуемую длину.`,
      negative
        ? 'Координата может быть отрицательной. Длина измеренного пути — нет: шкала расстояния начинается с нуля.'
        : zero
          ? 'Сокращаем длину двух направленных построений до нуля. Смотри, куда приходят маркеры.'
          : `Из центра откладываем ${n(r)} влево и столько же вправо.`,
      negative
        ? `Требуется длина ${n(r)}, но допустимые расстояния находятся по другую сторону нулевой границы.`
        : zero
          ? 'Сравни положения маркеров. Разные записи одного положения не создают разные точки.'
          : 'У обеих точек одинаковое расстояние до центра, но сравни их координаты.',
      question,
    ];
  } else if (v.kind === 'subtraction') {
    title = 'Вычитание на числовой прямой';
    question = `Чему равно ${n(v.start)} − (${n(v.subtract)})?`;
    headings = [
      'Поставь начальную точку',
      'Выбери направление',
      'Пройди нужную длину',
      'Прочитай координату',
    ];
    captions = [
      `Начинаем в точке ${n(v.start)}.`,
      v.subtract >= 0
        ? `Вычесть ${n(v.subtract)} — переместиться влево на эту длину.`
        : `Вычесть отрицательное число ${n(v.subtract)} — переместиться вправо на ${n(-v.subtract)}.`,
      'Направление задаётся действием, а ответом будет координата конца пути.',
      question,
    ];
    formulas = [`${n(v.start)} − (${n(v.subtract)})`];
  } else if (v.kind === 'sign') {
    title = 'Знак выражения из условия';
    const relation = { lt: '<', le: '≤', gt: '>', ge: '≥' }[v.relation];
    question = `Какой знак имеет x − (${n(v.offset)}) при x ${relation} ${n(v.boundary)}?`;
    headings = ['Прочитай ограничение', 'Размести x', 'Сравни с точкой отсчёта', 'Определи знак'];
    captions = [
      `Известно: x ${relation} ${n(v.boundary)}. Точное значение x не задано.`,
      'Выделенная область показывает допустимую сторону. Маркер x — условное положение, не конкретное число.',
      `Сравни x с ${n(v.offset)}: именно это число вычитается из x.`,
      question,
    ];
    formulas = [`x ${relation} ${n(v.boundary)}`, `x − (${n(v.offset)})`];
  } else if (v.kind === 'compare') {
    title = 'Сравнение на числовой прямой';
    question = `Сравни ${typeof v.left === 'number' ? n(v.left) : `√${n(v.left.radicand)}`} и ${n(v.right)}.`;
    headings = [
      'Найди опорные значения',
      'Размести числа',
      'Посмотри порядок точек',
      'Запиши сравнение',
    ];
    captions = [
      question,
      'Число с меньшей координатой находится левее. Точки рассчитаны из переданных значений.',
      'Для корня положение на рисунке приближённое; сравнение вычислено по исходным числам.',
      question,
    ];
  } else if (v.kind === 'expression') {
    title = 'Преобразование по шагам';
    question = 'Объясни, какое правило связывает записи.';
    headings = ['Прочитай запись', 'Выдели выражение', 'Примени правило', 'Проверь переход'];
    captions = [
      v.lines[0].explanation || 'Сначала читаем исходную запись целиком.',
      v.lines[Math.min(1, v.lines.length - 1)].explanation ||
        'Подсвеченная часть участвует в текущем преобразовании.',
      v.lines[Math.min(2, v.lines.length - 1)].explanation ||
        'Сопоставь новую запись с предыдущей. Знаки принадлежат своим слагаемым.',
      question,
    ];
  }
  const offset = Math.max(0, teachingStages.indexOf(initialStage));
  const steps = teachingStages.slice(offset).map((stage, i) => ({
    id: stage,
    title: headings[i + offset],
    narration: captions[i + offset],
    durationMs: stage === 'build' ? 4600 : stage === 'compare' ? 4200 : 3600,
    visualAction: stage,
    highlights: [],
    formula: stage === 'conclude' && revealAnswer ? teachingConclusion(v) : formulas[i + offset],
  }));
  return {
    id: `teaching:${JSON.stringify(v)}:${revealAnswer}:${initialStage}`,
    subject: 'math',
    topic: v.kind,
    title,
    eyebrow: 'Понимаем действие',
    autoplay: true,
    replayable: true,
    durationMs: steps.reduce((s, x) => s + x.durationMs, 0),
    steps,
    reducedMotionFrame: { step: 0, description: captions[offset] },
    question,
  };
}
