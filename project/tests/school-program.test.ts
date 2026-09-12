import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  schoolUnits,
  schoolSources,
  schoolSubjects,
  programUnits,
  programSubjects,
  getProgramSource,
} from '../src/domain/school-program';
import {
  createSchoolState,
  startSchoolLesson,
  hydrateSchoolState,
  finishSchoolLesson,
  planSchoolDays,
  schoolLessonInstructions,
  schoolDocumentFromLesson,
} from '../src/domain/school-state';
import { createState, hydrateState } from '../src/domain/learning';
const manifest = JSON.parse(readFileSync('resources/school-program/manifest.json', 'utf8'));
const physics = () => programUnits('physics', 10)[0];
describe('official school curriculum coverage and references', () => {
  it('keeps precisely the requested general subject registry and grade availability', () => {
    expect(schoolSubjects.map((s) => s.id).sort()).toEqual(
      [
        'math',
        'russian',
        'literature',
        'english',
        'history',
        'social',
        'geography',
        'physics',
        'chemistry',
        'biology',
        'informatics',
        'project',
      ].sort(),
    );
    for (const subject of schoolSubjects)
      for (const grade of subject.grades)
        expect(programUnits(subject.id, grade).length, `${subject.id} ${grade}`).toBeGreaterThan(0);
    expect(programSubjects(8).some((s) => s.id === 'social')).toBe(false);
    expect(programUnits('chemistry', 7)).toHaveLength(0);
    expect(schoolSources.some(s => ['music', 'pe', 'obzr'].includes(s.subject))).toBe(false);
    expect(schoolUnits.every((u) => [7, 8, 9, 10, 11].includes(u.grade))).toBe(true);
  });
  it('maps every unit to an actual physical page of the packaged official document', () => {
    expect(new Set(schoolUnits.map((u) => u.id)).size).toBe(schoolUnits.length);
    expect(new Set(schoolSources.map((s) => s.id)).size).toBe(schoolSources.length);
    for (const unit of schoolUnits) {
      const source = getProgramSource(unit.sourceId),
        file = manifest.documents.find((d: any) => d.id === unit.sourceId);
      expect(source, unit.id).toBeTruthy();
      expect(file, unit.id).toBeTruthy();
      expect(source?.subject).toBe(unit.subject);
      expect(source?.grades).toContain(unit.grade);
      expect(file.grades, unit.id).toContain(unit.grade);
      expect(unit.pages.length).toBeGreaterThan(0);
      expect(
        unit.pages.every((p) => Number.isInteger(p) && p >= 1 && p <= file.pageCount),
        unit.id,
      ).toBe(true);
      expect(unit.topics.length, unit.id).toBeGreaterThan(0);
      for (const field of ['intro', 'keyIdea', 'example', 'question', 'answer'] as const)
        expect(unit[field].trim().length, `${unit.id} ${field}`).toBeGreaterThan(
          field === 'answer' || field === 'question' ? 0 : 15,
        );
    }
  });
  it('finds material by subtopic, handles case and ё, and stays inside grade/subject', () => {
    const u = physics(),
      word = u.topics[0].split(/\s+/)[0];
    expect(programUnits('physics', 10, word.toUpperCase()).map((x) => x.id)).toContain(u.id);
    expect(
      programUnits('chemistry', 10, word).every((x) => x.subject === 'chemistry' && x.grade === 10),
    ).toBe(true);
    expect(programUnits('physics', 10, 'no_such_topic_978113')).toHaveLength(0);
  });
});
describe('separate school learning state', () => {
  it('migrates retired subjects without breaking surviving lessons or planner entries', () => {
    const unit = physics();
    const state = startSchoolLesson(createSchoolState(), unit);
    const surviving = state.activeLessonId!;
    const input = JSON.parse(JSON.stringify(state));
    input.subject = 'music';
    input.selectedSubjects = ['music', 'pe', 'obzr', 'physics'];
    input.lessons.retired = { ...input.lessons[surviving], id: 'retired', subject: 'music', unitId: 'program-music-8-song' };
    input.activeLessonId = 'retired';
    input.days['2026-10-01'] = [
      { id: 'old', unitId: 'program-music-8-song', minutes: 25, done: false, note: '' },
      { id: 'keep', unitId: unit.id, minutes: 45, done: false, note: 'Моя задача' },
    ];
    const restored = hydrateSchoolState(input);
    expect(Object.keys(restored.lessons)).toEqual([surviving]);
    expect(restored.activeLessonId).toBeUndefined();
    expect(restored.selectedSubjects).toEqual(['physics']);
    expect(restored.days['2026-10-01']).toEqual([input.days['2026-10-01'][1]]);
  });
  it('finishes only the associated plan item, even if two tasks use the same unit', () => {
    const unit = physics(),
      s = createSchoolState();
    s.days['2026-09-12'] = [
      { id: 'one', unitId: unit.id, minutes: 25, note: 'Первое ДЗ', done: false },
      { id: 'two', unitId: unit.id, minutes: 30, note: 'Второе ДЗ', done: false },
    ];
    const started = startSchoolLesson(s, unit, 'homework', 'Первое ДЗ', 25, {
      itemId: 'one',
      date: '2026-09-12',
    });
    const restored = hydrateSchoolState(JSON.parse(JSON.stringify(started)));
    const finished = finishSchoolLesson(
      restored,
      restored.activeLessonId!,
      'Разобрали первое ДЗ',
      '2026-09-09T12:00:00.000Z',
    );
    expect(finished.days['2026-09-12'].map((i) => i.done)).toEqual([true, false]);
    expect(finished.days['2026-09-09']).toBeUndefined();
  });
  it('round-trips school lessons without mutating existing EGE data', () => {
    const state = createState('Ученик QA'),
      before = structuredClone(state);
    let school = startSchoolLesson({ ...createSchoolState(), enabled: true }, physics());
    const lesson = school.lessons[school.activeLessonId!];
    lesson.messages = [
      {
        id: 'm1',
        role: 'user',
        text: 'Почему тело продолжает двигаться?',
        at: lesson.startedAt,
        kind: 'student',
      },
    ];
    state.school = school;
    const restored = hydrateState(JSON.stringify(state));
    expect(restored.school).toEqual(school);
    delete restored.school;
    expect(restored).toEqual(hydrateState(JSON.stringify(before)));
  });
  it('rejects mismatched lesson and document subjects on restore', () => {
    const state = startSchoolLesson(createSchoolState(), physics()),
      id = state.activeLessonId!;
    const doc = schoolDocumentFromLesson(state.lessons[id]);
    state.lessons[id].subject = 'chemistry';
    state.documents = [{ ...doc, subject: 'chemistry' }];
    const restored = hydrateSchoolState(state);
    expect(restored.lessons).toEqual({});
    expect(restored.activeLessonId).toBeUndefined();
    expect(restored.documents).toEqual([]);
  });
  it('supplies only the current school subject and grade to the model', () => {
    let school = startSchoolLesson(createSchoolState(), physics());
    const id = school.activeLessonId!,
      at = new Date().toISOString();
    school.facts = [
      { id: 'yes', subject: 'physics', grade: 10, text: 'PHYSICS10_ONLY', at, origin: 'student' },
      { id: 'no', subject: 'physics', grade: 8, text: 'OTHER_GRADE_SECRET', at, origin: 'student' },
      { id: 'no2', subject: 'chemistry', grade: 10, text: 'CHEM_SECRET', at, origin: 'student' },
    ];
    const prompt = schoolLessonInstructions(
      'QA',
      school,
      school.lessons[id],
      'OFFICIAL_LOCAL_FRAGMENT',
    );
    expect(prompt).toContain('PHYSICS10_ONLY');
    expect(prompt).toContain('OFFICIAL_LOCAL_FRAGMENT');
    expect(prompt).not.toContain('OTHER_GRADE_SECRET');
    expect(prompt).not.toContain('CHEM_SECRET');
  });
  it('records a finished homework summary and repetition without awarding unit mastery', () => {
    let school = startSchoolLesson(createSchoolState(), physics(), 'homework');
    const id = school.activeLessonId!;
    school = finishSchoolLesson(
      school,
      id,
      'Сила и ускорение: спутали направления, разобрали второй закон.',
    );
    expect(school.lessons[id].completedAt).toBeTruthy();
    expect(school.progress[physics().id].studiedAt).toBeUndefined();
    expect(school.progress[physics().id].reviewAt).toBeTruthy();
    expect(school.facts[0]).toMatchObject({ subject: 'physics', grade: 10, lessonId: id });
    const next = startSchoolLesson(school, physics());
    expect(schoolLessonInstructions('QA', next, next.lessons[next.activeLessonId!])).toContain(
      'Сила и ускорение',
    );
  });
  it('plans distinct next topics and preserves edits and other grades on the same date', () => {
    const base = createSchoolState(),
      old = programUnits('physics', 8)[0];
    base.days['2026-09-09'] = [
      { id: 'old-grade', unitId: old.id, minutes: 20, note: 'KEEP', done: false },
    ];
    const first = planSchoolDays(base, '2026-09-09', 7, 120),
      items = Object.values(first.days)
        .flat()
        .filter((i) => i.id !== 'old-grade');
    expect(first.days['2026-09-09'][0]).toEqual(base.days['2026-09-09'][0]);
    expect(items.length).toBeGreaterThan(5);
    expect(new Set(items.map((i) => i.unitId)).size).toBe(items.length);
    expect(planSchoolDays(first, '2026-09-09', 7, 90).days).toEqual(first.days);
  });
  it('exports school lesson content and real drawings with explicit provenance', () => {
    const s = startSchoolLesson(createSchoolState(), physics()),
      l = s.lessons[s.activeLessonId!];
    l.messages = [
      {
        id: 'a',
        role: 'assistant',
        kind: 'openai',
        text: 'Проверим связь силы и ускорения.',
        at: l.startedAt,
        drawing: {
          kind: 'algebra',
          title: 'Второй закон',
          steps: [{ caption: 'При неизменной массе', formula: 'F=ma' }],
        },
      },
    ];
    const doc = schoolDocumentFromLesson(l);
    expect(doc.subject).toBe('physics');
    expect(doc.content).toContain('10 класс · Школьный режим');
    expect(doc.content).toContain(getProgramSource(physics().sourceId)!.url);
    expect(doc.drawings[0].steps[0].formula).toBe('F=ma');
    expect(doc.path).toBeUndefined();
  });
});
