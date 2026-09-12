import {describe,expect,it} from 'vitest';
import {searchQuickJumpTopics} from '../src/domain/quick-jump';
import {schoolTopics} from '../src/domain/school-catalog';

describe('quick jump searches the whole exam catalogue before optional local practice',()=>{
  it('finds a broad exam topic that has no ready local lesson',()=>{
    const rows=searchQuickJumpTopics('логарифм');
    expect(rows.some(row=>row.id==='school-math-1-6'&&row.kind==='school')).toBe(true);
    expect(rows[0].kind).toBe('school');
    expect(rows.every(row=>row.subject==='math')).toBe(true);
  });
  it('matches the actual authored start, separates it from the official title and respects multiple words',()=>{
    const modulus=searchQuickJumpTopics('модуль')[0];
    expect(modulus.id).toBe('school-math-1-7');
    expect(modulus.title).toContain('Действительные числа');
    expect(modulus.detail).toContain('начнём: Модуль числа и расстояние');
    expect(searchQuickJumpTopics('корни модуль').some(row=>row.id==='school-math-1-3')).toBe(true);
    expect(searchQuickJumpTopics('МАТЕМАТИКА 2.8')[0].id).toBe('school-math-2-8');
  });
  it('covers all assessed source positions as searchable results without adding excluded or navigation rows',()=>{
    for(const topic of schoolTopics) {
      const subject={math:'математика',russian:'русский язык',history:'история',social:'обществознание'}[topic.subject];
      const result=searchQuickJumpTopics(`${subject} ${topic.curriculumCodes[0]}`,[],30);
      expect(result.some(row=>row.id===topic.id),topic.id).toBe(true);
      expect(result.filter(row=>row.kind==='school').every(row=>schoolTopics.some(card=>card.id===row.id))).toBe(true);
    }
    expect(searchQuickJumpTopics('математика 2.11')).toEqual([]);
  });
  it('opens local practice only through explicitly labelled results and preserves prior bookmarks',()=>{
    const rows=searchQuickJumpTopics('корни модуль',['math-radicals']);
    const firstLocal=rows.findIndex(row=>row.kind==='practice');
    expect(rows[0].kind).toBe('school');expect(rows[0].pinned).toBe(true);
    expect(firstLocal).toBeGreaterThan(0);
    expect(rows[firstLocal].detail).toContain('Локальная практика');
    expect(searchQuickJumpTopics('локальная практика модуль').every(row=>row.kind==='practice')).toBe(true);
    expect(searchQuickJumpTopics('')).toEqual([]);
  });
});
