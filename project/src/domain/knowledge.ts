import type { SubjectId } from './types';
import { mathKnowledge } from './knowledge/math';
import { russianKnowledge } from './knowledge/russian';
import { historyKnowledge } from './knowledge/history';
import { socialKnowledge } from './knowledge/social';
import type { KnowledgeCard } from './knowledge/types';

export type { KnowledgeCard } from './knowledge/types';

export const knowledgeCards: readonly KnowledgeCard[] = Object.freeze([
  ...mathKnowledge,
  ...russianKnowledge,
  ...historyKnowledge,
  ...socialKnowledge,
]);

const stopWords = new Set([
  'а',
  'и',
  'в',
  'во',
  'на',
  'к',
  'ко',
  'с',
  'со',
  'от',
  'до',
  'по',
  'за',
  'из',
  'для',
  'о',
  'об',
  'у',
  'как',
  'что',
  'это',
  'чем',
  'мне',
  'меня',
  'мой',
  'я',
  'мы',
  'ты',
  'он',
  'она',
  'они',
  'оно',
  'ли',
  'или',
  'же',
  'бы',
  'быть',
  'при',
  'его',
  'ее',
  'объясни',
  'объяснить',
  'расскажи',
  'пожалуйста',
  'почему',
  'помоги',
  'такое',
  'такой',
  'такая',
  'такие',
  'нужно',
  'знаю',
  'понять',
  'разобрать',
  'дай',
  'назови',
  'начни',
  'помнить',
  'помню',
  'один',
  'одну',
  'одного',
  'одном',
  'короткий',
  'короткую',
  'простой',
  'простого',
  'маленькую',
  'подсказку',
  'вопрос',
  'причину',
  'пример',
  'примере',
  'шаг',
  'шага',
]);

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(text: string): string[] {
  return [
    ...new Set(
      normalize(text)
        .split(' ')
        .filter((word) => word && !stopWords.has(word)),
    ),
  ];
}

// Small transparent suffix normalizer, not a claim of full Russian morphology.
function stem(word: string): string {
  if (word.length < 5 || !/^[а-я]+$/.test(word)) return word;
  return word.replace(
    /(?:иями|ями|ами|иях|ого|ему|ому|ыми|ими|ая|яя|ое|ее|ые|ие|ий|ый|ой|ую|юю|ом|ем|ам|ям|ах|ях|ов|ев|ей|а|я|ы|и|у|ю|е)$/u,
    '',
  );
}

function matchToken(query: string, candidate: string): number {
  if (query === candidate) return 1;
  if (query.length < 4 || candidate.length < 4) return 0;
  const q = stem(query),
    c = stem(candidate);
  if (q.length >= 3 && q === c) return 0.85;
  // Prefix match helps «медиан» / «медиана» without matching tiny common fragments.
  if (Math.min(q.length, c.length) >= 5 && (q.startsWith(c) || c.startsWith(q))) return 0.65;
  return 0;
}

const index = knowledgeCards.map((card, order) => ({
  card,
  order,
  headings: tokens(`${card.title} ${card.topic} ${card.keywords.join(' ')}`),
  body: tokens(
    `${card.summary} ${card.explanation.join(' ')} ${card.example.problem} ${card.mistakes.join(' ')}`,
  ),
}));

/** Returns detached cards. A future topic id is knowledge coverage, not an executable lesson. */
export function getKnowledgeForTopic(topicId: string, subject?: SubjectId): KnowledgeCard[] {
  return knowledgeCards
    .filter((card) => card.topicIds.includes(topicId) && (!subject || card.subject === subject))
    .map((card) => structuredClone(card));
}

/**
 * Deterministic offline lexical retrieval. Subject is a strict filter; topic is a ranking hint.
 * Empty query returns topic cards, or the first subject cards. Unknown nonempty queries return [].
 * No network, model, state mutation, official-task claim or automated assessment occurs here.
 */
export function retrieveKnowledge(
  subject: SubjectId,
  query: string,
  topic?: string,
  limit = 3,
): KnowledgeCard[] {
  const count = Number.isFinite(limit) ? Math.max(0, Math.min(8, Math.floor(limit))) : 3;
  if (!count) return [];
  const normalizedQuery = normalize(query.slice(0, 4000));
  const isUncertainty = /^(?:я )?(?:не знаю|не понимаю|затрудняюсь|не уверен|не уверена)$/.test(
    normalizedQuery,
  );
  const terms = isUncertainty
    ? []
    : tokens(normalizedQuery).filter(
        (term) => subject === 'russian' || (term !== 'не' && term !== 'ни'),
      );
  const candidates = index.filter((entry) => entry.card.subject === subject);
  if (!terms.length) {
    return candidates
      .filter((entry) => !topic || entry.card.topicIds.includes(topic))
      .slice(0, count)
      .map(({ card }) => structuredClone(card));
  }
  return (
    candidates
      .map((entry) => {
        let relevance = 0,
          matched = 0,
          headingMatches = 0,
          bodyMatches = 0;
        for (const term of terms) {
          const heading = Math.max(0, ...entry.headings.map((word) => matchToken(term, word)));
          // Short NE/NI and numbers match explicit headings only; common body words should not dominate.
          const body =
            term.length > 2 ? Math.max(0, ...entry.body.map((word) => matchToken(term, word))) : 0;
          if (heading || body) matched += 1;
          if (heading >= 0.65) headingMatches += 1;
          if (body >= 0.65) bodyMatches += 1;
          relevance += heading * 8 + body;
        }
        const score =
          relevance +
          (matched / terms.length) * 3 +
          (relevance > 0 && topic && entry.card.topicIds.includes(topic) ? 2 : 0);
        return { ...entry, relevance, score, headingMatches, bodyMatches };
      })
      // One incidental body word is not evidence of topic relevance. This removes
      // e.g. Versailles through «причина» and extra geometry through «стороны».
      .filter(
        (entry) => entry.relevance > 0 && (entry.headingMatches > 0 || entry.bodyMatches >= 2),
      )
      .sort((a, b) => b.score - a.score || a.order - b.order)
      // Additional cards must be comparably relevant; do not fill a requested quota
      // with low-score material merely because two slots were requested.
      .filter((entry, _position, ranked) => entry.score >= ranked[0]!.score * 0.72)
      .slice(0, count)
      .map(({ card }) => structuredClone(card))
  );
}
