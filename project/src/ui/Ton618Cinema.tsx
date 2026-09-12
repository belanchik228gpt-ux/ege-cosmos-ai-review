import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LearningState } from '../domain';
import { ton618Variant, ton618Variants } from '../domain/ton618';
import { Ton618Media } from './Ton618Media';

export function Ton618Cinema({ settings, update, close }: {
  settings: LearningState['settings'];
  update: (patch: Partial<LearningState['settings']>) => void;
  close: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const [fit, setFit] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [status, setStatus] = useState('Открываем видео…');
  const [replay, setReplay] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const exit = useRef(close);
  exit.current = close;
  const selected = ton618Variant(settings.background);
  const hasVideo = !!selected && 'video' in selected;
  function reveal() {
    setChrome(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setChrome(false), 2800);
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    const wasInert = root?.inert ?? false;
    const wasFullscreen = !!document.fullscreenElement;
    const htmlOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    let entered = false;
    if (root) root.inert = true;
    window.dispatchEvent(new CustomEvent('cosmos:ton-cinema', { detail: true }));
    dialog.current?.focus();
    reveal();
    const change = () => {
      if (document.fullscreenElement) entered = true;
      else if (entered && !wasFullscreen) exit.current();
    };
    document.addEventListener('fullscreenchange', change);
    if (!wasFullscreen) void document.documentElement.requestFullscreen().catch(() => {
      // The same viewer remains usable across the entire application window.
    });
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); exit.current(); }
      if (event.key === 'Tab') {
        reveal();
        const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select') || []);
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (items.length && (index === -1 || (!event.shiftKey && index === items.length - 1) || (event.shiftKey && index === 0))) {
          event.preventDefault(); items[event.shiftKey ? items.length - 1 : 0].focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('keydown', key);
      document.removeEventListener('fullscreenchange', change);
      if (!wasFullscreen && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      if (root) root.inert = wasInert;
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
      window.dispatchEvent(new CustomEvent('cosmos:ton-cinema', { detail: false }));
      previous?.focus();
    };
  }, []);
  return createPortal(<div ref={dialog} role="dialog" aria-modal="true" aria-label="TON 618 на весь экран" tabIndex={-1}
    className="ton618-cinema" data-fit={fit} data-chrome={chrome} onPointerMove={reveal} onPointerDown={reveal}>
    <Ton618Media key={replay} settings={settings} cinema paused={paused} onStatus={setStatus} />
    <div className="ton618-cinema-controls" onFocusCapture={reveal} onClick={event => {
      if (event.detail > 0 && event.target instanceof HTMLButtonElement) dialog.current?.focus();
    }}>
      <div><strong>TON 618</strong><span role="status">{status}</span></div>
      <select aria-label="Палитра полноэкранного фона" value={selected?.id || 'bronze'} onChange={event => { setPaused(false); update({ background: `ton618-${event.target.value}` }); }}>
        {ton618Variants.map(variant => <option key={variant.id} value={variant.id}>{variant.title}{'video' in variant ? '' : ' · изображение'}</option>)}
      </select>
      <button disabled={!hasVideo} onClick={() => setPaused(value => !value)}>{paused ? 'Продолжить' : 'Пауза'}</button>
      <button disabled={!hasVideo} onClick={() => { setPaused(false); setReplay(value => value + 1); }}>С начала</button>
      <button onClick={() => setFit(value => !value)}>{fit ? 'Заполнить экран' : 'Показать целиком'}</button>
      <button onClick={close} aria-label="Закрыть полноэкранный фон">Закрыть · Esc</button>
    </div>
  </div>, document.body);
}
