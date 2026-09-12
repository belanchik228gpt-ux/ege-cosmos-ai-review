import { expect, it } from 'vitest';
import { createState } from '../src/domain/learning';
import { schoolTopics } from '../src/domain/school-catalog';
import { curriculumNodes } from '../src/domain/curriculum-data';
import { setEgeTopicSkipped } from '../src/domain/ege-topic-skips';
import { addCustomTopic, createPlanningState, generateStudyPlan } from '../src/domain/study-plan';
const day = '2026-09-10';
const options = {
  period: 'week' as const,
  anchorDate: day,
  subjects: ['math' as const],
  dailyMinutes: 25,
  schoolGrade: 10,
  mathLevel: 'basic' as const,
  goal: 'ege' as const,
};
it('excludes a skipped EGE card and its linked practice from new plans, while preserving existing days and evidence', () => {
  const card = schoolTopics.find((t) => t.lessonTopicIds.includes('math-absolute'))!;
  expect(card).toBeDefined();
  const learning = createState();
  learning.progress['math-absolute'] = {
    mastery: 'learning',
    attempts: [],
    nextReviewAt: '2026-09-01T00:00:00.000Z',
  };
  const original = generateStudyPlan(createPlanningState(), learning, curriculumNodes, options);
  expect(original.days[day].entries.some((e) => e.topicId === 'math-absolute')).toBe(true);
  const skipped = setEgeTopicSkipped(learning, card.id, true, '2026-09-10T00:00:00.000Z');
  const generated = generateStudyPlan(createPlanningState(), skipped, curriculumNodes, options);
  const entries = Object.values(generated.days).flatMap((d) => d.entries);
  expect(entries.some((e) => e.topicId && card.lessonTopicIds.includes(e.topicId))).toBe(false);
  expect(
    entries.some((e) => e.curriculumNodeId && card.curriculumNodeIds.includes(e.curriculumNodeId)),
  ).toBe(false);
  expect(generateStudyPlan(original, skipped, curriculumNodes, options).days).toEqual(
    original.days,
  );
  expect(skipped.progress).toBe(learning.progress);
  const restored = setEgeTopicSkipped(skipped, card.id, false);
  expect(
    generateStudyPlan(createPlanningState(), restored, curriculumNodes, options).days[
      day
    ].entries.some((e) => e.topicId === 'math-absolute'),
  ).toBe(true);
});
it('keeps an explicit personal request and the separate school goal available after an EGE skip', () => {
  const card = schoolTopics.find((t) => t.lessonTopicIds.includes('math-absolute'))!;
  const learning = setEgeTopicSkipped(createState(), card.id, true);
  const personal = addCustomTopic(createPlanningState(), {
    subject: 'math',
    title: 'Хочу ещё раз разобрать модули',
    topicId: 'math-absolute',
    notes: '',
  });
  const result = generateStudyPlan(personal.state, learning, [], { ...options, schoolGrade: 7 });
  expect(
    Object.values(result.days)
      .flatMap((d) => d.entries)
      .some((e) => e.customTopicId === personal.id && e.topicId === 'math-absolute'),
  ).toBe(true);
  const school = generateStudyPlan(createPlanningState(), learning, curriculumNodes, {
    ...options,
    goal: 'school',
  });
  expect(
    Object.values(school.days)
      .flatMap((d) => d.entries)
      .some((e) => e.topicId === 'math-absolute'),
  ).toBe(true);
});
