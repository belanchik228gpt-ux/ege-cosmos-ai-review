import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { resolveMotionPolicy, type InterfaceMotionSettings } from './motion';

export function InterfaceEffects({
  settings,
  routeKey,
}: {
  settings: InterfaceMotionSettings;
  routeKey: string;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const [systemReduced, setSystemReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const policy = resolveMotionPolicy(settings, systemReduced);

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(query.matches);
    const visibility = () => setPageVisible(!document.hidden);
    query.addEventListener('change', update);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      query.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useLayoutEffect(() => {
    const main = anchor.current?.parentElement?.querySelector<HTMLElement>('.main-content');
    if (!main || !policy.enabled) return;
    const animation = main.animate(
      [
        { opacity: 0.55, transform: `translateY(${policy.routeDistance}px)` },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: policy.routeDuration, easing: 'cubic-bezier(.2,.72,.25,1)' },
    );
    return () => animation.cancel();
  }, [routeKey, policy.enabled, policy.routeDuration, policy.routeDistance]);

  return (
    <div ref={anchor} className="ui-effects-anchor" aria-hidden="true">
      {policy.background && (
        <div className={`ui-ambient ${pageVisible ? '' : 'ui-ambient-paused'}`}>
          <span className="ui-ambient-haze" />
          <span className="ui-ambient-orbit ui-orbit-one" />
          <span className="ui-ambient-orbit ui-orbit-two" />
          <span className="ui-ambient-stars" />
        </div>
      )}
    </div>
  );
}
