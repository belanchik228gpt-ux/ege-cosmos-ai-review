import {
  prepareTutorEvidence,
  reviewEvidenceNumbers,
  type TutorEvidenceFragment,
} from '../domain/evidence';
import {
  examReferenceReply,
  isExamReferenceQuery,
  reviewTutorResponse,
  reviewProblemExplanation,
} from '../domain/grounding';
import type { Message, SubjectId, Task, Topic } from '../domain/types';
import type { ProblemSpec } from '../domain/problem-workbench';

export function activeTaskEvidence(task: Task, allowAnswer = false): TutorEvidenceFragment {
  return {
    id: `active-task:${task.id.replace(/[^a-zA-Z0-9:-]/g, '-')}`,
    sourceIds: ['cosmos-training'],
    text: `Единственное активное условие: «${task.prompt}». ${allowAnswer ? `Проверенный ответ: ${task.answer}. Обоснование: ${task.explanation}.` : ''} Первый шаг: ${task.hint}. Это авторское тренировочное задание, не официальное задание ФИПИ.`,
  };
}
export function problemEvidence(problem: ProblemSpec, allowAnswer = false): TutorEvidenceFragment {
  const fractions =
    problem.kind === 'arithmetic' && String(problem.parameters.expression || '').includes('/')
      ? ' Дроби с разными знаменателями можно складывать: сначала заменяем их равными дробями с общим знаменателем. При сложении или вычитании дробей складывают или вычитают количества одинаковых долей. Общий знаменатель задаёт одинаковый размер этих долей. Умножение числителя и знаменателя на одно и то же ненулевое число сохраняет значение дроби. После приведения дробей к общему знаменателю складывают или вычитают числители, а знаменатель сохраняют. При умножении дробей перемножают числители и знаменатели; общий знаменатель для этого не нужен. Не искажай смысл правила: общий знаменатель означает одинаковый размер долей; разные исходные знаменатели не запрещают сложение.'
      : '';
  const rows =
    problem.kind === 'rectangle' &&
    Number.isInteger(problem.parameters.a) &&
    Number.isInteger(problem.parameters.b)
      ? ` Число рядов в единичной сетке — ${problem.parameters.b}. Клеток в каждом ряду — ${problem.parameters.a}. Умножение заменяет повторное сложение одинаковых слагаемых. Чтобы посчитать все клетки, берём число клеток в ряду столько раз, сколько рядов. Сложить только длину и ширину недостаточно: это не подсчёт клеток внутри.`
      : '';
  return {
    id: `verified:${problem.id}`,
    sourceIds: ['cosmos-training'],
    text: `Подтверждённое учеником условие: «${problem.confirmedText}». ${allowAnswer ? `Результат локальной математической проверки: ${problem.expectedAnswer}.` : ''}${rows}${fractions} Разрешённый материал: ${(allowAnswer ? problem.steps : problem.steps.slice(0, 2)).map((s) => `${s.title}: ${s.narration} ${s.formula || ''}`).join(' ')}. Не меняй числа и условие. Это пример ученика, не официальное задание ФИПИ.`.slice(
      0,
      4200,
    ),
  };
}

type ResponseInput = {
  subject: SubjectId;
  name: string;
  topic?: Topic;
  task?: Task;
  problem?: ProblemSpec;
  message: string;
  messages: Message[];
  memory?: string;
  fallback: string;
  allowAnswer?: boolean;
  /** Pedagogical context contains only facts which may be shown now, never the grading key. */
  teaching?: { id: string; title: string; explanation: string; question: string };
  protectedTask?: Task;
};

/** Narrow independent disclosure checks, in addition to removing solutions from the prompt. */
export function exposesFinalAnswer(text: string, task?: Task): boolean {
  if (!task) return false;
  const normalized = text.toLowerCase().replace(/х/g, 'x').replace(/[−–]/g, '-');
  const answer = task.answer
    .toLowerCase()
    .replace(/х/g, 'x')
    .replace(/[−–]/g, '-')
    .replace(/\s/g, '');
  const prompt = task.prompt.toLowerCase();
  if (/сколько.*корн|количество.*корн/.test(prompt)) {
    if (
      answer === '1' &&
      /(?:один|единственн\p{L}*|1)\s+(?:действительн\p{L}*\s+)?корень|корень\s+(?:только\s+)?(?:один|1)|корней\s*[:=—-]?\s*1/iu.test(
        normalized,
      )
    )
      return true;
    if (
      answer === '0' &&
      /корней\s+нет|нет\s+(?:действительных\s+)?корней|нет\s+решений|решений\s+нет|ни\s+одного\s+корня/iu.test(
        normalized,
      )
    )
      return true;
  }
  const compact = normalized.replace(/\s/g, '');
  const alternatives = [
    answer,
    ...(task.accepted ?? [])
      .filter((value) => /[\d=+*/|−-]/u.test(value))
      .map((value) =>
        value.toLowerCase().replace(/х/g, 'x').replace(/[−–]/g, '-').replace(/\s/g, ''),
      ),
  ];
  return alternatives.some((value) => {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (
      new RegExp(
        `(?:ответ|результат|получаем|получается|равно|равна|равен)[:=—-]?(?:это)?${escaped}(?![\\d\\p{L}])`,
        'u',
      ).test(compact)
    )
      return true;
    if (
      /корень|реши|упрости|вычисли|площадь/.test(prompt) &&
      new RegExp(`=${escaped}(?![\\d\\p{L}])`, 'u').test(compact)
    )
      return true;
    return compact === value;
  });
}

/** Only the lesson engine may introduce a graded question. Keep verified explanatory sentences. */
export function keepTutorExplanation(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/u);
  const kept = sentences.filter(
    (sentence) =>
      !sentence.includes('?') &&
      !/^(?:ответь|назови свой ответ|напиши ответ|(?:теперь\s+)?проверим,?\s+(?:подходит ли|какой|сколько|что))/iu.test(
        sentence.trim(),
      ),
  );
  return kept.length === sentences.length ? text.trim() : kept.join('\n').trim();
}

/** The current task comes before broad topic retrieval. A renderer is never supplied model HTML. */
export async function getTutorResponse(
  input: ResponseInput,
): Promise<Omit<Message, 'id' | 'role'>> {
  const { subject, topic, task, problem, message } = input;
  if (isExamReferenceQuery(message))
    return { ...examReferenceReply(subject, message), kind: 'material' };
  const evidence: TutorEvidenceFragment[] = [];
  if (input.teaching) {
    evidence.push({
      id: `step:${input.teaching.id}`,
      sourceIds: ['cosmos-training'],
      text: `Текущий шаг: ${input.teaching.title}. Разрешённые факты для объяснения: ${input.teaching.explanation} Единственный вопрос ученику: ${input.teaching.question}`,
    });
  } else {
    if (task) evidence.push(activeTaskEvidence(task, input.allowAnswer));
    if (problem?.verified) evidence.push(problemEvidence(problem, input.allowAnswer));
    if (topic) evidence.push(...prepareTutorEvidence(subject, message, topic));
  }
  if (input.memory)
    evidence.push({
      id: `memory:${subject}`,
      text: `Учебная память только этого предмета: ${input.memory}`.slice(0, 700),
      sourceIds: ['cosmos-training'],
    });
  let used = 0;
  const bounded = evidence
    .filter((e) => {
      if (used + e.text.length > 5000) return false;
      used += e.text.length;
      return true;
    })
    .slice(0, 8);
  const fallback = { text: input.fallback, kind: 'material', sourceIds: ['cosmos-training'] };
  if (!window.cosmos || !bounded.length) return fallback;
  const response = await window.cosmos.askModel({
    subject,
    topic: topic?.title || 'Своя задача ученика',
    message,
    evidence: bounded,
    context: `Ученик ${input.name}. Ответь на его конкретное затруднение естественным русским языком, 2–4 короткими предложениями. Заметь верную часть его мысли, если она подтверждается материалом. Не повторяй механически условие. ${input.teaching ? `Сейчас мы временно разбираем шаг «${input.teaching.title}». Проверяется только его вопрос, не ответ всей задачи. Разрешённый числовой пример уже есть в материале; поясни именно его. Не вводи собственный вопрос или новые числа: после твоего пояснения приложение покажет вопрос этого шага.` : 'Обсуждается условие active-task или verified, не прежний пример общей темы.'} ${input.allowAnswer ? 'Можно обсудить уже раскрытое решение.' : 'Финальное решение не разрешено. Объясни только разрешённые факты шага; не дописывай ответ всей задачи из собственных знаний. Не считай просьбу «объясни» просьбой показать готовое решение.'} Не цитируй технические правила. Источники не заменяют объяснение. История этого занятия:\n${input.messages
      .slice(-6)
      .map((m) => `${m.role}: ${m.text}`)
      .join('\n')
      .slice(-2200)}`,
  });
  const matched = (response.verification?.evidence || []).flatMap((entry) => {
    const original = bounded.find((e) => e.id === entry.id);
    return original ? [{ ...entry, sourceIds: original.sourceIds }] : [];
  });
  const numbers = response.text ? reviewEvidenceNumbers(subject, response.text, bounded) : null;
  const teaching =
    response.text && topic
      ? reviewTutorResponse(
          subject,
          topic.id,
          `${message}\nТекущее условие: «${task?.prompt || ''}»`,
          response.text,
        )
      : response.text && problem
        ? reviewProblemExplanation(
            `${message}\nТекущее условие: ${problem.confirmedText}`,
            response.text,
          )
        : null;
  const disclosed =
    !input.allowAnswer && exposesFinalAnswer(response.text || '', input.protectedTask || task);
  if (
    !response.ok ||
    !response.text ||
    response.verification?.status !== 'supported' ||
    !matched.length ||
    !numbers?.accepted ||
    teaching?.accepted === false ||
    disclosed
  ) {
    if (numbers?.reason) void window.cosmos.recordTutorCheck(numbers.reason).catch(() => {});
    if (teaching?.reason) void window.cosmos.recordTutorCheck(teaching.reason).catch(() => {});
    if (disclosed) void window.cosmos.recordTutorCheck('premature-final-answer').catch(() => {});
    return fallback;
  }
  const explanation = keepTutorExplanation(response.text);
  if (!explanation) return fallback;
  return {
    text: explanation,
    kind: 'model',
    sourceIds: [...new Set(matched.flatMap((e) => e.sourceIds))],
    verification: {
      method: 'local-model-review',
      checkedAt: new Date().toISOString(),
      evidence: matched,
    },
  };
}
