import { describe, it, expect } from 'vitest';
import {
  createHomeworkLesson,
  cleanHomeworkSource,
  homeworkInstructions,
} from '../src/domain/homework-desk';
import {
  createSchoolState,
  hydrateSchoolState,
  finishSchoolLesson,
  schoolDocumentFromLesson,
} from '../src/domain/school-state';
import { createState, hydrateState } from '../src/domain';
describe('separate homework desk', () => {
  it('restores a real custom condition without a catalogue unit or shared school history', () => {
    const lesson = createHomeworkLesson('math', 10, {
      text: '3(x − 2) = 15',
      imageId: '3cc545f4-5c3b-460f-b478-5c9c4b2ed845',
      imageName: 'условие.png',
    });
    const state = createState();
    state.homeworkDesk = {
      ...createSchoolState(),
      view: 'room',
      activeLessonId: lesson.id,
      lessons: { [lesson.id]: lesson },
    };
    const restored = hydrateState(JSON.parse(JSON.stringify(state)));
    expect(restored.homeworkDesk?.lessons[lesson.id].assignment).toEqual(lesson.assignment);
    expect(restored.school?.lessons || {}).toEqual({});
    expect(restored.sessions).toEqual({});
    expect(hydrateSchoolState(state.homeworkDesk).lessons).toEqual({});
  });
  it('does not invent homework from an empty task, foreign path or unknown subject', () => {
    expect(cleanHomeworkSource({ imageId: '../../profile' })).toBeUndefined();
    expect(() => createHomeworkLesson('math', 10, { text: ' ' })).toThrow();
    expect(() => createHomeworkLesson('music' as never, 10, { text: 'x' })).toThrow();
    expect(() => createHomeworkLesson('project', 7, { text: 'x' })).toThrow();
  });
  it('completes and documents discussion without claiming catalogue mastery', () => {
    const l = createHomeworkLesson('physics', 9, { text: 'Найти скорость по пути и времени' });
    l.messages = [
      {
        id: 'reply',
        role: 'assistant',
        kind: 'openai',
        at: l.startedAt,
        text: 'Скорость — путь, делённый на время.',
        question: 'В каких единицах задано время?',
      },
    ];
    const s = finishSchoolLesson(
      { ...createSchoolState(), lessons: { [l.id]: l } },
      l.id,
      'Правило разобрано с помощью.',
    );
    expect(s.progress).toEqual({});
    expect(s.lessons[l.id].completedAt).toBeTruthy();
    const doc = schoolDocumentFromLesson(s.lessons[l.id]);
    expect(doc.content).toContain('Правило разобрано с помощью.');
    expect(doc.content).not.toContain('Состав программы сверён');
    expect(hydrateSchoolState({ ...s, documents: [doc] }, 'homework').documents).toHaveLength(1);
  });
  it('passes only matching subject and grade memory; requires scaffolding and transfer practice', () => {
    const l = createHomeworkLesson('math', 10, { text: '|x|=0' }),
      other = createHomeworkLesson('chemistry', 10, { text: 'SECRET' });
    other.summary = 'DO_NOT_MIX';
    const prompt = homeworkInstructions(
      'Ученик',
      { ...createSchoolState(), lessons: { [l.id]: l, [other.id]: other } },
      l,
    );
    expect(prompt).not.toContain('DO_NOT_MIX');
    expect(prompt).toContain('похожее с другими данными');
    expect(prompt).toContain('не повторяй одну подсказку');
    expect(prompt).toContain('|x|=0');
  });
});
