export const lessonLabSources: Record<
  string,
  { title: string; url: string; checkedAt: string; scope?: string }
>;
export const lessonLabExamples: Array<{
  id: string;
  subject: string;
  topic: string;
  aliases: string[];
  title: string;
  source: string;
  steps: Array<{ caption: string; formula?: string }>;
}>;
export function validLessonLabValues(value: unknown): boolean;
export function renderLessonLab(values: unknown, progress?: number): string | null;
