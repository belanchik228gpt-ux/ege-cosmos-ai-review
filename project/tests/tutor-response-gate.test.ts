import { afterEach, describe, expect, it, vi } from 'vitest';
import { topics } from '../src/domain/catalog';
import { getTutorResponse } from '../src/ui/tutor-response';
import type { TutorEvidenceFragment } from '../src/domain/evidence';
import { parseProblem } from '../src/domain/problem-workbench';

afterEach(() => vi.unstubAllGlobals());

// Transport is deliberately mocked: these are gate regressions, not model quality or native acceptance.
describe('the current UI response gate keeps limited factual checks after model self-review', () => {
  it('rejects the real fraction contradiction even when a model approved a valid source quote', async () => {
    const text =
      'Потому что сложение дробей возможно только при одинаковых знаменателях. Общий знаменатель позволяет сравнить и сложить доли, разного размера.';
    const log = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', {
      cosmos: {
        askModel: vi.fn(async (request: { evidence: TutorEvidenceFragment[] }) => ({
          ok: true,
          text,
          verification: {
            status: 'supported',
            evidence: [{ id: request.evidence[0].id, quote: request.evidence[0].text }],
          },
        })),
        recordTutorCheck: log,
      },
    });
    const result = await getTutorResponse({
      subject: 'math',
      name: 'Ученик',
      problem: parseProblem('3/8+1/4'),
      message: 'Почему нужен общий знаменатель?',
      messages: [],
      fallback: 'Общий знаменатель задаёт одинаковый размер долей.',
    });
    expect(result.kind).toBe('material');
    expect(result.verification).toBeUndefined();
    expect(result.text).not.toContain(text);
    expect(log).toHaveBeenCalledOnce();
  });
  it.each([
    [
      'social-demand',
      'demand-1',
      'Почему?',
      'Спрос не уменьшается, а сдвигается.',
      'own-price-demand-quantity-confusion',
    ],
    [
      'social-demand',
      'demand-3',
      'Почему?',
      'Кривая спроса сдвигается влево.',
      'own-price-demand-quantity-confusion',
    ],
    [
      'history-baptism',
      'baptism-3',
      'Напомни век события.',
      '988 год относится к XI веку.',
      'baptism-century-contradiction',
    ],
    [
      'russian-commas',
      'commas-1',
      'Зачем запятая в предложении «Когда наступила весна, птицы вернулись»?',
      'Запятая обозначает начало придаточной части.',
      'initial-subordinate-boundary-contradiction',
    ],
  ])(
    'blocks %s / %s even if a self-review approved a genuine source quote',
    async (topicId, taskId, message, reply, reason) => {
      const topic = topics.find((topic) => topic.id === topicId)!;
      const task = topic.tasks.find((task) => task.id === taskId)!;
      const log = vi.fn().mockResolvedValue(undefined);
      const askModel = vi.fn(async (request: { evidence: TutorEvidenceFragment[] }) => ({
        ok: true,
        text: reply,
        verification: {
          status: 'supported',
          evidence: [{ id: request.evidence[0].id, quote: request.evidence[0].text }],
        },
      }));
      vi.stubGlobal('window', { cosmos: { askModel, recordTutorCheck: log } });
      const fallback = `Первый шаг к текущему заданию: ${task.hint}`;
      const result = await getTutorResponse({
        subject: topic.subject,
        name: 'Ученик',
        topic,
        task,
        message,
        messages: [],
        fallback,
      });
      expect(askModel).toHaveBeenCalledOnce();
      expect(result.kind).toBe('material');
      expect(result.text).toContain(fallback);
      expect(result.text).not.toContain(reply);
      expect(result.verification).toBeUndefined();
      expect(log).toHaveBeenCalledWith(reason);
    },
  );
  it('delivers an allowed, supported answer without silently relabeling it authored', async () => {
    const topic = topics.find((topic) => topic.id === 'social-demand')!;
    const task = topic.tasks[0];
    const text = 'Меняется величина спроса. Сама кривая спроса не сдвигается.';
    const log = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', {
      cosmos: {
        askModel: vi.fn(async (request: { evidence: TutorEvidenceFragment[] }) => ({
          ok: true,
          text,
          verification: {
            status: 'supported',
            evidence: [{ id: request.evidence[0].id, quote: request.evidence[0].text }],
          },
        })),
        recordTutorCheck: log,
      },
    });
    const result = await getTutorResponse({
      subject: 'social',
      name: 'Ученик',
      topic,
      task,
      message: 'Почему?',
      messages: [],
      fallback: task.hint,
    });
    expect(result.kind).toBe('model');
    expect(result.text.replace(/\s+/g, ' ')).toBe(text);
    expect(result.verification?.method).toBe('local-model-review');
    expect(log).not.toHaveBeenCalled();
  });
});
