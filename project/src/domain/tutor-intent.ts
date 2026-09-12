import type { Task } from './types';
import { assessAnswer, normalizeAnswerText } from './answer-check';

export type TutorInputIntent =
  | 'answer'
  | 'hint'
  | 'reveal'
  | 'why'
  | 'discussion'
  | 'repeat'
  | 'next';

/** Classifies an action before grading. It does not infer correctness. */
export function classifyTutorInput(input: string, task?: Task): TutorInputIntent {
  const text = normalizeAnswerText(input);
  if (task && assessAnswer(task, text).status === 'correct') return 'answer';
  if (
    /(?:не\s+(?:показывай|говори|пиши|давай|раскрывай)\s+(?:готовый\s+)?(?:ответ|решение))/u.test(
      text,
    )
  )
    return 'hint';
  if (
    /(?:покажи|скажи|дай|раскрой|напиши|показать|сказать|написать)\s+(?:мне\s+)?(?:пожалуйста[, ]+)?(?:готовый\s+|правильный\s+)?(?:ответ|решение|разбор)|(?:^|\s)сдаюсь(?:\s|$)|^(?:готовый\s+ответ|решение\s+целиком|(?:какой\s+)?правильный\s+ответ|ответ[, ]+пожалуйста)$/u.test(
      text,
    )
  )
    return 'reveal';
  if (/^(?:я\s+)?не\s+понимаю[, ]+(?:почему|зачем|как)/u.test(text)) return 'why';
  if (
    /(?:не\s+(?:знаю|понимаю|понял|поняла|помню|умею|могу)|забыл[аи]?|подсказ|помоги|помощь|затрудняюсь|не уверен|сомневаюсь)/u.test(
      text,
    )
  )
    return 'hint';
  if (
    /^(?:(?:а|но)\s+)?(?:почему|зачем|объясни|объясните|как\s+(?:это|решить|начать|получилось|понять)|что\s+(?:значит|означает|обозначает|такое))/u.test(
      text,
    )
  )
    return 'why';
  if (/^(?:повтори(?:\s+(?:задание|вопрос|условие))?|еще\s+раз|сначала)$/u.test(text))
    return 'repeat';
  if (
    /^(?:(?:окей|ок|хорошо|ладно|понятно|давай|ну|а|и)[, ]+)*(?:что\s+)?(?:дальше|далее|следующее(?:\s+(?:задание|вопрос))?|пропусти(?:ть)?(?:\s+(?:задание|шаг))?)$/u.test(
      text,
    )
  )
    return 'next';
  if (
    /^(?:привет|здравствуй|спасибо|поговорим|расскажи|можешь\s+объяснить|я\s+хочу\s+спросить|кто\s+|когда\s+|где\s+|чем\s+|как\s+)/u.test(
      text,
    )
  )
    return 'discussion';
  return 'answer';
}
