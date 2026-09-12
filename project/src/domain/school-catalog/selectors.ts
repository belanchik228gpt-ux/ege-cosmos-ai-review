import type { SubjectId } from '../types';
import { schoolTopics } from './data';
import type { SchoolTopic, SchoolTopicQuery, SchoolTopicContextOptions, SchoolMathLevel } from './types';

const foundations = new Set(['math-rectangle', 'math-triangle', 'math-median', 'math-fraction', 'math-multiply', 'math-percent']);
export const isFoundationLesson = (id: string): boolean => foundations.has(id);
export const getSchoolTopic = (id: string): SchoolTopic | undefined => schoolTopics.find((topic) => topic.id === id);
export const getSchoolTopicByLessonId = (id: string): SchoolTopic | undefined => schoolTopics.find((topic) => topic.lessonTopicIds.includes(id));
const normalize = (text: string) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/[^\p{L}\p{N}.]+/gu, ' ').trim();
const wordKey = (word: string) => {
  if (/^(?:корень|корн(?:и|ей|я|ями|ях))$/u.test(word)) return 'корень';
  return word.length > 6 ? word.replace(/(?:ические|ический|ическая|ического|ических|ические|ющие|ющий|ого|ому|ыми|ими|ые|ие|ий|ый|ая|яя|ой|ей)$/u, '') : word;
};
export function listSchoolTopics(options: SchoolTopicQuery = {}): SchoolTopic[] {
  const words = normalize(options.query ?? '').split(/\s+/u).filter(Boolean);
  return schoolTopics.filter((topic) => {
    if (options.subject && topic.subject !== options.subject) return false;
    if (options.grade && !topic.grades.includes(options.grade as 8 | 9 | 10 | 11)) return false;
    if (options.includeFoundations === false && topic.foundation) return false;
    // Unknown leaf-to-exam mappings stay visible with their explicit warning; never infer from parent.
    if (topic.subject === 'math' && options.mathLevel && options.mathLevel !== 'undecided' && topic.examLevels.length && !topic.examLevels.includes(options.mathLevel)) return false;
    const subjectName={math:'Математика',russian:'Русский язык',history:'История',social:'Обществознание'}[topic.subject];
    const haystack = normalize([subjectName, topic.title, topic.section, topic.recommendedStart?.title??'', topic.recommendedStart?.description??'', ...topic.curriculumCodes, ...topic.keyConcepts, ...topic.subtopics].join(' '));
    const keys = haystack.split(/\s+/u).map(wordKey);
    return words.every((word) => haystack.includes(word) || keys.includes(wordKey(word)));
  });
}
export function getSchoolTopicContext(id: string, options: SchoolTopicContextOptions = {}): string {
  const topic = getSchoolTopic(id);
  if (!topic) return '';
  const max = Math.max(600, Math.min(12_000, Number.isFinite(options.maxChars) ? Math.floor(options.maxChars!) : 6500));
  const header = `Авторская карта содержания Cosmos, не официальный текст учебника и не готовое решение. Источники: ${topic.sourceIds.join(', ')}. ФИПИ: ${topic.curriculumCodes.join(', ')}, ${topic.sourceReferences.map((source) => `PDF ${source.documentId}, стр. ${source.page}`).join('; ')}.\n`;
  const limit = '\nГраница: полнота каталога не равна полноте объяснений и не гарантирует 80+. В базовой математике используется отметка по пятибалльной шкале.';
  const start = topic.recommendedStart ? `Рекомендуемый первый шаг: ${topic.recommendedStart.title}. ${topic.recommendedStart.description}\n` : '';
  const startBudget=Math.max(0,max-header.length-limit.length);
  const focus=start.slice(0,Math.min(start.length,startBudget));
  return (focus + header + topic.context.slice(0, Math.max(0, max - focus.length - header.length - limit.length)) + limit).slice(0, max);
}
const starts: Partial<Record<SubjectId, string[]>> = { math: ['school-math-1-7', 'school-math-1-3', 'school-math-1-8', 'school-math-2-1'], russian: ['school-russian-3-2-1', 'school-russian-3-3-1', 'school-russian-3-5-1'], history: ['school-history-7-1'], social: ['school-social-1-1', 'school-social-2-1'] };
export function getGradeRoute(subject: SubjectId, grade = 10, mathLevel: SchoolMathLevel = 'basic'): SchoolTopic[] {
  const preferred = starts[subject] ?? [];
  return listSchoolTopics({ subject, grade, mathLevel, includeFoundations: false }).sort((a, b) => {
    const ai = preferred.indexOf(a.id), bi = preferred.indexOf(b.id);
    if (ai >= 0 || bi >= 0) return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi);
    return a.curriculumCodes[0].localeCompare(b.curriculumCodes[0], 'ru', { numeric: true });
  });
}
/** Existing practice only. An empty list means grade-appropriate guides are available, not fake tasks. */
export function getGradeLessonIds(subject: SubjectId, grade = 10): string[] {
  return [...new Set(getGradeRoute(subject, grade).flatMap((topic) => topic.lessonTopicIds))].filter((id) => !isFoundationLesson(id));
}
