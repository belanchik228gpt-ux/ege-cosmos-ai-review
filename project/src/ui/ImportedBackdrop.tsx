import { useEffect, useState } from 'react';
import type { LearningState } from '../domain';
import { ton618Variant } from '../domain/ton618';
import { Ton618Media } from './Ton618';
export function ImportedBackdrop({ settings, home = false }: { settings: LearningState['settings']; home?: boolean }) {
  const [background, setBackground] = useState<CosmosBackground | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setVideoFailed(false);
    setBackground(null);
    if (ton618Variant(settings.background) || ['quiet', 'cosmos-orbit'].includes(settings.background)) return;
    window.cosmos
      ?.listBackgrounds()
      .then((items) => {
        if (live) setBackground(items.find((b) => b.id === settings.background) || null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [settings.background]);
  const ton = ton618Variant(settings.background);
  if (ton)
    return !home ? null : (
      <div className="imported-backdrop ton618-backdrop" aria-hidden="true">
        <Ton618Media settings={settings} />
      </div>
    );
  if (!background) return null;
  const systemReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const video =
    settings.animatedBackground &&
    !settings.reducedMotion &&
    !systemReduced &&
    settings.quality !== 'static' &&
    !videoFailed
      ? background.variants[settings.quality]
      : undefined;
  return (
    <div className="imported-backdrop" aria-hidden="true">
      {video ? (
        <video
          key={video}
          src={video}
          poster={background.staticUrl}
          autoPlay
          muted
          loop
          playsInline
          onError={() => setVideoFailed(true)}
        />
      ) : (
        <img src={background.staticUrl} alt="" />
      )}
    </div>
  );
}
