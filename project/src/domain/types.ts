import type { DiagnosticRecord } from './diagnostics';
import type { HomeworkAssignment } from './homework';
import type { StudyPlanningState } from './study-plan';
import type { StudyWorkspace } from './workspace';
import type { TeachingStep, TeachingState, TeachingAnswerMeaning } from './teaching-types';

export type SubjectId = 'math' | 'russian' | 'history' | 'social';
export type Quality = 'high' | 'medium' | 'low' | 'static';
export type MaterialStatus = 'official' | 'training' | 'synthetic' | 'model';

export interface Subject {
  id: SubjectId;
  title: string;
  shortTitle: string;
  color: string;
  description: string;
  icon: string;
}

export interface Task {
  id: string;
  prompt: string;
  answer: string;
  accepted?: string[];
  hint: string;
  hints?: string[];
  scaffolds?: { prompt: string; answer: string; accepted?: string[]; explanation: string }[];
  explanation: string;
  choices?: string[];
  kind?: 'number' | 'text';
  requireSimplified?: boolean;
  teachingSteps?: TeachingStep[];
  answerMeaning?: TeachingAnswerMeaning;
}

export interface Topic {
  id: string;
  subject: SubjectId;
  title: string;
  description: string;
  sceneId: string;
  durationMinutes: number;
  explanation: string;
  known: string;
  goal: string;
  firstStep: string;
  formula: string;
  question: string;
  tasks: Task[];
  sourceId: string;
  sourceIds?: string[];
  materialStatus: MaterialStatus;
  version: string;
}

export interface Message {
  id: string;
  role: 'cosmos' | 'student';
  text: string;
  kind?: string;
  sourceIds?: string[];
  knowledgeIds?: string[];
  verification?: {
    method: 'local-model-review';
    checkedAt: string;
    evidence: Array<{ id: string; quote: string; sourceIds: string[] }>;
  };
}

export interface Session {
  id: string;
  subject: SubjectId;
  topicId: string;
  startedAt: string;
  completedAt?: string;
  messages: Message[];
  taskIndex: number;
  hintsUsed: number;
  scaffoldIndex?: number;
  phase: 'practice' | 'summary';
  summary?: string;
  note?: string;
  learningMemoryKey?: string;
  activeMs?: number;
  teaching?: TeachingState;
  teachingHistory?: TeachingState[];
}

export interface Attempt {
  taskId: string;
  correct: boolean;
  assisted: boolean;
  at: string;
  sessionId: string;
}

export interface TopicProgress {
  attempts: Attempt[];
  mastery: 'new' | 'learning' | 'review' | 'mastered';
  nextReviewAt?: string;
}

export interface LearningDocument {
  drawings?: import('./cloud-learning').TutorDrawing[];
  id: string;
  title: string;
  subject: SubjectId | 'all';
  topicId?: string;
  topic?: string;
  createdAt: string;
  updatedAt?: string;
  content: string;
  type: string;
  sources: string[];
  status: MaterialStatus;
  path?: string;
  sessionId?: string;
  style?: 'cosmos' | 'paper';
  scale?: 'comfortable' | 'large';
  sourceSnapshot?: Array<{
    id: string;
    title: string;
    url: string;
    version: string;
    checkedAt: string;
    publisher: string;
    status: string;
    purpose: 'topic' | 'exam-reference' | 'local-material';
  }>;
}

export interface LearningFact {
  id: string;
  subject: SubjectId | 'all';
  text: string;
  createdAt: string;
  /** Missing on older notes; never infer that an unlabelled note is a measured result. */
  origin?: 'student' | 'model-summary';
  sourceSessionId?: string;
}

export interface LearningState {
  version: 1;
  egeTopicSkips?: import('./ege-topic-skips').EgeTopicSkips;
  school?: import('./school-state').SchoolState;
  homeworkDesk?: import('./school-state').SchoolState;
  cloudSessions?: Record<string, import('./cloud-learning').CloudLesson>;
  problemSessions?: Record<string, import('./problem-sessions').ProblemSession>;
  planning?: StudyPlanningState;
  studyWorkspace?: StudyWorkspace;
  profile: { name: string; dailyMinutes: number; selectedSubjects: SubjectId[] };
  sessions: Record<string, Session>;
  progress: Record<string, TopicProgress>;
  documents: LearningDocument[];
  settings: {
    quality: Quality;
    reducedMotion: boolean;
    voice: boolean;
    background: string;
    palette: 'cosmos' | 'aurora' | 'ocean' | 'amber' | 'rose' | 'custom';
    accentColor: string;
    spaceColor: string;
    textScale: 'normal' | 'comfortable' | 'large';
    contrast: 'soft' | 'high';
    focusMode: boolean;
    uiMotion: 'off' | 'gentle' | 'expressive';
    motionSpeed: 'slow' | 'normal' | 'fast';
    glow: 'off' | 'soft' | 'vivid';
    hoverEffects: boolean;
    animatedBackground: boolean;
    sceneAutoplay: boolean;
    sceneSpeed: 0.5 | 1 | 1.5 | 2;
    density: 'comfortable' | 'compact';
    cornerStyle: 'soft' | 'rounded' | 'square';
    contentWidth: 'comfortable' | 'wide';
    lessonLayout: 'balanced' | 'visual' | 'dialogue';
    fontFamily: 'system' | 'humanist';
    documentStyle: 'cosmos' | 'paper';
    documentScale: 'comfortable' | 'large';
    sourceDetailsExpanded: boolean;
    voiceRate: number;
    voicePitch: number;
    voiceVolume: number;
    enterToSend: boolean;
    autoHomework: boolean;
    showReviewReminders: boolean;
  };
  bookmarks: string[];
  facts: LearningFact[];
  diagnostics?: Record<string, DiagnosticRecord>;
  homework?: Record<string, HomeworkAssignment>;
  preferenceProfiles?: Array<{
    id: string;
    name: string;
    settings: LearningState['settings'];
    createdAt: string;
  }>;
}
