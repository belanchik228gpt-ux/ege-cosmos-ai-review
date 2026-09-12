import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { SceneVisual } from './SceneVisuals';
import { getScene, scenes } from './registry';
import { timelineProgress } from './timeline';
import { useSceneClock } from './useSceneClock';
import type { LessonScene, SceneQuality } from './types';
import './scenes.css';

export type ScenePlayerProps = {
  sceneId: string;
  reducedMotion?: boolean;
  quality?: SceneQuality;
  autoplay?: boolean;
  initialSpeed?: 0.5 | 1 | 1.5 | 2;
  onComplete?: () => void;
  persistenceKey?: string;
  paused?: boolean;
  hideQuestion?: boolean;
};

function Player({
  scene,
  reducedMotion = false,
  quality = 'high',
  autoplay,
  initialSpeed = 1,
  onComplete,
  persistenceKey,
  paused = false,
  hideQuestion = false,
}: Omit<ScenePlayerProps, 'sceneId'> & { scene: LessonScene }) {
  const [systemReduced, setSystemReduced] = useState(
    () =>
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const staticMode = quality === 'static';
  const motionOff = reducedMotion || systemReduced || staticMode;
  const clock = useSceneClock(
    scene,
    quality,
    motionOff,
    autoplay,
    initialSpeed,
    persistenceKey,
    paused,
  );
  const { cursor, playing, speed, setSpeed, bodyRef, revision, manualFrame, goTo } = clock;
  const outlineRef = useRef<HTMLDetailsElement>(null);
  const reported = useRef(false);
  const completeCallback = useRef(onComplete);
  completeCallback.current = onComplete;
  const step = scene.steps[cursor.step];

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setSystemReduced(query.matches);
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);

  useEffect(() => {
    if (!cursor.complete) return;
    if (!reported.current) {
      reported.current = true;
      completeCallback.current?.();
    }
  }, [cursor.complete]);

  const replay = () => {
    reported.current = false;
    clock.replay();
  };
  const togglePlay = () => {
    if (cursor.complete) reported.current = false;
    clock.togglePlay();
  };
  const progress = timelineProgress(scene, cursor.step, cursor.elapsedMs);
  const atEnd = cursor.step === scene.steps.length - 1;
  const formulaVisible = manualFrame || motionOff || cursor.elapsedMs >= 1400;
  const next = () => {
    if (atEnd) clock.finish();
    else goTo(cursor.step + 1);
  };

  const keyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && outlineRef.current?.open) {
      event.preventDefault();
      outlineRef.current.open = false;
      event.currentTarget.focus();
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest('input,textarea,select,button,summary,a,[contenteditable="true"]')
    )
      return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(cursor.step - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      goTo(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      goTo(scene.steps.length - 1);
    } else if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) togglePlay();
    }
  };

  return (
    <section
      className={`scene-player sc-quality-${quality} ${motionOff ? 'sc-motion-off' : ''} ${manualFrame ? 'sc-manual-frame' : ''}`}
      aria-label={`Учебная сцена: ${scene.title}`}
      tabIndex={0}
      onKeyDown={keyboard}
      aria-keyshortcuts="Space ArrowLeft ArrowRight Home End"
    >
      <header className="sc-header">
        <div className="sc-chapter">
          <Sparkles size={15} />
          <span>СМОТРИ И РАССУЖДАЙ</span>
        </div>
        <details ref={outlineRef} className="sc-outline">
          <summary aria-label="Оглавление шагов">
            <span className="sc-counter">
              {String(cursor.step + 1).padStart(2, '0')}
              <span> / {String(scene.steps.length).padStart(2, '0')}</span>
            </span>
            <ChevronDown size={14} />
          </summary>
          <div className="sc-outline-list">
            <span>ШАГИ ОБЪЯСНЕНИЯ</span>
            {scene.steps.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-current={index === cursor.step ? 'step' : undefined}
                onClick={() => {
                  goTo(index);
                  if (outlineRef.current) {
                    outlineRef.current.open = false;
                    outlineRef.current.closest('section')?.focus();
                  }
                }}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                {item.title}
                {index < cursor.step && <Check size={13} />}
              </button>
            ))}
          </div>
        </details>
      </header>
      <div className="sc-body" ref={bodyRef}>
        <div className="sc-stage" role="img" aria-label={`${step.title}. ${step.narration}`}>
          <div className="sc-stage-aura" />
          <SceneVisual key={revision} sceneId={scene.id} step={cursor.step} />
        </div>
        <div className="sc-explanation" aria-live={playing ? 'off' : 'polite'}>
          <div className="sc-step-heading">
            <span className="sc-step-dot" />
            <h3>{step.title}</h3>
          </div>
          <p>{step.narration}</p>
          <div
            className={`sc-formula ${step.formula && formulaVisible ? 'sc-has-formula' : ''}`}
            aria-label={
              step.formula && formulaVisible ? `Формула или вывод: ${step.formula}` : undefined
            }
          >
            {(formulaVisible && step.formula) || (
              <span className="sc-observe">Сначала действие — затем вывод</span>
            )}
          </div>
          {atEnd && !hideQuestion && (
            <div className="sc-question">
              <span>ПОПРОБУЙ САМОСТОЯТЕЛЬНО</span>
              <p>{scene.question}</p>
            </div>
          )}
        </div>
      </div>
      <div className="sc-transport">
        <div
          className="sc-sr-only"
          role="progressbar"
          aria-label="Ход объяснения"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
        <div className="sc-timeline" role="group" aria-label="Шаги объяснения">
          {scene.steps.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={`sc-tick ${i < cursor.step ? 'sc-done' : ''} ${i === cursor.step ? 'sc-current' : ''}`}
              aria-label={`Шаг ${i + 1}: ${item.title}`}
              aria-current={i === cursor.step ? 'step' : undefined}
              title={`${i + 1}. ${item.title}`}
              onClick={() => goTo(i)}
            >
              <span
                style={{
                  width:
                    i < cursor.step
                      ? '100%'
                      : i === cursor.step
                        ? `${Math.max(5, (cursor.elapsedMs / item.durationMs) * 100)}%`
                        : '0%',
                }}
              />
            </button>
          ))}
        </div>
        <div className="sc-controls">
          <div className="sc-controls-left">
            <button
              type="button"
              className="sc-play"
              onClick={togglePlay}
              disabled={staticMode}
              aria-label={
                playing ? 'Пауза' : cursor.complete ? 'Воспроизвести заново' : 'Воспроизвести'
              }
              title={playing ? 'Пауза' : 'Воспроизвести'}
            >
              {playing ? (
                <Pause size={17} fill="currentColor" />
              ) : (
                <Play size={17} fill="currentColor" />
              )}
              <span>{playing ? 'Пауза' : 'Смотреть'}</span>
            </button>
            <button
              type="button"
              className="sc-icon-button"
              onClick={replay}
              aria-label="Повторить сцену"
              title="Повторить"
            >
              <RotateCcw size={17} />
            </button>
            <label className="sc-speed">
              <span className="sc-sr-only">Скорость воспроизведения</span>
              <select
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
                disabled={staticMode}
                aria-label="Скорость воспроизведения"
              >
                <option value="0.5">0,5×</option>
                <option value="0.75">0,75×</option>
                <option value="1">1×</option>
                <option value="1.5">1,5×</option>
                <option value="2">2×</option>
              </select>
            </label>
          </div>
          <div className="sc-controls-right">
            {motionOff && <span className="sc-motion-note">Без анимации</span>}
            <button
              type="button"
              className="sc-icon-button"
              onClick={() => goTo(cursor.step - 1)}
              disabled={cursor.step === 0}
              aria-label="Предыдущий шаг"
              title="Шаг назад"
            >
              <ArrowLeft size={18} />
            </button>
            <button
              type="button"
              className="sc-next"
              onClick={next}
              disabled={cursor.complete}
              aria-label={atEnd ? 'Завершить просмотр сцены' : 'Следующий шаг'}
            >
              {atEnd ? (
                <>
                  <span>{cursor.complete ? 'Просмотрено' : 'К вопросу'}</span>
                  <Check size={17} />
                </>
              ) : (
                <>
                  <span>Далее</span>
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ScenePlayer(props: ScenePlayerProps) {
  const scene = getScene(props.sceneId);
  if (!scene)
    return (
      <section className="scene-player sc-unavailable">
        <Sparkles size={22} />
        <p>Для этой темы визуальная сцена ещё не добавлена. Продолжим с объяснением и заданием.</p>
      </section>
    );
  return <Player key={scene.id} {...props} scene={scene} />;
}

export { scenes };
export default ScenePlayer;
