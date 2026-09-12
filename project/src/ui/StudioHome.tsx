import { type CSSProperties } from 'react';
import { Ton618Controls } from './Ton618';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Flame,
  Landmark,
  Layers3,
  Play,
  Plus,
  ShieldCheck,
  Sigma,
  Sparkles,
  Target,
} from 'lucide-react';
import { getStats, subjects, type LearningState, type SubjectId } from '../domain';
import { getGradeRoute, schoolTopicsBySubjectCounts } from '../domain/school-catalog';
import { localStudyDate } from '../domain/study-plan';
import { cloudPhaseNames } from '../domain/cloud-learning';
const icons = { math: Sigma, russian: BookOpen, history: Landmark, social: Layers3 };
export function StudioHome({
  state,
  onRoom,
  onContinue,
  onStart,
  onPlan,
  onCatalog,
  onDocument,
  onCheckin,
  onMinutes,
  onSettings,
}: {
  state: LearningState;
  onSettings: (s: Partial<LearningState['settings']>) => void;
  onRoom: (s: SubjectId) => void;
  onContinue: (id: string) => void;
  onStart: () => void;
  onPlan: () => void;
  onCatalog: () => void;
  onDocument: () => void;
  onCheckin: () => void;
  onMinutes: (n: number) => void;
}) {
  const stats = getStats(state),
    recent = Object.values(state.cloudSessions ?? {}).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ),
    active = recent.find((l) => !l.completedAt && l.messages.length > 0),
    minutes = state.planning?.days[localStudyDate()]?.budgetMinutes ?? state.profile.dailyMinutes;
  const day = state.planning?.days[localStudyDate()];
  const route = day?.entries.filter((b) => b.kind !== 'break') ?? [];
  return (
    <section className="studio-home">
      <div className="studio-page-heading">
        <div>
          <span className="studio-eyebrow">КАЖДЫЙ ШАГ ПРИБЛИЖАЕТ К ЦЕЛИ</span>
          <h1>
            {state.profile.name}, рад тебя видеть <span className="studio-wave">✦</span>
          </h1>
          <p>Твоё пространство для спокойной и понятной подготовки.</p>
        </div>
        <span className="studio-date">
          <CalendarDays size={16} />
          {new Date().toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            weekday: 'long',
          })}
        </span>
      </div>
      <Ton618Controls settings={state.settings} update={onSettings} />
      <div className="studio-hero-grid">
        <div className="studio-hero">
          <div className="studio-hero-content">
            <span className="studio-tag">
              <Sparkles size={14} />
              ТВОЙ СЛЕДУЮЩИЙ ШАГ
            </span>
            <h2>
              {active
                ? 'Продолжим с того места, где остановились'
                : 'Большая цель. Понятный шаг сегодня.'}
            </h2>
            <p>
              {active
                ? active.title
                : 'Разберём тему, попробуем самостоятельно и сохраним всё важное. Cosmos поможет держать направление.'}
            </p>
            <div className="studio-actions">
              <button
                className="button primary"
                onClick={() => (active ? onContinue(active.id) : onStart())}
              >
                <Play size={17} />
                {active ? 'Продолжить занятие' : 'Начать сегодняшнее занятие'}
                <ArrowRight size={16} />
              </button>
              <button className="studio-hero-link" onClick={onPlan}>
                Мой план <ChevronRight size={15} />
              </button>
            </div>
            <div className="studio-hero-meta">
              <Clock3 size={15} />
              {minutes} минут на сегодня <span />
              10 класс · ЕГЭ
            </div>
          </div>
        </div>
        <div className="studio-card studio-streak">
          <div className="studio-fire">
            <Flame size={31} />
          </div>
          <span className="studio-eyebrow">ТВОЙ РИТМ</span>
          <strong>
            {stats.streak}
            <small>дней подряд</small>
          </strong>
          <p>
            {stats.streak
              ? 'Продолжай в удобном темпе. Каждое осмысленное занятие имеет значение.'
              : 'Первая самостоятельная практика начнёт твою серию.'}
          </p>
          <div className="studio-week-dots">
            {'ПВCЧПСВ'.split('').map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <span className="studio-small">Серия по подтверждённым учебным попыткам</span>
        </div>
      </div>
      <div className="studio-section-title">
        <h2>Твои предметы</h2>
        <button className="text-button" onClick={onCatalog}>
          Все темы <ArrowRight size={15} />
        </button>
      </div>
      <div className="studio-subject-grid">
        {subjects.map((s) => {
          const Icon = icons[s.id],
            count = recent.filter((l) => l.subject === s.id && l.completedAt).length,
            mastered = Object.values(state.progress).filter((p) => p.mastery === 'mastered').length;
          return (
            <button
              className="studio-subject-card"
              key={s.id}
              style={{ '--topic-color': s.color } as CSSProperties}
              onClick={() => onRoom(s.id)}
            >
              <span className="studio-subject-icon">
                <Icon size={25} />
              </span>
              <h3>{s.title}</h3>
              <p>{schoolTopicsBySubjectCounts[s.id]} тем в каталоге</p>
              <div className="studio-subject-status">
                <span>{count ? `${count} завершённых разговоров` : 'Начать подготовку'}</span>
                <ChevronRight size={16} />
              </div>
              <div className="studio-subject-line" />
            </button>
          );
        })}
      </div>
      <div className="studio-home-bottom">
        <div className="studio-card studio-today">
          <div className="studio-section-title">
            <div>
              <h2>План на сегодня</h2>
              <p>Достаточно знать, какой шаг следующий.</p>
            </div>
            <button className="text-button" onClick={onPlan}>
              Изменить <ChevronRight size={14} />
            </button>
          </div>
          <label className="studio-time-choice">
            Сколько времени уделим?
            <select value={minutes} onChange={(e) => onMinutes(+e.target.value)}>
              {[15, 25, 30, 45, 60, 90, 120, 180, 240].includes(minutes) ? null : (
                <option value={minutes}>{minutes} минут</option>
              )}
              {[15, 25, 30, 45, 60, 90, 120, 180, 240].map((n) => (
                <option key={n} value={n}>
                  {n} минут
                </option>
              ))}
            </select>
          </label>
          {route.map((t, i) => (
            <button className="studio-day-row" key={t.id} onClick={onStart}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{subjects.find((s) => s.id === t.subject)?.title}</h3>
                <p>{t.title}</p>
              </div>
              <span>{t.minutes} мин</span>
              <ChevronRight size={17} />
            </button>
          ))}
          <p className="studio-small">
            Начальный маршрут по классу. В календаре можно распределить темы по дням и учесть свои
            школьные занятия.
          </p>
        </div>
        <div className="studio-home-side">
          <button className="studio-card studio-action-card" onClick={onCheckin}>
            <span className="studio-subject-icon">
              <ShieldCheck size={23} />
            </span>
            <div>
              <h3>Что я уже знаю?</h3>
              <p>Короткая диагностика по текущей теме</p>
            </div>
            <ChevronRight size={18} />
          </button>
          <button className="studio-card studio-action-card" onClick={onDocument}>
            <span className="studio-subject-icon">
              <FileText size={23} />
            </span>
            <div>
              <h3>Мои конспекты</h3>
              <p>
                {state.documents.length
                  ? `${state.documents.length} сохранённых документов`
                  : 'Сохраним объяснения, формулы и примеры'}
              </p>
            </div>
            <ChevronRight size={18} />
          </button>
          <div className="studio-card studio-target">
            <Target size={25} />
            <h3>Понимание важнее спешки</h3>
            <p>
              Тема становится освоенной после нескольких самостоятельных решений. Для 80+ на
              стобалльных экзаменах нужны ещё пробники; цель базовой математики — 5.
            </p>
            <button className="text-button" onClick={onCatalog}>
              Посмотреть маршрут <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
