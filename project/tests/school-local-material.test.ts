import { expect, it } from 'vitest';
import { schoolLocalMaterial } from '../src/domain/school-local-material';
import { getSchoolUnit, schoolUnits } from '../src/domain/school-program';
import {
  createSchoolState,
  startSchoolLesson,
  schoolDocumentFromLesson,
} from '../src/domain/school-state';
import type { TutorDrawing } from '../src/domain/cloud-learning';
const unit = schoolUnits.find((u) => u.subject === 'physics' && u.grade === 10)!;
const drawing: TutorDrawing = {
  kind: 'algebra',
  title: 'Авторский пример · Своя задача',
  steps: [
    { caption: 'Масса 3 кг, сила 12 Н.' },
    { caption: 'Делим силу на массу.', formula: 'a=12/3=4' },
    { caption: 'На другом теле сила 10 Н, масса 2 кг. Каково ускорение?' },
  ],
};
it('does not pair a selected subtopic with an unrelated parent-unit question or answer', () => {
  const material = schoolLocalMaterial(
    { ...unit, question: 'Чужой вопрос', answer: 'Чужой ответ' },
    'Ускорение',
    drawing,
  );
  expect(material.question).toContain('10 Н');
  expect(material.answer).toBeUndefined();
  expect(JSON.stringify(material)).not.toContain('Чужой');
  expect(material.example).not.toContain('10 Н');
});
it('keeps unprepared subtopics explicit without making a parent example their answer', () => {
  const material = schoolLocalMaterial(unit, 'Неизвестная подтема', {
    kind: 'concept',
    title: 'Схема содержания · Неизвестная подтема',
    steps: [{ caption: 'Карта' }],
  });
  expect(material.keyIdea).toContain('пока нет');
  expect(material.answer).toBeUndefined();
  expect(material.question).toContain('Неизвестная подтема');
});
it('exports the actual discussed problem instead of injecting the introduction and an unrelated drawing', () => {
  const s = startSchoolLesson(createSchoolState(), getSchoolUnit(unit.id)!);
  const l = s.lessons[s.activeLessonId!];
  l.messages = [
    {
      id: 'actual',
      role: 'assistant',
      kind: 'openai',
      at: l.startedAt,
      text: 'Разобрали твою задачу: 12 Н и 3 кг.',
      question: 'Как изменится ускорение при удвоении массы?',
    },
  ];
  const doc = schoolDocumentFromLesson(l);
  expect(doc.content).toContain('12 Н и 3 кг');
  expect(doc.content).toContain('удвоении массы');
  expect(doc.content).not.toContain(unit.example);
  expect(doc.content).not.toContain(unit.question);
  expect(doc.drawings).toEqual([]);
});
