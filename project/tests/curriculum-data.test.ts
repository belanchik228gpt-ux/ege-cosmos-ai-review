import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import manifest from '../resources/knowledge-sources/manifest.json';
import {
  baseExamTaskMap,
  curriculumCatalogMetadata,
  curriculumNodes,
} from '../src/domain/curriculum-data';
import { getSource } from '../src/domain/sources';

const find = (subject: string, code: string) =>
  curriculumNodes.find((n) => n.subject === subject && n.code === code)!;
const range = (prefix: string, max: number) =>
  Array.from({ length: max }, (_, i) => `${prefix}.${i + 1}`);
const codes = (subject: string) =>
  curriculumNodes.filter((n) => n.subject === subject).map((n) => n.code);

describe('official curriculum content transcription', () => {
  it('retains every code in the visually counted math table and history appendix, without inventing history section 6', () => {
    const mathExpected = [
      '1',
      ...range('1', 9),
      '2',
      ...range('2', 11),
      '3',
      ...range('3', 8),
      '4',
      ...range('4', 3),
      '5',
      ...range('5', 2),
      '6',
      ...range('6', 3),
      '7',
      ...range('7', 5),
    ];
    expect(codes('math')).toEqual(mathExpected);
    const historyExpected = [
      '1',
      ...range('1', 11),
      '2',
      ...range('2', 6),
      '3',
      ...range('3', 8),
      '4',
      ...range('4', 16),
      '5',
      ...range('5', 20),
      '7',
      ...range('7', 9),
      '8',
      ...range('8', 4),
      '9',
      ...range('9', 4),
      '10',
      ...range('10', 2),
      '11',
      ...range('11', 3),
      '12',
      ...range('12', 6),
    ];
    expect(codes('history')).toEqual(historyExpected);
    expect(find('history', '6')).toBeUndefined();
    expect(find('history', '5.19').title).toBe('Международные отношения в XIX в.');
  });

  it('retains the Russian hierarchy and all five social sections at source granularity', () => {
    const russianExpected = [
      '1',
      ...range('1', 5),
      '2',
      ...range('2', 5),
      '3',
      ...[4, 3, 6, 2, 6, 7, 9, 9].flatMap((max, i) => [`3.${i + 1}`, ...range(`3.${i + 1}`, max)]),
      '4',
      ...range('4', 4),
      '5',
      ...range('5', 3),
    ];
    expect(codes('russian')).toEqual(russianExpected);
    const socialExpected = [15, 18, 10, 12, 20].flatMap((max, i) => [
      String(i + 1),
      ...range(String(i + 1), max),
    ]);
    expect(codes('social')).toEqual(socialExpected);
    expect(curriculumNodes).toHaveLength(304);
    expect(curriculumNodes.filter((n) => n.assessmentStatus === 'section')).toHaveLength(36);
    expect(curriculumNodes.filter((n) => n.assessmentStatus === 'assessed')).toHaveLength(264);
  });

  it('uses unique stable subject IDs, real parents, and separates sections from assessable leaves', () => {
    expect(new Set(curriculumNodes.map((n) => n.id)).size).toBe(304);
    for (const node of curriculumNodes) {
      expect(node.id).toBe(`ege-${node.subject}-${node.code.replaceAll('.', '-')}`);
      const children = curriculumNodes.filter((n) => n.parentId === node.id);
      expect(node.assessmentStatus === 'section').toBe(children.length > 0);
      if (node.parentId) {
        const parent = curriculumNodes.find((n) => n.id === node.parentId)!;
        expect(parent?.subject).toBe(node.subject);
        expect(node.code.startsWith(parent.code + '.')).toBe(true);
        expect(parent.assessmentStatus).toBe('section');
      }
    }
  });

  it('anchors each final record to the exact bundled PDF and physical viewer page', () => {
    const pageLimits = { math: 13, russian: 10, history: 16, social: 18 };
    for (const node of curriculumNodes) {
      const document = manifest.documents.find((d) => d.id === node.sourceDocumentId)!;
      expect(document?.sourceId).toBe(node.sourceId);
      expect(document.subject).toBe(node.subject);
      expect(document.year).toBe(2026);
      expect(node.editionYear).toBe(2026);
      expect(node.editionStatus).toBe('final');
      expect(getSource(node.sourceId)?.publicationStatus).toBe('final');
      expect(node.page).toBeGreaterThan(0);
      expect(node.page).toBeLessThanOrEqual(pageLimits[node.subject]);
      expect(node.printedPage).toBeGreaterThan(0);
    }
    for (const meta of Object.values(curriculumCatalogMetadata.subjects)) {
      const document = manifest.documents.find((d) => d.id === meta.sourceDocumentId)!;
      const bytes = readFileSync(`resources/knowledge-sources/${document.file}`);
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(meta.sha256);
    }
    expect(find('history', '1.4').page).toBe(14);
    expect(find('history', '1.4').printedPage).toBe(19);
    expect(find('history', '2.1').title).toContain('Пресечение династии Рюриковичей');
  });

  it('respects the actual 2026 exclusion note rather than treating every minus marker as an exclusion', () => {
    expect(
      curriculumNodes
        .filter((n) => n.assessmentStatus === 'not-assessed-in-edition')
        .map((n) => n.id),
    ).toEqual(['ege-math-1-9', 'ege-math-2-11', 'ege-math-3-6', 'ege-math-5-1']);
    expect(find('social', '3.10').assessmentStatus).toBe('assessed');
    expect(find('social', '5.17').assessmentStatus).toBe('assessed');
    expect(find('social', '5.19').assessmentStatus).toBe('assessed');
    expect(
      curriculumNodes.filter((n) => n.notAssessedFragments?.length).map((n) => n.code),
    ).toEqual(['1.15', '2.1', '2.4', '2.5', '2.8', '2.10', '2.13', '2.18', '3.2', '3.3', '4.7']);
    expect(find('social', '2.5').notAssessedFragments).toContain('Товары Гиффена и эффект Веблена');
    expect(find('social', '4.7').assessmentStatus).toBe('assessed');
    expect(find('social', '4.7').title).toContain('Опасность коррупции');
  });

  it('does not confuse basic/advanced school programmes with basic/profile exam mappings', () => {
    expect(baseExamTaskMap.map((t) => t.taskNumber)).toEqual(
      Array.from({ length: 21 }, (_, i) => i + 1),
    );
    expect(baseExamTaskMap.find((t) => t.taskNumber === 7)?.contentCodes).toEqual(['3', '4']);
    expect(baseExamTaskMap.find((t) => t.taskNumber === 8)?.contentCodes).toEqual(['5']);
    expect(baseExamTaskMap.find((t) => t.taskNumber === 20)?.contentCodes).toEqual(['2']);
    for (const task of baseExamTaskMap) {
      expect(task.sourceDocumentId).toBe('fipi-math-2026-specification-basic');
      expect(task.contentCodes.every((code) => /^\d$/.test(code))).toBe(true);
      expect(task.printedPage).toBe(task.taskNumber <= 9 ? 10 : task.taskNumber <= 19 ? 11 : 12);
    }
    for (const node of curriculumNodes.filter((n) => n.subject === 'math')) {
      if (node.assessmentStatus === 'section')
        expect(node.examLevels).toEqual(['basic', 'profile']);
      else expect(node.examLevels).toBeUndefined();
    }
    expect(find('math', '7.4').programLevels).toEqual(['advanced']);
    expect(find('math', '7.4').examLevels).toBeUndefined();
  });

  it('keeps school grades approximate and authored scene links narrower than official positions', () => {
    for (const node of curriculumNodes) {
      expect(node.gradeBasis).toBe('approximate');
      expect(node.gradeNote).toContain('не календарь');
      expect(node.schoolGrades.length).toBeGreaterThan(0);
      expect(node.schoolGrades).toEqual([...new Set(node.schoolGrades)].sort((a, b) => a - b));
      expect(node.schoolGrades.every((g) => Number.isInteger(g) && g >= 5 && g <= 11)).toBe(true);
    }
    expect(find('math', '7.1').lessonTopicIds).toEqual([
      'math-rectangle',
      'math-triangle',
      'math-median',
    ]);
    expect(find('math', '1.2').lessonTopicIds).toEqual([
      'math-fraction',
      'math-multiply',
      'math-percent',
    ]);
    expect(find('math', '1.7').lessonTopicId).toBe('math-absolute');
    expect(find('history', '1.4').lessonTopicId).toBe('history-baptism');
  });

  it('removes page-layout debris without changing source words or merging adjacent Russian rows', () => {
    expect(find('math', '1.1').title).toBe(
      'Натуральные и целые числа. Признаки делимости целых чисел',
    );
    expect(find('math', '2.1').title).toBe('Целые и дробно-рациональные уравнения');
    expect(find('russian', '3.5.3').title).toBe(
      'Основные нормы употребления имён прилагательных: форм степеней сравнения, краткой формы',
    );
    expect(find('russian', '3.7.3').title).toBe('Употребление ъ и ь (в том числе разделительных)');
    expect(find('russian', '3.7.7').title).toBe('Правописание не и ни');
    expect(find('russian', '3.2.2').title).toBe('Изобразительно-выразительные средства фонетики');
    for (const node of curriculumNodes)
      expect(node.title).not.toMatch(/[\n\r�]|\s{2,}|Кодификатор ЕГЭ|Федеральная служба/);
    expect(curriculumCatalogMetadata.draftsIncluded).toBe(false);
  });
});
