export interface AnswerReview {
  version: 1;
  status: 'scoped-checks' | 'no-claim-coverage' | 'conflict';
  durationMs: number;
  scope: string;
  checks: Array<{
    kind: string;
    expression: string;
    status: string;
    correction?: string;
    sourceUrl?: string;
  }>;
  references: Array<{ title: string; text: string; url: string }>;
}
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown, n = 700) => (typeof x === 'string' ? x.slice(0, n) : '');
const url = (x: unknown) => {
  try {
    const u = new URL(String(x));
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : undefined;
  } catch {
    return undefined;
  }
};
export function cleanAnswerReview(input: unknown): AnswerReview | undefined {
  if (
    !object(input) ||
    input.version !== 1 ||
    !['scoped-checks', 'no-claim-coverage', 'conflict'].includes(String(input.status)) ||
    typeof input.durationMs !== 'number' ||
    !Number.isFinite(input.durationMs) ||
    input.durationMs < 0
  )
    return;
  return {
    version: 1,
    status: input.status as AnswerReview['status'],
    durationMs: Math.min(input.durationMs, 60000),
    scope: text(input.scope),
    checks: Array.isArray(input.checks)
      ? input.checks
          .filter(object)
          .slice(0, 64)
          .map((c) => ({
            kind: text(c.kind, 40),
            expression: text(c.expression),
            status: text(c.status, 30),
            correction: text(c.correction) || undefined,
            sourceUrl: url(c.sourceUrl),
          }))
      : [],
    references: Array.isArray(input.references)
      ? input.references
          .filter(object)
          .filter((r) => url(r.url))
          .slice(0, 6)
          .map((r) => ({ title: text(r.title, 150), text: text(r.text, 1500), url: url(r.url)! }))
      : [],
  };
}
