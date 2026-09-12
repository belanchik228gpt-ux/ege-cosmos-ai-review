import { describe, expect, it } from 'vitest';
import {
  classifyTutorInput,
  createState,
  hydrateState,
  startSession,
  submitAnswer,
  topics,
  topicStatus,
  isTaskRevealed,
  finishSession,
} from '../src/domain';

const at = '2026-09-08T12:00:00Z';
const rectangle = topics.find((topic) => topic.id === 'math-rectangle')!;

describe('conversation intent before assessment', () => {
  it.each([
    ['дай подсказку', 'hint'],
    ['не понимаю', 'hint'],
    ['Я не понял', 'hint'],
    ['напиши ответ', 'reveal'],
    ['Можешь показать ответ?', 'reveal'],
    ['не показывай ответ', 'hint'],
    ['не понимаю почему нужно умножать', 'why'],
    ['какой правильный ответ?', 'reveal'],
    ['почему нужно умножать?', 'why'],
    ['объясни, почему', 'why'],
    ['как это получается?', 'why'],
    ['повтори задание', 'repeat'],
    ['дальше', 'next'],
    ['спрос уменьшится', 'answer'],
    ['получится 28 см²', 'answer'],
    ['7*4=28', 'answer'],
    ['нет', 'answer'],
  ])('routes %s as %s', (text, intent) => {
    expect(classifyTutorInput(text, rectangle.tasks[0])).toBe(intent);
  });
  it('uses different authored help steps without mistakes or answer leakage on the first request', () => {
    const started = startSession(createState(), rectangle.id, at);
    let state = started.state;
    const replies: string[] = [];
    for (const request of ['дай подсказку', 'не понимаю', 'все равно не понимаю']) {
      state = submitAnswer(state, started.sessionId, request, at);
      replies.push(state.sessions[started.sessionId].messages.at(-1)!.text);
    }
    expect(new Set(replies).size).toBe(3);
    expect(replies[0]).not.toContain(rectangle.tasks[0].answer);
    expect(state.sessions[started.sessionId].scaffoldIndex).toBe(0);
    expect(topicStatus(state, rectangle.id).attempts).toHaveLength(0);
    const restored = hydrateState(JSON.stringify(state));
    expect(restored.sessions[started.sessionId].scaffoldIndex).toBe(0);
    state = submitAnswer(restored, started.sessionId, 'напиши ответ', at);
    expect(state.sessions[started.sessionId].messages.at(-1)?.kind).toBe('solution');
    expect(state.sessions[started.sessionId].messages.at(-1)?.text).toContain(
      `Ответ: ${rectangle.tasks[0].answer}`,
    );
    expect(topicStatus(state, rectangle.id).attempts).toHaveLength(0);
    state = submitAnswer(state, started.sessionId, `Получается ${rectangle.tasks[0].answer}`, at);
    expect(
      topicStatus(state, rectangle.id).attempts.map((attempt) => [
        attempt.correct,
        attempt.assisted,
      ]),
    ).toEqual([[true, true]]);
    expect(topicStatus(state, rectangle.id).mastery).toBe('learning');
  });
  it('does not grade questions, repeats, next requests or conflicting alternatives', () => {
    const started = startSession(createState(), rectangle.id, at);
    for (const input of ['почему?', 'повтори задание', 'дальше', '21 или 28', 'привет']) {
      const state = submitAnswer(started.state, started.sessionId, input, at);
      expect(topicStatus(state, rectangle.id).attempts).toHaveLength(0);
      expect(state.sessions[started.sessionId].taskIndex).toBe(input === 'дальше' ? 1 : 0);
      expect(topicStatus(state, rectangle.id).mastery).toBe('new');
    }
  });
  it('does not restart finished small questions after restoration or a repeated condition', () => {
    const started = startSession(createState(), rectangle.id, at);
    let state = submitAnswer(started.state, started.sessionId, 'дай подсказку', at);
    state = submitAnswer(state, started.sessionId, '7', at);
    state = submitAnswer(state, started.sessionId, 'дальше', at);
    state = submitAnswer(state, started.sessionId, 'умножение', at);
    state = submitAnswer(state, started.sessionId, 'дальше', at);
    state = hydrateState(JSON.stringify(state));
    state = submitAnswer(state, started.sessionId, 'повтори задание', at);
    state = submitAnswer(state, started.sessionId, 'не понимаю', at);
    expect(state.sessions[started.sessionId].scaffoldIndex).toBeUndefined();
    expect(state.sessions[started.sessionId].messages.at(-1)?.text).not.toContain(
      'Начнём с одного ряда',
    );
    expect(topicStatus(state, rectangle.id).attempts).toHaveLength(0);
  });
  it('lets the student continue after a revealed solution without awarding evidence or a false final status', () => {
    const started = startSession(createState(), rectangle.id, at);
    let state = started.state;
    for (let index = 0; index < rectangle.tasks.length; index++) {
      expect(isTaskRevealed(state.sessions[started.sessionId])).toBe(false);
      state = submitAnswer(state, started.sessionId, 'напиши ответ', at);
      state = hydrateState(JSON.stringify(state));
      expect(isTaskRevealed(state.sessions[started.sessionId])).toBe(true);
      state = submitAnswer(state, started.sessionId, 'повтори задание', at);
      expect(isTaskRevealed(state.sessions[started.sessionId])).toBe(true);
      state = submitAnswer(state, started.sessionId, 'дальше', at);
      expect(state.sessions[started.sessionId].taskIndex).toBe(index + 1);
      expect(topicStatus(state, rectangle.id).attempts).toHaveLength(0);
    }
    state = finishSession(state, started.sessionId, at);
    expect(state.sessions[started.sessionId].summary).toContain('без проверки: 4');
    expect(state.sessions[started.sessionId].summary).not.toContain('Практика пройдена');
    expect(topicStatus(state, rectangle.id).mastery).toBe('new');
    expect(isTaskRevealed(state.sessions[started.sessionId])).toBe(false);
  });
  it('checks the full filled Russian sentence before interpreting words as uncertainty', () => {
    const started = startSession(createState(), 'russian-ne-ni', at);
    const task = topics.find((topic) => topic.id === 'russian-ne-ni')!.tasks[0];
    expect(classifyTutorInput('Я не знаю ответа.', task)).toBe('answer');
    const state = submitAnswer(started.state, started.sessionId, 'Я не знаю ответа.', at);
    expect(topicStatus(state, 'russian-ne-ni').attempts[0]).toMatchObject({
      correct: true,
      assisted: false,
    });
    expect(state.sessions[started.sessionId].taskIndex).toBe(1);
  });
  it('records the right social phrase once and keeps another subject isolated', () => {
    const math = startSession(createState(), rectangle.id, at);
    const social = startSession(math.state, 'social-demand', at);
    const before = structuredClone(social.state.sessions[math.sessionId]);
    const state = submitAnswer(social.state, social.sessionId, 'спрос станет маленьким', at);
    expect(
      topicStatus(state, 'social-demand').attempts.map((attempt) => [
        attempt.correct,
        attempt.assisted,
      ]),
    ).toEqual([[true, false]]);
    expect(
      state.sessions[social.sessionId].messages.some((message) =>
        message.text.includes('Точнее: уменьшается величина спроса'),
      ),
    ).toBe(true);
    expect(state.sessions[math.sessionId]).toEqual(before);
  });
});
