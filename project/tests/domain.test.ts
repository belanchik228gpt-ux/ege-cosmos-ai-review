import { describe, expect, it } from 'vitest';
import {
  appendDiscussion,
  buildPlan,
  checkAnswer,
  createState,
  finishSession,
  getStats,
  hydrateState,
  sources,
  startSession,
  subjectHistory,
  submitAnswer,
  topics,
  topicStatus,
  type LearningState,
  getTeachingContext,
} from '../src/domain';

const START = '2026-09-07T09:00:00.000Z';
const NEXT_DAY = '2026-09-08T10:00:00.000Z';

function complete(state: LearningState, topicId: string, at = START) {
  const lesson = topics.find((topic) => topic.id === topicId)!;
  const started = startSession(state, topicId, at);
  let next = started.state;
  for (let index = 0; index < lesson.tasks.length; index++) {
    const task = lesson.tasks[index];
    if (task.teachingSteps?.length) {
      for (const step of task.teachingSteps) {
        if (next.sessions[started.sessionId].taskIndex !== index) break;
        expect(getTeachingContext(next.sessions[started.sessionId], task).stepId).toBe(step.id);
        next = submitAnswer(next, started.sessionId, step.question.answer, at);
        next = submitAnswer(next, started.sessionId, 'дальше', at);
      }
    }
    if (next.sessions[started.sessionId].taskIndex === index)
      next = submitAnswer(next, started.sessionId, task.answer, at);
  }
  return { state: finishSession(next, started.sessionId, at), sessionId: started.sessionId };
}

describe('local learning content', () => {
  it('has executable, distinct tasks and declared local provenance in all four rooms', () => {
    expect(new Set(topics.map((topic) => topic.subject)).size).toBe(4);
    expect(topics.length).toBe(15);
    expect(new Set(topics.map((topic) => topic.id)).size).toBe(topics.length);
    const ids = new Set<string>();
    for (const topic of topics) {
      expect(topic.tasks.length).toBeGreaterThanOrEqual(4);
      expect(['synthetic', 'training']).toContain(topic.materialStatus);
      expect(sources.some((source) => source.id === topic.sourceId)).toBe(true);
      for (const task of topic.tasks) {
        expect(ids.has(task.id)).toBe(false);
        ids.add(task.id);
        expect(checkAnswer(task, task.answer)).toBe(true);
        expect(checkAnswer(task, 'это точно не ответ')).toBe(false);
      }
    }
    expect(sources.find((source) => source.id === 'fipi-demo')?.version).toContain('проекты');
  });

  it('checks rational numbers without evaluating code or accepting partial matches', () => {
    const fraction = topics.find((topic) => topic.id === 'math-fraction')!.tasks[0];
    expect(checkAnswer(fraction, ' 0,40 ')).toBe(true);
    expect(checkAnswer(fraction, '8/20')).toBe(true);
    expect(checkAnswer(fraction, '4/0')).toBe(false);
    expect(checkAnswer(fraction, '4/10 or 3/10')).toBe(false);
    expect(checkAnswer(fraction, 'alert(1)')).toBe(false);
    expect(checkAnswer(fraction, '0.4000001')).toBe(false);
    const reduce = topics.find((topic) => topic.id === 'math-fraction')!.tasks[1];
    expect(checkAnswer(reduce, '6/8')).toBe(false);
    expect(checkAnswer(reduce, '3/4')).toBe(true);
    const multiply = topics.find((topic) => topic.id === 'math-multiply')!.tasks[0];
    expect(checkAnswer(multiply, '2/10')).toBe(false);
    expect(checkAnswer(multiply, '1/5')).toBe(true);
  });

  it('runs every local lesson to summary without a model', () => {
    let state = createState('Саша');
    for (const topic of topics) {
      const result = complete(state, topic.id);
      state = result.state;
      expect(state.sessions[result.sessionId].phase).toBe('summary');
      expect(state.sessions[result.sessionId].completedAt).toBe(START);
      expect(topicStatus(state, topic.id).attempts).toHaveLength(topic.tasks.length);
      expect(topicStatus(state, topic.id).mastery).toBe(
        topic.tasks.some((task) => task.teachingSteps?.length) ? 'learning' : 'review',
      );
    }
    expect(getStats(state, START).completedSessions).toBe(topics.length);
  });
});

describe('tutor conversation and progress', () => {
  it('waits for the student and provides a hint without a ready answer', () => {
    const base = createState('Миша');
    const started = startSession(base, 'math-rectangle', START);
    expect(started.state.sessions[started.sessionId].messages[0].text).toContain('Миша');
    const next = submitAnswer(started.state, started.sessionId, 'не знаю', START);
    const session = next.sessions[started.sessionId];
    expect(session.taskIndex).toBe(0);
    expect(session.messages.at(-1)?.kind).toBe('hint');
    expect(session.messages.at(-1)?.text).not.toContain('21');
    expect(topicStatus(next, 'math-rectangle').attempts).toHaveLength(0);
    expect(next.sessions[started.sessionId].hintsUsed).toBe(1);
    expect(base.sessions).toEqual({});
    expect(started.state.sessions[started.sessionId].messages).toHaveLength(2);
  });

  it('records a mistake, gives help, and marks the subsequent correction assisted', () => {
    const started = startSession(createState(), 'math-rectangle', START);
    let state = submitAnswer(started.state, started.sessionId, '10', START);
    expect(state.sessions[started.sessionId].taskIndex).toBe(0);
    expect(state.sessions[started.sessionId].messages.at(-1)?.text).not.toContain('21');
    state = submitAnswer(state, started.sessionId, '21', START);
    const progress = topicStatus(state, 'math-rectangle');
    expect(progress.attempts.map((attempt) => [attempt.correct, attempt.assisted])).toEqual([
      [false, false],
      [true, true],
    ]);
    expect(state.sessions[started.sessionId].taskIndex).toBe(1);
    expect(state.sessions[started.sessionId].hintsUsed).toBe(0);
    expect(progress.mastery).toBe('learning');
  });

  it('checks smaller questions before returning to the full task and restores that position', () => {
    const started = startSession(createState(), 'math-rectangle', START);
    let state = submitAnswer(started.state, started.sessionId, 'я не понимаю', START);
    expect(state.sessions[started.sessionId].scaffoldIndex).toBe(0);
    state = submitAnswer(state, started.sessionId, '7', START);
    expect(state.sessions[started.sessionId].teaching?.phase).toBe('answered');
    state = submitAnswer(state, started.sessionId, 'дальше', START);
    expect(state.sessions[started.sessionId].scaffoldIndex).toBe(1);
    expect(topicStatus(state, 'math-rectangle').attempts).toHaveLength(0);
    state = hydrateState(JSON.stringify(state));
    expect(state.sessions[started.sessionId].scaffoldIndex).toBe(1);
    state = submitAnswer(state, started.sessionId, 'умножение', START);
    state = submitAnswer(state, started.sessionId, 'дальше', START);
    expect(state.sessions[started.sessionId].scaffoldIndex).toBeUndefined();
    expect(state.sessions[started.sessionId].messages.at(-1)?.text).toContain('исходное задание');
    state = submitAnswer(state, started.sessionId, '21', START);
    expect(topicStatus(state, 'math-rectangle').attempts).toHaveLength(1);
    expect(topicStatus(state, 'math-rectangle').attempts[0].assisted).toBe(true);
  });

  it('does not count a requested solution as independent evidence', () => {
    const started = startSession(createState(), 'math-rectangle', START);
    let state = submitAnswer(started.state, started.sessionId, 'покажи решение', START);
    expect(state.sessions[started.sessionId].messages.at(-1)?.kind).toBe('solution');
    state = submitAnswer(state, started.sessionId, '21', START);
    expect(topicStatus(state, 'math-rectangle').attempts[0].assisted).toBe(true);
  });

  it('requires at least three distinct independent answers and a spaced repeat for mastery', () => {
    let state = createState();
    for (let repeat = 0; repeat < 5; repeat++) {
      const started = startSession(state, 'math-rectangle', START);
      state = submitAnswer(started.state, started.sessionId, '21', START);
      state = finishSession(state, started.sessionId, START);
    }
    expect(topicStatus(state, 'math-rectangle').mastery).toBe('learning');
    state = complete(state, 'math-rectangle').state;
    expect(topicStatus(state, 'math-rectangle').mastery).toBe('review');
    state = complete(state, 'math-rectangle', '2026-09-07T13:00:00.000Z').state;
    expect(topicStatus(state, 'math-rectangle').mastery).toBe('review');
    state = complete(state, 'math-rectangle', NEXT_DAY).state;
    expect(topicStatus(state, 'math-rectangle').mastery).toBe('mastered');
    expect(Date.parse(topicStatus(state, 'math-rectangle').nextReviewAt!)).toBeGreaterThan(
      Date.parse(NEXT_DAY),
    );
  });

  it('keeps subject contexts isolated and ignores input after completion', () => {
    const math = complete(createState(), 'math-rectangle');
    const russian = startSession(math.state, 'russian-syntax', START);
    const before = structuredClone(russian.state.sessions[math.sessionId]);
    const state = submitAnswer(russian.state, russian.sessionId, 'птицы', START);
    expect(state.sessions[math.sessionId]).toEqual(before);
    expect(subjectHistory(state, 'russian').map((session) => session.id)).toEqual([
      russian.sessionId,
    ]);
    expect(topicStatus(state, 'russian-syntax').attempts[0].taskId).toBe('syntax-1');
    expect(submitAnswer(state, math.sessionId, 'ещё один ответ', START)).toBe(state);
    expect(submitAnswer(state, 'missing', 'ответ', START)).toBe(state);
  });

  it('does not claim learning from an empty session', () => {
    const started = startSession(createState(), 'math-rectangle', START);
    const state = finishSession(started.state, started.sessionId, START);
    expect(topicStatus(state, 'math-rectangle').mastery).toBe('new');
    expect(state.sessions[started.sessionId].summary).toContain('Ответы ещё не проверены');
    expect(getStats(state, START).streak).toBe(0);
    expect(finishSession(state, started.sessionId, START)).toBe(state);
  });
});

describe('persistence and preparation plan', () => {
  it('persists model discussion in its own session without grading model prose', () => {
    const started = startSession(createState(), 'math-rectangle', START);
    let state = appendDiscussion(
      started.state,
      started.sessionId,
      'student',
      'Почему нужно умножать?',
      'discussion',
    );
    state = appendDiscussion(
      state,
      started.sessionId,
      'cosmos',
      'Умножение объединяет равные группы.',
      'model',
    );
    expect(state.sessions[started.sessionId].taskIndex).toBe(0);
    expect(topicStatus(state, 'math-rectangle').attempts).toHaveLength(0);
    expect(state.sessions[started.sessionId].messages.at(-1)?.kind).toBe('model');
    const restored = hydrateState(JSON.stringify(state));
    expect(restored.sessions[started.sessionId].messages).toEqual(
      state.sessions[started.sessionId].messages,
    );
    state = submitAnswer(restored, started.sessionId, '21', START);
    expect(topicStatus(state, 'math-rectangle').attempts[0].assisted).toBe(true);
    expect(appendDiscussion(state, 'missing', 'cosmos', 'Привет')).toBe(state);
    expect(
      appendDiscussion(state, started.sessionId, 'cosmos', 'RPC error', 'probe' as 'model'),
    ).toBe(state);
    const completed = finishSession(state, started.sessionId, START);
    const followup = appendDiscussion(
      completed,
      started.sessionId,
      'cosmos',
      'Вспомни равные группы.',
      'model',
    );
    expect(followup.sessions[started.sessionId].completedAt).toBe(START);
    expect(followup.progress).toEqual(completed.progress);
  });

  it('round-trips real educational data and discards corrupt and technical records', () => {
    let state = complete(createState('Оля'), 'math-rectangle').state;
    state.settings = {
      ...state.settings,
      quality: 'low',
      reducedMotion: true,
      voice: false,
      background: 'ton-618',
    };
    state.facts.push({
      id: 'fact-1',
      subject: 'math',
      text: 'Хочу разобраться с геометрией',
      createdAt: START,
    });
    state.documents.push({
      id: 'doc-1',
      title: 'Площадь',
      subject: 'math',
      createdAt: START,
      content: 'S = a · b',
      type: 'конспект',
      sources: ['cosmos-training'],
      status: 'training',
    });
    expect(hydrateState(JSON.stringify(state))).toEqual(state);
    expect(hydrateState('{broken')).toEqual(createState());
    expect(hydrateState({ version: 999 })).toEqual(createState());
    const session = Object.values(state.sessions)[0];
    const corrupt = structuredClone(state);
    corrupt.sessions[session.id].messages.push({
      id: 'probe-1',
      role: 'cosmos',
      text: 'RPC probe error',
      kind: 'probe',
    });
    (corrupt as unknown as { progress: Record<string, unknown> }).progress['unknown-topic'] = {
      mastery: 'mastered',
      attempts: [],
    };
    const restored = hydrateState(corrupt);
    expect(
      restored.sessions[session.id].messages.some((message) => message.text.includes('RPC')),
    ).toBe(false);
    expect(restored.progress['unknown-topic']).toBeUndefined();
  });

  it('rejects cross-subject sessions and forged mastery on restoration', () => {
    const result = complete(createState(), 'math-rectangle');
    const input = structuredClone(result.state);
    input.sessions[result.sessionId].subject = 'russian';
    input.progress['math-rectangle'].mastery = 'mastered';
    const state = hydrateState(input);
    expect(state.sessions[result.sessionId]).toBeUndefined();
    expect(topicStatus(state, 'math-rectangle').attempts).toHaveLength(0);
    expect(topicStatus(state, 'math-rectangle').mastery).toBe('new');
  });

  it('prioritizes due reviews, respects selected rooms and the daily time budget', () => {
    const state = complete(createState(), 'math-rectangle').state;
    state.planning!.preferences.schoolGrade = 6;
    state.profile.dailyMinutes = 20;
    state.profile.selectedSubjects = ['math', 'russian'];
    const plan = buildPlan(state, NEXT_DAY);
    expect(plan[0].topicId).toBe('math-rectangle');
    expect(plan[0].kind).toBe('review');
    expect(plan.reduce((minutes, item) => minutes + item.minutes, 0)).toBeLessThanOrEqual(20);
    expect(plan.every((item) => ['math', 'russian'].includes(item.subject))).toBe(true);
    state.profile.selectedSubjects = [];
    expect(buildPlan(state, NEXT_DAY)).toEqual([]);
  });

  it('counts an unbroken study streak using calendar days without inventing accuracy', () => {
    let state = complete(createState(), 'math-rectangle', START).state;
    state = complete(state, 'math-rectangle', NEXT_DAY).state;
    const stats = getStats(state, NEXT_DAY);
    expect(stats.streak).toBe(2);
    expect(stats.totalAttempts).toBe(8);
    expect(stats.bySubject.math.masteredTopics).toBe(1);
    expect(stats.bySubject.history.attempts).toBe(0);
    expect(getStats(state, '2026-09-11T10:00:00Z').streak).toBe(0);
  });
});
