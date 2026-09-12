import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { advanceTimeline, clampStep } from './timeline';
import type { LessonScene, SceneQuality } from './types';
import {
  describeMotion,
  readMotionSnapshots,
  restoreMotion,
  type MotionSnapshot,
} from './motionSnapshot';

type Cursor = { step: number; elapsedMs: number; complete: boolean };

/** One clock owns the lesson timeline and every CSS transition inside the scene body. */
export function useSceneClock(
  scene: LessonScene,
  quality: SceneQuality,
  motionOff: boolean,
  autoplay = scene.autoplay,
  initialSpeed = 1,
  persistenceKey?: string,
  externalPaused = false,
) {
  const staticMode = quality === 'static';
  const [restored] = useState(() => {
    if (!persistenceKey || typeof sessionStorage === 'undefined') return undefined;
    try {
      const raw = sessionStorage.getItem(`cosmos-scene-cursor:${persistenceKey}`) || 'null';
      if (raw.length > 256000) return undefined;
      const value = JSON.parse(raw);
      if (
        value?.sceneId !== scene.id ||
        !Number.isInteger(value.step) ||
        value.step < 0 ||
        value.step >= scene.steps.length ||
        value.stepId !== scene.steps[value.step].id
      )
        return undefined;
      return {
        step: value.step,
        elapsedMs: Math.max(
          0,
          Math.min(scene.steps[value.step].durationMs, Number(value.elapsedMs) || 0),
        ),
        complete: value.complete === true,
        speed: [0.5, 1, 1.5, 2].includes(value.speed) ? value.speed : initialSpeed,
        manualFrame: value.manualFrame === true,
        motions:
          value.motionVersion === 1 && value.quality === quality
            ? readMotionSnapshots(value.motions)
            : [],
      };
    } catch {
      return undefined;
    }
  });
  const [cursor, setCursor] = useState<Cursor>({
    step: staticMode ? scene.reducedMotionFrame.step : (restored?.step ?? 0),
    elapsedMs: staticMode ? 0 : (restored?.elapsedMs ?? 0),
    complete: staticMode ? false : (restored?.complete ?? false),
  });
  const [playing, setPlayingState] = useState(
    !restored && autoplay && !motionOff && !externalPaused,
  );
  const [speed, setSpeed] = useState(restored?.speed ?? initialSpeed);
  const [manualFrame, setManualFrame] = useState(
    staticMode || motionOff || restored?.manualFrame === true,
  );
  const [revision, setRevision] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const motions = useRef<Animation[]>([]);
  const descriptors = useRef(new WeakMap<Animation, MotionSnapshot>());
  const restoredEffects = useRef(new Set<Animation>());
  const hydrationDone = useRef(false);
  const current = useRef(cursor);
  const running = useRef(playing);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const manualFrameRef = useRef(manualFrame);
  manualFrameRef.current = manualFrame;
  const forcedPause = useRef(false);
  useEffect(() => {
    if (!persistenceKey) return;
    const save = () => {
      try {
        const value = current.current;
        const snapshots = motions.current.flatMap((animation) => {
          const description = descriptors.current.get(animation);
          return description
            ? [
                {
                  ...description,
                  currentTime:
                    typeof animation.currentTime === 'number'
                      ? animation.currentTime
                      : value.elapsedMs,
                },
              ]
            : [];
        });
        sessionStorage.setItem(
          `cosmos-scene-cursor:${persistenceKey}`,
          JSON.stringify({
            ...value,
            sceneId: scene.id,
            stepId: scene.steps[value.step].id,
            speed: speedRef.current,
            manualFrame: manualFrameRef.current,
            motionVersion: 1,
            quality,
            motions: snapshots,
          }),
        );
      } catch {
        /* Learning progress is saved independently. */
      }
    };
    window.addEventListener('pagehide', save);
    return () => {
      save();
      // Real unmounts detach targets. StrictMode's simulated unmount keeps them connected.
      for (const animation of restoredEffects.current) {
        const effect = animation.effect;
        if (effect instanceof KeyframeEffect && !effect.target?.isConnected) animation.cancel();
      }
      window.removeEventListener('pagehide', save);
    };
  }, [persistenceKey, scene, quality]);
  useEffect(() => {
    if (externalPaused) {
      forcedPause.current = running.current;
      pause();
    } else if (forcedPause.current && !motionOff && !current.current.complete) {
      forcedPause.current = false;
      running.current = true;
      setPlayingState(true);
    }
  }, [externalPaused]);

  function publish(next: Cursor) {
    current.current = next;
    setCursor(next);
  }

  function seekMotions(elapsed: number) {
    const unfinished: Animation[] = [];
    for (const animation of motions.current) {
      try {
        const end = Number(animation.effect?.getComputedTiming().endTime ?? 0);
        if (elapsed >= end) {
          animation.finish();
          if (restoredEffects.current.delete(animation)) animation.cancel();
        } else {
          animation.currentTime = elapsed;
          unfinished.push(animation);
        }
      } catch {
        // A transition can be replaced by the browser when its CSS property changes.
      }
    }
    motions.current = unfinished;
  }

  function finishMotions() {
    for (const animation of motions.current) {
      try {
        animation.finish();
        if (restoredEffects.current.delete(animation)) animation.cancel();
      } catch {
        /* Already replaced or cancelled. */
      }
    }
    motions.current = [];
  }

  useLayoutEffect(() => {
    // Flush style changes, capture newly authored CSS transitions, and pause their own clocks.
    const body = bodyRef.current;
    if (!body) return;
    const available = body.getAnimations({ subtree: true });
    for (const animation of available) {
      if (!descriptors.current.has(animation)) {
        const description = describeMotion(body, animation);
        if (description) descriptors.current.set(animation, description);
      }
    }
    if (!hydrationDone.current) {
      hydrationDone.current = true;
      if (!manualFrame && !motionOff) {
        for (const snapshot of restored?.motions ?? []) {
          const animation = restoreMotion(body, snapshot);
          if (!animation) continue;
          descriptors.current.set(animation, snapshot);
          restoredEffects.current.add(animation);
          available.push(animation);
        }
      }
    }
    motions.current = available;
    for (const animation of available) animation.pause();
    if (manualFrame || motionOff) finishMotions();
    else seekMotions(current.current.elapsedMs);
  }, [cursor.step, revision, manualFrame, motionOff, quality]);

  useEffect(() => {
    if (!playing || staticMode) return;
    let frame = 0;
    let previous = performance.now();
    let painted = previous;
    const tick = (now: number) => {
      if (!running.current) return;
      const delta = document.hidden ? 0 : Math.min(now - previous, 100) * speed;
      previous = now;
      const old = current.current;
      const next = advanceTimeline(scene, old.step, old.elapsedMs, delta);
      current.current = next;
      const changedStep = old.step !== next.step;
      if (changedStep) {
        finishMotions();
        setManualFrame(false);
      } else seekMotions(next.elapsedMs);
      // Native animation frames remain smooth; React only refreshes the text/progress as needed.
      if (changedStep || next.complete || now - painted >= (quality === 'low' ? 150 : 60)) {
        setCursor(next);
        painted = now;
      }
      if (next.complete) {
        running.current = false;
        setPlayingState(false);
      } else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, staticMode, speed, quality, scene]);

  useEffect(() => {
    if (motionOff) {
      running.current = false;
      setPlayingState(false);
      setManualFrame(true);
      publish({ ...current.current });
    }
  }, [motionOff]);

  useEffect(() => {
    if (staticMode) {
      finishMotions();
      setManualFrame(true);
      publish({ step: scene.reducedMotionFrame.step, elapsedMs: 0, complete: false });
    }
  }, [staticMode, scene]);

  const pause = () => {
    running.current = false;
    setPlayingState(false);
    publish({ ...current.current });
    seekMotions(current.current.elapsedMs);
  };

  const goTo = (index: number) => {
    pause();
    finishMotions();
    setManualFrame(true);
    publish({ step: clampStep(index, scene.steps.length), elapsedMs: 0, complete: false });
  };

  const replay = () => {
    finishMotions();
    publish({ step: 0, elapsedMs: 0, complete: false });
    setRevision((value) => value + 1);
    setManualFrame(motionOff);
    running.current = !motionOff && !externalPaused;
    setPlayingState(!motionOff && !externalPaused);
  };

  const togglePlay = () => {
    if (staticMode || externalPaused) return;
    if (running.current) {
      pause();
      return;
    }
    if (current.current.complete) {
      replay();
      return;
    }
    running.current = true;
    setPlayingState(true);
  };

  const finish = () => {
    pause();
    finishMotions();
    const index = scene.steps.length - 1;
    publish({ step: index, elapsedMs: scene.steps[index].durationMs, complete: true });
  };

  return {
    cursor,
    playing,
    speed,
    setSpeed,
    bodyRef,
    revision,
    manualFrame,
    goTo,
    replay,
    togglePlay,
    finish,
    pause,
  };
}
