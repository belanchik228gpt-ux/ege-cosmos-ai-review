import { describe, it, expect } from 'vitest';
import {
  createState,
  hydrateState,
  startSession,
  finishSession,
  buildPlan,
  getStats,
  clearSubjectHistory,
  getTopic,
} from '../src/domain';
import { createHomework } from '../src/domain/homework';
import { hydratePreferences, preferencePresets } from '../src/domain/preferences';
import {
  startDiagnostic,
  answerDiagnostic,
  advanceDiagnostic,
  practiceTask,
} from '../src/domain/diagnostics';

describe('personal preferences preserve learning evidence', () => {
  it('does not turn an overnight open lesson into hours of learning', () => {
    const started = startSession(createState('Алексей'), 'math-rectangle', '2026-09-08T08:00:00Z');
    started.state.sessions[started.sessionId].activeMs = 125_000;
    const finished = finishSession(started.state, started.sessionId, '2026-09-08T16:00:00Z');
    expect(getStats(finished).totalMinutes).toBe(2);
    const restored = hydrateState(finished);
    expect(restored.sessions[started.sessionId].activeMs).toBe(125_000);
    delete finished.sessions[started.sessionId].activeMs;
    expect(getStats(hydrateState(finished)).totalMinutes).toBe(
      getTopic('math-rectangle')!.durationMinutes,
    );
  });
  it('clears diagnostic and homework evidence only in the selected subject', () => {
    let state = startDiagnostic(createState('Алексей'), 'math').state;
    state = startDiagnostic(state, 'russian').state;
    const math = startSession(state, 'math-rectangle');
    state = createHomework(math.state, 'math', math.sessionId).state;
    const russian = startSession(state, 'russian-syntax');
    state = createHomework(russian.state, 'russian', russian.sessionId).state;
    const cleared = clearSubjectHistory(state, 'math');
    expect(Object.values(cleared.diagnostics!).map((record) => record.subject)).toEqual([
      'russian',
    ]);
    expect(Object.values(cleared.homework!).map((record) => record.subject)).toEqual(['russian']);
    expect(cleared.sessions[russian.sessionId]).toEqual(state.sessions[russian.sessionId]);
    expect(cleared.sessions[math.sessionId]).toBeUndefined();
    expect(cleared.documents).toBe(state.documents);
    expect(cleared.settings).toBe(state.settings);
    expect(Object.keys(state.homework!)).toHaveLength(2);
  });
  it('restores old profiles with usable defaults and rejects invalid controls', () => {
    const state = hydrateState({
      version: 1,
      profile: { name: 'Алексей', dailyMinutes: 45, selectedSubjects: ['math'] },
      settings: {
        palette: 'ocean',
        uiMotion: 'execute',
        glow: 'vivid',
        voiceRate: -1,
        voiceVolume: 9,
        sceneSpeed: Infinity,
        cornerStyle: 'rounded',
        enterToSend: false,
        documentStyle: 'cosmos',
      },
    });
    expect(state.settings.uiMotion).toBe('expressive');
    expect(state.settings.voiceRate).toBe(1);
    expect(state.settings.voiceVolume).toBe(0.8);
    expect(state.settings.sceneSpeed).toBe(1);
    expect(state.settings.enterToSend).toBe(false);
    expect(state.settings.cornerStyle).toBe('rounded');
    expect(state.diagnostics).toEqual({});
    expect(state.homework).toEqual({});
  });
  it('round-trips a saved combination without importing attempts or changing profile', () => {
    const initial = startSession(createState('Ученик теста'), 'math-rectangle').state;
    initial.settings = {
      ...initial.settings,
      glow: 'off',
      sceneAutoplay: false,
      voiceRate: 0.8,
      lessonLayout: 'dialogue',
      documentScale: 'large',
    };
    initial.preferenceProfiles = [
      {
        id: 'evening',
        name: 'Мой вечер',
        createdAt: '2026-09-08T12:00:00Z',
        settings: { ...initial.settings },
      },
    ];
    const restored = hydrateState(JSON.stringify(initial));
    expect(restored.preferenceProfiles?.[0].settings).toEqual(initial.settings);
    expect(restored.sessions).toEqual(initial.sessions);
    const changed = hydratePreferences(
      { uiMotion: 'off', sessions: { fake: true }, voicePitch: 1.1 },
      restored.settings,
    );
    expect(changed).not.toHaveProperty('sessions');
    expect(changed.voicePitch).toBe(1.1);
    for (const preset of preferencePresets) {
      const selected = hydratePreferences(preset.patch, restored.settings);
      expect(selected.documentStyle).toBe('cosmos');
    }
  });
  it('uses a short diagnostic to choose practice without awarding mastery', () => {
    const created = startDiagnostic(createState('Алексей'), 'math', '2026-09-08T08:00:00Z');
    let state = created.state;
    for (let i = 0; i < 3; i++) {
      const record = state.diagnostics![created.diagnosticId],
        item = record.items[record.currentIndex],
        task = practiceTask(item)!;
      state = answerDiagnostic(
        state,
        created.diagnosticId,
        i === 0 ? '999999' : task.answer,
        `diag-${i}`,
        `2026-09-08T08:0${i}:00Z`,
      );
      state = advanceDiagnostic(state, created.diagnosticId, `2026-09-08T08:0${i}:20Z`);
    }
    const record = state.diagnostics![created.diagnosticId];
    expect(record.phase).toBe('completed');
    const weakId = record.items[0].topicId;
    expect(getStats(state).weakTopics.map((topic) => topic.id)).toContain(weakId);
    expect(buildPlan(state).find((item) => item.topicId === weakId)?.kind).toBe('practice');
    expect(getStats(state).totalAttempts).toBe(0);
    expect(getStats(state).bySubject.math.masteredTopics).toBe(0);
  });
});
