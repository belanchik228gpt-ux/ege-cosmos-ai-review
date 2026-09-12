import { useEffect, useRef, useState } from 'react';
import type { LearningState } from '../domain';
import { ton618Poster, ton618Variant, ton618Video } from '../domain/ton618';
type Settings = LearningState['settings'];
export function Ton618Media({ settings, staticOnly = false, cinema = false, paused = false, onStatus }: { settings: Settings; staticOnly?: boolean; cinema?: boolean; paused?: boolean; onStatus?: (status: string) => void }) {
  const variant = ton618Variant(settings.background);
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(true);
  const [hidden, setHidden] = useState(document.hidden);
  const [nativeVisible, setNativeVisible] = useState(true);
  const [reduced, setReduced] = useState(matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [cinemaOpen, setCinemaOpen] = useState(false);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReduced(query.matches);
    const visibility = () => setHidden(document.hidden);
    query.addEventListener('change', motion);
    document.addEventListener('visibilitychange', visibility);
    const cinemaVisibility = (event: Event) => setCinemaOpen((event as CustomEvent<boolean>).detail === true);
    window.addEventListener('cosmos:ton-cinema', cinemaVisibility);
    let active = true;
    const unsubscribe = window.cosmos?.onWindowVisible?.(setNativeVisible);
    window.cosmos?.getWindowActivity?.().then(state => { if (active) setNativeVisible(state.visible); }).catch(() => {});
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (box.current) observer.observe(box.current);
    return () => { active = false; unsubscribe?.(); observer.disconnect(); query.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('cosmos:ton-cinema', cinemaVisibility); };
  }, []);
  const source = variant && ton618Video(variant);
  const allowed = !!source && !staticOnly && (cinema || (settings.animatedBackground && !settings.reducedMotion && !reduced && !['low', 'static'].includes(settings.quality) && !cinemaOpen)) && visible && !hidden && nativeVisible;
  useEffect(() => { setFailed(false); setPlaying(false); }, [source, settings.animatedBackground, settings.quality]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let active = true;
    setReady(false);
    setPlaying(false);
    const timeout = setTimeout(() => { if (active && element.readyState < 3) setFailed(true); }, 10000);
    return () => { active = false; clearTimeout(timeout); element.pause(); element.removeAttribute('src'); element.load(); };
  }, [source, allowed, failed]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let active = true;
    if (paused) element.pause();
    else element.play().catch(error => { if (active && error?.name !== 'AbortError') setFailed(true); });
    return () => { active = false; };
  }, [paused, source, allowed, failed]);
  // Recover a background decoder that stopped after window occlusion or GPU sleep.
  // Explicit pause and disabled/background-hidden states must never be restarted.
  useEffect(() => {
    const element = video.current;
    if (!element || !allowed || paused || failed) return;
    let lastTime = element.currentTime;
    let stalled = 0;
    const timer = setInterval(() => {
      if (document.hidden) return;
      if (element.currentTime === lastTime) stalled++; else stalled = 0;
      lastTime = element.currentTime;
      if (element.paused) void element.play().catch(() => {});
      if (stalled >= 3) {
        stalled = 0;
        element.load();
        void element.play().catch(() => {});
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [allowed, paused, failed, source]);
  useEffect(() => { onStatus?.(!source ? 'Изображение · видео для этой палитры нет' : failed ? 'Видео не открылось · показан статичный кадр' : paused ? 'Пауза' : allowed && playing ? 'Видео · повтор ∞' : allowed ? 'Открываем видео…' : 'Статичный фон по настройкам'); }, [source, failed, paused, allowed, playing, onStatus]);
  useEffect(() => {
    if (cinema) return;
    const status = !source ? 'Изображение · видео для этой палитры нет' : failed ? 'Видео не открылось · выключи и включи анимацию для повтора' : allowed && playing ? 'Видео · повтор ∞' : allowed ? 'Открываем видео…' : 'Фон приостановлен';
    window.dispatchEvent(new CustomEvent('cosmos:ton-background-status', { detail: status }));
  }, [cinema, source, failed, allowed, playing]);
  return <div ref={box} className="ton618-media" data-ton-variant={variant?.id} aria-hidden="true">
    {variant && <img key={variant.id} src={ton618Poster(variant)} alt="" decoding="async" style={{ visibility: allowed && ready && !failed ? 'hidden' : undefined }} onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />}
    {allowed && !failed && <video ref={video} key={source} src={source} poster={variant && ton618Poster(variant)} muted loop playsInline preload="auto" onPlaying={() => { setReady(true); setPlaying(true); }} onPause={() => setPlaying(false)} onError={() => setFailed(true)} style={{ opacity: ready ? 1 : 0 }} />}
  </div>;
}
