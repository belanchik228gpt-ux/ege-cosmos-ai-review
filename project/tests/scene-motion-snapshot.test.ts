import { describe, expect, it } from 'vitest';
import { readMotionSnapshots } from '../src/scenes/motionSnapshot';

const transition = () => ({
  path: [0, 1, 4],
  tag: 'rect',
  frames: [
    { offset: 0, computedOffset: 0, easing: 'linear', strokeDashoffset: '1px' },
    { offset: 1, computedOffset: 1, easing: 'linear', strokeDashoffset: '0px' },
  ],
  timing: {
    duration: 1400,
    delay: 0,
    iterations: 1,
    fill: 'backwards',
    easing: 'ease',
    direction: 'normal',
  },
  currentTime: 226.6,
});

describe('restorable UI animation snapshots', () => {
  it('retains partial line drawing and its original easing instead of storing a final frame', () => {
    const [restored] = readMotionSnapshots([transition()]);
    expect(restored.currentTime).toBe(226.6);
    expect(restored.timing.duration).toBe(1400);
    expect(restored.timing.easing).toBe('ease');
    expect(restored.frames).toEqual([
      { offset: 0, easing: 'linear', strokeDashoffset: '1px' },
      { offset: 1, easing: 'linear', strokeDashoffset: '0px' },
    ]);
  });

  it('discards malformed or excessively large persisted animation sets without throwing', () => {
    expect(readMotionSnapshots(null)).toEqual([]);
    expect(readMotionSnapshots({ motions: [] })).toEqual([]);
    expect(readMotionSnapshots(Array.from({ length: 257 }, transition))).toEqual([]);
    expect(
      readMotionSnapshots([
        { ...transition(), path: [-1] },
        { ...transition(), currentTime: Infinity },
      ]),
    ).toEqual([]);
  });

  it('does not replay arbitrary CSS or resource URLs from edited session storage', () => {
    const edited = transition();
    edited.frames = edited.frames.map((frame) => ({
      ...frame,
      position: 'fixed',
      backgroundImage: 'url(https://example.invalid/tracker)',
      fill: 'url(https://example.invalid/fill)',
    }));
    const [restored] = readMotionSnapshots([edited]);
    expect(
      restored.frames.every(
        (frame) => !('position' in frame) && !('backgroundImage' in frame) && !('fill' in frame),
      ),
    ).toBe(true);
    expect(restored.frames[0].strokeDashoffset).toBe('1px');
  });

  it('rejects invalid durations and target paths while preserving a valid sibling transition', () => {
    const valid = transition();
    const restored = readMotionSnapshots([
      { ...transition(), timing: { duration: 'auto' } },
      { ...transition(), path: [0, 2001] },
      valid,
    ]);
    expect(restored).toHaveLength(1);
    expect(restored[0].path).toEqual(valid.path);
  });
});
