import type { SchoolState } from './school-state';
import { getSchoolUnit, type SchoolUnit } from './school-program';
import { getSchoolTopicFocus } from './school-program/topic-labels';

export type SchoolTopicSkip = { at: string; origin: 'student' };
export type SchoolTopicSkips = Record<string, Record<string, SchoolTopicSkip>>;
const validDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  Number.isFinite(Date.parse(value));
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const focusCache = new WeakMap<SchoolUnit, { list: string[]; allowed: Set<string> }>();
function unitFocuses(unit: SchoolUnit) {
  let cached = focusCache.get(unit);
  if (!cached) {
    const list = unit.topics.map((_, index) => getSchoolTopicFocus(unit, index).trim());
    cached = { list, allowed: new Set(list) };
    focusCache.set(unit, cached);
  }
  return cached;
}

/** Manual bypasses have their own store; they never manufacture answers or mastery. */
export function cleanSchoolTopicSkips(value: unknown): SchoolTopicSkips {
  const result: SchoolTopicSkips = {};
  if (!record(value)) return result;
  for (const [unitId, entries] of Object.entries(value).slice(0, 2000)) {
    const unit = getSchoolUnit(unitId);
    if (!unit || !record(entries)) continue;
    const accepted = Object.fromEntries(
      Object.entries(entries)
        .slice(0, 500)
        .filter(
          ([focus, mark]) =>
            unitFocuses(unit).allowed.has(focus) &&
            record(mark) &&
            mark.origin === 'student' &&
            validDate(mark.at),
        )
        .map(([focus, mark]) => [
          focus,
          { at: (mark as SchoolTopicSkip).at, origin: 'student' as const },
        ]),
    );
    if (Object.keys(accepted).length) result[unitId] = accepted;
  }
  return result;
}
export function schoolTopicSkip(state: SchoolState, unitId: string, focus: string) {
  const unit = getSchoolUnit(unitId);
  if (!unit || !unitFocuses(unit).allowed.has(focus.trim())) return undefined;
  return state.topicSkips?.[unitId]?.[focus.trim()];
}
export function schoolUnitSkipped(state: SchoolState, unitId: string) {
  const unit = getSchoolUnit(unitId);
  return (
    !!unit?.topics.length &&
    unitFocuses(unit).list.every((focus) => !!state.topicSkips?.[unitId]?.[focus])
  );
}
/** Undefined focus means all listed subtopics in this one section. */
export function setSchoolTopicSkipped(
  state: SchoolState,
  unitId: string,
  focus: string | undefined,
  skipped: boolean,
  now = new Date().toISOString(),
): SchoolState {
  const unit = getSchoolUnit(unitId);
  if (
    !unit ||
    !validDate(now) ||
    (focus !== undefined && !unitFocuses(unit).allowed.has(focus.trim()))
  )
    return state;
  const entries = { ...state.topicSkips?.[unitId] };
  for (const topic of focus === undefined ? unitFocuses(unit).list : [focus]) {
    if (skipped) entries[topic.trim()] = { at: now, origin: 'student' };
    else delete entries[topic.trim()];
  }
  const topicSkips = { ...state.topicSkips };
  if (Object.keys(entries).length) topicSkips[unitId] = entries;
  else delete topicSkips[unitId];
  return { ...state, topicSkips };
}

/** Progress through a particular conversation, never an estimate of exam mastery. */
export function subtopicProgress(state: SchoolState, unitId: string, focus: string): number {
  if (schoolTopicSkip(state, unitId, focus)) return 100;
  const phases = { understand: 0, explain: 25, practice: 50, review: 75, summary: 100 };
  return Math.max(
    0,
    ...Object.values(state.lessons)
      .filter((l) => l.unitId === unitId && l.focus.trim() === focus.trim())
      .map((l) =>
        l.completedAt
          ? 100
          : Math.max(phases[l.phase], ...l.messages.map((m) => (m.phase ? phases[m.phase] : 0))),
      ),
  );
}
