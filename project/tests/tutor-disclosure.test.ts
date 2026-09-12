import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getTutorResponse,
  exposesFinalAnswer,
  activeTaskEvidence,
  problemEvidence,
  keepTutorExplanation,
} from '../src/ui/tutor-response';
import { absoluteTopic } from '../src/domain/absolute-topic';
import { parseProblem } from '../src/domain/problem-workbench';
import { radicalTopic } from '../src/domain/radical-topic';
afterEach(() => vi.unstubAllGlobals());
describe('explanation and full solution are different permissions', () => {
  it('keeps the explanation and removes a model restatement of the tracked question', () => {
    expect(
      keepTutorExplanation(
        'Корень — значение x. Теперь проверим, подходит ли x = 2 уравнению x + 1 = 3. Ответь «да» или «нет».',
      ),
    ).toBe('Корень — значение x.');
  });
  it('does not send the private answer key with current-step evidence', () => {
    const task = absoluteTopic.tasks[4];
    expect(activeTaskEvidence(task).text).not.toContain('Проверенный ответ');
    expect(activeTaskEvidence(task).text).not.toContain(task.explanation);
    expect(problemEvidence(parseProblem('7*4')).text).not.toContain(
      'Результат локальной математической проверки',
    );
    expect(activeTaskEvidence(task, true).text).toContain(task.explanation);
  });
  it.each([
    'У уравнения один корень — x = 0.',
    'Единственный корень находится в нуле.',
    'Корень только один.',
  ])('rejects a premature root count: %s', (reply) =>
    expect(exposesFinalAnswer(reply, absoluteTopic.tasks[4])).toBe(true),
  );
  it('permits explanation of the coordinate while keeping the count for the learner', () => {
    expect(
      exposesFinalAnswer(
        'Нулевое расстояние означает отсутствие движения. Координата точки — 0.',
        absoluteTopic.tasks[4],
      ),
    ).toBe(false);
  });
  it.each(['Ответ: −x + 6.', '|x−6|=−(x−6)=−x+6', 'Получается 6−х.'])(
    'protects every registered equivalent final expression: %s',
    (reply) => {
      expect(exposesFinalAnswer(reply, radicalTopic.tasks[1])).toBe(true);
    },
  );
  it('rejects the final answer even if self-review approves a source quotation', async () => {
    const askModel = vi.fn(async (req) => ({
      ok: true,
      text: 'У уравнения один корень — x = 0.',
      verification: {
        status: 'supported',
        evidence: [{ id: req.evidence[0].id, quote: req.evidence[0].text }],
      },
    }));
    const recordTutorCheck = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', { cosmos: { askModel, recordTutorCheck } });
    const result = await getTutorResponse({
      subject: 'math',
      name: 'Ученик',
      task: absoluteTopic.tasks[4],
      protectedTask: absoluteTopic.tasks[4],
      message: 'Объясни',
      messages: [],
      fallback: 'Нулевое расстояние означает, что начало и конец пути совпадают.',
      teaching: {
        id: 'zero-coordinate',
        title: 'Точка и путь',
        explanation: 'При нулевом расстоянии начало и конец пути совпадают.',
        question: 'Назови координату этой точки.',
      },
    });
    expect(result.kind).toBe('material');
    expect(result.text).not.toContain('один корень');
    expect(result.text).not.toContain('Не удалось подтвердить');
    const evidence = askModel.mock.calls[0][0].evidence
      .map((e: { text: string }) => e.text)
      .join(' ');
    expect(evidence).not.toContain('Ответ: 1');
    expect(recordTutorCheck).toHaveBeenCalledWith('premature-final-answer');
  });
});
