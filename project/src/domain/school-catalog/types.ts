import type { SubjectId } from '../types';

export type SchoolGrade = 8 | 9 | 10 | 11;
export type SchoolMathLevel = 'basic' | 'profile' | 'undecided';
export interface SchoolTopic {
  id: string;
  subject: SubjectId;
  grade: SchoolGrade;
  grades: SchoolGrade[];
  section: string;
  title: string;
  goal: string;
  keyConcepts: string[];
  formulas: string[];
  prerequisites: string[];
  subtopics: string[];
  curriculumNodeIds: string[];
  curriculumCodes: string[];
  sourceIds: string[];
  sourceReferences: { sourceId: string; documentId: string; page: number; editionYear: number }[];
  gradeBasis: 'approximate' | 'official-program';
  gradeNote: string;
  materialStatus: 'authored-guide';
  examRelevance: 'assessed-content';
  lessonTopicIds: string[];
  /** Authored first subtopic, never a replacement for the full official position title. */
  recommendedStart?: { lessonTopicId: string; title: string; description: string };
  availability: 'guide' | 'practice';
  foundation: boolean;
  exclusionNotes: string[];
  /** Exam membership is never inferred from school programme level or inherited parent codes. */
  examLevels: ('basic' | 'profile')[];
  examLevelNote: string;
  context: string;
}
export interface SchoolTopicQuery {
  subject?: SubjectId;
  grade?: SchoolGrade | number;
  query?: string;
  includeFoundations?: boolean;
  mathLevel?: SchoolMathLevel;
}
export interface SchoolTopicContextOptions { maxChars?: number }
export interface SchoolTopicOverlay {
  goal?: string;
  keyConcepts?: string[];
  formulas?: string[];
  prerequisites?: string[];
  explanation?: string;
}
