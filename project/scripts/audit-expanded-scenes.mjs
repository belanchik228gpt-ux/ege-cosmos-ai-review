import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
const out = path.resolve('docs/verification/expanded-scenes-0.7.2');
const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
try {
  const { schoolUnits, schoolSubjects } = await server.ssrLoadModule(
    '/src/domain/school-program.ts',
  );
  const { topicDrawing } = await server.ssrLoadModule('/src/domain/school-topic-drawings.ts');
  const { mathInformaticsExamples } = await server.ssrLoadModule(
    '/src/domain/topic-scenes/math-informatics.ts',
  );
  const { naturalSciencesExamples } = await server.ssrLoadModule(
    '/src/domain/topic-scenes/natural-sciences.ts',
  );
  const { humanitiesExamples } = await server.ssrLoadModule(
    '/src/domain/topic-scenes/humanities.ts',
  );
  const families = new Set();
  const missing = [],
    covered = [],
    counts = [];
  for (const subject of schoolSubjects) {
    const units = schoolUnits.filter((u) => u.subject === subject.id),
      entries = [];
    for (const unit of units)
      for (const focus of unit.topics) {
        const d = topicDrawing(unit, focus),
          prepared = !d.title.startsWith('Схема содержания');
        const entry = {
          subject: subject.id,
          grade: unit.grade,
          unitId: unit.id,
          focus,
          scene: prepared ? d.title : null,
        };
        if (prepared) families.add(d.title);
        entries.push(entry);
        (prepared ? covered : missing).push(entry);
      }
    counts.push({
      subject: subject.id,
      title: subject.title,
      units: units.length,
      subtopics: entries.length,
      localExamples: entries.filter((e) => e.scene).length,
    });
  }
  const { historyAtlasExamples } = await server.ssrLoadModule(
    '/src/domain/topic-scenes/history-atlas.ts',
  );
  const { civicsExpandedExamples } = await server.ssrLoadModule(
    '/src/domain/topic-scenes/civics-expanded.ts',
  );
  const { chemistryExpandedExamples } = await server.ssrLoadModule(
    '/src/domain/topic-scenes/chemistry-expanded.ts',
  );
  const newExamples = [
    ...historyAtlasExamples,
    ...civicsExpandedExamples,
    ...chemistryExpandedExamples,
  ];
  const examples = [
    ...mathInformaticsExamples,
    ...naturalSciencesExamples,
    ...humanitiesExamples,
    ...newExamples,
  ];
  const report = {
    at: new Date().toISOString(),
    reachableAuthoredFamilies: families.size,
    newFamilyCount: newExamples.length,
    newExamples,
    subjects: counts,
    coveredSubtopics: covered.length,
    totalSubtopics: covered.length + missing.length,
    limitations: [
      'An authored example is an introduction, not a complete course or a mastery certificate.',
      'Several exact aliases can share a scene family. No claim that every subtopic has a unique animation.',
      'Unsupported topics remain explicit and can be discussed with OpenAI.',
    ],
    examples,
    covered,
    missing,
  };
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, 'coverage.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      { ...report, examples: undefined, covered: undefined, missing: undefined },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
