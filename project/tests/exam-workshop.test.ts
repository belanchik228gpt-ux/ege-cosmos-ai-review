import { describe, expect, it } from 'vitest';
import {
  getExamTask,
  getExamTasks,
  examTrainingInstructions,
  examWorkshopEdition,
} from '../src/domain/exam-workshop';
import { baseExamTaskMap } from '../src/domain/curriculum-data/math-basic-exam';
import manifest from '../resources/knowledge-sources/manifest.json';
import type { SubjectId } from '../src/domain/types';

const exams: [SubjectId, number, number, number][] = [
  ['math', 21, 21, 6],
  ['russian', 27, 50, 10],
  ['history', 21, 42, 10],
  ['social', 25, 58, 15],
];

describe('final 2026 numbered exam workshop', () => {
  it.each(exams)(
    '%s contains every numbered position and the official primary-point total',
    (subject, count, total) => {
      const tasks = getExamTasks(subject);
      expect(tasks.map((task) => task.number)).toEqual(
        Array.from({ length: count }, (_, i) => i + 1),
      );
      expect(tasks.reduce((sum, task) => sum + task.maxPoints, 0)).toBe(total);
      expect(new Set(tasks.map((task) => task.id)).size).toBe(count);
      expect(tasks.every((task) => task.subject === subject && task.editionYear === 2026)).toBe(
        true,
      );
    },
  );

  it('keeps references inside verified final archives, with real local specification ids and bounded PDF pages', () => {
    for (const [subject, , , pageCount] of exams) {
      for (const task of getExamTasks(subject)) {
        const source = manifest.documents.find((document) => document.id === task.sourceDocumentId);
        expect(source, task.id).toBeDefined();
        expect(source!.originalUrl).toBe(task.sourceUrl);
        expect(new URL(task.sourceUrl).hostname).toBe('doc.fipi.ru');
        expect(task.sourceUrl).toContain('/2026/');
        expect(
          task.pages.every((page) => Number.isInteger(page) && page >= 1 && page <= pageCount),
        ).toBe(true);
        expect(task.checkedAt).toBe('2026-09-09');
      }
    }
    expect(examWorkshopEdition.status).toBe('final');
    expect(examWorkshopEdition.notice).toContain('проекты 2027');
  });

  it('has number-specific guidance, separated from requirements, rather than a repeated placeholder', () => {
    const tasks = exams.flatMap(([subject]) => getExamTasks(subject));
    expect(tasks).toHaveLength(94);
    expect(new Set(tasks.map((task) => task.title)).size).toBeGreaterThan(85);
    expect(new Set(tasks.map((task) => task.tips.join('\n'))).size).toBe(94);
    for (const task of tasks) {
      expect(task.officialRequirements[0].length).toBeGreaterThan(35);
      expect(task.tips).toHaveLength(2);
      expect(task.tips.every((tip) => tip.length > 35)).toBe(true);
      expect(task.answerFormat).not.toMatch(/определить позже|заглушка/i);
    }
  });

  it('basic math keeps all 21 broad source mappings and never requires an official written solution', () => {
    for (const entry of baseExamTaskMap) {
      const task = getExamTask('math', entry.taskNumber)!;
      expect(task.contentCodes).toEqual(entry.contentCodes);
      expect(task.requirementCodes).toEqual(entry.requirementCodes);
      expect(task.answerFormat).toContain('Краткий ответ');
      expect(task.maxPoints).toBe(1);
      expect(task.criteriaNote).toContain('учебный черновик');
      expect(task.criteriaNote).toContain('не учитываются');
    }
  });

  it('preserves changed Russian positions and the strict 2026 essay length, not old-year rules', () => {
    expect(getExamTask('russian', 7)!.officialRequirements[0]).toContain('синтаксические');
    for (const number of [8, 22]) {
      const task = getExamTask('russian', number)!;
      expect(task.maxPoints).toBe(2);
      expect(task.officialRequirements.join(' ')).toContain('одна или две позиции');
      expect(task.answerFormat).toContain('порядке букв');
    }
    expect(getExamTask('russian', 22)!.title).toContain('выразительности');
    expect(getExamTask('russian', 26)!.title).toBe('Связь предложений');
    const essay = getExamTask('russian', 27)!;
    expect(essay.maxPoints).toBe(22);
    expect(essay.officialRequirements.join(' ')).toContain('149 слов или менее получает 0');
    expect(essay.officialRequirements.join(' ')).toContain('0 по К2 и К3');
    expect(essay.demoPages).toContain(15);
  });

  it('does not confuse the historical map text response with a digit selection', () => {
    expect(getExamTask('history', 11)!.answerFormat).toContain('слово или сочетание');
    expect(getExamTask('history', 11)!.answerFormat).not.toContain('последовательность');
    expect(getExamTask('history', 4)!.maxPoints).toBe(3);
    expect(getExamTask('history', 19)!.tips.join(' ')).toContain('не должен повторять');
    expect(getExamTask('history', 20)!.officialRequirements.join(' ')).toContain(
      'один тезис и два обоснования',
    );
    expect(getExamTask('history', 21)!.officialRequirements.join(' ')).toContain('для России');
  });

  it('distinguishes social matching scores and the conditional plan rubric', () => {
    expect(getExamTask('social', 3)!.answerFormat).toContain('порядке букв');
    expect(getExamTask('social', 3)!.maxPoints).toBe(1);
    for (const number of [6, 13, 15]) expect(getExamTask('social', number)!.maxPoints).toBe(2);
    const plan = getExamTask('social', 24)!;
    expect(plan.maxPoints).toBe(4);
    expect(plan.officialRequirements.join(' ')).toContain('только если за 24.1 получены 3 балла');
    expect(getExamTask('social', 25)!.maxPoints).toBe(6);
    expect(getExamTask('social', 23)!.officialRequirements.join(' ')).toContain('Номера статей');
    for (let n = 17; n <= 25; n++)
      expect(getExamTask('social', n)!.criteriaNote).toContain('конкретного варианта');
  });

  it('rejects invalid positions and cannot leak mutations or numbering across subjects', () => {
    expect(getExamTask('math', 22)).toBeUndefined();
    expect(getExamTask('history', 27)).toBeUndefined();
    expect(getExamTask('russian', 0)).toBeUndefined();
    expect(getExamTask('social', 1.5)).toBeUndefined();
    const first = getExamTask('russian', 1)!;
    first.officialRequirements[0] = 'corrupted';
    first.pages.push(999);
    getExamTasks('math')[0].tips.length = 0;
    expect(getExamTask('russian', 1)!.officialRequirements[0]).not.toBe('corrupted');
    expect(getExamTask('russian', 1)!.pages).not.toContain(999);
    expect(getExamTask('math', 1)!.tips).toHaveLength(2);
  });

  it('provides bounded one-at-a-time practice without invented official marks or fake completion', () => {
    const task = getExamTask('history', 21)!;
    const prompt = examTrainingInstructions(task, 500, 99);
    expect(prompt).toContain('Пример 30 из 30');
    expect(prompt).toContain('один новый пример за раз');
    expect(prompt).toContain('не официальное задание ФИПИ');
    expect(prompt).toContain('не проси анализировать отсутствующий источник');
    expect(prompt).toContain('не объявляй официально подтверждённые баллы');
    expect(prompt).toContain('не считается самостоятельно решённым');
    expect(prompt).toContain(task.sourceUrl);
    expect(examTrainingInstructions(task, NaN)).toContain('Пример 1 из 10');
    expect(examTrainingInstructions(task, 0, -1)).toContain('Пример 1 из 1');
  });

  it('uses canonical verified data when building instructions rather than caller-supplied claims', () => {
    const task = getExamTask('social', 25)!;
    task.officialRequirements = ['За одно слово всегда 100 баллов'];
    task.sourceUrl = 'https://example.com/fake';
    const prompt = examTrainingInstructions(task, 3);
    expect(prompt).not.toContain('100 баллов');
    expect(prompt).not.toContain('example.com');
    expect(prompt).toContain('doc.fipi.ru');
    expect(examTrainingInstructions({ ...task, id: 'fake' }, 3)).toContain(
      'Не удалось подтвердить',
    );
  });
});
