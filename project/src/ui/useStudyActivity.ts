import { useEffect } from 'react';
import type { LearningState } from '../domain/types';
import { addStudyActiveTime } from '../domain/study-plan';
import { acceptsActivity } from './useLessonActivity';

export function useStudyActivity(
  runId: string | undefined,
  enabled: boolean,
  setState: React.Dispatch<React.SetStateAction<LearningState>>,
) {
  useEffect(() => {
    if (!runId || !enabled) return;
    let previous = performance.now(),
      lastInteraction = previous,
      disposed = false;
    const interact = () => {
      lastInteraction = performance.now();
    };
    const timer = setInterval(async () => {
      const now = performance.now(),
        delta = Math.min(5000, Math.max(0, now - previous));
      previous = now;
      if (document.hidden || !document.hasFocus() || now - lastInteraction > 90000) return;
      let native: { visible: boolean; focused: boolean } | null | undefined;
      if (window.cosmos?.getWindowActivity) {
        let deadline: ReturnType<typeof setTimeout> | undefined;
        try {
          native = await Promise.race([
            window.cosmos.getWindowActivity(),
            new Promise<null>((resolve) => {
              deadline = setTimeout(() => resolve(null), 750);
            }),
          ]);
        } catch {
          native = null;
        } finally {
          clearTimeout(deadline);
        }
      }
      if (
        disposed ||
        !acceptsActivity({ visible: !document.hidden, focused: document.hasFocus() }, native)
      )
        return;
      setState((current) => {
        if (!current.planning) return current;
        const planning = addStudyActiveTime(current.planning, runId, delta);
        return planning === current.planning ? current : { ...current, planning };
      });
    }, 5000);
    for (const event of ['pointerdown', 'keydown', 'wheel', 'pointermove'])
      window.addEventListener(event, interact, { passive: true });
    return () => {
      disposed = true;
      clearInterval(timer);
      for (const event of ['pointerdown', 'keydown', 'wheel', 'pointermove'])
        window.removeEventListener(event, interact);
    };
  }, [runId, enabled, setState]);
}
