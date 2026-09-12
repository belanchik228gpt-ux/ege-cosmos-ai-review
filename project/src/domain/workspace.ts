import type { SubjectId } from './types';

export interface StudyWorkspace {
  curriculumSubject: SubjectId | 'all';
  curriculumQuery: string;
  curriculumGrade: string;
  showSchoolOnly: boolean;
  curriculumNodeId?: string;
  curriculumPane?: 'overview' | 'visual' | 'practice' | 'sources';
  curriculumMathMode?: 'exam' | 'catalog';
  planDate?: string;
  planPeriod: 'week' | 'month';
}
export const createStudyWorkspace = (): StudyWorkspace => ({
  curriculumSubject: 'all',
  curriculumQuery: '',
  curriculumGrade: 'all',
  showSchoolOnly: false,
  planPeriod: 'week',
});
export function hydrateStudyWorkspace(raw: unknown): StudyWorkspace {
  const result = createStudyWorkspace();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  const value = raw as Record<string, unknown>;
  if (['all', 'math', 'russian', 'history', 'social'].includes(String(value.curriculumSubject)))
    result.curriculumSubject = value.curriculumSubject as StudyWorkspace['curriculumSubject'];
  if (typeof value.curriculumQuery === 'string')
    result.curriculumQuery = value.curriculumQuery.slice(0, 200);
  if (['all', '5', '6', '7', '8', '9', '10', '11'].includes(String(value.curriculumGrade)))
    result.curriculumGrade = String(value.curriculumGrade);
  result.showSchoolOnly = value.showSchoolOnly === true;
  if (typeof value.curriculumNodeId === 'string')
    result.curriculumNodeId = value.curriculumNodeId.slice(0, 180);
  if (['overview', 'visual', 'practice', 'sources'].includes(String(value.curriculumPane)))
    result.curriculumPane = value.curriculumPane as StudyWorkspace['curriculumPane'];
  if (value.curriculumMathMode === 'catalog' || value.curriculumMathMode === 'exam')
    result.curriculumMathMode = value.curriculumMathMode;
  if (typeof value.planDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.planDate))
    result.planDate = value.planDate;
  if (value.planPeriod === 'month') result.planPeriod = 'month';
  return result;
}
