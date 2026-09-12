import type { SubjectId } from '../types';

/** Authored offline teaching material, never an imported official examination task. */
export interface KnowledgeCard {
  id: string;
  subject: SubjectId;
  topic: string;
  /** Existing lesson ids or future curriculum ids; these do not create lessons. */
  topicIds: string[];
  title: string;
  summary: string;
  explanation: string[];
  formula?: string;
  example: { problem: string; steps: string[]; answer: string };
  mistakes: string[];
  checkpoint: { question: string; hint: string; answer: string };
  keywords: string[];
  scope: string;
  sourceIds: string[];
  curriculumSourceIds: string[];
  factSourceIds: string[];
  materialStatus: 'training';
  exampleStatus: 'synthetic';
  version: string;
  checkedAt: string;
  schoolGrades?: number[];
  gradeBasis?: 'author-route' | 'official-program';
  gradeNote?: string;
}

export type CardDraft = Omit<
  KnowledgeCard,
  | 'subject'
  | 'sourceIds'
  | 'curriculumSourceIds'
  | 'materialStatus'
  | 'exampleStatus'
  | 'version'
  | 'checkedAt'
>;

export function authorCards(subject: SubjectId, drafts: CardDraft[]): KnowledgeCard[] {
  const curriculumSourceIds = [`fipi-${subject}-2026`, `fipi-${subject}-2027-project`];
  return drafts.map((draft) => ({
    ...draft,
    subject,
    materialStatus: 'training',
    exampleStatus: 'synthetic',
    version: '2026.09.08.3',
    checkedAt: '2026-09-08',
    curriculumSourceIds: [...curriculumSourceIds],
    sourceIds: [...curriculumSourceIds, ...draft.factSourceIds, 'cosmos-training'],
  }));
}
