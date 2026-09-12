import { ChevronRight, Target } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import './tutor-workspace.css';

export function LessonProgress({
  title,
  completed,
  total,
  request,
  phase,
  next,
  children,
}: {
  title: string;
  completed: number;
  total: number;
  request: string;
  phase: number;
  next?: string;
  children?: React.ReactNode;
}) {
  const value = Math.min(total, Math.max(0, completed));
  const compassRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const compass = compassRef.current;
    const workspace = compass?.closest<HTMLElement>('.tutor-workspace');
    if (!compass || !workspace) return;
    const sync = () => {
      workspace.style.setProperty(
        '--compass-height',
        `${compass.getBoundingClientRect().height}px`,
      );
      const grid = workspace.querySelector('.tutor-grid');
      if (grid) {
        const top = Math.max(
          compass.getBoundingClientRect().bottom + 14,
          grid.getBoundingClientRect().top,
        );
        workspace.style.setProperty(
          '--conversation-space',
          `${Math.max(300, window.innerHeight - top - 16)}px`,
        );
      }
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(compass);
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      workspace.style.removeProperty('--compass-height');
      workspace.style.removeProperty('--conversation-space');
    };
  }, []);
  return (
    <section ref={compassRef} className="lesson-compass" aria-label="Прогресс занятия">
      <div className="compass-heading">
        <div>
          <span className="eyebrow">СЕЙЧАС ИЗУЧАЕМ</span>
          <h1>{title}</h1>
        </div>
        <span className="compass-count">
          <b>{value}</b> / {total}
          <small>заданий пройдено</small>
        </span>
        {children}
      </div>
      <progress
        aria-label="Пройденные задания занятия, не освоение темы"
        max={Math.max(1, total)}
        value={value}
      />
      <div className="compass-phases">
        {['Читаем условие', 'Разбираемся', 'Твоя попытка', 'Итог'].map((label, i) => (
          <span
            key={label}
            data-current={i === phase}
            aria-current={i === phase ? 'step' : undefined}
          >
            <b>{i + 1}</b>
            {label}
            {i < 3 && <ChevronRight size={13} />}
          </span>
        ))}
      </div>
      <div className="compass-request">
        <Target size={19} />
        <div>
          <strong>{value === total ? 'Следующий шаг' : 'Что нужно сейчас'}</strong>
          <p>{request}</p>
        </div>
      </div>
      {next && <div className="compass-next">Дальше: {next}</div>}
    </section>
  );
}
