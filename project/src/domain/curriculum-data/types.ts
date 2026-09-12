import type { SubjectId } from '../types';

/** A source-coded curriculum position, not a completed lesson or official exam task. */
export interface CurriculumNode {
  id: string;
  subject: SubjectId;
  code: string;
  title: string;
  section: string;
  parentId?: string;
  sourceId: string;
  sourceDocumentId: string;
  /** One-based physical PDF page, suitable for the local document viewer. */
  page: number;
  editionYear: number;
  editionStatus: 'final' | 'draft';
  schoolGrades: number[];
  gradeBasis: 'official-program' | 'approximate';
  gradeNote: string;
  keywords: string[];
  lessonTopicId?: string;
  /** Several authored scenes may cover portions of one broad official position. */
  lessonTopicIds?: string[];
  assessmentStatus?: 'assessed' | 'not-assessed-in-edition' | 'section';
  assessmentNote?: string;
  /** Italic subclauses explicitly excluded by the publisher; the remaining node is assessed. */
  notAssessedFragments?: string[];
  printedPage?: number;
  /** Basic/advanced school programme levels, not a mapping to basic/profile EGE tasks. */
  programLevels?: ('basic' | 'advanced')[];
  /** Only assigned at the granularity explicitly identified in an exam specification. Never inherit to all leaves. */
  examLevels?: ('basic' | 'profile')[];
  examLevelNote?: string;
}

export interface MathExamTaskMap {
  taskNumber: number;
  title: string;
  contentCodes: string[];
  requirementCodes: string[];
  sourceId: string;
  sourceDocumentId: string;
  page: number;
  printedPage: number;
  editionYear: number;
  editionStatus: 'final';
}
