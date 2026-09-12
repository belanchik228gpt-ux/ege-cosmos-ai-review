import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sourceManifest from '../resources/knowledge-sources/manifest.json';
import { getKnowledgeForTopic, knowledgeCards, retrieveKnowledge } from '../src/domain/knowledge';
import { examMaterialStatus, getSource, sources } from '../src/domain/sources';
import { topics } from '../src/domain/catalog';
import type { SubjectId } from '../src/domain/types';

describe('offline knowledge and provenance', () => {
  it('contains substantial authored cards in all rooms and covers each existing lesson', () => {
    expect(knowledgeCards).toHaveLength(28);
    expect(new Set(knowledgeCards.map((card) => card.id)).size).toBe(28);
    expect(knowledgeCards.filter((card) => card.subject === 'math')).toHaveLength(10);
    for (const subject of ['russian', 'history', 'social']) {
      expect(knowledgeCards.filter((card) => card.subject === subject)).toHaveLength(6);
    }
    for (const topic of topics)
      expect(getKnowledgeForTopic(topic.id, topic.subject).length).toBeGreaterThan(0);
    for (const card of knowledgeCards) {
      expect(card.explanation.join(' ').length).toBeGreaterThan(180);
      expect(card.example.steps.length).toBeGreaterThanOrEqual(3);
      expect(card.mistakes.length).toBeGreaterThanOrEqual(2);
      expect(card.checkpoint.question.length).toBeGreaterThan(8);
      expect(card.checkpoint.hint).not.toBe(card.checkpoint.answer);
      expect(card.scope.length).toBeGreaterThan(20);
      expect(card.materialStatus).toBe('training');
      expect(card.exampleStatus).toBe('synthetic');
    }
  });

  it('distinguishes official curriculum references from factual sources and draft status', () => {
    expect(new Set(sources.map((source) => source.id)).size).toBe(sources.length);
    for (const card of knowledgeCards) {
      expect(card.factSourceIds.length).toBeGreaterThan(0);
      expect(card.curriculumSourceIds).toHaveLength(2);
      expect(card.sourceIds).toEqual(
        expect.arrayContaining([...card.factSourceIds, ...card.curriculumSourceIds]),
      );
      for (const id of card.sourceIds) {
        const source = getSource(id);
        expect(source, id).toBeDefined();
        expect(source!.subjects).toContain(card.subject);
        expect(source!.checkedAt).toMatch(/^2026-09-0[78]$/);
        if (source!.status !== 'local-training') {
          expect(new URL(source!.url).protocol).toBe('https:');
          expect(source!.url).not.toMatch(/google|bing\.com|\/search\?|\/poisk\?/);
        }
      }
      for (const id of card.curriculumSourceIds) expect(getSource(id)!.role).toBe('curriculum');
      for (const id of card.factSourceIds) expect(card.curriculumSourceIds).not.toContain(id);
    }
    expect(examMaterialStatus.finalYear).toBe(2026);
    expect(examMaterialStatus.draftYear).toBe(2027);
    for (const subject of ['math', 'russian', 'history', 'social']) {
      expect(getSource(`fipi-${subject}-2026`)!.publicationStatus).toBe('final');
      expect(getSource(`fipi-${subject}-2027-project`)!.publicationStatus).toBe('draft');
    }
  });

  it('retrieves relevant Russian inflections, numbers, and NE/NI deterministically', () => {
    const cases: [SubjectId, string, string][] = [
      ['math', 'Объясни квадратное уравнение и дискриминант', 'knowledge-math-quadratic'],
      ['math', 'Почему медиана не является высотой?', 'knowledge-math-median'],
      ['history', 'Крещение Руси 988', 'knowledge-history-baptism'],
      ['history', 'Пётр Северная война', 'knowledge-history-northern-war'],
      ['russian', 'НЕ и НИ', 'knowledge-russian-ne-ni'],
      ['russian', 'Причастным оборотом', 'knowledge-russian-participle'],
      ['social', 'Что такое величина спроса?', 'knowledge-social-demand'],
    ];
    for (const [subject, query, expected] of cases) {
      expect(retrieveKnowledge(subject, query)[0]?.id, query).toBe(expected);
      expect(retrieveKnowledge(subject, query)).toEqual(retrieveKnowledge(subject, query));
    }
  });

  it('never crosses rooms or returns unrelated material merely because a topic exists', () => {
    expect(retrieveKnowledge('math', 'Куликовская битва')).toEqual([]);
    expect(retrieveKnowledge('history', 'дискриминант')).toEqual([]);
    expect(retrieveKnowledge('math', 'квантовая хромодинамика', 'math-median')).toEqual([]);
    expect(getKnowledgeForTopic('history-baptism', 'math')).toEqual([]);
    expect(getKnowledgeForTopic('unknown-topic')).toEqual([]);
    expect(retrieveKnowledge('other' as SubjectId, 'площадь')).toEqual([]);
    for (const subject of ['math', 'russian', 'history', 'social'] as SubjectId[]) {
      expect(retrieveKnowledge(subject, '').every((card) => card.subject === subject)).toBe(true);
    }
  });

  it('handles query limits and returns detached copies without changing registry content', () => {
    expect(retrieveKnowledge('math', '', undefined, 99)).toHaveLength(8);
    expect(retrieveKnowledge('math', '', undefined, 0)).toEqual([]);
    expect(retrieveKnowledge('math', '', undefined, -5)).toEqual([]);
    expect(retrieveKnowledge('math', '', undefined, Number.NaN)).toHaveLength(3);
    expect(retrieveKnowledge('math', '', 'math-percent')).toHaveLength(1);
    expect(retrieveKnowledge('math', 'не знаю', 'math-percent')[0]?.id).toBe(
      'knowledge-math-percent',
    );
    expect(retrieveKnowledge('russian', 'я не понимаю', 'russian-commas')[0]?.id).toBe(
      'knowledge-russian-commas',
    );
    const found = retrieveKnowledge('math', 'проценты')[0]!;
    const old = found.explanation[0];
    found.explanation[0] = 'corrupted';
    found.sourceIds.length = 0;
    expect(retrieveKnowledge('math', 'проценты')[0]!.explanation[0]).toBe(old);
    expect(retrieveKnowledge('math', 'проценты')[0]!.sourceIds.length).toBeGreaterThan(0);
  });

  it('keeps checked mathematical examples consistent with independent arithmetic', () => {
    const byId = (id: string) => knowledgeCards.find((card) => card.id === `knowledge-math-${id}`)!;
    expect(byId('area').example.answer).toBe(`${6 * 4} см²; ${(8 * 5) / 2} см².`);
    expect(byId('area').checkpoint.answer).toContain(`${(10 * 6) / 2} см²`);
    expect(byId('median').example.answer).toContain(`${14 / 2} см`);
    expect((2 / 3) * (3 / 4)).toBe(1 / 2);
    expect(byId('fractions').example.answer).toBe('1/2.');
    expect(byId('percent').example.answer).toBe(`${(80 * 25) / 100}.`);
    expect(200 * 1.1 * 0.9).toBeCloseTo(198);
    expect(3 * 4 + 5).toBe(17);
    for (const x of [2, 3]) expect(x * x - 5 * x + 6).toBe(0);
    expect(2 * 2 - 4 * 1 * 5).toBeLessThan(0);
    expect(-3 * -4).toBe(12);
    expect(0 * 0.5 + 6 * 0.5).toBe(3);
  });

  it('preserves historical distinctions and does not teach stressed vowels as alternating checks', () => {
    const text = (id: string) => JSON.stringify(knowledgeCards.find((card) => card.id === id));
    expect(text('knowledge-history-baptism')).toContain('традиционная дата');
    expect(text('knowledge-history-reform')).toContain('19 февраля 1861');
    expect(text('knowledge-history-reform')).toContain('3 марта');
    expect(text('knowledge-history-northern-war')).toContain('1700–1721');
    expect(text('knowledge-history-world-war')).toContain('1939–1945');
    expect(text('knowledge-history-world-war')).toContain('1941–1945');
    expect(text('knowledge-history-france')).toContain('20 июня 1789');
    const roots = knowledgeCards.find((card) => card.id === 'knowledge-russian-roots')!;
    expect(roots.checkpoint.question).toContain('р_стение');
    expect(roots.checkpoint.answer).toContain('перед ст');
  });

  it('ships the actual 22 reviewed official PDFs with source mappings and pinned bytes', () => {
    expect(sourceManifest.documents).toHaveLength(22);
    expect(new Set(sourceManifest.documents.map((entry) => entry.id)).size).toBe(22);
    for (const entry of sourceManifest.documents) {
      expect(entry.file).toMatch(/^202[67]\/(math|russian|history|social)-[a-z-]+\.pdf$/);
      expect(getSource(entry.sourceId)?.url).toBe(entry.originalUrl);
      expect(entry.status).toBe(entry.year === 2027 ? 'draft' : 'final');
      const data = readFileSync(
        new URL(`../resources/knowledge-sources/${entry.file}`, import.meta.url),
      );
      expect(data.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(data.subarray(-4096).includes(Buffer.from('%%EOF'))).toBe(true);
      expect(data.byteLength).toBe(entry.bytes);
      expect(createHash('sha256').update(data).digest('hex')).toBe(entry.sha256);
    }
  });
});
