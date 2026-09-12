export type UiMotion = 'off' | 'gentle' | 'expressive';
export type MotionSpeed = 'slow' | 'normal' | 'fast';
export type Glow = 'off' | 'soft' | 'vivid';

export type InterfaceMotionSettings = {
  uiMotion?: UiMotion;
  motionSpeed?: MotionSpeed;
  glow?: Glow;
  hoverEffects?: boolean;
  animatedBackground?: boolean;
  reducedMotion?: boolean;
  quality?: 'high' | 'medium' | 'low' | 'static';
};

/** User and OS accessibility choices override decorative movement, never learning state. */
export function resolveMotionPolicy(settings: InterfaceMotionSettings, systemReduced = false) {
  const reduced = Boolean(settings.reducedMotion || systemReduced);
  const level = settings.uiMotion ?? 'expressive';
  const quality = settings.quality ?? 'high';
  const limited = quality === 'low' || quality === 'static';
  const enabled = !reduced && level !== 'off' && quality !== 'static';
  const duration = { slow: 520, normal: 330, fast: 180 }[settings.motionSpeed ?? 'normal'];
  return {
    enabled,
    reduced,
    routeDuration: enabled ? (limited ? Math.min(duration, 160) : duration) : 0,
    routeDistance: enabled && !limited ? (level === 'expressive' ? 14 : 5) : 0,
    background: enabled && !limited && Boolean(settings.animatedBackground),
    hover: enabled && (settings.hoverEffects ?? true),
  };
}
