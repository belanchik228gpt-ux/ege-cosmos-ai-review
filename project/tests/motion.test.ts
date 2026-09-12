import { describe, expect, it } from 'vitest';
import { resolveMotionPolicy } from '../src/ui/motion';

describe('interface motion accessibility and resource policy', () => {
  it('OS reduced motion overrides expressive settings and animated background', () => {
    expect(
      resolveMotionPolicy({ uiMotion: 'expressive', animatedBackground: true }, true),
    ).toMatchObject({
      enabled: false,
      routeDuration: 0,
      routeDistance: 0,
      background: false,
      hover: false,
    });
  });
  it('application reduced motion has the same priority', () => {
    expect(resolveMotionPolicy({ reducedMotion: true, uiMotion: 'expressive' })).toMatchObject({
      enabled: false,
      routeDuration: 0,
    });
  });
  it('low quality excludes continuous ambient movement and displacement', () => {
    const policy = resolveMotionPolicy({
      quality: 'low',
      animatedBackground: true,
      motionSpeed: 'slow',
    });
    expect(policy.background).toBe(false);
    expect(policy.routeDistance).toBe(0);
    expect(policy.routeDuration).toBeLessThanOrEqual(160);
  });
  it('static and explicit off never start an animation', () => {
    for (const settings of [{ quality: 'static' as const }, { uiMotion: 'off' as const }]) {
      expect(resolveMotionPolicy(settings)).toMatchObject({
        enabled: false,
        routeDuration: 0,
        background: false,
      });
    }
  });
  it('hover and background opt outs are independent', () => {
    expect(resolveMotionPolicy({ hoverEffects: false, animatedBackground: true })).toMatchObject({
      hover: false,
      background: true,
      enabled: true,
    });
  });
});
