import { describe, expect, it } from 'vitest';
import {
  createState,
  startSession,
  submitAnswer,
  finishSession,
  hydrateState,
} from '../src/domain/learning';
import { topics } from '../src/domain/catalog';
import { curriculumNodes } from '../src/domain/curriculum-data';
import { getSource } from '../src/domain/sources';
import {
  addStudyBlock,
  createPlanningState,
  updateStudyDayMinutes,
  studyDayMinutes,
  pauseStudyDay,
  setStudyBlockNote,
  startStudyBlock,
  type StudyBlockInput,
} from '../src/domain/study-plan';
import {
  putTopicInDay,
  addPersonalToDay,
  addSchoolToDay,
  startDailyLearning,
  enterDailyBlock,
  completeDailyBlock,
  finishDailyLearning,
  dailyErrorReviews,
  dailyReportContent,
  refitStudyDay,
  ensureTodayPlan,
} from '../src/domain/study-actions';

const DAY = '2026-09-08',
  NOW = '2026-09-08T10:00:00.000Z';
const math = topics.find((topic) => topic.id === 'math-rectangle')!;
const item = (
  title: string,
  minutes: number,
  kind: StudyBlockInput['kind'] = 'study',
): StudyBlockInput => ({
  title,
  minutes,
  kind,
  subject: 'math',
  reason: kind === 'custom' ? 'Моя тема' : 'Автоматическая практика',
});
function fixture() {
  const state = createState('Тест');
  let planning = updateStudyDayMinutes(createPlanningState(), DAY, 60);
  planning = addStudyBlock(planning, DAY, { ...item(math.title, 25), topicId: math.id });
  planning = addStudyBlock(planning, DAY, {
    kind: 'break',
    title: 'Перерыв',
    minutes: 5,
    reason: 'Отдых',
  });
  planning = addStudyBlock(planning, DAY, item('Обзор без готового урока', 30));
  state.planning = planning;
  return state;
}
function entered() {
  const started = startDailyLearning(fixture(), DAY, NOW);
  const blockId = started.state.planning!.runs[started.runId].blocks[0].id;
  const opened = enterDailyBlock(started.state, started.runId, blockId, NOW);
  return { ...opened, runId: started.runId, blockId, sessionId: opened.sessionId! };
}
describe('personal selections and atomic time budgets', () => {
  it('merges the 120-minute school-module insertion with its current automatic allocation', () => {
    const before = ensureTodayPlan(createState('Тест'), DAY);
    const planned = before.planning!.days[DAY];
    const automatic = planned.entries.find((block) => block.topicId === 'math-absolute')!;
    expect(automatic.minutes).toBeGreaterThanOrEqual(25);
    const original = JSON.stringify(before);
    const next = addSchoolToDay(before, {
      title: 'Модули и уравнения с модулем',
      subject: 'math',
      date: DAY,
      minutes: 25,
      status: 'needs-help',
    });
    const day = next.planning!.days[DAY];
    expect(day.budgetMinutes).toBe(120);
    expect(studyDayMinutes(day)).toBe(120);
    expect(day.entries.filter((block) => block.topicId === 'math-absolute')).toHaveLength(1);
    expect(day.entries[0]).toMatchObject({
      id: automatic.id,
      kind: 'school',
      subject: 'math',
      topicId: 'math-absolute',
      minutes: automatic.minutes,
    });
    expect(day.entries[0].schoolTopicId).toBe(next.planning!.schoolTopics[0].id);
    expect(day.entries[0].reason).toContain('Объединено');
    expect(day.entries[1].kind).toBe('break');
    expect(day.entries.at(-1)?.kind).not.toBe('break');
    for (const block of planned.entries.filter((block) => block.id !== automatic.id))
      expect(day.entries.find((saved) => saved.id === block.id)).toEqual(block);
    expect(next.progress).toEqual(before.progress);
    expect(JSON.stringify(before)).toBe(original);
    expect(hydrateState(next).planning!.days[DAY]).toEqual(day);
  });
  it('retains an intentional personal repeat while upgrading only automatic same-subject practice', () => {
    let planning = updateStudyDayMinutes(createPlanningState(), DAY, 60);
    planning = addStudyBlock(planning, DAY, {
      ...item('Повторю ещё раз', 15, 'custom'),
      topicId: math.id,
      customTopicId: 'custom-repeat',
    });
    planning = addStudyBlock(planning, DAY, {
      ...item('Автоматический разбор', 30),
      topicId: math.id,
    });
    planning = addStudyBlock(planning, DAY, {
      ...item('Личная тема истории', 15, 'custom'),
      subject: 'history',
      customTopicId: 'custom-history',
    });
    const personal = planning.days[DAY].entries.filter((block) => block.kind === 'custom');
    const next = putTopicInDay(planning, DAY, {
      ...item('Школьный разбор', 25, 'school'),
      topicId: math.id,
      schoolTopicId: 'school-new',
    });
    expect(studyDayMinutes(next.days[DAY])).toBe(60);
    expect(next.days[DAY].entries[0]).toMatchObject({
      kind: 'school',
      minutes: 30,
      schoolTopicId: 'school-new',
    });
    expect(next.days[DAY].entries.filter((block) => block.kind === 'custom')).toEqual(personal);
    expect(next.days[DAY].entries.filter((block) => block.topicId === math.id)).toHaveLength(2);
  });
  it('rolls back the school observation and merge if a longer request would consume protected time', () => {
    const state = createState('Тест');
    let planning = updateStudyDayMinutes(createPlanningState(), DAY, 60);
    planning = addStudyBlock(planning, DAY, { ...item('Модули', 10), topicId: 'math-absolute' });
    planning = addStudyBlock(planning, DAY, item('Моя обязательная практика', 50, 'custom'));
    state.planning = planning;
    const original = JSON.stringify(state);
    expect(() =>
      addSchoolToDay(state, {
        title: 'Модули',
        subject: 'math',
        date: DAY,
        minutes: 25,
        status: 'needs-help',
      }),
    ).toThrow('заполнен твоими');
    expect(JSON.stringify(state)).toBe(original);
    expect(state.planning.schoolTopics).toHaveLength(0);
  });
  it('has a real source catalogue available to integration actions', () =>
    expect(curriculumNodes.length).toBeGreaterThan(100));
  it('makes space only in the automatic tail and never changes the chosen budget', () => {
    let planning = updateStudyDayMinutes(createPlanningState(), DAY, 60);
    planning = addStudyBlock(planning, DAY, item('Личный разбор', 25, 'custom'));
    planning = addStudyBlock(planning, DAY, item('Авто', 35));
    const before = JSON.stringify(planning),
      next = putTopicInDay(planning, DAY, item('Школьный вопрос', 20, 'school'));
    expect(next.days[DAY].budgetMinutes).toBe(60);
    expect(studyDayMinutes(next.days[DAY])).toBe(60);
    expect(next.days[DAY].entries.find((block) => block.title === 'Личный разбор')?.minutes).toBe(
      25,
    );
    expect(next.days[DAY].entries.find((block) => block.title === 'Авто')?.minutes).toBe(15);
    expect(next.days[DAY].entries[0].title).toBe('Школьный вопрос');
    expect(JSON.stringify(planning)).toBe(before);
  });
  it('protects explicitly selected curriculum entries and rolls back failed insertion', () => {
    let planning = updateStudyDayMinutes(createPlanningState(), DAY, 60);
    planning = addStudyBlock(planning, DAY, {
      ...item('Выбранная тема', 50),
      reason: 'Добавлено учеником. Проверенная тема.',
    });
    planning = addStudyBlock(planning, DAY, item('Авто', 10));
    const before = JSON.stringify(planning);
    expect(() => putTopicInDay(planning, DAY, item('Не помещается', 25, 'custom'))).toThrow(
      'заполнен твоими',
    );
    expect(JSON.stringify(planning)).toBe(before);
    expect(() =>
      putTopicInDay(createPlanningState(), DAY, item('Нельзя увеличить скрыто', 180, 'custom')),
    ).toThrow('Сначала увеличь');
  });
  it('does not leave an orphan custom record when the calendar transaction fails', () => {
    const state = fixture();
    state.planning = updateStudyDayMinutes(state.planning!, DAY, 0, { trim: true });
    const before = JSON.stringify(state);
    expect(() =>
      addPersonalToDay(state, { title: 'Моя тема', subject: 'math', date: DAY, minutes: 25 }),
    ).toThrow('Сначала увеличь');
    expect(JSON.stringify(state)).toBe(before);
    expect(state.planning.customTopics).toHaveLength(0);
  });
  it('records an understood school observation without allocating a calendar or inventing progress', () => {
    const state = createState('Тест'),
      before = JSON.stringify(state.progress);
    const next = addSchoolToDay(state, {
      title: 'Модули',
      subject: 'math',
      date: DAY,
      minutes: 25,
      status: 'understood',
    });
    expect(next.planning!.schoolTopics.at(-1)?.status).toBe('understood');
    expect(next.planning!.days).toEqual(state.planning?.days ?? {});
    expect(JSON.stringify(next.progress)).toBe(before);
  });
  it('refits down and up while retaining personal block identity and profile/preferences budget', () => {
    const state = fixture();
    state.planning = putTopicInDay(state.planning!, DAY, item('Моя тема', 20, 'custom'));
    const personal = state.planning.days[DAY].entries[0];
    const reduced = refitStudyDay(state, DAY, 30);
    expect(reduced.planning!.days[DAY].entries.find((block) => block.id === personal.id)).toEqual(
      personal,
    );
    expect(studyDayMinutes(reduced.planning!.days[DAY])).toBeLessThanOrEqual(30);
    expect(reduced.profile.dailyMinutes).toBe(30);
    expect(reduced.planning!.preferences.dailyMinutes).toBe(30);
    const increased = refitStudyDay(reduced, DAY, 120);
    expect(increased.planning!.days[DAY].entries.find((block) => block.id === personal.id)).toEqual(
      personal,
    );
    expect(studyDayMinutes(increased.planning!.days[DAY])).toBeGreaterThan(30);
    expect(studyDayMinutes(increased.planning!.days[DAY])).toBeLessThanOrEqual(120);
    expect(increased.profile.dailyMinutes).toBe(120);
    const before = JSON.stringify(increased);
    expect(() => refitStudyDay(increased, DAY, 10)).toThrow('выбранные темы');
    expect(JSON.stringify(increased)).toBe(before);
  });
});
describe('start, resume, rest and finalization transactions', () => {
  it('resumes the same session and day after a pause/date change, without creating a second session', () => {
    const f = entered();
    const paused = { ...f.state, planning: pauseStudyDay(f.state.planning!, f.runId) };
    const resumed = startDailyLearning(paused, '2026-09-09', '2026-09-09T10:00:00.000Z');
    expect(resumed.runId).toBe(f.runId);
    expect(resumed.state.planning!.days['2026-09-09']).toBeUndefined();
    const reopened = enterDailyBlock(resumed.state, f.runId, f.blockId, '2026-09-09T10:01:00.000Z');
    expect(reopened.sessionId).toBe(f.sessionId);
    expect(Object.keys(reopened.state.sessions)).toHaveLength(1);
    expect(() => refitStudyDay(reopened.state, DAY, 90)).toThrow('уже начато');
  });
  it('fills an empty day at its saved duration, preserves neighbours and does not bypass explicit rest', () => {
    const state = fixture();
    state.planning = updateStudyDayMinutes(state.planning!, DAY, 0, { trim: true });
    state.planning = updateStudyDayMinutes(state.planning, DAY, 35);
    state.planning = updateStudyDayMinutes(state.planning, '2026-09-09', 15);
    const neighbour = state.planning.days['2026-09-09'];
    const started = startDailyLearning(state, DAY, NOW);
    expect(started.state.planning!.days[DAY].budgetMinutes).toBe(35);
    expect(studyDayMinutes(started.state.planning!.days[DAY])).toBeLessThanOrEqual(35);
    expect(started.state.planning!.days['2026-09-09']).toEqual(neighbour);
    expect(Object.values(started.state.planning!.days).every((day) => !!day)).toBe(true);
    const rest = fixture();
    rest.planning = updateStudyDayMinutes(rest.planning!, DAY, 0, { trim: true });
    expect(() => startDailyLearning(rest, DAY, NOW)).toThrow('0 минут');
  });
  it('does not reopen a finished session, but allows explicitly closing its day block', () => {
    const f = entered(),
      closed = finishSession(f.state, f.sessionId, '2026-09-08T10:01:00.000Z');
    const before = JSON.stringify(closed);
    expect(() => enterDailyBlock(closed, f.runId, f.blockId, '2026-09-08T10:02:00.000Z')).toThrow(
      'Подведи итог блока',
    );
    expect(JSON.stringify(closed)).toBe(before);
    const complete = completeDailyBlock(closed, f.runId, f.blockId, '2026-09-08T10:02:00.000Z');
    expect(complete.planning!.runs[f.runId].blocks[0].status).toBe('completed');
    expect(completeDailyBlock(complete, f.runId, f.blockId, '2026-09-08T10:03:00.000Z')).toBe(
      complete,
    );
    expect(Object.keys(complete.sessions)).toHaveLength(1);
  });
  it('does not recreate a lost or mismatched saved session', () => {
    const f = entered(),
      broken = structuredClone(f.state);
    delete broken.sessions[f.sessionId];
    expect(() => enterDailyBlock(broken, f.runId, f.blockId, NOW)).toThrow('недоступно');
    expect(Object.keys(broken.sessions)).toHaveLength(0);
    const foreign = topics.find((topic) => topic.subject === 'history')!;
    broken.sessions[f.sessionId] = {
      ...f.state.sessions[f.sessionId],
      subject: 'history',
      topicId: foreign.id,
    };
    expect(() => enterDailyBlock(broken, f.runId, f.blockId, NOW)).toThrow('другой теме');
  });
  it('finishes only the day-owned sessions and leaves pending blocks unchanged on early exit', () => {
    const f = entered(),
      other = startSession(f.state, topics.find((topic) => topic.subject === 'history')!.id, NOW);
    const done = finishDailyLearning(other.state, f.runId, true, '2026-09-08T10:01:00.000Z');
    expect(done.sessions[f.sessionId].completedAt).toBeDefined();
    expect(done.sessions[other.sessionId].completedAt).toBeUndefined();
    expect(done.planning!.runs[f.runId].blocks[2].status).toBe('pending');
    expect(done.planning!.runs[f.runId].report?.completedBlocks).toBe(0);
    expect(finishDailyLearning(done, f.runId, true, '2026-09-08T10:02:00.000Z')).toBe(done);
  });
});
describe('the same historical evidence filter for report UI and exported text', () => {
  it('freezes the completed lesson notebook in the report and retains long multiline notes after restart', () => {
    const f = entered();
    const note = '  Мой ход решения\n' + 'Проверяю единицы площади. '.repeat(120) + '\n  ';
    f.state.sessions[f.sessionId].note = note;
    const completed = completeDailyBlock(f.state, f.runId, f.blockId, '2026-09-08T10:01:00.000Z');
    expect(completed.planning!.runs[f.runId].blocks[0].note).toBe(note);
    expect(f.state.planning!.runs[f.runId].blocks[0].note).toBeUndefined();

    const done = finishDailyLearning(completed, f.runId, true, '2026-09-08T10:02:00.000Z');
    done.sessions[f.sessionId].note = 'Поздняя правка в истории занятий';
    const report = dailyReportContent(done, f.runId);
    expect(report).toContain(note);
    expect(report).not.toContain('Поздняя правка в истории занятий');

    const restarted = hydrateState(JSON.parse(JSON.stringify(done)));
    expect(restarted.planning!.runs[f.runId].blocks[0].note).toBe(note);
    expect(dailyReportContent(restarted, f.runId)).toContain(note);
  });
  it('captures the active lesson notebook on early exit without completing its block or including another session', () => {
    const f = entered();
    const other = startSession(
      f.state,
      topics.find((topic) => topic.subject === 'history')!.id,
      NOW,
    );
    other.state.sessions[f.sessionId].note = 'Первый шаг\nОстался вопрос об единицах';
    other.state.sessions[other.sessionId].note = 'Чужая заметка по истории';
    const done = finishDailyLearning(other.state, f.runId, true, '2026-09-08T10:01:00.000Z');
    const block = done.planning!.runs[f.runId].blocks[0];
    expect(block.status).toBe('paused');
    expect(block.note).toBe('Первый шаг\nОстался вопрос об единицах');
    expect(done.planning!.runs[f.runId].report?.completedBlocks).toBe(0);
    const report = dailyReportContent(done, f.runId);
    expect(report).toContain(block.note!);
    expect(report).not.toContain('Чужая заметка по истории');
    expect(done.sessions[other.sessionId].completedAt).toBeUndefined();
  });
  it('exports registry provenance only for started topics, keeping future subjects out of the studied-material list', () => {
    const state = fixture();
    const mathNode = curriculumNodes.find(
      (node) =>
        node.subject === 'math' &&
        (node.lessonTopicId === math.id || node.lessonTopicIds?.includes(math.id)),
    )!;
    const history = topics.find((topic) => topic.id === 'history-baptism')!;
    const historyNode = curriculumNodes.find(
      (node) =>
        node.subject === 'history' &&
        (node.lessonTopicId === history.id || node.lessonTopicIds?.includes(history.id)),
    )!;
    state.planning!.days[DAY].entries[0].curriculumNodeId = mathNode.id;
    Object.assign(state.planning!.days[DAY].entries[2], {
      subject: 'history',
      topicId: history.id,
      curriculumNodeId: historyNode.id,
      title: history.title,
    });
    const started = startDailyLearning(state, DAY, NOW);
    const blockId = started.state.planning!.runs[started.runId].blocks[0].id;
    const entered = enterDailyBlock(started.state, started.runId, blockId, NOW);
    const done = finishDailyLearning(
      entered.state,
      started.runId,
      true,
      '2026-09-08T10:01:00.000Z',
    );
    const report = dailyReportContent(done, started.runId);
    const mathSource = getSource(mathNode.sourceId)!;
    expect(report).toContain(mathSource.url);
    expect(report).toContain(mathSource.version);
    expect(report).toContain(mathSource.checkedAt);
    expect(report).toContain('не подтверждение каждого авторского примера');
    expect(report).toContain('Авторский тренировочный материал Cosmos');
    expect(report).not.toContain(getSource(historyNode.sourceId)!.url);
    expect(report).not.toContain(getSource('history-baptism-source')!.url);
    expect(done.planning!.runs[started.runId].blocks[2].startedAt).toBeUndefined();
  });
  it('preserves a note from a curriculum overview without an attached lesson', () => {
    const started = startDailyLearning(fixture(), DAY, NOW),
      block = started.state.planning!.runs[started.runId].blocks[2];
    let state = {
      ...started.state,
      planning: startStudyBlock(
        started.state.planning!,
        started.runId,
        block.id,
        started.state,
        undefined,
        NOW,
      ),
    };
    state = {
      ...state,
      planning: setStudyBlockNote(
        state.planning!,
        started.runId,
        block.id,
        'Моя заметка без готового урока',
      ),
    };
    const done = finishDailyLearning(state, started.runId, true, '2026-09-08T10:01:00.000Z');
    expect(dailyReportContent(done, started.runId)).toContain('Моя заметка без готового урока');
    expect(dailyErrorReviews(done, started.runId)).toEqual([]);
  });
  it('excludes baseline, late, foreign and unknown attempts while retaining a real error once', () => {
    const f = entered();
    let state = submitAnswer(f.state, f.sessionId, '9999', '2026-09-08T10:01:00.000Z');
    state = submitAnswer(state, f.sessionId, 'не знаю', '2026-09-08T10:02:00.000Z');
    state = submitAnswer(state, f.sessionId, '7', '2026-09-08T10:02:10.000Z');
    state = submitAnswer(state, f.sessionId, 'дальше', '2026-09-08T10:02:20.000Z');
    state = submitAnswer(state, f.sessionId, 'умножение', '2026-09-08T10:02:30.000Z');
    state = submitAnswer(state, f.sessionId, 'дальше', '2026-09-08T10:02:40.000Z');
    state = submitAnswer(state, f.sessionId, math.tasks[0].answer, '2026-09-08T10:03:00.000Z');
    const old = {
      sessionId: f.sessionId,
      taskId: math.tasks[1].id,
      correct: false,
      assisted: false,
      at: NOW,
    };
    state.progress[math.id].attempts.push(old);
    state.planning!.runs[f.runId].blocks[0].attemptBaseline.push(
      JSON.stringify([old.taskId, old.at, old.correct, old.assisted]),
    );
    state = completeDailyBlock(state, f.runId, f.blockId, '2026-09-08T10:04:00.000Z');
    state = finishDailyLearning(state, f.runId, true, '2026-09-08T10:05:00.000Z');
    state.progress[math.id].attempts.push(
      { ...old, at: '2026-09-08T10:06:00.000Z' },
      { ...old, at: '2026-09-08T10:01:00.000Z', sessionId: 'foreign' },
      { ...old, at: '2026-09-08T10:01:00.000Z', taskId: 'unknown' },
    );
    const reviews = dailyErrorReviews(state, f.runId);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].prompt).toBe(math.tasks[0].prompt);
    const text = dailyReportContent(state, f.runId);
    expect(text).toContain(math.tasks[0].explanation);
    expect(text).not.toContain('Задание: ' + math.tasks[1].prompt);
    expect(text).toContain('текущую версию локальных заданий');
    expect(state.planning!.runs[f.runId].report).toMatchObject({
      attempts: 2,
      independentCorrect: 0,
      assistedCorrect: 1,
      incorrect: 1,
    });
  });
});
