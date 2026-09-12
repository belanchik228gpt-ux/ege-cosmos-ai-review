import { parseProblem, type ProblemSpec } from './problem-workbench';
import type { Message, SubjectId } from './types';
import type { TeachingState } from './teaching-types';
import { hydrateTeachingState } from './teaching';
import { createProblemTask } from './problem-teaching';

export type ProblemSession = {
  id: string;
  subject: SubjectId;
  title: string;
  confirmedText: string;
  originalText: string;
  fromPhoto: boolean;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  attempts: number;
  hints: number;
  solved: boolean;
  revealed: boolean;
  teaching?: TeachingState;
};

export function createProblemSession(text: string, fromPhoto = false): ProblemSession {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    subject: 'math',
    title: text.trim().slice(0, 90),
    confirmedText: text.trim().slice(0, 4000),
    originalText: text.trim().slice(0, 4000),
    fromPhoto,
    createdAt: now,
    updatedAt: now,
    messages: [],
    attempts: 0,
    hints: 0,
    solved: false,
    revealed: false,
  };
}

/** Saved text is the source of truth; never restore a persisted model-produced answer. */
export function restoreProblem(session: ProblemSession): ProblemSpec {
  return parseProblem(session.confirmedText);
}

export function hydrateProblemSessions(raw: unknown): Record<string, ProblemSession> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, ProblemSession> = {};
  for (const item of Object.values(raw).slice(-100)) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Partial<ProblemSession>;
    if (
      typeof s.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(s.id) ||
      s.subject !== 'math' ||
      typeof s.confirmedText !== 'string' ||
      !s.confirmedText.trim()
    )
      continue;
    const confirmedText = s.confirmedText.slice(0, 4000);
    const task = createProblemTask(parseProblem(confirmedText));
    result[s.id] = {
      id: s.id,
      subject: 'math',
      title: String(s.title || s.confirmedText).slice(0, 90),
      confirmedText,
      originalText: String(s.originalText || s.confirmedText).slice(0, 4000),
      fromPhoto: s.fromPhoto === true,
      createdAt:
        typeof s.createdAt === 'string' && Number.isFinite(Date.parse(s.createdAt))
          ? s.createdAt
          : new Date().toISOString(),
      updatedAt:
        typeof s.updatedAt === 'string' && Number.isFinite(Date.parse(s.updatedAt))
          ? s.updatedAt
          : new Date().toISOString(),
      messages: Array.isArray(s.messages)
        ? s.messages
            .filter(
              (m) =>
                m &&
                typeof m.id === 'string' &&
                typeof m.text === 'string' &&
                ['student', 'cosmos'].includes(m.role),
            )
            .slice(-200)
            .map((m) => ({ ...m, text: m.text.slice(0, 16000) }))
        : [],
      attempts: Math.max(0, Math.min(10000, Math.floor(Number(s.attempts) || 0))),
      hints: Math.max(0, Math.min(10000, Math.floor(Number(s.hints) || 0))),
      solved: s.solved === true,
      revealed: s.revealed === true,
      teaching: hydrateTeachingState(
        s.teaching,
        task,
        undefined,
        Number(s.hints) > 0 || s.revealed === true,
      ),
    };
  }
  return result;
}
