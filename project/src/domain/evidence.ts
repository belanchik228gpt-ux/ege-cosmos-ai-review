import { checkArithmetic } from '../../shared/arithmetic-review.cjs';
import { prepareGrounding } from './grounding';
import { retrieveKnowledge } from './knowledge';
import { sources } from './sources';
import type { SubjectId, Topic } from './types';
import { sourceExcerpts } from './knowledge/source-excerpts';

/** Local authored teaching paragraphs or explicitly identified short publisher excerpts. */
export interface TutorEvidenceFragment {
  id: string;
  text: string;
  sourceIds: string[];
}

const MAX_FRAGMENTS = 8;
const MAX_EVIDENCE_CHARS = 5000;

function relevantCards(subject: SubjectId, query: string, topic: Topic) {
  if (topic.subject !== subject) return [];
  let searchQuery = query;
  const plain = query
    .toLocaleLowerCase('ru-RU')
    .replace(/[?!.,]+/gu, '')
    .trim();
  if (/^(?:я\s+)?(?:не знаю|не помню|не понимаю|затрудняюсь|не уверен|не уверена)$/u.test(plain))
    searchQuery = '';
  else if (
    subject === 'russian' &&
    !/частиц|отрицани|написани|правописани|[«"„](?:не|ни)[»"“]|(?:^|\s)не\s+(?:и|или)\s+ни(?:$|\s)|^(?:не|ни)$/iu.test(
      query,
    )
  ) {
    // Ordinary negation in "фотоны не имеют массы" is not a request for a
    // Russian NE/NI rule. Only metalinguistic wording may use these tiny tokens.
    searchQuery = query.replace(/(^|[^\p{L}])(?:не|ни)(?=$|[^\p{L}])/giu, '$1 ');
  }
  // prepareGrounding has a current-room fallback. A different, uncovered question
  // must not inherit that fallback and acquire an appearance of factual support.
  const actual = new Set(
    retrieveKnowledge(subject, searchQuery, topic.id, 1).map((card) => card.id),
  );
  if (!actual.size) return [];
  return prepareGrounding(subject, searchQuery, topic).cards.filter(
    (card) => card.subject === subject && card.materialStatus === 'training' && actual.has(card.id),
  );
}

function registeredSources(subject: SubjectId, ids: string[]) {
  return [...new Set(ids)].filter((id) =>
    sources.some((source) => source.id === id && source.subjects.includes(subject)),
  );
}

export function prepareTutorEvidence(
  subject: SubjectId,
  query: string,
  topic: Topic,
): TutorEvidenceFragment[] {
  const result: TutorEvidenceFragment[] = [];
  let characters = 0;
  const cards = relevantCards(subject, query, topic);
  const topicIds = new Set(cards.flatMap((card) => card.topicIds));
  for (const excerpt of sourceExcerpts
    .filter(
      (excerpt) => excerpt.subject === subject && excerpt.topicIds.some((id) => topicIds.has(id)),
    )
    .slice(0, 2)) {
    const sourceIds = registeredSources(subject, [excerpt.sourceId]);
    if (!sourceIds.length) continue;
    result.push({ id: `source:${excerpt.id}`, text: excerpt.quote, sourceIds });
    characters += excerpt.quote.length;
  }
  for (const card of cards) {
    // A FIPI curriculum listing is not evidence for each mathematical or historical fact.
    const sourceIds = registeredSources(subject, [...card.factSourceIds, 'cosmos-training']);
    if (!sourceIds.length) continue;
    // Only declarative teaching paragraphs: an exercise's deliberately incorrect
    // premise and a checkpoint's answer are not evidence for a tutor's next hint.
    for (const [index, explanation] of card.explanation.entries()) {
      const text = explanation.trim();
      if (!text || text.length + characters > MAX_EVIDENCE_CHARS) continue;
      result.push({ id: `${card.id}:explanation:${index + 1}`, text, sourceIds: [...sourceIds] });
      characters += text.length;
      if (result.length >= MAX_FRAGMENTS) return result;
    }
  }
  return result;
}

/** This review catches only the explicit cases below; accepted is not a truth certificate. */
export interface EvidenceNumberReview {
  accepted: boolean;
  reason: string | null;
}

function containsUrl(text: string) {
  return (
    /\b[a-z][a-z0-9+.-]*:\/\//iu.test(text) ||
    /\b(?:mailto|file|data|javascript):/iu.test(text) ||
    /\bwww\./iu.test(text) ||
    /(?:^|[^\p{L}\p{N}_])(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+(?:[a-zа-я]{2,24})(?=$|[^\p{L}])/iu.test(
      text,
    ) ||
    /(?:^|[^\d])(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:\/|\b)/u.test(text)
  );
}

function calendarYears(text: string) {
  const years = new Set<string>();
  for (const match of text.matchAll(/(?<!\d)\d{4}(?!\d)/gu)) {
    const before = text.slice(Math.max(0, match.index! - 1), match.index!);
    const after = text.slice(match.index! + match[0].length);
    // A four-digit count is not a calendar date. Decimal parts are not dates either.
    if (/[.,]/u.test(before) || /^[.,]\d/u.test(after)) continue;
    if (
      /^\s*(?:человек|чел\b|жител|солдат|воин|крестьян|руб|км\b|метр|тонн|тысяч|млн|миллион|процент|%)/iu.test(
        after,
      )
    )
      continue;
    years.add(match[0]);
  }
  return years;
}

export function reviewEvidenceNumbers(
  subject: SubjectId,
  reply: string,
  evidence: TutorEvidenceFragment[],
): EvidenceNumberReview {
  if (containsUrl(reply)) return { accepted: false, reason: 'url-in-model-response' };
  if (subject === 'history') {
    const supported = calendarYears(evidence.map((fragment) => fragment.text).join('\n'));
    if ([...calendarYears(reply)].some((year) => !supported.has(year)))
      return { accepted: false, reason: 'unsupported-history-year' };
  }
  if (subject === 'math') {
    const reason = checkArithmetic(reply);
    if (reason) return { accepted: false, reason };
  }
  return { accepted: true, reason: null };
}

export function authoredEvidenceFallback(subject: SubjectId, query: string, topic: Topic) {
  const cards = relevantCards(subject, query, topic);
  const prefix = 'Для свободного ответа не хватает подтверждения.';
  if (!cards.length)
    return {
      text: `${prefix} В локальной подборке я не нашёл достаточно близкого объяснения. Уточни тему или пришли условие задачи — начнём с одного понятного шага.`,
      sourceIds: [] as string[],
      knowledgeIds: [] as string[],
    };
  const current = cards.find((card) => card.topicIds.includes(topic.id));
  const sourceIds = registeredSources(
    subject,
    cards.flatMap((card) => card.sourceIds),
  );
  // Never echo a checkpoint answer or a dated card title as a hint to "не знаю".
  // Ask for one observable first step instead of substituting a solved example.
  const firstSteps: Record<SubjectId, string> = {
    math: 'Начнём с условия: выпиши, что уже известно. Какую одну величину нужно найти?',
    russian:
      'Прочитай предложение ещё раз. Какое действие или состояние в нём названо? Выдели одно слово.',
    history:
      'Разделим вопрос: событие, его участники, дата и последствия. Какой один из этих элементов ты уже помнишь?',
    social: 'Сначала назови участников ситуации. Что делает один из них?',
  };
  const uncertainty =
    /не\s+(?:знаю|помню|понимаю)|затрудня|подсказ|помоги.{0,30}од(?:ин|ну|ного|ной)|не\s+называя|не\s+говори.{0,15}ответ/iu.test(
      query,
    );
  const step = uncertainty
    ? firstSteps[subject]
    : current
      ? `${topic.firstStep} Попробуй описать этот первый шаг своими словами.`
      : `В подходящем учебном объяснении: ${cards[0]!.explanation[0]} Какую часть этого правила разобрать сначала?`;
  return { text: `${prefix} ${step}`, sourceIds, knowledgeIds: cards.map((card) => card.id) };
}
