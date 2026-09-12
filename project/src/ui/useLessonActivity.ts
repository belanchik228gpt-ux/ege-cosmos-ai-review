import { useEffect } from 'react';
import type { LearningState } from '../domain';

export function acceptsActivity(
  dom: { visible: boolean; focused: boolean },
  native?: { visible: boolean; focused: boolean } | null,
) {
  return (
    dom.visible && dom.focused && (native === undefined || !!(native?.visible && native.focused))
  );
}

/** Approximate active lesson time; hidden windows and long idle periods do not count. */
export function useLessonActivity(
  sessionId: string | null,
  completed: boolean,
  setState: React.Dispatch<React.SetStateAction<LearningState>>,
) {
  useEffect(() => {
    if (!sessionId || completed) return;
    let lastInteraction = performance.now(),
      previous = performance.now();
    let disposed = false;
    const interaction = () => {
      lastInteraction = performance.now();
    };
    const visibility = () => {
      previous = performance.now();
      lastInteraction = previous;
    };
    const timer = setInterval(async () => {
      const now = performance.now(),
        delta = Math.max(0, Math.min(5000, now - previous));
      previous = now;
      if (disposed || document.hidden || !document.hasFocus() || now - lastInteraction > 90_000)
        return;
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
        const session = current.sessions[sessionId];
        if (!session || session.completedAt) return current;
        return {
          ...current,
          sessions: {
            ...current.sessions,
            [sessionId]: { ...session, activeMs: Math.round((session.activeMs || 0) + delta) },
          },
        };
      });
    }, 5000);
    for (const event of ['pointerdown', 'keydown', 'wheel', 'pointermove'])
      window.addEventListener(event, interaction, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', visibility);
    return () => {
      disposed = true;
      clearInterval(timer);
      for (const event of ['pointerdown', 'keydown', 'wheel', 'pointermove'])
        window.removeEventListener(event, interaction);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', visibility);
    };
  }, [sessionId, completed, setState]);
}
