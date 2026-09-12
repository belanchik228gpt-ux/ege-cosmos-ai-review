export type SceneQuality = 'high' | 'medium' | 'low' | 'static';

export type SceneFrame = { step: number; description: string };
export type SceneStep = {
  id: string;
  title: string;
  narration: string;
  durationMs: number;
  visualAction: string;
  highlights: string[];
  formula?: string;
};
export type LessonScene = {
  id: string;
  subject: import('../domain/school-program/types').SchoolSubjectId;
  topic: string;
  title: string;
  eyebrow: string;
  autoplay: boolean;
  replayable: boolean;
  durationMs: number;
  steps: SceneStep[];
  reducedMotionFrame: SceneFrame;
  question: string;
};
