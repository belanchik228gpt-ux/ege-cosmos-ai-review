import type { TeachingVisual } from './teaching-visual';

export type TeachingAnswerMeaning =
  | 'value'
  | 'coordinate'
  | 'distance'
  | 'count'
  | 'direction'
  | 'sign'
  | 'expression'
  | 'text';

export interface TeachingQuestion {
  prompt: string;
  answer: string;
  accepted?: string[];
  kind?: 'number' | 'text';
  answerMeaning?: TeachingAnswerMeaning;
  hint?: string;
  explanation?: string;
}

/** Authored, checkable step. No question is introduced only through explanatory prose. */
export interface TeachingStep {
  id: string;
  /** Registered prerequisite meaning; this is authored metadata, not model-generated prose. */
  concept?: 'expression-value';
  title: string;
  explanation: string;
  question: TeachingQuestion;
  visual?: TeachingVisual;
  hints?: string[];
  success?: string;
  /** Defaults to the next primary step, or back to the task after the final step. */
  nextStepId?: string | 'main';
  /** Authored declaration: a checked answer here finishes the original task after every required step. */
  completesTask?: boolean;
  /** Smaller prerequisite questions; finishing one returns to this step. */
  detours?: TeachingStep[];
}

export interface TeachingAttempt {
  id: string;
  stepId: string;
  questionId: string;
  text: string;
  correct: boolean;
  assisted: boolean;
  uncertain: boolean;
  at: string;
}

/** Persist references and evidence, never a second editable copy of the grading answer. */
export interface TeachingState {
  version: 1;
  taskId: string;
  activeStepId: string | 'main';
  phase: 'asking' | 'answered' | 'revealed';
  returnStack: Array<{ stepId: string; phase: 'asking' | 'answered' | 'revealed' }>;
  completedStepIds: string[];
  skippedStepIds: string[];
  attempts: TeachingAttempt[];
  hintLevel: number;
  assisted: boolean;
  mainRevealed: boolean;
  revision: number;
}
