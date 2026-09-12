import { useMemo, useState, useEffect, useRef, type KeyboardEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { TutorDrawing } from '../domain/cloud-learning';
import type { LearningState, SubjectId } from '../domain/types';
import type { SchoolSubjectId } from '../domain/school-program/types';
import { useSceneClock } from './useSceneClock';
import type { LessonScene } from './types';
import { DialogueArt } from './DialogueArt';
import { historyStageContent } from '../../shared/history-atlas.mjs';
import { normalizeCoordinateDrawing } from '../../shared/drawing-coordinate-points.cjs';
import './dialogue-scene.css';

export function DialogueScene({
  drawing: suppliedDrawing,
  id,
  subject,
  settings,
  active = true,
  autoplay = true,
}: {
  drawing: TutorDrawing;
  id: string;
  subject: SubjectId | SchoolSubjectId;
  settings: LearningState['settings'];
  active?: boolean;
  autoplay?: boolean;
}) {
  const drawing = useMemo(
    () =>
      suppliedDrawing.figure === 'history-map'
        ? {
            ...suppliedDrawing,
            steps: suppliedDrawing.steps.map((step) => ({
              ...step,
              ...historyStageContent(step.values),
            })),
          }
        : normalizeCoordinateDrawing(suppliedDrawing),
    [suppliedDrawing],
  );
  const root = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false),
    [screenError, setScreenError] = useState(false);
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === root.current);
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && document.fullscreenElement === root.current) {
        event.preventDefault();
        void document.exitFullscreen().catch(() => setScreenError(true));
      }
    };
    document.addEventListener('fullscreenchange', changed);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      document.removeEventListener('keydown', escape, true);
    };
  }, []);
  async function expand() {
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
      setScreenError(false);
    } catch {
      setScreenError(true);
    }
  }
  const [systemReduced, setSystemReduced] = useState(
    () =>
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)'),
      changed = () => setSystemReduced(query.matches);
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);
  const motionOff = settings.reducedMotion || systemReduced || settings.quality === 'static';
  const scene = useMemo<LessonScene>(
    () => ({
      id,
      subject,
      topic: id,
      title: drawing.title,
      eyebrow: 'Разбираемся наглядно',
      autoplay: true,
      replayable: true,
      durationMs: drawing.steps.length * 4300,
      steps: drawing.steps.map((step, i) => ({
        id: `${id}-${i}`,
        title: drawing.title,
        narration: step.caption,
        durationMs: 4300,
        visualAction: drawing.kind,
        highlights: step.labels ?? [],
        formula: step.formula,
      })),
      reducedMotionFrame: { step: 0, description: drawing.steps[0]?.caption ?? drawing.title },
      question: '',
    }),
    [drawing, id, subject],
  );
  const clock = useSceneClock(
    scene,
    settings.quality,
    motionOff,
    active && autoplay && settings.sceneAutoplay,
    settings.sceneSpeed,
    id,
    !active,
  );
  const index = Math.min(clock.cursor.step, drawing.steps.length - 1),
    step = drawing.steps[index];
  const progress =
    motionOff || clock.manualFrame || (!autoplay && !clock.playing && clock.cursor.elapsedMs === 0)
      ? 1
      : 1 - Math.pow(1 - Math.min(1, clock.cursor.elapsedMs / 1800), 3);
  const keyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (
      (event.target as HTMLElement).closest(
        'input,textarea,select,button,a,[contenteditable="true"]',
      ) ||
      !active
    )
      return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      clock.goTo(index - 1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      clock.goTo(index + 1);
    }
    if (event.code === 'Space' && !motionOff) {
      event.preventDefault();
      clock.togglePlay();
    }
  };
  if (!step) return null;
  return (
    <section
      ref={root}
      className={`dialogue-scene ds-${drawing.kind}`}
      data-motion={motionOff ? 'off' : 'on'}
      data-quality={settings.quality}
      data-step={index}
      data-playing={clock.playing}
      aria-label={drawing.title}
      tabIndex={0}
      onKeyDown={keyboard}
    >
      <header>
        <span>
          <Sparkles size={16} aria-hidden="true" />
          {drawing.title}
        </span>
        <small>
          {index + 1} / {drawing.steps.length}
        </small>
        <button
          className="ds-expand"
          aria-label={fullscreen ? 'Вернуться к переписке' : 'Рисунок целиком'}
          title={fullscreen ? 'Вернуться к переписке · Esc' : 'Рисунок целиком'}
          onClick={() => void expand()}
        >
          {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          <span>{fullscreen ? 'К переписке' : 'Целиком'}</span>
        </button>
      </header>
      {screenError && (
        <p role="status">
          Полный экран сейчас недоступен. Рисунок можно смотреть в расширенном чате.
        </p>
      )}
      <div ref={clock.bodyRef} className="dialogue-scene-body">
        <DialogueArt
          drawing={drawing}
          step={step}
          progress={progress}
          index={index}
          subject={subject}
        />
      </div>
      <div className="ds-caption">
        <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <p>{step.caption}</p>
      </div>
      <footer>
        <div className="ds-controls">
          <button
            aria-label="Предыдущий кадр"
            title="Предыдущий кадр"
            onClick={() => clock.goTo(index - 1)}
            disabled={index === 0 || !active}
          >
            <ArrowLeft size={17} />
          </button>
          <button
            aria-label={clock.playing ? 'Пауза' : 'Воспроизвести'}
            title={clock.playing ? 'Пауза' : 'Воспроизвести'}
            onClick={clock.togglePlay}
            disabled={motionOff || !active}
          >
            {clock.playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <button
            aria-label="Следующий кадр"
            title="Следующий кадр"
            onClick={() => clock.goTo(index + 1)}
            disabled={index === drawing.steps.length - 1 || !active}
          >
            <ArrowRight size={17} />
          </button>
          <button
            aria-label="Повторить рисунок"
            title="Повторить рисунок"
            onClick={clock.replay}
            disabled={!active}
          >
            <RotateCcw size={17} />
          </button>
        </div>
        <div className="ds-dots">
          {drawing.steps.map((_, i) => (
            <button
              key={i}
              aria-label={`Кадр ${i + 1}`}
              aria-current={i === index ? 'step' : undefined}
              onClick={() => clock.goTo(i)}
              disabled={!active}
            />
          ))}
        </div>
        <select
          aria-label="Скорость рисунка"
          value={clock.speed}
          onChange={(event) => clock.setSpeed(Number(event.target.value))}
          disabled={motionOff || !active}
        >
          {[0.5, 1, 1.5, 2].map((speed) => (
            <option key={speed} value={speed}>
              {speed}×
            </option>
          ))}
        </select>
      </footer>
    </section>
  );
}
