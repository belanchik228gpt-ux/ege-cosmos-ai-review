import { expect, it } from 'vitest';
import {
  createSchoolState,
  startSchoolLesson,
  finishSchoolLesson,
  hydrateSchoolState,
} from '../src/domain/school-state';
import { programUnits } from '../src/domain/school-program';
import { subtopicProgress } from '../src/domain/school-progress';
it('preserves independent subtopic progress and grade-seven history on restart', () => {
  const unit = programUnits('math', 7)[0];
  let state = startSchoolLesson(createSchoolState(), unit, 'lesson', unit.topics[0]);
  const id = state.activeLessonId!;
  state.lessons[id].phase = 'practice';
  expect(subtopicProgress(state, unit.id, unit.topics[0])).toBe(50);
  expect(subtopicProgress(state, unit.id, unit.topics[1])).toBe(0);
  state = finishSchoolLesson(state, id, 'Разобрали пример с подсказкой');
  state = hydrateSchoolState(JSON.parse(JSON.stringify(state)));
  expect(subtopicProgress(state, unit.id, unit.topics[0])).toBe(100);
  expect(subtopicProgress(state, unit.id, unit.topics[1])).toBe(0);
  expect(state.progress[unit.id].studiedAt).toBeUndefined();
  expect(state.lessons[id].grade).toBe(7);
});
it('does not attribute a whole-unit lesson or manual mark to every subtopic', () => {
  const unit = programUnits('math', 7)[0];
  let state = startSchoolLesson(createSchoolState(), unit);
  state = finishSchoolLesson(state, state.activeLessonId!, 'Обзор раздела');
  state.progress[unit.id].studiedAt = new Date().toISOString();
  expect(subtopicProgress(state, unit.id, unit.topics[0])).toBe(0);
});
