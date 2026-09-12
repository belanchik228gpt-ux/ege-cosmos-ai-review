import type { SubjectId } from '../domain/types';
export type BoardFact = {
  label: string;
  text: string;
  icon:
    | 'text'
    | 'person'
    | 'event'
    | 'date'
    | 'place'
    | 'buyer'
    | 'seller'
    | 'change'
    | 'quantity'
    | 'expression';
};
export type TaskBoardContent = {
  subject: SubjectId;
  kind: 'sentence' | 'history' | 'social' | 'math';
  source: string;
  question: string;
  tokens: Array<{ text: string; part: number; focus: boolean }>;
  facts: BoardFact[];
  guidance: [string, string, string];
};
const unique = (list: string[]) => [...new Set(list)];
const clip = (text: string, max = 180) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const trim = (text: string) => text.trim().replace(/^[,;:—\s]+|[.\s]+$/g, '');
const questions =
  /(?:^|[.!?]\s+)(?:Назови|Найди|Сколько|Как(?:ой|ая|ое|ие|ого|ом|им)?|Чему|Что|Кто|Где|Когда|После какого|Перед каким|Ответь|Запиши|Это(?:\s|$))/iu;
/** Extracts literal prompt data; has no access to correct answers or hidden explanations. */
export function taskBoardContent(subject: SubjectId, prompt: string): TaskBoardContent {
  const source = prompt.trim(),
    quoted = [...source.matchAll(/[«“"]([^»”"]+)[»”"]/g)].find(
      (m) => m[1].length >= 8 && /\s/.test(m[1]),
    ),
    quote = quoted?.[1];
  const outside = quote ? trim(source.replace(quoted![0], '')) : source,
    requestMatch = outside.match(questions),
    questionSentence = outside.match(/(?:^|[.!?]\s+)([^.!?]*\?)/u),
    questionStart = requestMatch
      ? requestMatch.index! + (requestMatch[0].match(/^[.!?]\s*/)?.[0].length ?? 0)
      : questionSentence
        ? questionSentence.index! + questionSentence[0].length - questionSentence[1].length
        : undefined;
  const question = questionStart !== undefined ? outside.slice(questionStart) : outside;
  const factual = trim(
    quote
      ? source.slice(0, quoted!.index)
      : questionStart !== undefined && questionStart > 0
        ? source.slice(0, questionStart)
        : source,
  );
  const parts = source
      .split(/(?<=[.!?])\s+|,\s*(?=а\s)/u)
      .map(trim)
      .filter(Boolean),
    facts: BoardFact[] = [];
  let tokens: TaskBoardContent['tokens'] = [];
  const kind: TaskBoardContent['kind'] = subject === 'russian' ? 'sentence' : subject;
  if (subject === 'russian') {
    const words = (quote || factual || source).match(/\S+/g) || [];
    let part = 0;
    tokens = words.slice(0, 64).map((text) => {
      const item = {
        text,
        part,
        focus: /^(когда|если|что|который|которая|которое|которые|потому|чтобы|хотя)$/iu.test(
          text.replace(/[,.!?;:]$/, ''),
        ),
      };
      if (text.includes(',')) part++;
      return item;
    });
    const sought = source.match(
      /(?:подлежащее|сказуемое|определение|запятая|запятую|частиц[а-яё]*|грамматических основ)/iu,
    )?.[0];
    if (sought) facts.push({ label: 'Что ищем', text: sought, icon: 'text' });
    return {
      subject,
      kind,
      source,
      question: question || source,
      tokens,
      facts,
      guidance: [
        quote
          ? 'Читаем предложение в том виде, в котором оно дано.'
          : 'Сначала прочитай выделенные слова условия.',
        tokens.some((t) => t.focus)
          ? 'Подсвечены слова связи, которые уже есть в записи. Найди, какие части они соединяют.'
          : 'Сопоставь слова с вопросом. Подсветка помогает читать, но не выбирает правильное слово.',
        'Назови нужное слово или объясни границу частей. Знаки в исходной записи не изменены.',
      ],
    };
  }
  if (subject === 'history') {
    const dates = unique(
        source.match(/(?<!\d)(?:\d{3,4}|[IVX]{2,5})(?:\s*(?:год[а-яё]*|г\.|век[а-яё]*))?/g) || [],
      ),
      roles = unique(
        source.match(
          /(?:княз[а-яё]*|правител[а-яё]*|император[а-яё]*|крестьян[а-яё]*|помещик[а-яё]*|войск[а-яё]*|сослови[а-яё]*)/giu,
        ) || [],
      );
    const event = source.match(
        /(?:Крещени[а-яё]* Руси|отмен[а-яё]* крепостного права|Северн[а-яё]* войн[а-яё]*|реформ[а-яё]*(?: [А-ЯЁ][а-яё]+(?: II| I)?)?)/iu,
      )?.[0],
      place = source.match(/(?:в|из|под)\s+([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)/u)?.[1];
    if (event) facts.push({ label: 'Событие в условии', text: event, icon: 'event' });
    if (dates.length)
      facts.push({ label: 'Время в условии', text: dates.join(' · '), icon: 'date' });
    if (roles.length)
      facts.push({ label: 'Участники / роль', text: roles.join(' · '), icon: 'person' });
    if (place) facts.push({ label: 'Место в записи', text: place, icon: 'place' });
    if (!facts.length)
      facts.push({ label: 'Исторический контекст', text: clip(factual || source), icon: 'event' });
  } else if (subject === 'social') {
    const factualParts = parts.filter((p) => !questions.test(p) && !p.includes('?')),
      selected = factualParts.length ? factualParts : parts.slice(0, 1),
      buyers = selected.find((p) => /покупател[а-яё]*|спрос/iu.test(p)),
      sellers = selected.find((p) => /продав[а-яё]*|предложени[а-яё]*/iu.test(p) && p !== buyers);
    if (buyers)
      facts.push({
        label: /покупател/iu.test(buyers) ? 'Покупатели' : 'Спрос в условии',
        text: clip(buyers),
        icon: 'buyer',
      });
    if (sellers)
      facts.push({
        label: /продав/iu.test(sellers) ? 'Продавцы' : 'Предложение в условии',
        text: clip(sellers),
        icon: 'seller',
      });
    {
      selected
        .filter((p) => p !== buyers && p !== sellers)
        .slice(0, 2)
        .forEach((p, i) =>
          facts.push({
            label: i === 0 ? 'Ситуация' : 'Действие в условии',
            text: clip(p),
            icon: /семь|групп|человек|граждан/iu.test(p) ? 'person' : 'change',
          }),
        );
    }
  } else {
    const expressions = unique(
      source.match(
        /\|[^|]{1,35}\|\s*=\s*[-−]?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?(?:\s*[+−\-*/·:]\s*\d+(?:[.,]\d+)?)+|[A-Z]{1,3}\s*=\s*[-−]?\d+(?:[.,]\d+)?(?:\s*(?:см|м)(?:²)?)?|\d+\s*%/g,
      ) || [],
    );
    expressions
      .slice(0, 3)
      .forEach((text) => facts.push({ label: 'Запись из условия', text, icon: 'expression' }));
    const relations = unique(
      source.match(/[A-Z]{1,3}\s*[—−-]\s*(?:медиан[а-яё]*|высот[а-яё]*|биссектрис[а-яё]*)/gu) || [],
    );
    relations
      .slice(0, 2)
      .forEach((text) => facts.push({ label: 'Связь из условия', text, icon: 'quantity' }));
    if (!facts.length) {
      const quantities = unique(
        source.match(
          /[-−]?\d+(?:[.,]\d+)?(?:\s*(?:см²|см|м²|м|клет[а-яё]*|ряд[а-яё]*|дол[а-яё]*|част[а-яё]*|единиц[а-яё]*))?/gu,
        ) || [],
      );
      quantities
        .slice(0, 3)
        .forEach((text) => facts.push({ label: 'Дано', text, icon: 'quantity' }));
    }
    if (!facts.length)
      facts.push({
        label: 'Математическое условие',
        text: clip(factual || source),
        icon: 'expression',
      });
  }
  return {
    subject,
    kind,
    source,
    question: question || source,
    tokens,
    facts: facts.slice(0, 4),
    guidance: [
      subject === 'history'
        ? 'Рассматриваем только событие, время и участников, названных в этом условии.'
        : subject === 'social'
          ? 'Посмотри, кто участвует в ситуации и что именно сказано об их действиях.'
          : 'Сначала прочитай данные и выражения. Числа на карточках взяты из условия.',
      subject === 'history'
        ? 'Отдели известные факты от того, что требуется назвать. Дата или имя не добавляются за тебя.'
        : subject === 'social'
          ? 'Сопоставь действия и величины. Ответ о связи между ними сформулируешь ты.'
          : 'Сопоставь известные данные с тем, что нужно найти. Карточки не вычисляют ответ.',
      'Ответь на вопрос ниже или расскажи, какой шаг хочешь уточнить.',
    ],
  };
}
