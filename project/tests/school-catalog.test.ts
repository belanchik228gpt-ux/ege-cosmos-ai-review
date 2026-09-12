import { describe, expect, it } from 'vitest';
import { curriculumNodes } from '../src/domain/curriculum-data';
import { sources } from '../src/domain/sources';
import { topics } from '../src/domain/catalog';
import { createState, startSession, submitAnswer, hydrateState, buildPlan, clearSubjectHistory } from '../src/domain/learning';
import { createCloudLesson } from '../src/domain/cloud-learning';
import { ensureTodayPlan } from '../src/domain/study-actions';
import { startDiagnostic, practiceTask } from '../src/domain/diagnostics';
import { schoolTopics, schoolTopicsBySubjectCounts, schoolCatalogMetadata, getSchoolTopic, listSchoolTopics, getSchoolTopicContext, getGradeRoute, getGradeLessonIds, isFoundationLesson, getSchoolTopicByLessonId } from '../src/domain/school-catalog';
import { schoolTopicOverlays } from '../src/domain/school-catalog/overlays';

describe('exam-linked school catalogue', () => {
  it('covers every assessed final-edition code exactly once and excludes navigation and omitted exam content', () => {
    expect(schoolTopics).toHaveLength(264);
    expect(new Set(schoolTopics.map((topic) => topic.id)).size).toBe(264);
    const covered = schoolTopics.flatMap((topic) => topic.curriculumNodeIds).sort();
    expect(covered).toEqual(curriculumNodes.filter((node) => node.assessmentStatus === 'assessed' && node.editionYear === 2026 && node.editionStatus === 'final').map((node) => node.id).sort());
    expect(schoolCatalogMetadata).toMatchObject({ totalSourceNodes: 304, sectionCount: 36, excludedLeafCount: 4, topicCount: 264 });
    expect(Object.values(schoolTopicsBySubjectCounts).reduce((sum, value) => sum + value, 0)).toBe(264);
  });
  it('gives each subject an honest exam-linked entry in every grade view without inventing an official 8th-grade social programme', () => {
    for (const subject of ['math', 'russian', 'history', 'social'] as const)
      for (const grade of [8, 9, 10, 11]) {
        const cards = listSchoolTopics({ subject, grade });
        expect(cards.length, `${subject} grade ${grade}`).toBeGreaterThan(0);
        expect(cards.every((card) => card.subject === subject && card.grades.includes(grade as 8 | 9 | 10 | 11))).toBe(true);
      }
    expect(listSchoolTopics({ subject: 'social', grade: 8 }).every((card) => card.gradeBasis === 'approximate' && card.gradeNote.includes('дополнительная') && card.gradeNote.includes('только в 9 классе'))).toBe(true);
  });
  it('contains meaningful bounded guidance and valid source/lesson references without turning cards into mastery or official tasks', () => {
    const knownSources = new Set(sources.map((source) => source.id));
    for (const card of schoolTopics) {
      expect(card.goal.length).toBeGreaterThan(35);
      expect(card.keyConcepts.length).toBeGreaterThan(0);
      expect(card.subtopics.length).toBeGreaterThan(0);
      expect(card.prerequisites.length).toBeGreaterThanOrEqual(1);
      expect(card.context).toContain('не означает готового полного урока');
      expect(card.materialStatus).toBe('authored-guide');
      expect(card.sourceIds.every((id) => knownSources.has(id))).toBe(true);
      expect(card.sourceReferences.every((ref) => ref.page > 0 && ref.editionYear === 2026)).toBe(true);
      expect(card.lessonTopicIds.every((id) => topics.some((topic) => topic.id === id && topic.subject === card.subject))).toBe(true);
      const bounded = getSchoolTopicContext(card.id, { maxChars: 900 });
      expect(bounded.length).toBeLessThanOrEqual(900);
      expect(bounded).toContain(card.sourceReferences[0].documentId);
      expect(bounded).toContain('не гарантирует 80+');
    }
    expect(getSchoolTopicContext('unknown-topic')).toBe('');
  });
  it('keeps excluded social fragments out of learning guidance and leaves unknown basic-exam membership unknown', () => {
    for (const node of curriculumNodes.filter((node) => node.notAssessedFragments?.length)) {
      const card = schoolTopics.find((topic) => topic.curriculumNodeIds.includes(node.id))!;
      for (const fragment of node.notAssessedFragments!) {
        expect(card.context).not.toContain(fragment);
        expect(card.exclusionNotes).toContain(fragment);
      }
    }
    const parameters = getSchoolTopic('school-math-2-10')!;
    expect(parameters.examLevels).toEqual([]);
    expect(parameters.examLevelNote).toContain('не утверждает');
    expect(parameters.examLevelNote).toContain('21 позиции');
  });
  it('offers a grade-10 main route with modules and radicals while retaining the old prerequisite lessons by stable ID', () => {
    const route = getGradeRoute('math', 10, 'basic');
    expect(route.slice(0, 4).map((topic) => topic.id)).toEqual(['school-math-1-7', 'school-math-1-3', 'school-math-1-8', 'school-math-2-1']);
    expect(getGradeLessonIds('math', 10)).toEqual(['math-absolute', 'math-radicals']);
    expect(getGradeLessonIds('history', 10)).toEqual([]); // Cloud guides, not fake local lessons from the wrong century.
    expect(getSchoolTopicByLessonId('math-fraction')?.foundation).toBe(true);
    expect(getSchoolTopicByLessonId('math-radicals')?.formulas).toContain('√(a²) = |a|');
    const state = createState();
    const started = startSession(state, 'math-rectangle');
    const answered = submitAnswer(started.state, started.sessionId, '21');
    const before = JSON.stringify(answered.sessions);
    const planned = ensureTodayPlan(answered, '2026-09-08');
    expect(JSON.stringify(planned.sessions)).toBe(before);
    expect(hydrateState(planned).sessions[started.sessionId].topicId).toBe('math-rectangle');
    expect(planned.planning!.days['2026-09-08'].entries.filter((block) => block.topicId).every((block) => !isFoundationLesson(block.topicId!))).toBe(true);
    expect(buildPlan(planned).some((item) => isFoundationLesson(item.topicId))).toBe(false);
  });
  it('starts mathematics diagnostics with grade-10 symbolic questions and keeps assessment separate from viewing the catalogue', () => {
    const state = createState();
    const started = startDiagnostic(state, 'math', '2026-09-08T08:00:00.000Z');
    const record = started.state.diagnostics![started.diagnosticId];
    expect(record.items.map((item) => item.taskId)).toEqual(['absolute-7', 'radicals-2', 'absolute-8']);
    expect(record.items.every((item) => practiceTask(item) && !isFoundationLesson(item.topicId))).toBe(true);
    for (const card of schoolTopics) getSchoolTopicContext(card.id);
    expect(started.state.progress).toEqual({});
  });
  it('searches source codes and every query word while preserving subject boundaries', () => {
    expect(listSchoolTopics({ subject: 'math', query: 'корни арифметические' }).some((card) => card.id === 'school-math-1-3')).toBe(true);
    expect(listSchoolTopics({ subject: 'math', query: '2.10' }).map((card) => card.id)).toEqual(['school-math-2-10']);
    expect(listSchoolTopics({ subject: 'history', query: 'логарифм' })).toEqual([]);
  });
  it('keeps all mathematics overlays attached to actual assessed codes and separates an authored start from the official whole topic', () => {
    const mathCodes=curriculumNodes.filter(node=>node.subject==='math'&&node.assessmentStatus==='assessed').map(node=>node.id).sort();
    expect(Object.keys(schoolTopicOverlays).sort()).toEqual(mathCodes);
    expect(getSchoolTopic('school-math-2-8')!.keyConcepts).toContain('Единичная окружность');
    expect(getSchoolTopic('school-math-5-2')!.keyConcepts).toContain('Высказывание');
    const card=getGradeRoute('math',10)[0];
    expect(card.title).toBe(curriculumNodes.find(node=>node.id==='ege-math-1-7')!.title);
    expect(card.title).toContain('Приближённые вычисления');
    expect(card.recommendedStart).toMatchObject({lessonTopicId:'math-absolute',title:'Модуль числа и расстояние'});
    expect(card.goal).toContain('приближение');
    expect(card.recommendedStart!.description).toContain('не официальное название');
    expect(getSchoolTopicContext(card.id).split('\n')[0]).toContain('Модуль числа и расстояние');
    expect(getSchoolTopicContext(card.id)).toContain(card.title);
    expect(getSchoolTopicContext(card.id,{maxChars:600})).toContain('не гарантирует 80+');
    for (const current of schoolTopics.filter(topic=>topic.recommendedStart))
      expect(current.lessonTopicIds).toContain(current.recommendedStart!.lessonTopicId);
  });
  it('persists separate cloud subject lessons and clears only the selected subject history', () => {
    const state = createState('Тест');
    expect(state.cloudSessions).toEqual({});
    const math = createCloudLesson('math', 'school-math-1-7', 'Модуль');
    const history = createCloudLesson('history', 'school-history-7-1', 'Первая мировая война');
    state.cloudSessions = { [math.id]: math, [history.id]: history };
    const restored = hydrateState(JSON.stringify(state));
    expect(restored.cloudSessions![math.id]).toMatchObject(math);
    expect(restored.cloudSessions![history.id]).toMatchObject(history);
    const cleared = clearSubjectHistory(restored, 'math');
    expect(Object.keys(cleared.cloudSessions!)).toEqual([history.id]);
    expect(cleared.cloudSessions![history.id]).toEqual(restored.cloudSessions![history.id]);
    expect(state.cloudSessions[math.id]).toEqual(math);
    expect(cleared.planning).toEqual(restored.planning);
  });
});
