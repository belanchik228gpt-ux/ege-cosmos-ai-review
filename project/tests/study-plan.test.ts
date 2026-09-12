import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudyRunView } from '../src/ui/StudyRunView';
import { createState, startSession, submitAnswer } from '../src/domain/learning';
import { topics } from '../src/domain/catalog';
import type { CurriculumNode } from '../src/domain/curriculum-data/types';
import { curriculumNodes } from '../src/domain/curriculum-data';
import {
  addCustomTopic,
  addStudyActiveTime,
  addStudyBlock,
  buildStudyReportText,
  completeStudyBlock,
  createPlanningState,
  finishStudyDay,
  generateStudyPlan,
  hydrateStudyPlanning,
  localStudyDate,
  moveStudyBlock,
  pauseStudyDay,
  recordSchoolTopic,
  removeStudyBlock,
  resumeStudyDay,
  setStudyBlockNote,
  shiftStudyDate,
  skipStudyBlock,
  startStudyBlock,
  startStudyDay,
  studyDayMinutes,
  updateStudyBlock,
  updateStudyDayMinutes,
  updateStudyPreferences,
  type StudyPlanningState,
  type StudyDayRun,
} from '../src/domain/study-plan';

const DAY = '2026-09-08',
  NOW = '2026-09-08T10:00:00.000Z';
const math = topics.find((topic) => topic.id === 'math-rectangle')!;
const history = topics.find((topic) => topic.subject === 'history')!;
const node = (id: string, changes: Partial<CurriculumNode> = {}): CurriculumNode => ({
  id,
  subject: 'math',
  code: '1.1',
  title: `Тема ${id}`,
  section: 'Числа',
  sourceId: 'fipi-demo',
  sourceDocumentId: 'math-2026-codifier',
  page: 8,
  editionYear: 2026,
  editionStatus: 'final',
  schoolGrades: [10],
  gradeBasis: 'approximate',
  gradeNote: 'Класс ориентировочный.',
  keywords: ['числа'],
  assessmentStatus: 'assessed',
  ...{ examLevels: ['basic', 'profile'] },
  ...changes,
});
function plan(): StudyPlanningState {
  let state = updateStudyDayMinutes(createPlanningState(), DAY, 60);
  state = addStudyBlock(state, DAY, {
    kind: 'study',
    subject: 'math',
    topicId: math.id,
    title: math.title,
    minutes: 25,
    reason: 'Практика',
  });
  state = addStudyBlock(state, DAY, {
    kind: 'break',
    title: 'Перерыв',
    minutes: 5,
    reason: 'Отдых',
  });
  return addStudyBlock(state, DAY, {
    kind: 'study',
    subject: 'history',
    topicId: history.id,
    title: history.title,
    minutes: 30,
    reason: 'Повторение',
  });
}
function running() {
  const lesson = startSession(createState('Тест'), math.id, '2026-09-08T09:00:00.000Z');
  const started = startStudyDay(plan(), DAY, NOW);
  const blockId = started.state.runs[started.runId].blocks[0].id;
  return {
    planning: started.state,
    runId: started.runId,
    blockId,
    learning: lesson.state,
    sessionId: lesson.sessionId,
  };
}
// This checks the student's actual report wording, not layout or native acceptance.
function reportUiText(run: StudyDayRun) {
  return renderToStaticMarkup(
    createElement(StudyRunView, {
      state: createState('Тест'),
      run,
      setState: () => {},
      notify: () => {},
      onEnter: () => {},
      onNext: () => {},
      onSkip: () => {},
      onFinish: () => {},
      onPause: () => {},
      onNote: () => {},
      onPlan: () => {},
      onHome: () => {},
    }),
  )
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ');
}

describe('deterministic calendar and honest allocation', () => {
  it('uses local dates at midnight, validates actual dates, and crosses leap/month/year boundaries', () => {
    expect(localStudyDate(new Date(2026, 8, 8, 0, 5))).toBe(DAY);
    expect(localStudyDate(DAY)).toBe(DAY);
    expect(shiftStudyDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftStudyDate('2028-02-29', 1)).toBe('2028-03-01');
    expect(shiftStudyDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(() => shiftStudyDate('2026-02-29', 1)).toThrow();
    expect(() => localStudyDate('2026-13-01')).toThrow();
  });
  it('defaults to 120 minutes, grade 10, basic math, exam 2028 without altering the learning profile', () => {
    const learning = createState();
    const state = createPlanningState();
    expect(state.preferences).toMatchObject({
      dailyMinutes: 120,
      schoolGrade: 10,
      mathLevel: 'basic',
      examYear: 2028,
    });
    const options = { period: 'week' as const, anchorDate: DAY };
    const a = generateStudyPlan(state, learning, [], options),
      b = generateStudyPlan(state, learning, [], options);
    expect(a).toEqual(b);
    expect(a.days[DAY].budgetMinutes).toBe(120);
    expect(learning.profile.dailyMinutes).toBe(30);
    expect(state.days).toEqual({});
    expect(a.plans['week-2026-09-07'].dates).toHaveLength(7);
    expect(a.days['2026-09-12'].budgetMinutes).toBe(0);
  });
  it('creates actual calendar months and keeps the first local day', () => {
    const state = generateStudyPlan(createPlanningState(), createState(), [], {
      period: 'month',
      anchorDate: '2028-02-20',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(state.plans['month-2028-02-01'].dates).toHaveLength(29);
    expect(state.plans['month-2028-02-01'].endDate).toBe('2028-02-29');
    expect(state.days['2028-02-01']).toBeDefined();
  });
  it.each([0, 1, 5, 30, 119, 120, 180, 720])(
    'allocates %i minutes including breaks without a trailing break or overflow',
    (minutes) => {
      const state = generateStudyPlan(createPlanningState(), createState(), [], {
        period: 'week',
        anchorDate: DAY,
        dailyMinutes: minutes,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      });
      for (const day of Object.values(state.days)) {
        expect(studyDayMinutes(day)).toBeLessThanOrEqual(minutes);
        expect(day.entries.length).toBeLessThanOrEqual(48);
        expect(day.entries.at(-1)?.kind).not.toBe('break');
        if (minutes) expect(studyDayMinutes(day)).toBe(minutes);
        if (minutes >= 60) expect(day.entries.some((entry) => entry.kind === 'break')).toBe(true);
      }
    },
  );
  it('keeps user-edited days when ensuring overlapping week/month plans', () => {
    const initial = plan();
    const state = generateStudyPlan(initial, createState(), [], {
      period: 'month',
      anchorDate: DAY,
    });
    expect(state.days[DAY]).toEqual(initial.days[DAY]);
    const updated = generateStudyPlan(state, createState(), [], {
      period: 'week',
      anchorDate: DAY,
      replace: true,
      dailyMinutes: 90,
    });
    expect(updated.days[DAY].budgetMinutes).toBe(90);
    expect(studyDayMinutes(updated.days[DAY])).toBe(90);
  });
  it('uses selected subjects, overdue review, real mistakes and a recent school request', () => {
    const learning = createState();
    learning.profile.selectedSubjects = ['math'];
    learning.progress[math.id] = {
      mastery: 'review',
      attempts: [],
      nextReviewAt: '2026-09-07T10:00:00.000Z',
    };
    let state = recordSchoolTopic(
      createPlanningState(),
      { date: DAY, subject: 'math', title: 'Школьная тема', status: 'needs-help' },
      NOW,
    ).state;
    state = generateStudyPlan(state, learning, [node('math-new')], {
      period: 'week',
      anchorDate: DAY,
      dailyMinutes: 120,
      schoolGrade: 6,
    });
    const entries = state.days[DAY].entries.filter((entry) => entry.kind !== 'break');
    expect(entries.every((entry) => entry.subject === 'math')).toBe(true);
    expect(entries.some((entry) => entry.kind === 'review' && entry.topicId === math.id)).toBe(
      true,
    );
    expect(
      entries.some((entry) => entry.kind === 'school' && entry.title === 'Школьная тема'),
    ).toBe(true);
  });
  it('does not invent coverage of FIPI sections, excluded positions or unsupplied ready lessons', () => {
    const nodes = [
      node('parent', { assessmentStatus: 'section' }),
      node('excluded', { assessmentStatus: 'not-assessed-in-edition', lessonTopicId: math.id }),
      node('not-linked'),
      node('draft', { editionStatus: 'draft' }),
    ];
    const state = generateStudyPlan(createPlanningState(), createState(), nodes, {
      period: 'week',
      anchorDate: DAY,
      goal: 'ege',
      subjects: ['math'],
      dailyMinutes: 180,
    });
    const entries = Object.values(state.days).flatMap((day) => day.entries);
    expect(entries.some((entry) => entry.curriculumNodeId === 'not-linked' && !entry.topicId)).toBe(
      true,
    );
    expect(
      entries.some((entry) =>
        ['parent', 'excluded', 'draft'].includes(entry.curriculumNodeId ?? ''),
      ),
    ).toBe(false);
    expect(entries.some((entry) => entry.topicId === math.id)).toBe(false);
    const school = generateStudyPlan(createPlanningState(), createState(), nodes, {
      period: 'week',
      anchorDate: DAY,
      goal: 'school',
      subjects: ['math'],
      dailyMinutes: 180,
    });
    expect(
      Object.values(school.days)
        .flatMap((day) => day.entries)
        .find((entry) => entry.curriculumNodeId === 'excluded')?.reason,
    ).toContain('не проверяется на ЕГЭ');
  });
  it('allows an explicit custom topic and school note without making either an official mastery claim', () => {
    const custom = addCustomTopic(
      createPlanningState(),
      { subject: 'math', title: 'Мой вопрос', notes: 'Разобрать пример', topicId: history.id },
      NOW,
    );
    expect(custom.state.customTopics[0].topicId).toBeUndefined();
    const school = recordSchoolTopic(
      custom.state,
      { date: DAY, subject: 'math', title: 'Модуль числа', status: 'needs-help', topicId: math.id },
      NOW,
    );
    const state = generateStudyPlan(school.state, createState(), [], {
      period: 'week',
      anchorDate: DAY,
      goal: 'school',
      subjects: ['math'],
      dailyMinutes: 120,
    });
    expect(
      state.days[DAY].entries.find((entry) => entry.schoolTopicId === school.id)?.topicId,
    ).toBe(math.id);
    expect(
      state.days[DAY].entries.find((entry) => entry.customTopicId === custom.id)?.reason,
    ).toContain('по его выбору');
  });
});

describe('calendar editing and preserved runs', () => {
  it('includes all four selected subjects in a fresh balanced 120-minute day using the real catalogue', () => {
    const learning = createState(),
      state = generateStudyPlan(createPlanningState(), learning, curriculumNodes, {
        period: 'week',
        anchorDate: DAY,
        dailyMinutes: 120,
      });
    const blocks = state.days[DAY].entries.filter((block) => block.kind !== 'break');
    expect(new Set(blocks.map((block) => block.subject))).toEqual(
      new Set(['math', 'russian', 'history', 'social']),
    );
    expect(blocks.find((block) => block.subject === 'math')?.topicId).toBe('math-absolute');
    for (const block of blocks)
      if (block.topicId)
        expect(block.title).toBe(topics.find((topic) => topic.id === block.topicId)!.title);
    expect(studyDayMinutes(state.days[DAY])).toBe(120);
    expect(learning.progress).toEqual({});
  });
  it('keeps an explicit school request first while giving the other rooms space', () => {
    const learning = createState();
    const school = recordSchoolTopic(
      createPlanningState(),
      {
        date: DAY,
        subject: 'math',
        title: 'Сегодня проходили модули',
        topicId: 'math-absolute',
        status: 'needs-help',
      },
      NOW,
    );
    const state = generateStudyPlan(school.state, learning, curriculumNodes, {
      period: 'week',
      anchorDate: DAY,
      dailyMinutes: 120,
    });
    const blocks = state.days[DAY].entries.filter((block) => block.kind !== 'break');
    expect(blocks[0]).toMatchObject({
      subject: 'math',
      topicId: 'math-absolute',
      title: 'Сегодня проходили модули',
    });
    expect(new Set(blocks.map((block) => block.subject)).size).toBe(4);
  });
  it('prefers a grade-10 ready lesson over an unlinked position or older foundation', () => {
    const moduleLesson = topics.find((topic) => topic.id === 'math-absolute')!;
    const nodes = [
      node('grade-10-ready', { lessonTopicId: moduleLesson.id }),
      node('grade-10-overview'),
      node('lower-grade-ready', { schoolGrades: [6], lessonTopicId: math.id }),
    ];
    const state = generateStudyPlan(createPlanningState(), createState(), nodes, {
      period: 'week',
      anchorDate: DAY,
      goal: 'balanced',
      subjects: ['math'],
      dailyMinutes: 25,
    });
    expect(state.days[DAY].entries[0].curriculumNodeId).toBe('grade-10-ready');
    const school = recordSchoolTopic(
      createPlanningState(),
      {
        date: DAY,
        subject: 'math',
        title: 'Модуль со школьного урока',
        topicId: math.id,
        status: 'practice',
      },
      NOW,
    ).state;
    const requested = generateStudyPlan(school, createState(), nodes, {
      period: 'week',
      anchorDate: DAY,
      goal: 'balanced',
      subjects: ['math'],
      dailyMinutes: 25,
    });
    expect(requested.days[DAY].entries[0].title).toBe('Модуль со школьного урока');
  });
  it('does not inherit a basic-exam mapping from a parent or school programme level', () => {
    const unspecified = node('leaf-unknown', { programLevels: ['basic'] });
    delete (unspecified as CurriculumNode & { examLevels?: string[] }).examLevels;
    const parent = node('parent-basic', { assessmentStatus: 'section' });
    const leaf = node('profile-leaf');
    (leaf as CurriculumNode & { examLevels?: string[] }).examLevels = ['profile'];
    const state = generateStudyPlan(
      createPlanningState(),
      createState(),
      [parent, unspecified, leaf],
      { period: 'week', anchorDate: DAY, subjects: ['math'], goal: 'ege' },
    );
    expect(
      Object.values(state.days)
        .flatMap((day) => day.entries)
        .some((entry) => !!entry.curriculumNodeId),
    ).toBe(false);
    expect(
      state.days[DAY].entries
        .filter((entry) => entry.kind !== 'break')
        .every((entry) => entry.reason.includes('Локальный учебный материал')),
    ).toBe(true);
  });
  it('reduces priority of an actually completed curriculum block in the next week without assigning mastery', () => {
    const nodes = [node('first', { subject: 'history' }), node('second', { subject: 'history' })],
      learning = createState();
    let planning = generateStudyPlan(createPlanningState(), learning, nodes, {
      period: 'week',
      anchorDate: DAY,
      subjects: ['history'],
      dailyMinutes: 25,
    });
    const started = startStudyDay(planning, DAY, NOW),
      id = started.state.runs[started.runId].blocks[0].id;
    const completedNode = started.state.runs[started.runId].blocks[0].curriculumNodeId;
    planning = startStudyBlock(started.state, started.runId, id, learning, undefined, NOW);
    planning = completeStudyBlock(
      planning,
      started.runId,
      id,
      learning,
      '2026-09-08T10:01:00.000Z',
    );
    planning = finishStudyDay(planning, started.runId, learning, {
      now: '2026-09-08T10:02:00.000Z',
    });
    const next = generateStudyPlan(planning, learning, nodes, {
      period: 'week',
      anchorDate: '2026-09-14',
      subjects: ['history'],
      dailyMinutes: 25,
    });
    expect(next.days['2026-09-14'].entries[0].curriculumNodeId).not.toBe(completedNode);
    const month = generateStudyPlan(planning, learning, nodes, {
      period: 'month',
      anchorDate: '2026-09-14',
      subjects: ['history'],
      dailyMinutes: 25,
    });
    expect(month.days['2026-09-14'].entries[0].curriculumNodeId).not.toBe(completedNode);
    expect(next.runs[started.runId].report?.attempts).toBe(0);
    expect(learning.progress).toEqual({});
    expect('progress' in next).toBe(false);
  });
  it('rejects overflow atomically, supports explicit shortening, move and removal', () => {
    const initial = plan(),
      id = initial.days[DAY].entries[0].id;
    expect(() => updateStudyDayMinutes(initial, DAY, 20)).toThrow('превышают');
    expect(initial.days[DAY].budgetMinutes).toBe(60);
    expect(() =>
      addStudyBlock(initial, DAY, { kind: 'break', title: 'Лишнее', minutes: 5, reason: '' }),
    ).toThrow('превышают');
    const shortened = updateStudyDayMinutes(initial, DAY, 30, { trim: true });
    expect(studyDayMinutes(shortened.days[DAY])).toBe(25);
    let moved = moveStudyBlock(initial, DAY, '2026-09-09', id);
    expect(moved.days[DAY].entries).toHaveLength(2);
    expect(moved.days['2026-09-09'].entries[0].id).toBe(id);
    moved = updateStudyBlock(moved, '2026-09-09', id, { minutes: 40, title: 'Своя формулировка' });
    expect(moved.days['2026-09-09'].entries[0].minutes).toBe(40);
    expect(removeStudyBlock(moved, '2026-09-09', id).days['2026-09-09'].entries).toHaveLength(0);
  });
  it('resumes the same active day across midnight and rejects edits to its snapshot', () => {
    const f = running();
    let state = startStudyBlock(f.planning, f.runId, f.blockId, f.learning, f.sessionId, NOW);
    state = pauseStudyDay(state, f.runId);
    const restored = hydrateStudyPlanning(JSON.parse(JSON.stringify(state)));
    expect(restored.activeRunId).toBe(f.runId);
    expect(restored.runs[f.runId].status).toBe('paused');
    const resumed = startStudyDay(restored, '2026-09-09', '2026-09-09T10:00:00.000Z');
    expect(resumed.runId).toBe(f.runId);
    expect(resumed.resumed).toBe(true);
    expect(resumed.state.runs[f.runId].date).toBe(DAY);
    expect(resumed.state.runs[f.runId].blocks[0].status).toBe('active');
    expect(() => removeStudyBlock(resumed.state, DAY, f.blockId)).toThrow('План уже начат');
    const regenerated = generateStudyPlan(resumed.state, f.learning, [], {
      period: 'week',
      anchorDate: DAY,
      replace: true,
      dailyMinutes: 240,
    });
    expect(regenerated.runs[f.runId]).toEqual(resumed.state.runs[f.runId]);
    expect(regenerated.days[DAY].budgetMinutes).toBe(60);
  });
  it('does not complete unopened blocks or imply completion from a clock tick', () => {
    const f = running();
    expect(() => completeStudyBlock(f.planning, f.runId, f.blockId, f.learning, NOW)).toThrow(
      'Сначала начни',
    );
    let state = startStudyBlock(f.planning, f.runId, f.blockId, f.learning, f.sessionId, NOW);
    state = addStudyActiveTime(state, f.runId, 5000);
    expect(state.runs[f.runId].blocks[0]).toMatchObject({ status: 'active', activeMs: 5000 });
    expect(addStudyActiveTime(state, f.runId, 5001)).toBe(state);
    const paused = pauseStudyDay(state, f.runId);
    expect(addStudyActiveTime(paused, f.runId, 5000)).toBe(paused);
    expect(resumeStudyDay(paused, f.runId).runs[f.runId].blocks[0].status).toBe('active');
    expect(() => finishStudyDay(state, f.runId, f.learning, { now: NOW })).toThrow('незавершённые');
  });
  it('rejects cross-subject sessions and simultaneous blocks', () => {
    const f = running(),
      foreign = startSession(f.learning, history.id, NOW);
    expect(() =>
      startStudyBlock(f.planning, f.runId, f.blockId, foreign.state, foreign.sessionId, NOW),
    ).toThrow('именно этого');
    const state = startStudyBlock(f.planning, f.runId, f.blockId, f.learning, f.sessionId, NOW);
    expect(() =>
      startStudyBlock(state, f.runId, state.runs[f.runId].blocks[2].id, f.learning, undefined, NOW),
    ).toThrow('текущий блок');
    expect(() =>
      startStudyBlock(state, f.runId, f.blockId, foreign.state, foreign.sessionId, NOW),
    ).toThrow('другим занятием');
  });
});

describe('reports based on actual session evidence', () => {
  it.each([
    [0, '0 с'],
    [10_000, '10 с'],
    [59_999, '59 с'],
    [60_000, '1 мин'],
    [125_000, '2 мин'],
  ] as const)(
    'keeps %i ms consistent in the early report UI and PDF text',
    (activeMs, expected) => {
      const f = running();
      const state = startStudyBlock(f.planning, f.runId, f.blockId, f.learning, f.sessionId, NOW);
      f.learning.sessions[f.sessionId].activeMs = activeMs;
      const done = finishStudyDay(state, f.runId, f.learning, {
        early: true,
        now: '2026-09-08T10:03:00.000Z',
      });
      const run = done.runs[f.runId];
      expect(run.report?.activeMs).toBe(activeMs);
      expect(buildStudyReportText(run.report!)).toContain(
        `Измеренная учебная активность: ${expected}.`,
      );
      expect(reportUiText(run)).toContain(`${expected}измеренной учебной активности`);
      expect(reportUiText(run)).toContain('Учебные блоки: завершено 0, пропущено 0, осталось 2.');
    },
  );
  it('names an entirely skipped sequence without claiming it was viewed or completed', () => {
    const f = running();
    let state = f.planning;
    for (const block of state.runs[f.runId].blocks)
      state = skipStudyBlock(state, f.runId, block.id, f.learning, NOW);
    const sequence = reportUiText(state.runs[f.runId]);
    expect(sequence).toContain('Завершено 0 из 2 · пропущено 2 · осталось 0');
    expect(sequence).toContain('Последовательность закончилась — пора подвести итог');
    expect(sequence).not.toContain('Все блоки просмотрены');
    const done = finishStudyDay(state, f.runId, f.learning, { now: NOW });
    const run = done.runs[f.runId];
    expect(reportUiText(run)).toContain('Учебные блоки: завершено 0, пропущено 2, осталось 0.');
    expect(run.report).toMatchObject({
      attempts: 0,
      completedBlocks: 0,
      skippedBlocks: 2,
      unfinishedBlocks: 0,
    });
    expect(f.learning.progress[math.id]).toMatchObject({ attempts: [], mastery: 'new' });
  });
  it('preserves spaces and line breaks while a learner types a controlled block note', () => {
    const f = running();
    let state = startStudyBlock(f.planning, f.runId, f.blockId, f.learning, f.sessionId, NOW);
    const before = state;
    const text = '  Понял первый шаг \n  Следующий шаг: ';
    let typed = '';
    for (const character of text) {
      typed += character;
      state = setStudyBlockNote(state, f.runId, f.blockId, typed);
      expect(state.runs[f.runId].blocks[0].note).toBe(typed);
    }
    expect(before.runs[f.runId].blocks[0].note).toBeUndefined();
    expect(state.runs[f.runId].blocks[0].status).toBe('active');
    expect(state.runs[f.runId].blocks[0].evidence).toBeUndefined();
  });
  it('excludes earlier attempts, foreign sessions and unknown task IDs; assistance is not independence', () => {
    const f = running();
    let learning = submitAnswer(
      f.learning,
      f.sessionId,
      math.tasks[0].answer,
      '2026-09-08T09:30:00.000Z',
    );
    learning.sessions[f.sessionId].activeMs = 60_000;
    let state = startStudyBlock(f.planning, f.runId, f.blockId, learning, f.sessionId, NOW);
    learning = submitAnswer(learning, f.sessionId, '9999', '2026-09-08T10:01:00.000Z');
    learning = submitAnswer(learning, f.sessionId, 'не знаю', '2026-09-08T10:02:00.000Z');
    learning = submitAnswer(
      learning,
      f.sessionId,
      math.tasks[1].answer,
      '2026-09-08T10:03:00.000Z',
    );
    learning.progress[math.id].attempts.push(
      {
        sessionId: 'foreign',
        taskId: math.tasks[0].id,
        correct: true,
        assisted: false,
        at: '2026-09-08T10:03:00.000Z',
      },
      {
        sessionId: f.sessionId,
        taskId: 'unknown-task',
        correct: true,
        assisted: false,
        at: '2026-09-08T10:03:00.000Z',
      },
    );
    learning.sessions[f.sessionId].activeMs = 180_000;
    state = addStudyActiveTime(state, f.runId, 5000);
    state = completeStudyBlock(state, f.runId, f.blockId, learning, '2026-09-08T10:04:00.000Z');
    expect(state.runs[f.runId].blocks[0].evidence).toMatchObject({
      attempts: 2,
      independentCorrect: 0,
      assistedCorrect: 1,
      incorrect: 1,
      activeMs: 120_000,
    });
    expect(
      completeStudyBlock(state, f.runId, f.blockId, learning, '2026-09-08T10:05:00.000Z'),
    ).toBe(state);
    const done = finishStudyDay(state, f.runId, learning, {
      early: true,
      now: '2026-09-08T10:06:00.000Z',
    });
    const report = done.runs[f.runId].report!;
    expect(report).toMatchObject({
      completedBlocks: 1,
      completedMinutes: 25,
      plannedMinutes: 60,
      unfinishedBlocks: 1,
      attempts: 2,
      independentCorrect: 0,
      assistedCorrect: 1,
      incorrect: 1,
      activeMs: 120_000,
    });
    expect(done.runs[f.runId].blocks[2].status).toBe('pending');
    expect(done.activeRunId).toBeUndefined();
    expect(buildStudyReportText(report)).toContain('не подтверждение освоения');
    expect(buildStudyReportText(report)).toContain('Самостоятельных верных: 0');
    expect(
      finishStudyDay(done, f.runId, learning, { early: true, now: '2026-09-09T10:00:00.000Z' }),
    ).toBe(done);
  });
  it('keeps real work from an unfinished block in an early report without marking it completed', () => {
    const f = running();
    let state = startStudyBlock(f.planning, f.runId, f.blockId, f.learning, f.sessionId, NOW);
    const learning = submitAnswer(
      f.learning,
      f.sessionId,
      math.tasks[0].answer,
      '2026-09-08T10:01:00.000Z',
    );
    state = setStudyBlockNote(state, f.runId, f.blockId, 'Понял первый шаг, продолжу завтра');
    const done = finishStudyDay(state, f.runId, learning, {
      early: true,
      now: '2026-09-08T10:02:00.000Z',
    });
    expect(done.runs[f.runId].report).toMatchObject({
      completedBlocks: 0,
      completedMinutes: 0,
      attempts: 1,
      independentCorrect: 1,
      unfinishedBlocks: 2,
    });
    expect(done.runs[f.runId].blocks[0].status).toBe('paused');
    expect(done.runs[f.runId].blocks[0].note).toContain('продолжу завтра');
    const restored = hydrateStudyPlanning(done);
    expect(restored.runs[f.runId].report).toEqual(done.runs[f.runId].report);
  });
  it('does not mark a skipped block successful and allows a normal finish only after explicit decisions', () => {
    const f = running();
    let state = startStudyBlock(f.planning, f.runId, f.blockId, f.learning, f.sessionId, NOW);
    state = completeStudyBlock(state, f.runId, f.blockId, f.learning, '2026-09-08T10:01:00.000Z');
    for (const block of state.runs[f.runId].blocks.slice(1))
      state = skipStudyBlock(state, f.runId, block.id, f.learning, '2026-09-08T10:02:00.000Z');
    const done = finishStudyDay(state, f.runId, f.learning, { now: '2026-09-08T10:03:00.000Z' });
    expect(done.runs[f.runId].report).toMatchObject({
      endedEarly: false,
      completedBlocks: 1,
      skippedBlocks: 1,
      attempts: 0,
      completedBreaks: 0,
    });
    expect(done.runs[f.runId].report?.completedMinutes).toBe(25);
  });
  it('retains a completed evidence snapshot when later answers arrive in the same lesson', () => {
    const f = running();
    let state = startStudyBlock(f.planning, f.runId, f.blockId, f.learning, f.sessionId, NOW);
    state = completeStudyBlock(state, f.runId, f.blockId, f.learning, '2026-09-08T10:01:00.000Z');
    const learning = submitAnswer(
      f.learning,
      f.sessionId,
      math.tasks[0].answer,
      '2026-09-08T10:02:00.000Z',
    );
    const done = finishStudyDay(state, f.runId, learning, {
      early: true,
      now: '2026-09-08T10:03:00.000Z',
    });
    expect(done.runs[f.runId].report?.attempts).toBe(0);
  });
});

describe('bounded persistence', () => {
  it('hydrates defaults, clamps bounds, discards invalid dates/foreign topic links and keeps IDs unique', () => {
    expect(hydrateStudyPlanning(null)).toEqual(createPlanningState());
    const initial = plan();
    const raw = JSON.parse(JSON.stringify(initial));
    raw.sequence = 0;
    raw.preferences.dailyMinutes = Infinity;
    raw.preferences.weekdays = [1, 1, -1, 8];
    raw.days['2026-02-29'] = raw.days[DAY];
    raw.days[DAY].entries[0].topicId = history.id;
    raw.days[DAY].entries.push({ ...raw.days[DAY].entries[0], id: 'overflow', minutes: 9999 });
    const clean = hydrateStudyPlanning(raw);
    expect(clean.days['2026-02-29']).toBeUndefined();
    expect(clean.days[DAY].entries[0].topicId).toBeUndefined();
    expect(clean.preferences.dailyMinutes).toBe(120);
    expect(clean.preferences.weekdays).toEqual([1]);
    expect(studyDayMinutes(clean.days[DAY])).toBeLessThanOrEqual(clean.days[DAY].budgetMinutes);
    const next = addCustomTopic(clean, { subject: 'math', title: 'Моя тема' }, NOW);
    expect(Number(next.id.split('-').at(-1))).toBeGreaterThan(initial.sequence);
  });
  it('does not promote a persisted unopened block to completed', () => {
    const f = running(),
      raw = JSON.parse(JSON.stringify(f.planning));
    raw.runs[f.runId].blocks[0].status = 'completed';
    raw.runs[f.runId].blocks[0].evidence = { independentCorrect: 99 };
    const clean = hydrateStudyPlanning(raw),
      block = clean.runs[f.runId].blocks[0];
    expect(block.status).toBe('pending');
    expect(block.evidence).toBeUndefined();
    expect(clean.activeRunId).toBe(f.runId);
  });
  it('updates preferences without rewriting already planned days or academic mastery', () => {
    const state = plan(),
      before = JSON.stringify(state.days);
    const next = updateStudyPreferences(state, {
      dailyMinutes: 240,
      mathLevel: 'profile',
      examYear: 2029,
    });
    expect(JSON.stringify(next.days)).toBe(before);
    expect(next.preferences).toMatchObject({
      dailyMinutes: 240,
      mathLevel: 'profile',
      examYear: 2029,
    });
    expect('progress' in next).toBe(false);
  });
});
