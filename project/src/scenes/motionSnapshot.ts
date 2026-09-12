/** A bounded UI-only snapshot of in-flight teaching transitions, never learning memory. */
export type MotionSnapshot = {
  path: number[];
  tag: string;
  frames: Keyframe[];
  timing: KeyframeAnimationOptions;
  currentTime: number;
};

const MAX_MOTIONS = 256;
const properties = new Set([
  'opacity',
  'transform',
  'fill',
  'stroke',
  'fillOpacity',
  'strokeOpacity',
  'strokeDashoffset',
  'strokeWidth',
  'cx',
  'cy',
  'x',
  'y',
  'r',
  'width',
  'height',
]);
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const safeValue = (value: unknown): value is string | number =>
  (isNumber(value) && Math.abs(value) < 1e7) ||
  (typeof value === 'string' && value.length <= 320 && !/[{};<>]|url\s*\(/i.test(value));

export function readMotionSnapshots(value: unknown): MotionSnapshot[] {
  if (!Array.isArray(value) || value.length > MAX_MOTIONS) return [];
  const result: MotionSnapshot[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const { path, tag, timing, currentTime, frames } = candidate;
    if (
      !Array.isArray(path) ||
      path.length > 16 ||
      path.some((index) => !Number.isInteger(index) || index < 0 || index > 2000)
    )
      continue;
    if (typeof tag !== 'string' || !/^[a-zA-Z][\w-]{0,25}$/.test(tag)) continue;
    if (!isNumber(currentTime) || currentTime < 0 || currentTime > 20000) continue;
    if (!timing || !isNumber(timing.duration) || timing.duration <= 0 || timing.duration > 15000)
      continue;
    if (!Array.isArray(frames) || frames.length < 2 || frames.length > 8) continue;
    const cleanFrames: Keyframe[] = [];
    for (const frame of frames) {
      if (!frame || typeof frame !== 'object') break;
      const clean: Record<string, string | number | null> = {};
      for (const [key, val] of Object.entries(frame)) {
        if (properties.has(key) && safeValue(val)) clean[key] = val;
        if (key === 'offset' && (val === null || (isNumber(val) && val >= 0 && val <= 1)))
          clean.offset = val;
        if (key === 'easing' && typeof val === 'string' && safeValue(val)) clean.easing = val;
      }
      if (!Object.keys(clean).some((key) => properties.has(key))) break;
      cleanFrames.push(clean as Keyframe);
    }
    if (cleanFrames.length !== frames.length) continue;
    const cleanTiming: KeyframeAnimationOptions = {
      duration: timing.duration,
      delay: isNumber(timing.delay) ? Math.max(0, Math.min(5000, timing.delay)) : 0,
      endDelay: 0,
      iterations: 1,
      fill: ['none', 'forwards', 'backwards', 'both', 'auto'].includes(timing.fill)
        ? timing.fill
        : 'both',
      easing:
        typeof timing.easing === 'string' && safeValue(timing.easing) ? timing.easing : 'linear',
      direction: ['normal', 'reverse', 'alternate', 'alternate-reverse'].includes(timing.direction)
        ? timing.direction
        : 'normal',
    };
    result.push({ path, tag, frames: cleanFrames, timing: cleanTiming, currentTime });
  }
  return result;
}

export function describeMotion(body: Element, animation: Animation): MotionSnapshot | undefined {
  const effect = animation.effect;
  if (!(effect instanceof KeyframeEffect) || !(effect.target instanceof Element)) return undefined;
  const path: number[] = [];
  let element = effect.target;
  while (element !== body) {
    const parent = element.parentElement;
    if (!parent || path.length >= 16) return undefined;
    path.unshift([...parent.children].indexOf(element));
    element = parent;
  }
  return readMotionSnapshots([
    {
      path,
      tag: effect.target.tagName,
      frames: effect.getKeyframes(),
      timing: effect.getTiming(),
      currentTime:
        typeof animation.currentTime === 'number' ? Math.max(0, animation.currentTime) : 0,
    },
  ])[0];
}

export function restoreMotion(body: Element, snapshot: MotionSnapshot): Animation | undefined {
  let target: Element | undefined = body;
  for (const index of snapshot.path) target = target?.children[index];
  if (!target || target.tagName !== snapshot.tag) return undefined;
  try {
    const animation = target.animate(snapshot.frames, snapshot.timing);
    animation.pause();
    animation.currentTime = snapshot.currentTime;
    return animation;
  } catch {
    return undefined;
  }
}
