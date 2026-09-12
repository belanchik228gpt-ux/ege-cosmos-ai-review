export type SchoolGrade = 7 | 8 | 9 | 10 | 11;
export type SchoolSubjectId =
  | 'math'
  | 'russian'
  | 'literature'
  | 'english'
  | 'history'
  | 'social'
  | 'geography'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'informatics'
  | 'project';
export type SchoolVisual =
  | 'number-line'
  | 'algebra'
  | 'function'
  | 'geometry'
  | 'syntax'
  | 'history'
  | 'concept';
export interface SchoolSource {
  id: string;
  subject: SchoolSubjectId;
  title: string;
  url: string;
  publisher: string;
  kind: 'program' | 'guidance' | 'textbook-reference' | 'standard';
  edition: string;
  checkedAt: string;
  grades: SchoolGrade[];
  notes?: string;
}
export interface SchoolUnit {
  id: string;
  subject: SchoolSubjectId;
  grade: SchoolGrade;
  order: number;
  section: string;
  title: string;
  topics: string[];
  sourceId: string;
  pages: number[];
  objectives: string[];
  intro: string;
  keyIdea: string;
  example: string;
  question: string;
  answer: string;
  visual: SchoolVisual;
  notes?: string;
}
