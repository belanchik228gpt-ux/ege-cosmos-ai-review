import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { cleanAnswerReview } from '../src/domain/answer-review';
const require = createRequire(import.meta.url);
const { reviewAnswer, reviewContext } = require('../desktop/fast-answer-review.cjs');
const review = (text: string, subject = 'math') => reviewAnswer({ text }, { subject });
describe('mandatory bounded exact checks before publication', () => {
  const learningStep = {
    task: 'x² − 4x + 3 = 0',
    instruction: 'Вычисли дискриминант.',
    why: 'Дискриминант поможет найти корни.',
    stage: 'Ищем корни',
    recap: ['Ученик выбрал способ через дискриминант.'],
    memory: 'Ученик затруднился с двумя случаями равенства модулей.',
    plan: [{ id: 'roots', title: 'Найти корни', status: 'current' }],
    currentPlanId: 'roots',
  };
  it('preserves the current checkpoint with a correct discriminant solution and indexed roots', () => {
    const checkpoint = {
      ...learningStep,
      recap: ['D = (-4)^2 - 4*1*3 = 16-12 = 4.', 'x_1=(4+2)/2=3; x_2=(4-2)/2=1.'],
    };
    const r = reviewAnswer(
      { text: 'Теперь подставим корни в исходное уравнение.', learningStep: checkpoint },
      { subject: 'math' },
    );
    expect(r.learningStep).toEqual(checkpoint);
    expect(r.verification.status).toBe('scoped-checks');
    expect(r.verification.checks.every((c: { status: string }) => c.status === 'matched')).toBe(
      true,
    );
  });
  it.each(['task', 'instruction', 'why', 'stage'])(
    'withholds a checkpoint with a genuine numerical conflict in %s',
    (field) => {
      const r = reviewAnswer(
        { text: 'Продолжим этот шаг.', learningStep: { ...learningStep, [field]: '7*4=21' } },
        { subject: 'math' },
      );
      expect(r.verification.status).toBe('conflict');
      expect(r.learningStep).toBeUndefined();
      expect(r.text).not.toContain('7*4=21');
    },
  );
  it('checks claimed recap results but does not certify tentative memory or exercise content', () => {
    const wrong = reviewAnswer(
      { text: 'Проверим итог.', learningStep: { ...learningStep, recap: ['Получаем 7*4=21.'] } },
      { subject: 'math' },
    );
    expect(wrong.verification.status).toBe('conflict');
    expect(wrong.learningStep).toBeUndefined();
    const exercise = {
      ...learningStep,
      task: '7*4=21',
      instruction: 'Найди ошибку в равенстве.',
      memory: 'Ученик предположил: 7*4=21.',
    };
    const r = reviewAnswer({ text: 'Порассуждаем.', learningStep: exercise }, { subject: 'math' });
    expect(r.learningStep).toEqual(exercise);
    expect(r.verification.status).toBe('no-claim-coverage');
  });
  it('checks explicitly claimed atom balance in the current task without blocking a balancing exercise', () => {
    const input = { ...learningStep, task: 'H2+O2→H2O', instruction: 'Уравнено. Подсчитай атомы.' };
    const wrong = reviewAnswer(
      { text: 'Следим за атомами.', learningStep: input },
      { subject: 'chemistry' },
    );
    expect(wrong.verification.status).toBe('conflict');
    expect(wrong.learningStep).toBeUndefined();
    const exercise = { ...input, instruction: 'Подбери коэффициенты.' };
    expect(
      reviewAnswer({ text: 'Следим за атомами.', learningStep: exercise }, { subject: 'chemistry' })
        .learningStep,
    ).toEqual(exercise);
  });
  it.each([
    'x_1 = 3',
    'x_2 = 1',
    'x_{1} = 3',
    'x₁ = 3',
    'x2 = 1',
    'a_12 = 8',
    '1 = a_2',
    String.raw`\sqrt 4 = 2`,
    String.raw`\sqrt{4}+2=4`,
    '|-3|+1=4',
    '1=2\\pi',
  ])('never extracts arithmetic from an indexed or unsupported expression: %s', (text) => {
    const r = review(text);
    expect(r.text).toBe(text);
    expect(r.verification.status).toBe('no-claim-coverage');
  });
  it.each([
    'x_1 = (4+2)/2 = 3',
    'x_2 = (4-2)/2 = 1',
    String.raw`x_1 = \frac{4+2}{2} = 3`,
    String.raw`x_2 = \frac{4-2}{2} = 1`,
    'D=(-4)^2-4*1*3=16-12=4',
  ])(
    'preserves a correct discriminant solution and checks only complete numeric chain members: %s',
    (text) => {
      const r = review(text);
      expect(r.text).toBe(text);
      expect(r.verification.status).toBe('scoped-checks');
      expect(r.verification.checks.every((c: { status: string }) => c.status === 'matched')).toBe(
        true,
      );
    },
  );
  it('checks a genuinely wrong numeric chain member after an indexed root', () => {
    const r = review('x_1 = (4+2)/2 = 4');
    expect(r.verification.status).toBe('conflict');
    expect(r.verification.checks[0]).toMatchObject({
      expression: '(4+2)/2 = 4',
      correction: '(4+2)/2 = 3',
    });
  });
  it('does not replace a constant mismatch with a meaningless tautology', () => {
    const r = review('1 = 2');
    expect(r.verification.status).toBe('conflict');
    expect(r.text).not.toContain('1 = 1');
    expect(r.text).toContain('Левая часть равна 1, правая — 2');
  });
  it.each([
    '9007199254740993=9007199254740992',
    '0.12345678901234567=0.12345678901234568',
    '999999999*999999999=999999999*999999999',
  ])('does not certify numbers beyond supported precision: %s', (text) => {
    expect(review(text).verification.status).toBe('no-claim-coverage');
  });
  it.each([
    'Ученик спросил: «7 * 4 = 21».',
    'В конспекте цитата: "Северная война началась в 1701 году".',
    '> 7 * 4 = 21\nОбсудим эту запись.',
    '```text\n7*4=21\n```',
    'Ученик получил:\n7 * 4 = 21\nТеперь обсудим его ход решения.',
    'Найди ошибку:\n$$\n7 * 4 = 21\n$$',
    'Верно ли это равенство?\n7 * 4 = 21',
  ])('does not assert or reject quoted or exercise content: %s', (text) => {
    const r = review(text, 'history');
    expect(r.text).toBe(text);
    expect(r.verification.status).toBe('no-claim-coverage');
  });
  it('still checks a claim outside a quoted student mistake', () => {
    expect(review('Ученик написал «7*4=21». Получаем 7*4=29.').verification.status).toBe(
      'conflict',
    );
    expect(review('Ученик написал «7*4=21». Получаем 7*4=28.').verification.checks).toEqual([
      expect.objectContaining({ expression: '7*4 = 28', status: 'matched' }),
    ]);
  });
  it.each(['x +\n7 = 12', '2^\n3 = 8', '√\n9 = 3'])(
    'does not invent an equality from an unsupported split expression: %s',
    (text) => {
      expect(review(text).verification.status).toBe('no-claim-coverage');
    },
  );
  it.each(['1 +\n2 = 3', '1 /\n2 = 0.5', '$$\n7*4\n=28\n$$'])(
    'checks the whole arithmetic expression across layout breaks: %s',
    (text) => {
      expect(review(text).verification.status).toBe('scoped-checks');
    },
  );
  it('inherits the exercise context of a scene formula and checks a later asserted solution', () => {
    const result = {
      text: 'Порассуждаем.',
      scene: {
        steps: [
          { caption: 'Найди ошибку в равенстве.', formula: '7*4=21' },
          { caption: 'Исправленный результат.', formula: '7*4=28' },
        ],
      },
    };
    const r = reviewAnswer(result, { subject: 'math' });
    expect(r.scene).toEqual(result.scene);
    expect(r.verification.checks).toHaveLength(1);
    expect(r.verification.checks[0].expression).toBe('7*4 = 28');
  });
  it.each(['Уравнение не уравнено.', 'Это неуравненное уравнение.', 'Уравнено ли это уравнение?'])(
    'does not interpret a negative or questioned balance as a positive claim: %s',
    (caption) => {
      const r = reviewAnswer(
        { text: 'Подберём коэффициенты.', scene: { steps: [{ caption, formula: 'H2+O2→H2O' }] } },
        { subject: 'chemistry' },
      );
      expect(r.verification.status).toBe('no-claim-coverage');
      expect(r.scene).toBeDefined();
    },
  );
  it('checks balance explicitly asserted in the reply even without a scene', () => {
    expect(review('Уравнено:\nH2+O2→H2O', 'chemistry').verification.status).toBe('conflict');
    expect(review('Уравнено.\n2H2+O2→2H2O', 'chemistry').verification.status).toBe('scoped-checks');
  });
  it('keeps both wars and both directly coordinated date claims separate', () => {
    const text =
      'Крымская война началась в 1853 году и закончилась в 1856 году. Северная война (1700 — 1721).';
    expect(review(text, 'history').verification.checks).toHaveLength(3);
    expect(
      review('Северная война началась в 1700 году и закончилась в 1722 году.', 'history')
        .verification.status,
    ).toBe('conflict');
    expect(
      review(
        'Крымская война началась в 1853 году, осада Севастополя началась в 1854 году.',
        'history',
      ).verification.checks,
    ).toHaveLength(1);
  });
  it('does not certify tiny nonzero values or distinct integers as equal', () => {
    expect(review('0.00000000001=0').verification.status).toBe('conflict');
    expect(review('1000000000000000=1000000000000001').verification.status).toBe('conflict');
    expect(review('0.1+0.2=0.3').verification.status).toBe('scoped-checks');
  });
  it('finds specific civic aliases and supplies every source for a compound definition', () => {
    const registry = require('../shared/civics-terms.json');
    for (const phrase of ['прибыль', 'социальный статус']) {
      const r = review(`Объясню понятие ${phrase}.`, 'social');
      expect(r.verification.references.length).toBeGreaterThan(0);
      expect(r.verification.status).toBe('no-claim-coverage');
      const ref = r.verification.references[0],
        term = registry.terms.find((t: { term: string }) => t.term === ref.title);
      for (const id of term.sourceIds) {
        const url = registry.sources.find((s: { id: string }) => s.id === id).url;
        expect(r.verification.references.some((s: { url: string }) => s.url === url)).toBe(true);
        expect(reviewContext({ subject: 'social', instructions: phrase })).toContain(url);
      }
    }
  });
  it.each([
    '7 · 4 = 28',
    '12 / 3 = 4',
    '2 + 3 * 4 = 14',
    String.raw`\frac{12}{3} = 4`,
    '2,5 * 4 = 10',
  ])('checks supported equality %s', (text) => {
    const r = review(text);
    expect(r.text).toBe(text);
    expect(r.verification.status).toBe('scoped-checks');
  });
  it.each(['7 · 4 = 21', '8 / 0 = 4', '2 + 3 * 4 = 20'])(
    'withholds an explicit numeric error %s',
    (text) => {
      const r = review(text);
      expect(r.verification.status).toBe('conflict');
      expect(r.text).not.toContain(text);
      expect(r.phase).toBe('explain');
    },
  );
  it('checks scene formulas too and drops conflicting phase/summary/scene', () => {
    const r = reviewAnswer(
      {
        text: 'Посчитаем вместе.',
        phase: 'summary',
        summary: 'Всё освоено.',
        scene: { steps: [{ formula: '6 * 4 = 21', caption: 'Площадь' }] },
      },
      { subject: 'math' },
    );
    expect(r.verification.status).toBe('conflict');
    expect(r.scene).toBeUndefined();
    expect(r.summary).toBeUndefined();
  });
  it('checks claimed chemistry balance, preserves an unfinished exercise, and skips unsupported formulas', () => {
    const scene = (caption: string, formula: string) =>
      reviewAnswer(
        { text: 'Следим за атомами.', scene: { steps: [{ caption, formula }] } },
        { subject: 'chemistry' },
      );
    expect(scene('Уравнено: число атомов сохранено.', '2H2 + O2 → 2H2O').verification.status).toBe(
      'scoped-checks',
    );
    expect(scene('Уравнено: число атомов сохранено.', 'H2 + O2 → H2O').verification.status).toBe(
      'conflict',
    );
    expect(scene('Подбираем коэффициенты.', 'H2 + O2 → H2O').verification.status).toBe(
      'no-claim-coverage',
    );
    expect(scene('Уравнено.', 'Ca(OH)2 + 2HCl → CaCl2 + 2H2O').verification.status).toBe(
      'no-claim-coverage',
    );
  });
  it.each([
    'x + 7 = 12',
    '1 м = 100 см',
    '2^3=8',
    'Примерно 1/3 = 0,33',
    'Неверно: 7 * 4 = 21.',
    'Проверь равенство 7 * 4 = 21?',
    'Расскажу, что означает государство.',
  ])('does not pretend unsupported text is verified: %s', (text) => {
    const r = review(text);
    expect(r.text).toBe(text);
    expect(r.verification.status).toBe('no-claim-coverage');
  });
  it('checks explicitly named war start/end and avoids another event in same war', () => {
    expect(review('Крымская война началась в 1854 году.', 'history').verification.status).toBe(
      'conflict',
    );
    expect(review('Крымская война началась в 1853 году.', 'history').verification.status).toBe(
      'scoped-checks',
    );
    expect(
      review('В Крымской войне высадка союзников состоялась в 1854 году.', 'history').verification
        .status,
    ).toBe('no-claim-coverage');
    expect(review('Северная война (1700–1721).', 'history').verification.status).toBe(
      'scoped-checks',
    );
  });
  it('keeps exact review evidence across hydration and rejects unsafe links', () => {
    const r = review('3*4=12').verification;
    expect(cleanAnswerReview(r)).toMatchObject(r);
    expect(
      cleanAnswerReview({
        ...r,
        references: [{ title: 'fake', text: 'fake', url: 'javascript:alert(1)' }],
      })?.references,
    ).toEqual([]);
    expect(cleanAnswerReview({ ...r, durationMs: NaN })).toBeUndefined();
  });
  it('has bounded parsing work even for oversized hostile content', () => {
    const r = review('('.repeat(20000) + '1=2' + ')'.repeat(20000));
    expect(r.verification.durationMs).toBeLessThan(1000);
  });
});
