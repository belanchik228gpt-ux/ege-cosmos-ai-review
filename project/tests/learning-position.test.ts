import { describe, expect, it } from 'vitest';
import {
  currentLearningPosition,
  learningSheets,
  stepSheetKey,
} from '../src/domain/learning-position';
import type { CloudMessage, LearningStep } from '../src/domain/cloud-learning';
const step: LearningStep = {
  task: 'x² − 4x + 3 = 0',
  instruction: 'Найди дискриминант.',
  why: 'Выберем способ нахождения корней.',
  stage: 'Дискриминант',
  recap: ['Получили второе уравнение.'],
  memory: 'Ученик выбрал дискриминант.',
  plan: [{ id: 'roots', title: 'Найти корни', status: 'current' }],
  currentPlanId: 'roots',
};
const message = (id: string, learningStep = step): CloudMessage => ({
  id,
  role: 'assistant',
  kind: 'openai',
  at: '2026-09-09T12:00:00Z',
  text: 'Объяснение',
  learningStep,
});
describe('lesson position and independent sheet drafts', () => {
  it('preserves ink through explanations and switches drafts for a new action', () => {
    expect(stepSheetKey('a', { ...step, why: 'Поясняю иначе', memory: 'Дополнили' })).toBe(
      stepSheetKey('a', step),
    );
    expect(
      stepSheetKey('a', { ...step, instruction: 'Подставь x=1 в исходное условие.' }),
    ).not.toBe(stepSheetKey('a', step));
    expect(stepSheetKey('b', step)).not.toBe(stepSheetKey('a', step));
  });
  it('keeps latest real position in a long conversation and ignores rejected replies', () => {
    const history = Array.from({ length: 80 }, (_, i) => message(String(i)));
    const next = {
      ...step,
      task: '|x−6| = |x²−5x+9|',
      instruction: 'Проверь найденные корни подстановкой.',
    };
    history.push(message('next', next));
    history.push({
      ...message('rejected'),
      verification: { status: 'conflict' } as CloudMessage['verification'],
    });
    expect(currentLearningPosition(history)?.step).toEqual(next);
    expect(learningSheets('lesson', history)).toHaveLength(2);
    expect(learningSheets('lesson', history).at(-1)?.text).toContain(next.instruction);
  });
  it('does not invent a plan for a legacy chat', () => {
    expect(
      currentLearningPosition([{ ...message('old'), learningStep: undefined }]),
    ).toBeUndefined();
  });
});
