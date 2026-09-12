import type { SubjectId } from '../domain/types';

/** A mathematical sentence in a lesson is usually reasoning, not a new workspace request. */
export function shouldOpenOwnProblem(message: string, subject: SubjectId): boolean {
  if (subject !== 'math') return false;
  const text = message
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .trim()
    .replace(/^(?:(?:а|ну|окей|теперь|пожалуйста|давай)[, ]+)+/u, '');
  return (
    /^(?:вот\s+)?(?:мой|моя|новый|новая|другой|другая)\s+(?:пример|задача)(?=\s|[:—-]|$)/u.test(
      text,
    ) ||
    /^(?:у меня\s+(?:есть\s+)?)?(?:новый|другой)\s+пример(?=\s|[:—-]|$)/u.test(text) ||
    /^(?:у меня\s+(?:есть\s+)?)?(?:новая|другая)\s+задача(?=\s|[:—-]|$)/u.test(text) ||
    /^(?:реши|решим|разбери|разберем|открой|посмотри)\s+(?:(?:вот\s+)?(?:мой|мою|новый|новую|другой|другую)\s+(?:пример|задачу)|вот(?=\s|[:—-]|$))/u.test(
      text,
    )
  );
}
