import { describe, expect, it } from 'vitest';
import katex from 'katex';
import {
  lessonLabExamples,
  lessonLabSources,
  renderLessonLab,
  validLessonLabValues,
} from '../shared/lesson-lab.mjs';
import { renderSubjectFigure } from '../shared/subject-figures.mjs';
import { lessonLabDrawing } from '../src/domain/topic-scenes/lesson-lab';
import { cleanDrawing } from '../src/domain/cloud-learning';
import { schoolSubjects, schoolUnits } from '../src/domain/school-program';
import { topicDrawing } from '../src/domain/school-topic-drawings';

describe('authored lesson lab across the school subjects', () => {
  it('covers all twelve subject ids with distinct meaningful scenes, not a fallback per name', () => {
    expect(new Set(lessonLabExamples.map((e) => e.subject))).toEqual(
      new Set(schoolSubjects.map((s) => s.id)),
    );
    expect(lessonLabExamples.length).toBe(18);
    expect(lessonLabExamples.reduce((n, e) => n + e.steps.length, 0)).toBe(91);
    expect(new Set(lessonLabExamples.map((e) => e.id)).size).toBe(18);
  });
  for (const [scenario, example] of lessonLabExamples.entries()) {
    it(`${example.id}: exact alias, subject isolation, render/export continuity and staged teaching`, () => {
      const unit = schoolUnits.find((u) => u.subject === example.subject)!;
      const drawing = lessonLabDrawing(unit, example.topic)!;
      expect(drawing).toBeDefined();
      expect(cleanDrawing(drawing)).toEqual(drawing);
      for (const topic of [example.topic, ...example.aliases])
        expect(topicDrawing(unit, topic)).toEqual(drawing);
      expect(lessonLabDrawing(unit, example.topic + ' неизвестное дополнение')).toBeUndefined();
      const other = schoolUnits.find((u) => u.subject !== example.subject)!;
      expect(lessonLabDrawing(other, example.topic)).toBeUndefined();
      const svgs = example.steps.map((step, stage) => {
        expect(step.caption.length).toBeGreaterThan(40);
        if (step.formula)
          expect(() => katex.renderToString(step.formula!, { throwOnError: true })).not.toThrow();
        const svg = renderLessonLab([scenario, stage], 1)!;
        expect(svg).toContain('data-lab-id="' + example.id + '"');
        expect(svg).toContain('<desc>');
        expect(svg).not.toMatch(/NaN|Infinity|undefined|<script|<foreignObject|href=/);
        expect(renderSubjectFigure(drawing, stage, 1)).toBe(svg);
        expect(svg).toMatch(/<(path|rect|polygon|circle)/);
        return svg;
      });
      expect(new Set(svgs).size).toBe(example.steps.length);
      expect(example.steps.at(-1)?.caption).toContain('?');
      expect(lessonLabSources[example.source].url).toMatch(/^https:\/\//);
    });
  }
  it('rejects unknown scenarios, fractional and unbounded data without interpreting model labels', () => {
    for (const values of [
      null,
      [],
      [0],
      [0, 1, 2],
      [-1, 0],
      [18, 0],
      [0, 6],
      [1, 5],
      [0.1, 0],
      [0, Infinity],
      [1e50, 0],
      ['0', 1],
    ]) {
      expect(validLessonLabValues(values)).toBe(false);
      expect(renderLessonLab(values)).toBeNull();
    }
    const a = renderLessonLab([1, 2], 0)!,
      b = renderLessonLab([1, 2], 1)!;
    expect(a).not.toEqual(b);
    expect(renderLessonLab([1, 2], NaN)).toBe(b);
    expect(renderLessonLab([1, 2], 2)).toBe(b);
  });
  it('keeps geometric exceptions and representation limits explicit', () => {
    const intro = lessonLabExamples[0];
    expect(intro.steps.map((s) => s.caption).join(' ')).toMatch(/не лежащие на одной прямой/);
    expect(intro.steps.map((s) => s.caption).join(' ')).toMatch(/бесконечно много плоскостей/);
    expect(intro.steps.map((s) => s.caption).join(' ')).toMatch(/У плоскости нет края/);
    expect(lessonLabExamples.find((e) => e.id === 'cube-section')!.steps[3].caption).toMatch(
      /квадрат в пространстве/,
    );
    expect(lessonLabExamples.find((e) => e.id === 'line-plane-parallel')!.steps[3].caption).toMatch(
      /вне плоскости/,
    );
  });
  it('preserves conservation and does not fabricate experiment measurements', () => {
    expect(lessonLabExamples.find((e) => e.id === 'net-ionic')!.steps[2].caption).toContain(
      'физически они остаются',
    );
    expect(lessonLabExamples.find((e) => e.id === 'dna-replication')!.steps[3].caption).toContain(
      'одна исходная и одна новая',
    );
    expect(renderLessonLab([17, 3])).toContain('Данных пока нет');
  });
});
