import { Palette, Check, RotateCcw, Type } from 'lucide-react';
import type { LearningState } from '../domain';
import { palettes } from './appearance';

export function AppearanceSettings({
  settings,
  update,
}: {
  settings: LearningState['settings'];
  update: (patch: Partial<LearningState['settings']>) => void;
}) {
  return (
    <section className="panel appearance-panel">
      <div className="appearance-heading">
        <span className="icon-badge">
          <Palette size={24} />
        </span>
        <div>
          <h2>Цвет твоего космоса</h2>
          <p>Выбери настроение или собери собственную палитру. Изменения видны сразу.</p>
        </div>
      </div>
      <div className="palette-options" role="group" aria-label="Палитра интерфейса">
        {palettes.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={settings.palette === p.id}
            className={`palette-choice ${settings.palette === p.id ? 'selected' : ''}`}
            onClick={() => update({ palette: p.id, accentColor: p.accent, spaceColor: p.space })}
          >
            <span className="palette-sample" style={{ background: p.space }}>
              <i style={{ background: p.accent }} />
              <i style={{ background: p.accent, opacity: 0.4 }} />
              <i style={{ background: p.accent, opacity: 0.15 }} />
              {settings.palette === p.id && <Check size={18} style={{ color: p.accent }} />}
            </span>
            <strong>{p.title}</strong>
            <span>{p.description}</span>
          </button>
        ))}
      </div>
      <div className="appearance-controls">
        <label className="color-setting">
          <span>Свой акцент</span>
          <input
            aria-label="Свой цвет акцента"
            type="color"
            value={settings.accentColor}
            onChange={(e) => update({ palette: 'custom', accentColor: e.target.value })}
          />
        </label>
        <label className="color-setting">
          <span>Оттенок фона</span>
          <input
            aria-label="Свой оттенок фона"
            type="color"
            value={settings.spaceColor}
            onChange={(e) => update({ palette: 'custom', spaceColor: e.target.value })}
          />
        </label>
        <label className="font-setting">
          <span>
            <Type size={15} /> Размер текста
          </span>
          <select
            aria-label="Размер текста"
            value={settings.textScale}
            onChange={(e) =>
              update({ textScale: e.target.value as LearningState['settings']['textScale'] })
            }
          >
            <option value="normal">Обычный</option>
            <option value="comfortable">Комфортный · +10%</option>
            <option value="large">Крупный · +20%</option>
          </select>
        </label>
        <button
          type="button"
          className="text-button"
          onClick={() =>
            update({
              palette: 'cosmos',
              accentColor: '#bca5f5',
              spaceColor: '#0e0d16',
              textScale: 'normal',
              contrast: 'soft',
            })
          }
        >
          <RotateCcw size={15} />
          Сбросить оформление
        </button>
      </div>
      <p className="small muted">
        Основа остаётся тёмной. Светлота выбранных цветов подбирается для читаемого текста.
      </p>
      <label className="setting-toggle">
        <div>
          <strong>Повышенный контраст</strong>
          <span>Более яркие подписи и заметные границы элементов.</span>
        </div>
        <input
          type="checkbox"
          checked={settings.contrast === 'high'}
          onChange={(e) => update({ contrast: e.target.checked ? 'high' : 'soft' })}
        />
      </label>
      <div className="theme-preview">
        <span className="mini-tag">ТВОЯ ПАЛИТРА</span>
        <div>
          <h3>Сегодня получится понять больше.</h3>
          <p>Один небольшой шаг, затем самостоятельная попытка.</p>
        </div>
        <span className="preview-action">
          Продолжить <span aria-hidden="true">→</span>
        </span>
      </div>
    </section>
  );
}
