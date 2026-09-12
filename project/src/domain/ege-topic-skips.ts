import type { LearningState } from './types';
import { getSchoolTopic } from './school-catalog';
export type EgeTopicSkip = { at: string; origin: 'student' };
export type EgeTopicSkips = Record<string, EgeTopicSkip>;
const validDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  Number.isFinite(Date.parse(value));
export function cleanEgeTopicSkips(value: unknown): EgeTopicSkips {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 3000)
      .filter(
        ([topicId, mark]) =>
          !!getSchoolTopic(topicId) &&
          mark &&
          typeof mark === 'object' &&
          mark.origin === 'student' &&
          validDate(mark.at),
      )
      .map(([topicId, mark]) => [topicId, { at: mark.at, origin: 'student' as const }]),
  );
}
export function isEgeTopicSkipped(state: LearningState, topicId: string) {
  return !!state.egeTopicSkips?.[topicId];
}
/** Conversation coverage only, not a predicted exam score or measured mastery. */
export function egeTopicProgress(state: LearningState, topicId: string) {
  if (isEgeTopicSkipped(state, topicId)) return 100;
  const phases = { understand: 0, explain: 25, practice: 50, review: 75, summary: 100 };
  return Math.max(
    0,
    ...Object.values(state.cloudSessions || {})
      .filter((lesson) => lesson.topicId === topicId)
      .map((lesson) =>
        lesson.completedAt
          ? 100
          : Math.max(
              phases[lesson.phase],
              ...lesson.messages
                .filter(
                  (message) =>
                    message.role === 'assistant' && message.verification?.status !== 'conflict',
                )
                .map((message) => (message.phase ? phases[message.phase] : 0)),
            ),
      ),
  );
}
export function setEgeTopicSkipped(
  state: LearningState,
  topicId: string,
  skipped: boolean,
  now = new Date().toISOString(),
): LearningState {
  if (!getSchoolTopic(topicId) || !validDate(now)) return state;
  const egeTopicSkips = { ...state.egeTopicSkips };
  if (skipped) egeTopicSkips[topicId] = { at: now, origin: 'student' };
  else delete egeTopicSkips[topicId];
  return { ...state, egeTopicSkips };
}
