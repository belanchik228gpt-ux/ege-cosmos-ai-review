import { lessonLabExamples } from '../../../shared/lesson-lab.mjs';
import type { SchoolUnit } from '../school-program/types';
import type { TutorDrawing } from '../cloud-learning';
const normalize = (s: string) =>
  s
    .normalize('NFKC')
    .toLocaleLowerCase('ru')
    .replaceAll('ё', 'е')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!]+$/, '');
const registry = new Map<string, number>();
lessonLabExamples.forEach((example, index) =>
  [example.topic, ...example.aliases].forEach((alias) =>
    registry.set(example.subject + ':' + normalize(alias), index),
  ),
);
export function lessonLabDrawing(unit: SchoolUnit, topic: string): TutorDrawing | undefined {
  if (topic.length > 1400) return undefined;
  const scenario = registry.get(unit.subject + ':' + normalize(topic));
  if (scenario === undefined) return undefined;
  const example = lessonLabExamples[scenario];
  return {
    kind: 'concept',
    figure: 'lesson-lab',
    title: `Авторский пример · ${example.title}`,
    steps: example.steps.map((s, stage) => ({ ...s, values: [scenario, stage] })),
  };
}
