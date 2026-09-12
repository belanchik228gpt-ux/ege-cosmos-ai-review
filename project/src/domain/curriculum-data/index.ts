import math from './math-2026.json';
import russian from './russian-2026.json';
import history from './history-2026.json';
import social from './social-2026.json';
import metadata from './metadata.json';
import type { CurriculumNode } from './types';

export type { CurriculumNode, MathExamTaskMap } from './types';
export { baseExamTaskMap } from './math-basic-exam';

/** All coded content positions of the final 2026 edition, including marked exclusions.
 * Group rows are navigation sections; authored lessons cover only part of broad positions.
 * Draft 2027 documents are deliberately not merged into this array.
 */
export const curriculumNodes: CurriculumNode[] = [
  ...math,
  ...russian,
  ...history,
  ...social,
] as CurriculumNode[];
export const curriculumCatalogMetadata = metadata;
