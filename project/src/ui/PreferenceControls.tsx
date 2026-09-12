import { Orbit, Sparkles } from 'lucide-react';
import type { Preferences } from '../domain/preferences';
type ControlProps = {
  settings: Preferences;
  update: (patch: Partial<Preferences>) => void;
  title: string;
  description: string;
};
export function PreferenceChoice({
  settings,
  update,
  title,
  description,
  field,
  options,
}: ControlProps & { field: keyof Preferences; options: Array<[string, string]> }) {
  return (
    <div className="preference-control">
      <label>
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <select
          aria-label={title}
          value={String(settings[field])}
          onChange={(event) =>
            update({
              [field]: field === 'sceneSpeed' ? Number(event.target.value) : event.target.value,
            })
          }
        >
          {options.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
export function PreferenceToggle({
  settings,
  update,
  title,
  description,
  field,
}: ControlProps & { field: keyof Preferences }) {
  return (
    <div className="preference-control">
      <label>
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <input
          type="checkbox"
          aria-label={title}
          checked={!!settings[field]}
          onChange={(event) => update({ [field]: event.target.checked })}
        />
      </label>
    </div>
  );
}
export function PreferenceRange({
  settings,
  update,
  title,
  description,
  field,
  min,
  max,
  step,
}: ControlProps & {
  field: 'voiceRate' | 'voicePitch' | 'voiceVolume';
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="preference-control">
      <label>
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <input
          type="range"
          aria-label={title}
          min={min}
          max={max}
          step={step}
          value={settings[field]}
          onChange={(event) => update({ [field]: Number(event.target.value) })}
        />
        <output>{Math.round(settings[field] * 100)}%</output>
      </label>
    </div>
  );
}
export function PreferenceDemo({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <div className="preference-demo">
      <Orbit size={80} />
      <span className="eyebrow">МОЖНО ПОПРОБОВАТЬ СРАЗУ</span>
      <h2>Ещё один маленький шаг.</h2>
      <p>
        Свет, форма и движение меняются прямо здесь. Найди сочетание, с которым приятно учиться.
      </p>
      <div className="preference-demo-actions">
        <button className="button primary" onClick={onClick}>
          <Sparkles size={17} />
          Попробовать кнопку
        </button>
        <span className="pill" role="status">
          {count ? `Отклик · ${count}` : 'Наведи курсор'}
        </span>
      </div>
    </div>
  );
}
