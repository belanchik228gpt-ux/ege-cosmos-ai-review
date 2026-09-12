import type { LessonScene } from './types';

export function clampStep(step: number, length: number): number {
  return Math.max(
    0,
    Math.min(Math.max(0, length - 1), Number.isFinite(step) ? Math.floor(step) : 0),
  );
}

/** Progress is measured against the actual duration of every scene step. */
export function timelineProgress(scene: LessonScene, step: number, elapsedMs: number): number {
  const index = clampStep(step, scene.steps.length);
  const previous = scene.steps.slice(0, index).reduce((sum, item) => sum + item.durationMs, 0);
  const current = Math.min(scene.steps[index].durationMs, Math.max(0, elapsedMs));
  return Math.min(1, (previous + current) / scene.durationMs);
}

/** Advance without discarding overflow when a frame is late or the speed changes. */
export function advanceTimeline(
  scene: LessonScene,
  step: number,
  elapsedMs: number,
  deltaMs: number,
) {
  let index = clampStep(step, scene.steps.length);
  let elapsed = Math.max(0, elapsedMs + Math.max(0, deltaMs));
  while (elapsed >= scene.steps[index].durationMs && index < scene.steps.length - 1) {
    elapsed -= scene.steps[index].durationMs;
    index += 1;
  }
  const complete = index === scene.steps.length - 1 && elapsed >= scene.steps[index].durationMs;
  return { step: index, elapsedMs: Math.min(elapsed, scene.steps[index].durationMs), complete };
}
