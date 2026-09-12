export { Ton618Media } from './Ton618Media';
import { useEffect, useState } from 'react';
import type { LearningState } from '../domain';
import { ton618Poster, ton618Variant, ton618Variants, type Ton618Variant } from '../domain/ton618';
import './ton618.css';
import { Ton618Cinema } from './Ton618Cinema';
type Settings = LearningState['settings'];

export function Ton618Controls({ settings, update }: { settings: Settings; update: (s: Partial<Settings>) => void }) {
  const selected = ton618Variant(settings.background);
  const [cinema, setCinema] = useState(false);
  const [status, setStatus] = useState('Открываем фон…');
  useEffect(() => {
    const receive = (event: Event) => setStatus((event as CustomEvent<string>).detail);
    window.addEventListener('cosmos:ton-background-status', receive);
    return () => window.removeEventListener('cosmos:ton-background-status', receive);
  }, []);
  return <><div className="ton618-controls">
    <label>TON 618 <select aria-label="Палитра TON 618" value={selected?.id || ''} onChange={e => update({ background: `ton618-${e.target.value}` })}>
      {!selected && <option value="" disabled>Выбрать фон</option>}
      {ton618Variants.map(v => <option key={v.id} value={v.id}>{v.title}{'video' in v ? '' : ' · изображение'}</option>)}
    </select></label>
    <label><input type="checkbox" checked={settings.animatedBackground} onChange={e => update({ animatedBackground: e.target.checked })} /> Анимация фона</label>
    <span>{selected && !('video' in selected) ? 'Для этой палитры в пакете только изображение' : settings.reducedMotion || ['low', 'static'].includes(settings.quality) ? 'Статичный фон по настройкам движения и качества' : status}</span>
    <button className="button secondary" disabled={!selected} onClick={() => setCinema(true)}>Смотреть на весь экран</button>
  </div>{cinema && <Ton618Cinema settings={settings} update={update} close={() => setCinema(false)} />}</>;
}

export function Ton618Catalog({ settings, update }: { settings: Settings; update: (s: Partial<Settings>) => void }) {
  const selected = ton618Variant(settings.background);
  return <section className="ton618-catalog" aria-label="Шесть вариантов TON 618">
    <h2>TON 618 — глубокий космос</h2><p>Создано в Unreal Engine · Все шесть вариантов уже входят в приложение. Художественная сцена, не масштабная научная модель.</p>
    <Ton618Controls settings={settings} update={update} />
    <div className="ton618-variants">{ton618Variants.map((v: Ton618Variant) => <article className="ton618-variant" key={v.id} data-selected={selected?.id === v.id}>
      <img src={ton618Poster(v)} alt={`TON 618 — ${v.title.toLowerCase()} вариант`} loading="lazy" />
      <div><h3><i style={{ background: v.color }} />{v.title}</h3><p>{'video' in v ? `Видео 16 с · 1920 × 1080 · ${(v.bytes / 1e6).toFixed(1)} МБ` : 'Изображение · 1920 × 1080'}</p>
        <button className="button secondary" aria-pressed={selected?.id === v.id} onClick={() => update({ background: `ton618-${v.id}` })}>{selected?.id === v.id ? 'Выбран для главной' : 'На главный экран'}</button></div>
    </article>)}</div>
  </section>;
}
