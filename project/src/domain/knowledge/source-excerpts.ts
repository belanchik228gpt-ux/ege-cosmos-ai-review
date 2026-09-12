import type { SubjectId } from '../types';

export type SourceExcerpt = {
  id: string;
  subject: SubjectId;
  topicIds: string[];
  sourceId: string;
  quote: string;
  checkedAt: string;
  language: 'ru' | 'en';
};

/**
 * Short, verbatim publisher excerpts checked on the recorded date.
 * These are a limited local citation cache, not a full textbook, a translation,
 * or evidence that the internet was consulted for a particular student answer.
 * A topic association does not mean the excerpt proves every claim in that topic.
 * Context, access method, publisher conditions: docs/SOURCE_EXCERPTS.md.
 */
export const sourceExcerpts: SourceExcerpt[] = [
  {
    id: 'excerpt-grammatical-basis',
    subject: 'russian',
    topicIds: ['russian-syntax'],
    sourceId: 'gramota-basis',
    quote: 'Главные члены предложения образуют грамматическую основу предложения.',
    checkedAt: '2026-09-08',
    language: 'ru',
  },
  {
    id: 'excerpt-ne-negation',
    subject: 'russian',
    topicIds: ['russian-ne-ni'],
    sourceId: 'gramota-ne-ni',
    quote: 'Частица не передаёт отрицание:',
    checkedAt: '2026-09-08',
    language: 'ru',
  },
  {
    id: 'excerpt-ni-reinforcement',
    subject: 'russian',
    topicIds: ['russian-ne-ni'],
    sourceId: 'gramota-ne-ni',
    quote: 'Частица ни усиливает уже имеющееся отрицание.',
    checkedAt: '2026-09-08',
    language: 'ru',
  },
  {
    id: 'excerpt-subordinate-comma',
    subject: 'russian',
    topicIds: ['russian-commas'],
    sourceId: 'gramota-subordinate',
    // A concrete example in §115, not a universal punctuation rule.
    // The publisher attributes the example to M. Prishvin.
    quote: 'Когда стемнело, я зажег лампу',
    checkedAt: '2026-09-08',
    language: 'ru',
  },
  {
    id: 'excerpt-baptism-date',
    subject: 'history',
    topicIds: ['history-baptism'],
    sourceId: 'history-baptism-source',
    // Publisher's modern historical article, not a quotation from a medieval chronicle.
    quote: 'Датой крещения Киевской Руси считается 988 год',
    checkedAt: '2026-09-08',
    language: 'ru',
  },
  {
    id: 'excerpt-reform-date',
    subject: 'history',
    topicIds: ['history-reform'],
    sourceId: 'history-reform-source',
    // Opening of the collection's historical reference, not the manifesto itself.
    quote:
      '19 февраля (3 марта по новому стилю) 1861 года император Александр II подписал Манифест',
    checkedAt: '2026-09-08',
    language: 'ru',
  },
];
