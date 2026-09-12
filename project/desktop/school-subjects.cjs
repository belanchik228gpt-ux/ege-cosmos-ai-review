const registry = require('../shared/school-subjects.json');
const schoolSubjects = new Map(
  registry.map((subject) => [subject.id, Object.freeze({ ...subject })]),
);
function schoolSubject(id) {
  return typeof id === 'string' ? schoolSubjects.get(id) : undefined;
}
function validateSchoolContext(subject, grade) {
  const record = schoolSubject(subject);
  if (!record) throw new Error('Выбери предмет из школьного каталога.');
  if (grade !== undefined && (![7, 8, 9, 10, 11].includes(grade) || !record.grades.includes(grade)))
    throw new Error('Для этого предмета выбери доступный класс в школьном каталоге.');
  return record;
}
module.exports = { schoolSubject, validateSchoolContext };
