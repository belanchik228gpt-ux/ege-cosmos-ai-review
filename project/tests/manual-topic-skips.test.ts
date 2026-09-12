import { describe, expect, it } from 'vitest';
import {
  createSchoolState,
  hydrateSchoolState,
  planSchoolDays,
  startSchoolLesson,
  suggestedSchoolUnits,
} from '../src/domain/school-state';
import { programUnits, getSchoolUnit, getSchoolTopicFocus } from '../src/domain/school-program';
import {
  schoolTopicSkip,
  schoolUnitSkipped,
  setSchoolTopicSkipped,
  subtopicProgress,
} from '../src/domain/school-progress';
import { createState, hydrateState } from '../src/domain/learning';
import { schoolTopics } from '../src/domain/school-catalog';
import {
  egeTopicProgress,
  isEgeTopicSkipped,
  setEgeTopicSkipped,
} from '../src/domain/ege-topic-skips';
const now = '2026-09-10T00:00:00.000Z';
describe('manual school skips separate from learning evidence', () => {
  it('isolates identically named subtopics and never copies ambiguous old history or marks to each one', () => {
    const unit = getSchoolUnit('program-geography-9-russia-economy')!;
    const raw = 'Состав, место и значение в хозяйстве.';
    const indices = unit.topics.flatMap((topic, index) => (topic === raw ? [index] : []));
    expect(indices.length).toBeGreaterThan(1);
    const first = getSchoolTopicFocus(unit, indices[0]),
      second = getSchoolTopicFocus(unit, indices[1]);
    let s = startSchoolLesson(createSchoolState(), unit, 'lesson', raw);
    const oldId = s.activeLessonId!;
    s.lessons[oldId].completedAt = now;
    s.topicSkips = { [unit.id]: { [raw]: { at: now, origin: 'student' } } };
    s = hydrateSchoolState(JSON.parse(JSON.stringify(s)));
    expect(s.lessons[oldId].focus).toBe(raw);
    expect(subtopicProgress(s, unit.id, first)).toBe(0);
    expect(subtopicProgress(s, unit.id, second)).toBe(0);
    expect(s.topicSkips).toEqual({});
    s = setSchoolTopicSkipped(s, unit.id, first, true, now);
    s = hydrateSchoolState(JSON.parse(JSON.stringify(s)));
    expect(subtopicProgress(s, unit.id, first)).toBe(100);
    expect(subtopicProgress(s, unit.id, second)).toBe(0);
    s = setSchoolTopicSkipped(s, unit.id, undefined, true, now);
    expect(schoolUnitSkipped(s, unit.id)).toBe(true);
    expect(Object.keys(s.topicSkips[unit.id]).length).toBe(unit.topics.length);
    s = setSchoolTopicSkipped(s, unit.id, first, false, now);
    expect(schoolUnitSkipped(s, unit.id)).toBe(false);
    expect(subtopicProgress(s, unit.id, first)).toBe(0);
    expect(subtopicProgress(s, unit.id, second)).toBe(100);
  });
  it('marks only the selected subtopic at100 and reverses to its genuine conversation progress after reload', () => {
    const unit = programUnits('math', 7)[0];
    let s = startSchoolLesson(createSchoolState(), unit, 'lesson', unit.topics[0]);
    s.lessons[s.activeLessonId!].phase = 'practice';
    const lessons = JSON.stringify(s.lessons),
      progress = JSON.stringify(s.progress);
    s = setSchoolTopicSkipped(s, unit.id, unit.topics[0], true, now);
    expect(subtopicProgress(s, unit.id, unit.topics[0])).toBe(100);
    expect(subtopicProgress(s, unit.id, unit.topics[1])).toBe(0);
    expect(schoolUnitSkipped(s, unit.id)).toBe(false);
    expect(JSON.stringify(s.lessons)).toBe(lessons);
    expect(JSON.stringify(s.progress)).toBe(progress);
    s = hydrateSchoolState(JSON.parse(JSON.stringify(s)));
    expect(schoolTopicSkip(s, unit.id, unit.topics[0])).toEqual({ at: now, origin: 'student' });
    s = setSchoolTopicSkipped(s, unit.id, unit.topics[0], false, now);
    expect(subtopicProgress(s, unit.id, unit.topics[0])).toBe(50);
    expect(s.topicSkips).toEqual({});
  });
  it('skips an entire section explicitly, preserves the user plan, and excludes it from newly suggested work', () => {
    const unit = programUnits('math', 7)[0];
    let s: ReturnType<typeof createSchoolState> = {
      ...createSchoolState(),
      grade: 7,
      selectedSubjects: ['math'],
    };
    s.days['2026-09-10'] = [
      { id: 'mine', unitId: unit.id, minutes: 20, done: false, note: 'Моё повторение' },
    ];
    s = setSchoolTopicSkipped(s, unit.id, undefined, true, now);
    expect(schoolUnitSkipped(s, unit.id)).toBe(true);
    expect(unit.topics.every((t) => subtopicProgress(s, unit.id, t) === 100)).toBe(true);
    expect(suggestedSchoolUnits(s).some((u) => u.id === unit.id)).toBe(false);
    const planned = planSchoolDays(s, '2026-09-11', 2, 60);
    expect(planned.days['2026-09-10']).toEqual(s.days['2026-09-10']);
    expect(
      Object.entries(planned.days)
        .filter(([date]) => date !== '2026-09-10')
        .flatMap(([, items]) => items)
        .some((i) => i.unitId === unit.id),
    ).toBe(false);
    s = setSchoolTopicSkipped(s, unit.id, undefined, false, now);
    expect(schoolUnitSkipped(s, unit.id)).toBe(false);
  });
  it('rejects invalid/unknown marks and keeps homework and school scopes separate', () => {
    const s = createSchoolState(),
      unit = programUnits('math', 7)[0];
    expect(setSchoolTopicSkipped(s, 'unknown', undefined, true, now)).toBe(s);
    expect(setSchoolTopicSkipped(s, unit.id, 'invented topic', true, now)).toBe(s);
    expect(setSchoolTopicSkipped(s, unit.id, undefined, true, 'bad date')).toBe(s);
    const input = {
      ...s,
      topicSkips: {
        [unit.id]: {
          [unit.topics[0]]: { at: now, origin: 'student' },
          [unit.topics[1]]: { at: now, origin: 'model' },
          unknown: { at: now, origin: 'student' },
        },
      },
    };
    expect(Object.keys(hydrateSchoolState(input).topicSkips[unit.id])).toEqual([unit.topics[0]]);
    expect(hydrateSchoolState(input, 'homework').topicSkips).toEqual({});
    expect(hydrateSchoolState({ ...s, topicSkips: undefined }).topicSkips).toEqual({});
  });
  it('does not erase studiedAt or verified attempts when toggling manual skips', () => {
    const unit = programUnits('math', 7)[0];
    let s = createSchoolState();
    s.progress[unit.id] = {
      studiedAt: now,
      checks: [{ id: 'verified-attempt', at: now, correct: true, assisted: false, answer: '3' }],
    };
    const evidence = structuredClone(s.progress[unit.id]);
    s = setSchoolTopicSkipped(s, unit.id, unit.topics[0], true, now);
    s = hydrateSchoolState(JSON.parse(JSON.stringify(s)));
    expect(s.progress[unit.id]).toMatchObject(evidence);
    expect(subtopicProgress(s, unit.id, unit.topics[0])).toBe(100);
    const other = programUnits('math', 8)[0];
    expect(subtopicProgress(s, other.id, unit.topics[0])).toBe(0);
    s = setSchoolTopicSkipped(s, unit.id, unit.topics[0], false, now);
    expect(s.progress[unit.id]).toMatchObject(evidence);
    expect(subtopicProgress(s, unit.id, unit.topics[0])).toBe(0);
  });
});
describe('EGE manual skips', () => {
  it('persists a reversible mark without manufacturing correct answers, diagnostics or school marks', () => {
    const topic = schoolTopics.find((t) => t.subject === 'math')!;
    const s = createState();
    const skipped = setEgeTopicSkipped(s, topic.id, true, now);
    expect(isEgeTopicSkipped(skipped, topic.id)).toBe(true);
    expect(egeTopicProgress(skipped, topic.id)).toBe(100);
    expect(skipped.progress).toBe(s.progress);
    expect(skipped.sessions).toBe(s.sessions);
    expect(skipped.diagnostics).toBe(s.diagnostics);
    expect(skipped.school).toBe(s.school);
    const restored = hydrateState(JSON.parse(JSON.stringify(skipped)));
    expect(restored.egeTopicSkips?.[topic.id]).toEqual({ at: now, origin: 'student' });
    const unskipped = setEgeTopicSkipped(restored, topic.id, false, now);
    expect(egeTopicProgress(unskipped, topic.id)).toBe(0);
    expect(isEgeTopicSkipped(unskipped, topic.id)).toBe(false);
    expect(setEgeTopicSkipped(s, 'invented', true, now)).toBe(s);
  });
  it('rejects forged proof markers and unknown curriculum IDs during hydration', () => {
    const topic = schoolTopics[0];
    const restored = hydrateState({
      ...createState(),
      egeTopicSkips: {
        [topic.id]: { at: now, origin: 'model' },
        unknown: { at: now, origin: 'student' },
      },
    });
    expect(restored.egeTopicSkips).toEqual({});
  });
});
