/** Authored semantic input for local SVG renderers. No HTML, CSS or executable expressions. */
export type TeachingVisual = (
  | { kind: 'distance'; value: number; origin?: number }
  | { kind: 'root-count'; center: number; radius: number }
  | { kind: 'zero-root'; center: number }
  | { kind: 'negative-radius'; center: number; radius: number }
  | {
      kind: 'shifted-modulus';
      center: number;
      radius: number;
      focus?: 'both' | 'smaller' | 'larger';
    }
  | { kind: 'subtraction'; start: number; subtract: number }
  | { kind: 'sign'; boundary: number; relation: 'lt' | 'le' | 'gt' | 'ge'; offset: number }
  | {
      kind: 'expression';
      condition?: string;
      lines: Array<{ text: string; focus?: string; explanation?: string }>;
    }
  | { kind: 'compare'; left: number | { radicand: number }; right: number }
) & { workedExample?: boolean };

export type TeachingStage = 'orient' | 'build' | 'compare' | 'conclude';
export const teachingStages: TeachingStage[] = ['orient', 'build', 'compare', 'conclude'];

const number = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1000;
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= max &&
  !/[\u0000-\u001f]/.test(value) &&
  !/<\/?(?:script|style|div|span|img|iframe)\b/i.test(value);

/** Validates transport shape and bounds, not the truth of arbitrary authored expression lines. */
export function isTeachingVisual(raw: unknown): raw is TeachingVisual {
  if (!raw || typeof raw !== 'object') return false;
  const v = raw as Record<string, any>;
  if (v.workedExample !== undefined && typeof v.workedExample !== 'boolean') return false;
  switch (v.kind) {
    case 'distance':
      return number(v.value) && (v.origin === undefined || number(v.origin));
    case 'root-count':
      return number(v.center) && number(v.radius);
    case 'zero-root':
      return number(v.center);
    case 'negative-radius':
      return number(v.center) && number(v.radius) && v.radius < 0;
    case 'shifted-modulus':
      return (
        number(v.center) &&
        number(v.radius) &&
        v.radius >= 0 &&
        (v.focus === undefined || ['both', 'smaller', 'larger'].includes(v.focus))
      );
    case 'subtraction':
      return number(v.start) && number(v.subtract);
    case 'sign':
      return (
        number(v.boundary) && number(v.offset) && ['lt', 'le', 'gt', 'ge'].includes(v.relation)
      );
    case 'expression':
      return (
        (v.condition === undefined || text(v.condition, 100)) &&
        Array.isArray(v.lines) &&
        v.lines.length >= 1 &&
        v.lines.length <= 6 &&
        v.lines.every((line: unknown) => {
          if (!line || typeof line !== 'object') return false;
          const l = line as Record<string, unknown>;
          return (
            text(l.text, 64) &&
            (l.focus === undefined || (text(l.focus, 32) && l.text.includes(l.focus))) &&
            (l.explanation === undefined || text(l.explanation, 240))
          );
        })
      );
    case 'compare':
      return (
        number(v.right) &&
        (number(v.left) ||
          (v.left && typeof v.left === 'object' && number(v.left.radicand) && v.left.radicand >= 0))
      );
    default:
      return false;
  }
}
