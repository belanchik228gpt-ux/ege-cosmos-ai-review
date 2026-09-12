import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  schoolUnits,
  schoolSubjects,
  schoolSources,
  programTracks,
  programUnits,
  getUnitTrack,
  getSchoolUnit,
  schoolSequenceSources,
  schoolTextbookProfiles,
  getSchoolTopicLabel,
  getSchoolTopicFocus,
} from '../src/domain/school-program';

describe('school course sequencing and coverage boundaries', () => {
  it('assigns distinct stable focus keys only to repeated labels; leaves unique keys and old raw history unchanged', () => {
    const unit = getSchoolUnit('program-geography-9-russia-economy')!;
    const original = JSON.stringify(unit);
    expect(unit.topics[53]).toBe(unit.topics[79]);
    expect(getSchoolTopicFocus(unit, 53)).toBe(`${unit.topics[53]} [подтема 54]`);
    expect(getSchoolTopicFocus(unit, 79)).toBe(`${unit.topics[79]} [подтема 80]`);
    expect(getSchoolTopicFocus(unit, 0)).toBe(unit.topics[0]);
    expect(new Set(unit.topics.map((_, index) => getSchoolTopicFocus(unit, index))).size).toBe(
      unit.topics.length,
    );
    expect(JSON.stringify(unit)).toBe(original);
  });
  it('labels repeated source fragments with their subject context while preserving raw focus keys', () => {
    const unit = getSchoolUnit('program-geography-9-russia-economy')!;
    const raw = [...unit.topics];
    expect(getSchoolTopicLabel(unit, 53)).toBe(
      'Химическая промышленность: состав, место и значение в хозяйстве.',
    );
    expect(getSchoolTopicLabel(unit, 79)).toBe(
      'Пищевая промышленность: состав, место и значение в хозяйстве.',
    );
    expect(getSchoolTopicLabel(unit, 84)).toBe(
      'Лёгкая промышленность: состав, место и значение в хозяйстве.',
    );
    expect(unit.topics).toEqual(raw);
    const plants = getSchoolUnit('program-biology-7-plant-groups')!;
    expect(getSchoolTopicLabel(plants, 25)).toBe(
      'Плауны, хвощи и папоротники: общая характеристика.',
    );
    expect(getSchoolTopicLabel(plants, 34)).toBe('Голосеменные: общая характеристика.');
    expect(getSchoolTopicLabel(plants, 40)).toBe('Покрытосеменные: общая характеристика.');
  });

  it('removes only confirmed page-number artifacts in display, preserving meaningful numbers and source text', () => {
    const unit = getSchoolUnit('program-geography-10-world-economy')!;
    const index = unit.topics.findIndex((topic) => topic.includes('основные 8 формы'));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(getSchoolTopicLabel(unit, index)).toContain('основные формы');
    expect(unit.topics[index]).toContain('основные 8 формы');
    const custom = { ...unit, topics: ['Население выросло на 8 процентов.'] };
    expect(getSchoolTopicLabel(custom, 0)).toBe(custom.topics[0]);
  });
  it('makes geometry available from its own first section rather than after five algebra sections', () => {
    const tracks = programTracks('math', 10);
    expect(tracks.map((track) => track.id)).toEqual(['algebra', 'geometry', 'probability']);
    const geometry = tracks.find((track) => track.id === 'geometry')!;
    const first = getSchoolUnit('program-math-10-space-lines')!;
    expect(geometry.units[0]).toBe(first);
    expect(getUnitTrack(first)).toMatchObject({ id: 'geometry', order: 1, parallel: true });
    expect(geometry.entryTopic).toBe('Аксиомы и следствия стереометрии');
    expect(first.topics).toContain(geometry.entryTopic);
    expect(first.topics).toContain(
      'Прямая через две различные точки плоскости лежит в этой плоскости',
    );
    expect(first.pages).toEqual(expect.arrayContaining([32, 37, 38]));
  });

  it('covers every existing unit exactly once in a track without changing IDs or topic arrays', () => {
    const original = JSON.stringify(schoolUnits);
    for (const subject of schoolSubjects)
      for (const grade of subject.grades) {
        const tracks = programTracks(subject.id, grade);
        const flat = tracks.flatMap((track) => track.units);
        expect(flat.map((unit) => unit.id).sort()).toEqual(
          programUnits(subject.id, grade)
            .map((unit) => unit.id)
            .sort(),
        );
        expect(new Set(flat.map((unit) => unit.id)).size).toBe(flat.length);
        for (const track of tracks) {
          expect(
            track.sourceIds.every((id) => schoolSources.some((source) => source.id === id)),
          ).toBe(true);
          expect(track.units.map((unit) => getUnitTrack(unit).order)).toEqual(
            track.units.map((_, index) => index + 1),
          );
        }
      }
    expect(JSON.stringify(schoolUnits)).toBe(original);
  });

  it('keeps all three math courses in grades7–11 and the two history strands distinct', () => {
    for (const grade of [7, 8, 9, 10, 11] as const) {
      expect(programTracks('math', grade).map((track) => track.id)).toEqual([
        'algebra',
        'geometry',
        'probability',
      ]);
      expect(programTracks('history', grade).map((track) => track.id)).toEqual([
        'world-history',
        'russian-history',
      ]);
    }
  });

  it('preserves requested subjects and validates registered grade/source/page coverage without inventing grade7 chemistry', () => {
    expect(schoolSubjects.map((subject) => subject.id).sort()).toEqual(
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
    expect(programUnits('chemistry', 7)).toEqual([]);
    expect(programUnits('project', 7)).toEqual([]);
    expect(new Set(schoolUnits.map((unit) => unit.id)).size).toBe(schoolUnits.length);
    const manifest = JSON.parse(readFileSync('resources/school-program/manifest.json', 'utf8'));
    for (const unit of schoolUnits) {
      expect(schoolSubjects.find((subject) => subject.id === unit.subject)?.grades).toContain(
        unit.grade,
      );
      const source = schoolSources.find((source) => source.id === unit.sourceId)!;
      expect(source).toBeDefined();
      expect(source.subject).toBe(unit.subject);
      expect(source.grades).toContain(unit.grade);
      expect(unit.topics.length).toBeGreaterThan(0);
      expect(unit.topics.every((topic) => topic.trim().length > 0)).toBe(true);
      if (source.kind === 'program') {
        const pdf = manifest.documents.find((item: { id: string }) => item.id === source.id);
        expect(pdf).toBeDefined();
        expect(unit.pages.length).toBeGreaterThan(0);
        expect(unit.pages.every((page) => page >= 1 && page <= pdf.pageCount)).toBe(true);
      }
    }
  });

  it('does not pretend author names determine edition, paragraph numbers or September lesson dates', () => {
    const profile = schoolTextbookProfiles.find(
      (item) => item.id === 'mordkovich-semenov-algebra-10',
    )!;
    expect(profile.sequenceStatus).toBe('edition-needed');
    expect(profile.trackId).toBe('algebra');
    expect(schoolSources.find((source) => source.id === profile.referenceSourceId)?.kind).toBe(
      'textbook-reference',
    );
    expect(
      schoolSequenceSources.every(
        (source) => source.checkedAt === '2026-09-10' && source.url.startsWith('https:'),
      ),
    ).toBe(true);
  });

  it('finds stereometry axioms and notation inside the first geometry card', () => {
    expect(programUnits('math', 10, 'аксиомы').map((unit) => unit.id)).toContain(
      'program-math-10-space-lines',
    );
    expect(programUnits('math', 10, 'принадлежность точки').map((unit) => unit.id)).toContain(
      'program-math-10-space-lines',
    );
  });
});
