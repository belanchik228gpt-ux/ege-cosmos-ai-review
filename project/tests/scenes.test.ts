import { describe, expect, it } from 'vitest';
import { scenes, getScene } from '../src/scenes/registry';
import { advanceTimeline, clampStep, timelineProgress } from '../src/scenes/timeline';
import { distance, medianGeometry, polygonArea } from '../src/scenes/geometry';

describe('scene clock', () => {
  const scene = scenes.rectangle;
  it('carries excess elapsed time into following steps', () => {
    expect(advanceTimeline(scene, 0, 4000, 700)).toEqual({
      step: 1,
      elapsedMs: 500,
      complete: false,
    });
  });
  it('reaches the final question and terminates even after a long interval', () => {
    const result = advanceTimeline(scene, 0, 0, 1_000_000);
    expect(result.step).toBe(scene.steps.length - 1);
    expect(result.complete).toBe(true);
    expect(timelineProgress(scene, result.step, result.elapsedMs)).toBe(1);
  });
  it('preserves elapsed time while paused and clamps navigation', () => {
    expect(advanceTimeline(scene, 3, 1900, 0)).toEqual({
      step: 3,
      elapsedMs: 1900,
      complete: false,
    });
    expect(clampStep(-1, 12)).toBe(0);
    expect(clampStep(999, 12)).toBe(11);
    expect(clampStep(Number.NaN, 12)).toBe(0);
  });
  it('measures whole-timeline progress from unequal step durations', () => {
    expect(timelineProgress(scene, 1, 0)).toBeCloseTo(scene.steps[0].durationMs / scene.durationMs);
  });
});

describe('authored lesson progression', () => {
  it('places the bisector using the theorem and separates its foot from midpoint and altitude', () => {
    const { A, B, C, M, H, L } = medianGeometry;
    expect(distance(B, M)).toBe(distance(M, C));
    expect(distance(B, L) / distance(L, C)).toBeCloseTo(distance(A, B) / distance(A, C), 12);
    expect(H.x).toBe(A.x);
    expect(M.x).not.toBe(H.x);
    expect(L.x).not.toBe(M.x);
    expect(polygonArea([A, B, M])).toBe(polygonArea([A, M, C]));
  });
  it('never reveals rectangle formula before unit-cell multiplication', () => {
    expect(scenes.rectangle.steps.slice(0, 8).every((step) => !step.formula)).toBe(true);
    expect(scenes.rectangle.steps[8].formula).toBe('S = a · b');
    expect(scenes.rectangle.steps[10].formula).toBe('S = 24 см²');
  });
  it('distinguishes median, altitude, and bisector', () => {
    expect(scenes.median.steps.find((step) => step.visualAction === 'equal-parts')?.formula).toBe(
      'BM = MC',
    );
    expect(scenes.median.steps.find((step) => step.visualAction === 'altitude')?.formula).toBe(
      'AH ⟂ BC',
    );
    expect(scenes.median.steps.find((step) => step.visualAction === 'bisector')?.formula).toBe(
      '∠BAL = ∠LAC',
    );
  });
  it('declares offline static frame and an independent question for every subject', () => {
    expect(new Set(Object.values(scenes).map((scene) => scene.subject)).size).toBe(4);
    for (const scene of Object.values(scenes)) {
      expect(scene.steps[scene.reducedMotionFrame.step]).toBeDefined();
      expect(scene.question.length).toBeGreaterThan(20);
      expect(scene.durationMs).toBe(
        scene.steps.reduce((total, step) => total + step.durationMs, 0),
      );
    }
  });
  it('resolves content ids and returns no unrelated lesson for unknown ids', () => {
    expect(getScene('rectangle-area')).toBe(scenes.rectangle);
    expect(getScene('unknown-topic')).toBeUndefined();
  });
});
