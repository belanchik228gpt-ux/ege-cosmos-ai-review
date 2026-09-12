import data from '../../../shared/civics-terms.json';
import type { TutorDrawing } from '../cloud-learning';
import type { SchoolUnit } from '../school-program/types';

export interface CivicsTermSource {
  id: string;
  title: string;
  url: string;
  publisher: string;
  checkedAt: string;
  verification: 'page-text' | 'indexed-excerpt';
  quote: string;
  scope: string;
  notes?: string;
}

export interface CivicsTerm {
  id: string;
  term: string;
  subject: 'social';
  materialStatus: 'authored-training';
  topicAliases: string[];
  plainDefinition: string;
  formalDefinition: string;
  example: string;
  mechanism: string;
  counterexample: string;
  boundary: string;
  question: string;
  /** For a separately revealed self-check. Never inserted into the scene question frame. */
  answer: string;
  sourceIds: string[];
  sceneTitle: string;
  sceneLabels: string[][];
  figure?: 'tree' | 'cycle' | 'timeline';
  sceneFormula?: Record<string, string>;
}

// Definitions and examples are original teaching material; only source.quote is a quotation.
export const civicsTerms: readonly CivicsTerm[] = data.terms as CivicsTerm[];
export const civicsTermSources: readonly CivicsTermSource[] = data.sources as CivicsTermSource[];

function copyTerm(term: CivicsTerm): CivicsTerm {
  return {
    ...term,
    topicAliases: [...term.topicAliases],
    sourceIds: [...term.sourceIds],
    sceneLabels: term.sceneLabels.map((labels) => [...labels]),
    ...(term.sceneFormula ? { sceneFormula: { ...term.sceneFormula } } : {}),
  };
}

export function getCivicsTerm(id: string): CivicsTerm | undefined {
  const term = civicsTerms.find((item) => item.id === id);
  return term && copyTerm(term);
}

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('ru')
    .replaceAll('ё', 'е')
    .replace(/[\u00ad\u200b]/g, '')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/, '')
    .trim();

const aliases = new Map<string, CivicsTerm>();
for (const term of civicsTerms)
  for (const alias of term.topicAliases) {
    const key = normalize(alias);
    if (aliases.has(key) && aliases.get(key)?.id !== term.id)
      throw new Error('Duplicate civics scene alias');
    aliases.set(key, term);
  }

export const civicsExpandedExamples = civicsTerms.map((term) => ({
  subject: 'social' as const,
  topic: term.topicAliases[0],
  termId: term.id,
}));

/** The requested focus must match an authored topic, never a keyword from the enclosing room.
 * Four frames: concrete situation → mechanism → named concept and limits → fresh question.
 * Tree figures compare members of one category; their edges are not time or causal arrows. */
export function civicsExpandedDrawing(unit: SchoolUnit, topic: string): TutorDrawing | undefined {
  if (
    unit.subject !== 'social' ||
    typeof topic !== 'string' ||
    !topic.trim() ||
    topic.length > 1400
  )
    return;
  const term = aliases.get(normalize(topic));
  if (!term) return;
  const captions = [
    term.example,
    term.mechanism,
    `${term.term}. ${term.plainDefinition} ${term.boundary}`,
    `Самостоятельно: ${term.question}`,
  ];
  return {
    kind: 'concept',
    title: `Авторский пример · ${term.sceneTitle}`,
    ...(term.figure ? { figure: term.figure } : {}),
    steps: captions.map((caption, index) => ({
      caption,
      labels: [...term.sceneLabels[index]],
      // The last frame must never inherit a worked formula or labels from the previous example.
      ...(index < 3 && term.sceneFormula?.[index] ? { formula: term.sceneFormula[index] } : {}),
    })),
  };
}
