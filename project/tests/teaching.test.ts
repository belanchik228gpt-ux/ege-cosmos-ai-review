import { describe, expect, it } from 'vitest';
import {
  createState,
  getTopic,
  hydrateState,
  startSession,
  submitAnswer,
  topicStatus,
} from '../src/domain';
import {
  getTeachingContext,
  getTeachingChoices,
  handleTeachingTurn,
  hydrateTeachingState,
  interpretTeachingInput,
  selectTeachingStep,
} from '../src/domain/teaching';
import type { Session, Task } from '../src/domain/types';

const at = '2026-09-08T18:00:00.000Z';
const topic = getTopic('math-absolute')!;
const countTask = topic.tasks[4];
function countLesson() {
  const started = startSession(createState('Саша'), topic.id, at);
  const session = started.state.sessions[started.sessionId];
  session.taskIndex = 4;
  delete session.teaching;
  session.messages.push({
    id: 'count-question',
    role: 'cosmos',
    kind: 'question',
    text: countTask.prompt,
  });
  return started;
}
const current = (state: ReturnType<typeof createState>, sessionId: string) =>
  getTeachingContext(state.sessions[sessionId], countTask);

describe('tracked teaching questions', () => {
  it('accepts the uncertain zero coordinate from the real conversation, then asks root count separately', () => {
    const started = countLesson();
    let state = submitAnswer(started.state, started.sessionId, 'дай подсказку', at);
    expect(current(state, started.sessionId)).toMatchObject({
      stepId: 'zero-coordinate',
      mode: 'assisted',
      activeQuestion: { answer: '0', answerMeaning: 'coordinate' },
    });
    expect(state.sessions[started.sessionId].messages.at(-1)?.text).not.toMatch(
      /(?:один|1) корень/u,
    );
    state = submitAnswer(state, started.sessionId, '0? я не знаю(', at);
    expect(current(state, started.sessionId).completed).toBe(true);
    expect(state.sessions[started.sessionId].teaching?.attempts).toMatchObject([
      { correct: true, uncertain: true, stepId: 'zero-coordinate' },
    ]);
    state = submitAnswer(state, started.sessionId, 'объясни первый шаг', at);
    expect(current(state, started.sessionId).stepId).toBe('zero-coordinate');
    state = submitAnswer(state, started.sessionId, 'ну от нуля 0 находится не?', at);
    expect(state.sessions[started.sessionId].teaching?.attempts).toHaveLength(1);
    expect(topicStatus(state, topic.id).attempts).toHaveLength(0);
    state = hydrateState(JSON.stringify(state));
    expect(current(state, started.sessionId).completed).toBe(true);
    state = submitAnswer(state, started.sessionId, 'окей что дальше?', at);
    expect(current(state, started.sessionId)).toMatchObject({
      stepId: 'main',
      activeQuestion: { answer: '1', answerMeaning: 'count' },
    });
    expect(state.sessions[started.sessionId].messages.at(-1)?.text).toContain(countTask.prompt);
    state = submitAnswer(state, started.sessionId, 'один', at);
    expect(topicStatus(state, topic.id).attempts).toMatchObject([
      { taskId: countTask.id, correct: true, assisted: true },
    ]);
    expect(state.sessions[started.sessionId].teachingHistory?.at(-1)?.attempts).toHaveLength(1);
    expect(state.sessions[started.sessionId].taskIndex).toBe(5);
    expect(topicStatus(state, topic.id).mastery).toBe('learning');
  });

  it('never awards the main answer while a different small question is active', () => {
    const started = countLesson();
    let state = submitAnswer(started.state, started.sessionId, 'дай подсказку', at);
    state = submitAnswer(state, started.sessionId, '1', at);
    expect(current(state, started.sessionId).completed).toBe(false);
    expect(state.sessions[started.sessionId].teaching?.attempts[0].correct).toBe(false);
    expect(topicStatus(state, topic.id).attempts).toHaveLength(0);
    expect(state.sessions[started.sessionId].taskIndex).toBe(4);
  });

  it('clarifies coordinate-vs-count without recording a false count mistake', () => {
    const started = countLesson();
    const state = submitAnswer(started.state, started.sessionId, 'ну от нуля 0 находится не?', at);
    expect(topicStatus(state, topic.id).attempts).toHaveLength(0);
    expect(state.sessions[started.sessionId].messages.at(-1)?.text).toContain(
      'количество разных корней',
    );
  });

  it.each(['не 0', '0 или 1', '0, но не 0', '1? я не знаю('])(
    'does not accept incompatible candidate %s as the zero coordinate',
    (input) => {
      const started = countLesson();
      const state = submitAnswer(started.state, started.sessionId, 'дай подсказку', at);
      const question = current(state, started.sessionId).activeQuestion;
      expect(interpretTeachingInput(question, input).assessment.status).not.toBe('correct');
    },
  );

  it('replays the same explanation through a new revision, without creating progress', () => {
    const started = countLesson();
    const hinted = submitAnswer(started.state, started.sessionId, 'дай подсказку', at);
    const session = hinted.sessions[started.sessionId];
    const next = selectTeachingStep(session, countTask, 'zero-coordinate');
    expect(getTeachingContext(next, countTask).revision).toBeGreaterThan(
      getTeachingContext(session, countTask).revision,
    );
    expect(next.messages).toEqual(session.messages);
    expect(next.teaching?.attempts).toHaveLength(0);
    expect(selectTeachingStep(session, countTask, 'invented-by-model')).toBe(session);
  });

  it('allows next on unanswered steps and main tasks without fabricating evidence', () => {
    const started = countLesson();
    let state = submitAnswer(started.state, started.sessionId, 'дай подсказку', at);
    state = submitAnswer(state, started.sessionId, 'что дальше?', at);
    expect(current(state, started.sessionId).stepId).toBe('main');
    expect(state.sessions[started.sessionId].teaching?.skippedStepIds).toEqual(['zero-coordinate']);
    state = submitAnswer(state, started.sessionId, 'давай дальше', at);
    expect(state.sessions[started.sessionId].taskIndex).toBe(5);
    expect(topicStatus(state, topic.id).attempts).toHaveLength(0);
  });

  it('reveals the original task explicitly and allows next without copying its answer', () => {
    const started = countLesson();
    let state = submitAnswer(started.state, started.sessionId, 'дай подсказку', at);
    state = submitAnswer(state, started.sessionId, 'напиши ответ', at);
    expect(current(state, started.sessionId)).toMatchObject({ stepId: 'main', revealed: true });
    expect(state.sessions[started.sessionId].messages.at(-1)?.text).not.toContain('запиши ответ');
    state = submitAnswer(hydrateState(JSON.stringify(state)), started.sessionId, 'окей дальше', at);
    expect(state.sessions[started.sessionId].taskIndex).toBe(5);
    expect(topicStatus(state, topic.id).attempts).toHaveLength(0);
  });

  it('offers a genuine definition-of-root detour with its own checked question', () => {
    const started = countLesson();
    let session = submitAnswer(started.state, started.sessionId, 'дай подсказку', at).sessions[
      started.sessionId
    ];
    expect(getTeachingChoices(getTeachingContext(session, countTask))).toContainEqual(
      expect.objectContaining({
        id: 'zero-root-definition',
        question: 'Подходит ли x = 2 уравнению x + 1 = 3? Ответь «да» или «нет».',
      }),
    );
    session = selectTeachingStep(session, countTask, 'zero-root-definition');
    expect(getTeachingContext(session, countTask).activeQuestion.answer).toBe('да');
    session = handleTeachingTurn(session, countTask, 'да', at).session;
    session = handleTeachingTurn(session, countTask, 'дальше', at).session;
    expect(getTeachingContext(session, countTask).activeQuestion.answer).toBe('0');
    expect(getTeachingContext(session, countTask).completed).toBe(false);
  });

  it('opens the meaning of real roots locally when that concept is explicitly unknown', () => {
    const started = countLesson();
    const state = submitAnswer(
      started.state,
      started.sessionId,
      'я не знаю как находить действительные, объясни тему',
      at,
    );
    expect(current(state, started.sessionId)).toMatchObject({
      stepId: 'zero-root-definition',
      mode: 'detour',
      activeQuestion: { answer: 'да' },
    });
    expect(topicStatus(state, topic.id).attempts).toHaveLength(0);
  });

  it('has a semantic main visualization for every absolute-value task', () => {
    for (const task of topic.tasks) {
      const context = getTeachingContext(fixtureSession(), task);
      expect(context.mode).toBe('main');
      expect(context.visual?.kind).toBeTruthy();
      expect(context.revealed).toBe(false);
    }
  });

  it('resolves restored questions from authored task data and rejects foreign step state', () => {
    const started = countLesson();
    const state = submitAnswer(started.state, started.sessionId, 'дай подсказку', at);
    const raw = {
      ...state.sessions[started.sessionId].teaching,
      answer: '99',
      activeQuestion: { answer: '99' },
    };
    const restored = hydrateTeachingState(raw, countTask);
    const session = { ...state.sessions[started.sessionId], teaching: restored };
    expect(getTeachingContext(session, countTask).activeQuestion.answer).toBe('0');
    expect(
      hydrateTeachingState({ ...raw, activeStepId: 'history-988', phase: 'answered' }, countTask),
    ).toMatchObject({ activeStepId: 'main', phase: 'asking' });
    expect(hydrateTeachingState(raw, topic.tasks[0])).toMatchObject({
      activeStepId: 'main',
      taskId: 'absolute-1',
      attempts: [],
    });
    expect(
      hydrateTeachingState(
        { ...raw, phase: 'answered', completedStepIds: ['zero-coordinate'], attempts: [] },
        countTask,
      ),
    ).toMatchObject({ phase: 'asking', completedStepIds: [] });
  });
});

const expressionTask: Task = {
  id: 'symbolic-fixture',
  prompt: 'При x < a раскрой |x − a|.',
  answer: '-x+a',
  accepted: ['a-x'],
  kind: 'text',
  answerMeaning: 'expression',
  hint: 'Сначала определи знак разности.',
  explanation: '|x − a| = −(x − a) = −x + a.',
  teachingSteps: [
    {
      id: 'sign',
      title: 'Знак разности',
      explanation: 'Сравни x с a, затем знак x − a.',
      question: {
        prompt: 'При x < a разность x − a положительная или отрицательная?',
        answer: 'отрицательная',
        accepted: ['отрицательное', 'меньше нуля'],
        kind: 'text',
        answerMeaning: 'sign',
      },
      visual: { kind: 'sign', boundary: 2, relation: 'lt', offset: 2 },
      success: 'Да, разность отрицательная.',
      detours: [
        {
          id: 'subtract',
          title: 'Знакомые числа',
          explanation: 'Временно возьмём конкретные числа вместо букв.',
          question: {
            prompt: 'Чему равно 3 − 5?',
            answer: '-2',
            kind: 'number',
            answerMeaning: 'value',
          },
          visual: { kind: 'subtraction', start: 3, subtract: 5 },
          success: 'Да, результат отрицательный.',
        },
      ],
    },
    {
      id: 'negate',
      title: 'Определение модуля',
      explanation: 'Модуль отрицательного выражения равен противоположному выражению.',
      question: {
        prompt: 'Как записать выражение, противоположное x − a, не раскрывая скобок?',
        answer: '-(x-a)',
        accepted: ['−(x−a)'],
        kind: 'text',
        answerMeaning: 'expression',
      },
      visual: { kind: 'expression', lines: [{ text: '|x − a|' }] },
      success: 'Да. Теперь осталось раскрыть скобки в исходном вопросе.',
    },
  ],
};
function fixtureSession(): Session {
  return {
    id: 'fixture-session',
    subject: 'math',
    topicId: 'fixture',
    startedAt: at,
    messages: [],
    taskIndex: 0,
    hintsUsed: 0,
    phase: 'practice',
  };
}

describe('reusable authored step and detour controller', () => {
  it('opens authored teaching before a new radical quiz, and does not grant automatic mastery', () => {
    const radical = getTopic('math-radicals')!;
    const started = startSession(createState(), radical.id, at);
    const first = getTeachingContext(started.state.sessions[started.sessionId], radical.tasks[0]);
    expect(first).toMatchObject({
      stepId: radical.tasks[0].teachingSteps![0].id,
      activeQuestion: { answer: '25' },
      mode: 'assisted',
    });
    expect(started.state.sessions[started.sessionId].messages.at(-1)?.text).toContain(
      first.activeQuestion.prompt,
    );
    expect(
      started.state.sessions[started.sessionId].messages.filter(
        (message) => message.role === 'student',
      ),
    ).toHaveLength(0);
    expect(topicStatus(started.state, radical.id).attempts).toHaveLength(0);
  });
  it('enters a smaller arithmetic detour and returns to the same unresolved symbolic question', () => {
    let session = handleTeachingTurn(
      fixtureSession(),
      expressionTask,
      'объясни первый шаг',
      at,
    ).session;
    expect(getTeachingContext(session, expressionTask).stepId).toBe('sign');
    const choices = getTeachingChoices(getTeachingContext(session, expressionTask));
    expect(choices.some((choice) => choice.id === 'subtract')).toBe(true);
    expect(JSON.stringify(choices)).not.toContain('"answer"');
    session = selectTeachingStep(session, expressionTask, 'subtract');
    expect(getTeachingContext(session, expressionTask).mode).toBe('detour');
    session = handleTeachingTurn(session, expressionTask, '-2? я не знаю', at).session;
    expect(getTeachingContext(session, expressionTask).completed).toBe(true);
    session.teaching = hydrateTeachingState(
      JSON.parse(JSON.stringify(session.teaching)),
      expressionTask,
    );
    session = handleTeachingTurn(session, expressionTask, 'что дальше?', at).session;
    expect(getTeachingContext(session, expressionTask)).toMatchObject({
      stepId: 'sign',
      completed: false,
      mode: 'assisted',
    });
    session = handleTeachingTurn(session, expressionTask, 'отрицательная', at).session;
    session = handleTeachingTurn(session, expressionTask, 'дальше', at).session;
    expect(getTeachingContext(session, expressionTask).stepId).toBe('negate');
    session = handleTeachingTurn(session, expressionTask, '− ( x − a )', at).session;
    expect(getTeachingContext(session, expressionTask).completed).toBe(true);
    session = handleTeachingTurn(session, expressionTask, 'дальше', at).session;
    const result = handleTeachingTurn(session, expressionTask, 'а-x'.replace('а', 'a'), at);
    expect(result.completion).toMatchObject({ correct: true, assisted: true, skipped: false });
  });
  it('never exposes an unrelated nested detour to the model selector', () => {
    const context = getTeachingContext(fixtureSession(), expressionTask);
    expect(getTeachingChoices(context).map((choice) => choice.id)).not.toContain('subtract');
    expect(
      selectTeachingStep(fixtureSession(), expressionTask, 'subtract').teaching,
    ).toBeUndefined();
  });

  it('completes only an explicitly declared terminal step after all required steps are checked', () => {
    const task = structuredClone(expressionTask);
    task.teachingSteps![1].completesTask = true;
    let session = handleTeachingTurn(fixtureSession(), task, 'дай подсказку', at).session;
    session = handleTeachingTurn(session, task, 'отрицательная', at).session;
    session = handleTeachingTurn(session, task, 'дальше', at).session;
    session = handleTeachingTurn(session, task, '-(x-a)', at).session;
    expect(handleTeachingTurn(session, task, 'дальше', at).completion).toMatchObject({
      correct: true,
      assisted: true,
      skipped: false,
    });
    const unmarked = handleTeachingTurn(session, expressionTask, 'дальше', at);
    expect(unmarked.completion).toBeUndefined();
    expect(getTeachingContext(unmarked.session, expressionTask).stepId).toBe('main');
    session.teaching!.completedStepIds = ['negate'];
    session.teaching!.skippedStepIds = ['sign'];
    const missing = handleTeachingTurn(session, task, 'дальше', at);
    expect(missing.completion).toBeUndefined();
    expect(getTeachingContext(missing.session, task).stepId).toBe('main');
  });

  it.each([
    ['module', '|х - 6|', 'correct'],
    ['remove', '-(x-6)=-x+6', 'correct'],
    ['remove', '-(x-6)=-x-6', 'incorrect'],
    ['sign', 'оно отрицательное так как х меньше 6', 'correct'],
    ['sign', 'оно отрицательное так как х больше 6', 'incorrect'],
    ['sign', 'оно положительное так как х меньше 6', 'incorrect'],
  ])('accepts bounded mathematical prose for %s: %s', (stepSuffix, input, status) => {
    const radical = getTopic('math-radicals')!.tasks[1];
    const session = selectTeachingStep(fixtureSession(), radical, `radicals-2-${stepSuffix}`);
    expect(
      interpretTeachingInput(getTeachingContext(session, radical).activeQuestion, input).assessment
        .status,
    ).toBe(status);
  });

  it('normalizes typed powers only against an authored equivalent and does not accept the wrong binomial', () => {
    const radical = getTopic('math-radicals')!.tasks[2];
    const session = selectTeachingStep(fixtureSession(), radical, 'radicals-3-square');
    const active = getTeachingContext(session, radical).activeQuestion;
    expect(interpretTeachingInput(active, '(х+4)2').assessment.status).toBe('correct');
    expect(interpretTeachingInput(active, '(х-4)2').assessment.status).not.toBe('correct');
  });
});
