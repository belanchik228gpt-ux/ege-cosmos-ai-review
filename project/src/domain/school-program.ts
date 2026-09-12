import registry from '../../shared/school-subjects.json';
import { stemSources, stemTopics } from './school-program/stem';
import { humanitiesSources, humanitiesTopics } from './school-program/humanities';
import type {
  SchoolGrade,
  SchoolSubjectId,
  SchoolUnit,
  SchoolSource,
} from './school-program/types';
import { buildProgramTracks, unitTrackDefinition } from './school-program/sequence';
import { matchingSchoolUnits } from './school-topic-search';
export { schoolSequenceSources, schoolTextbookProfiles } from './school-program/sequence';
export type { SchoolTrack, SchoolUnitTrack } from './school-program/sequence';
export { getSchoolTopicLabel, getSchoolTopicFocus } from './school-program/topic-labels';
export * from './school-program/types';
export const schoolSubjects = registry as Array<{
  id: SchoolSubjectId;
  title: string;
  color: string;
  icon: string;
  description: string;
  grades: SchoolGrade[];
}>;
export const schoolUnits: SchoolUnit[] = [...stemTopics, ...humanitiesTopics];
export const schoolSources: SchoolSource[] = [...stemSources, ...humanitiesSources];
const units = new Map(schoolUnits.map((unit) => [unit.id, unit]));
const sourceMap = new Map(schoolSources.map((source) => [source.id, source]));
export const getSchoolUnit = (id: string) => units.get(id);
export const getProgramSource = (id: string) => sourceMap.get(id);
export const getSchoolSubject = (id: SchoolSubjectId) =>
  schoolSubjects.find((subject) => subject.id === id)!;
export function programUnits(subject: SchoolSubjectId, grade: SchoolGrade, query = '') {
  return matchingSchoolUnits(
    schoolUnits
      .filter((unit) => unit.subject === subject && unit.grade === grade)
      .sort((a, b) => a.order - b.order),
    query,
  );
}
export function programSubjects(grade: SchoolGrade) {
  return schoolSubjects.filter((subject) =>
    schoolUnits.some((unit) => unit.grade === grade && unit.subject === subject.id),
  );
}
export function programTracks(subject: SchoolSubjectId, grade: SchoolGrade) {
  return buildProgramTracks(schoolUnits, subject, grade);
}
export function getUnitTrack(unit: SchoolUnit) {
  const meta = unitTrackDefinition(unit);
  const units =
    programTracks(unit.subject, unit.grade).find((track) => track.id === meta.id)?.units ?? [];
  return { ...meta, order: units.findIndex((item) => item.id === unit.id) + 1 };
}
