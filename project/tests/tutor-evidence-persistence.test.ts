import { describe, it, expect } from 'vitest';
import {
  createState,
  startSession,
  appendDiscussion,
  hydrateState,
  type Message,
} from '../src/domain';

describe('evidence displayed with model replies survives restart', () => {
  const verification: NonNullable<Message['verification']> = {
    method: 'local-model-review',
    checkedAt: '2026-09-08T04:00:00.000Z',
    evidence: [
      {
        id: 'math-area:1',
        quote: 'Площадь показывает число единичных квадратов внутри фигуры.',
        sourceIds: ['cosmos-training'],
      },
    ],
  };
  it('keeps the exact reviewed excerpt with the original lesson, without assessment credit', () => {
    const started = startSession(createState('Алексей'), 'math-rectangle');
    const updated = appendDiscussion(
      started.state,
      started.sessionId,
      'cosmos',
      'Сколько клеток в одном ряду?',
      'model',
      { sourceIds: ['cosmos-training'], verification },
    );
    const restored = hydrateState(JSON.stringify(updated));
    expect(restored.sessions[started.sessionId].messages.at(-1)?.verification).toEqual(
      verification,
    );
    expect(restored.progress['math-rectangle'].attempts).toHaveLength(0);
    expect(restored.sessions[started.sessionId].hintsUsed).toBe(1);
  });
  it('does not mark student messages or authored fallbacks as a reviewed model reply', () => {
    const started = startSession(createState('Алексей'), 'math-rectangle');
    let state = appendDiscussion(
      started.state,
      started.sessionId,
      'student',
      'Я так думаю',
      'discussion',
      { verification },
    );
    state = appendDiscussion(
      state,
      started.sessionId,
      'cosmos',
      'Попробуем первый шаг.',
      'material',
      { verification },
    );
    expect(
      hydrateState(state)
        .sessions[started.sessionId].messages.slice(-2)
        .every((message) => !message.verification),
    ).toBe(true);
  });
});
