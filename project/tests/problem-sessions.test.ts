import { describe, expect, it } from 'vitest';
import {
  createProblemSession,
  hydrateProblemSessions,
  restoreProblem,
} from '../src/domain/problem-sessions';
import {
  activeTaskEvidence,
  problemEvidence,
  keepTutorExplanation,
} from '../src/ui/tutor-response';
import { parseProblem } from '../src/domain/problem-workbench';

describe('own work remains tied to confirmed text', () => {
  it('does not create a competing model question outside the checked condition', () => {
    expect(keepTutorExplanation('В каждом ряду семь клеток. Сколько будет 7 + 7?')).toBe(
      'В каждом ряду семь клеток.',
    );
    expect(keepTutorExplanation('Сколько будет 7 + 7?')).toBe('');
    expect(keepTutorExplanation('Главная часть — «Я знаю». «Что» вводит придаточную.')).toBe(
      'Главная часть — «Я знаю». «Что» вводит придаточную.',
    );
  });
  it('restores the actual 7×4 task rather than another authored rectangle', () => {
    const own = createProblemSession('Площадь прямоугольника со сторонами 7 и 4 см', true);
    const restored = hydrateProblemSessions(
      JSON.parse(
        JSON.stringify({ [own.id]: { ...own, expectedAnswer: '21', parameters: { a: 7, b: 3 } } }),
      ),
    );
    expect(restored[own.id].fromPhoto).toBe(true);
    const problem = restoreProblem(restored[own.id]);
    expect(problem.expectedAnswer).toBe('28');
    expect(problem.parameters).toMatchObject({ a: 7, b: 4 });
    expect(problemEvidence(problem).text).not.toContain('Результат локальной математической проверки');
    expect(problemEvidence(problem, true).text).toContain('28');
    expect(problemEvidence(problem).text).not.toContain('21');
  });
  it('does not mix a personal example into a different subject or preserve a raw image', () => {
    const own = createProblemSession('2x+5=17');
    const result = hydrateProblemSessions({
      a: { ...own, subject: 'history' },
      b: { ...own, dataUrl: 'data:image/png;base64,private' },
    });
    expect(Object.values(result)).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('private');
    expect(restoreProblem(result[own.id]).expectedAnswer).toBe('6');
  });
  it('keeps the confirmed numbers in model evidence ahead of unrelated teaching examples', () => {
    const evidence = activeTaskEvidence({
      id: 'rect-1',
      prompt: 'Найди площадь прямоугольника 7 на 3.',
      answer: '21',
      hint: 'Умножь длины двух сторон.',
      explanation: 'В 3 рядах по 7 клеток: 7 · 3 = 21.',
    });
    expect(evidence.text).toContain('7 на 3');
    expect(evidence.text).not.toContain('ответ: 21');
    expect(evidence.text).not.toContain('28');
    expect(evidence.sourceIds).toEqual(['cosmos-training']);
  });
  it('never restores an unverified result for unsupported image transcription', () => {
    const own = createProblemSession('Треугольник с двумя сторонами 7 и 4, найти площадь', true);
    expect(restoreProblem(own).verified).toBe(false);
    expect(parseProblem('1/0').verified).toBe(false);
  });
});
