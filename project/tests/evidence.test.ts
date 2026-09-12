import { describe, expect, it } from 'vitest';
import { topics } from '../src/domain';
import { sources } from '../src/domain/sources';
import {
  authoredEvidenceFallback,
  prepareTutorEvidence,
  reviewEvidenceNumbers,
  type TutorEvidenceFragment,
} from '../src/domain/evidence';

const rectangle = topics.find((topic) => topic.id === 'math-rectangle')!;
const baptism = topics.find((topic) => topic.id === 'history-baptism')!;
const reform = topics.find((topic) => topic.id === 'history-reform')!;

describe('bounded authored tutor evidence', () => {
  it('keeps a request for help finding one grammatical basis to one first step', () => {
    const topic = topics.find((item) => item.id === 'russian-commas')!;
    const fallback = authoredEvidenceFallback(
      'russian',
      'В предложении «Когда наступила весна, птицы вернулись» где основы? Помоги найти одну.',
      topic,
    );
    expect(fallback.text).toContain('Выдели одно слово');
    expect(fallback.text).not.toContain('обе');
    expect(fallback.text).not.toContain('весна наступила');
  });
  it('includes a declarative definition for a question about square centimetres', () => {
    const evidence = prepareTutorEvidence(
      'math',
      'Почему площадь измеряют в квадратных сантиметрах?',
      rectangle,
    );
    const units = evidence.find((fragment) => fragment.text.includes('Квадрат со стороной 1 см'));
    expect(units?.text).toContain('1 см² — квадратный сантиметр');
    expect(units?.sourceIds).toContain('cosmos-training');
    expect(units?.id).toBe('knowledge-math-area:explanation:3');
  });
  it('separates an exact publisher excerpt from an authored paragraph and curriculum references', () => {
    const evidence = prepareTutorEvidence('history', 'Крещение Руси', baptism);
    const publisher = evidence.find((fragment) => fragment.id.startsWith('source:'))!;
    expect(publisher.text).toBe('Датой крещения Киевской Руси считается 988 год');
    expect(publisher.sourceIds).toEqual(['history-baptism-source']);
    expect(evidence.some((fragment) => fragment.id.includes(':explanation:'))).toBe(true);
    expect(
      evidence.flatMap((fragment) => fragment.sourceIds).some((id) => id.startsWith('fipi-')),
    ).toBe(false);
  });
  it('provides subject-isolated registered evidence for every working lesson', () => {
    for (const topic of topics) {
      const evidence = prepareTutorEvidence(topic.subject, topic.title, topic);
      expect(evidence.length, topic.id).toBeGreaterThan(0);
      expect(evidence.length).toBeLessThanOrEqual(8);
      expect(
        evidence.reduce((total, fragment) => total + fragment.text.length, 0),
      ).toBeLessThanOrEqual(5000);
      expect(new Set(evidence.map((fragment) => fragment.id)).size).toBe(evidence.length);
      for (const fragment of evidence) {
        expect(fragment.text.length).toBeGreaterThan(10);
        expect(fragment.sourceIds.length).toBeGreaterThan(0);
        expect(
          fragment.sourceIds.every((id) =>
            sources.some((source) => source.id === id && source.subjects.includes(topic.subject)),
          ),
        ).toBe(true);
      }
    }
  });

  it('does not turn the room fallback or another subject into evidence for an uncovered question', () => {
    expect(prepareTutorEvidence('math', 'Как устроен бозон Хиггса?', rectangle)).toEqual([]);
    expect(prepareTutorEvidence('history', 'Площадь прямоугольника', rectangle)).toEqual([]);
    expect(
      prepareTutorEvidence(
        'russian',
        'Почему фотоны не имеют массы?',
        topics.find((topic) => topic.subject === 'russian')!,
      ),
    ).toEqual([]);
  });

  it('never treats a deliberately incorrect training premise as a verified quotation', () => {
    const evidence = prepareTutorEvidence('history', 'Крещение Руси', baptism);
    expect(evidence.some((fragment) => fragment.text.includes('Владимиром Святославичем'))).toBe(
      true,
    );
    expect(evidence.map((fragment) => fragment.text).join(' ')).not.toContain(
      'Ярослав Мудрый за один день',
    );
    evidence[0]!.sourceIds.push('not-a-source');
    expect(
      prepareTutorEvidence('history', 'Крещение Руси', baptism).flatMap(
        (fragment) => fragment.sourceIds,
      ),
    ).not.toContain('not-a-source');
  });

  it('gives an honest first-step fallback without revealing a requested answer', () => {
    const math = authoredEvidenceFallback(
      'math',
      'Не знаю, как найти площадь 7 на 3. Дай подсказку.',
      rectangle,
    );
    expect(math.text).toContain('не хватает подтверждения');
    expect(math.text).not.toMatch(/\b21\b|7\s*[·×*]\s*3/);
    expect(math.sourceIds.length).toBeGreaterThan(0);
    const history = authoredEvidenceFallback(
      'history',
      'Не помню дату Крещения Руси, не называя дату целиком.',
      baptism,
    );
    expect(history.text).not.toContain('988');
    expect(history.knowledgeIds).toContain('knowledge-history-baptism');
    const unknown = authoredEvidenceFallback('math', 'Кто открыл бозон Хиггса?', rectangle);
    expect(unknown.text).toContain('Уточни');
    expect(unknown.sourceIds).toEqual([]);
    expect(unknown.knowledgeIds).toEqual([]);
    expect(unknown.text).not.toContain('прямоугольник');
  });
});

describe('limited number and link review', () => {
  it('rejects links supplied by a model, even when their host is a real official source', () => {
    for (const reply of [
      'Открой https://fipi.ru/ege.',
      'Ссылка: fipi.ru/ege',
      'Материал на www.example.org',
      '[Справка](ftp://example.com/a)',
      'file:///C:/temp/a.pdf',
      'javascript:alert(1)',
      'http://127.0.0.1:8080',
      '127.0.0.1:8080/page',
      'история.рф',
    ])
      expect(reviewEvidenceNumbers('math', reply, []), reply).toEqual({
        accepted: false,
        reason: 'url-in-model-response',
      });
    expect(reviewEvidenceNumbers('math', '0.1 + 0.2 = 0.3; т. е. три десятых.', [])).toEqual({
      accepted: true,
      reason: null,
    });
  });

  it('permits an evidenced history year and rejects a new calendar date rather than trusting the model', () => {
    const evidence = prepareTutorEvidence('history', 'Отмена крепостного права', reform);
    expect(
      reviewEvidenceNumbers('history', 'Реформа 1861 года связана с Александром II.', evidence)
        .accepted,
    ).toBe(true);
    expect(reviewEvidenceNumbers('history', 'Реформа состоялась в 1905 году.', evidence)).toEqual({
      accepted: false,
      reason: 'unsupported-history-year',
    });
    expect(
      reviewEvidenceNumbers('history', 'В 1861–1905 годах происходили реформы.', evidence).accepted,
    ).toBe(false);
    expect(reviewEvidenceNumbers('history', 'Дату проверь: 1905.', []).accepted).toBe(false);
    expect(
      reviewEvidenceNumbers('history', 'В примере 2000 человек и 1500 солдат.', evidence).accepted,
    ).toBe(true);
  });

  it('does not use source publication metadata as evidence for an event date', () => {
    const evidence: TutorEvidenceFragment[] = [
      { id: 'fipi-2026', text: 'Князь принял христианство.', sourceIds: ['fipi-history-2026'] },
    ];
    expect(reviewEvidenceNumbers('history', 'Это произошло в 2026 году.', evidence).accepted).toBe(
      false,
    );
  });

  it('accepts new correctly derived mathematical numbers absent from the knowledge example', () => {
    const evidence = prepareTutorEvidence('math', 'Площадь прямоугольника', rectangle);
    for (const reply of [
      '7 · 3 = 21',
      '6/8 = 3/4',
      '100 * 1.2 = 120',
      '0,1 + 0,2 = 0,3',
      '−5 + 2 = −3',
      '(7 − 3) × 2 = 8',
      '(-2 + 3) / (4 - 2) = 0.5',
      'Площадь: 7 см × 3 см = 21 см².',
      '7:2 = 3,5.',
      'S = 7 * 3 = 21',
    ])
      expect(reviewEvidenceNumbers('math', reply, evidence), reply).toEqual({
        accepted: true,
        reason: null,
      });
  });

  it('rejects explicit wrong products, fractions, parentheses, signs and decimal results', () => {
    for (const reply of [
      '7 · 3 = 22',
      'Ответ: 7·3=22.',
      '6/8 = 3/5',
      '100 * 1.2 = 121',
      '0,1 + 0,2 = 0,4',
      '−5 + 2 = 3',
      '(7 − 3) × 2 = 9',
      '(-2 + 3) / (4 - 2) = 2',
      'Площадь: 7 см × 3 см = 22 см².',
      '7:2 = 3,6.',
      'S = 7 * 3 = 22',
      '7 * 3 = 21. 9 * 3 = 28.',
    ])
      expect(reviewEvidenceNumbers('math', reply, []), reply).toEqual({
        accepted: false,
        reason: 'incorrect-numeric-equality',
      });
  });

  it('handles explicit division by zero without a crash or a successful arithmetic check', () => {
    expect(reviewEvidenceNumbers('math', '1 / 0 = 7', [])).toEqual({
      accepted: false,
      reason: 'non-finite-arithmetic',
    });
    expect(reviewEvidenceNumbers('math', '0 / 0 = 0', []).accepted).toBe(false);
  });

  it('leaves symbolic, approximate and unsupported expressions unjudged instead of rejecting numeric tails', () => {
    for (const reply of [
      'S = a * b',
      'x+7=8',
      'x + 7 = 8',
      '7 = 2x',
      '7 = 2 x',
      '2^3 = 8',
      '2² = 4',
      '√9 = 3',
      '20% от 150 = 30',
      '1 м = 100 см',
      '2 кг = 2000 г',
      '100 см × 2 см = 0,02 м²',
      '1/3 ≈ 0,33',
      '1/3 = 0,33 (округлено до сотых)',
      'Приблизительно 1/3 = 0,33',
      '1/3 = 0,333…',
      `${'('.repeat(1000)}1${')'.repeat(1000)} = 5`,
    ])
      expect(reviewEvidenceNumbers('math', reply, []), reply).toEqual({
        accepted: true,
        reason: null,
      });
  });

  it('does not claim to verify numberless factual claims, dimensions or chronology relations', () => {
    expect(reviewEvidenceNumbers('math', '7 см = 7 м', []).accepted).toBe(true);
    expect(reviewEvidenceNumbers('history', 'Князь жил в XI веке.', []).accepted).toBe(true);
    expect(reviewEvidenceNumbers('russian', 'У всех предложений одна основа.', []).accepted).toBe(
      true,
    );
    // These are intentional boundaries, not assertions that the example claims are true.
  });
});
