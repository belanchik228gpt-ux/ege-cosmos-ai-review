import { describe, expect, it } from 'vitest';
import { absoluteTopic } from '../src/domain/absolute-topic';
import { getKnowledgeForTopic, retrieveKnowledge } from '../src/domain/knowledge';
import { prepareTutorEvidence } from '../src/domain/evidence';
import { getSource } from '../src/domain/sources';

describe('absolute value authored knowledge support', () => {
  it('provides the new lesson with authored definitions and registered factual support', () => {
    const card = getKnowledgeForTopic('math-absolute', 'math')[0];
    expect(card.id).toBe('knowledge-math-absolute');
    expect(card.materialStatus).toBe('training');
    expect(card.exampleStatus).toBe('synthetic');
    expect(card.schoolGrades).toEqual([10]);
    expect(card.gradeBasis).toBe('author-route');
    expect(card.gradeNote).toContain('не официальная привязка');
    const evidence = prepareTutorEvidence(
      'math',
      'Почему модуль отрицательного числа неотрицательный?',
      absoluteTopic,
    );
    const definition = evidence.find(
      (fragment) => fragment.id === 'knowledge-math-absolute:explanation:1',
    );
    expect(definition?.text).toBe(card.explanation[0]);
    expect(definition?.text).toContain('|−3| = 3');
    expect(definition?.text).toContain('|0| = 0');
    expect(definition?.sourceIds).toEqual(['openstax-absolute-value', 'cosmos-training']);
    expect(evidence.every((fragment) => !fragment.id.startsWith('source:'))).toBe(true);
    expect(getSource('openstax-absolute-value')?.url).toBe(
      'https://openstax.org/books/college-algebra-2e/pages/3-6-absolute-value-functions',
    );
  });

  it('keeps both equation branches, the zero case, and unsupported subjects distinct', () => {
    const evidence = prepareTutorEvidence('math', 'Как решать уравнение с модулем?', absoluteTopic);
    const cases = evidence.find((fragment) => fragment.id.endsWith(':explanation:3'))?.text;
    expect(cases).toContain('при a > 0 имеет два решения');
    expect(cases).toContain('При a = 0 решение одно');
    expect(cases).toContain('При a < 0 действительных решений нет');
    const card = retrieveKnowledge('math', 'Модуль и расстояние', 'math-absolute', 1)[0];
    expect(card.id).toBe('knowledge-math-absolute');
    expect(card.example.answer).toBe('−1 и 5.');
    expect([-1, 5].every((x) => Math.abs(x - 2) === 3)).toBe(true);
    expect(prepareTutorEvidence('history', 'Модуль числа', absoluteTopic)).toEqual([]);
    expect(evidence.some((fragment) => fragment.text === card.checkpoint.answer)).toBe(false);
  });
});
