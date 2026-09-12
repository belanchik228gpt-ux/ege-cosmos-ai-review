import { useState } from 'react';
import {
  BookOpen,
  Brain,
  CalendarDays,
  ClipboardCheck,
  ChevronRight,
  FileText,
  Home,
  Landmark,
  Layers3,
  Menu,
  Orbit,
  Search,
  Settings2,
  ShieldCheck,
  Sigma,
  Sparkles,
  Telescope,
  TrendingUp,
  X,
} from 'lucide-react';
import { subjects, type SubjectId } from '../domain';
import type { Page } from './App';
import type { SchoolView } from '../domain/school-state';
import { ConversationHistory, type HistoryEntry } from './ConversationHistory';
const icons = { math: Sigma, russian: BookOpen, history: Landmark, social: Layers3 };
export function StudioNavigation({
  page,
  subject,
  name,
  title,
  onNavigate,
  onRoom,
  onSearch,
  onConnect,
  connected,
  schoolMode = false,
  schoolGrade = 10,
  schoolView = 'today',
  onMode,
  onSchoolView,
  history = [],
  onResume,
}: {
  page: Page;
  subject: SubjectId;
  name: string;
  title: string;
  onNavigate: (p: Page) => void;
  onRoom: (s: SubjectId) => void;
  onSearch: () => void;
  onConnect: () => void;
  connected: boolean;
  schoolMode?: boolean;
  schoolGrade?: number;
  schoolView?: SchoolView;
  onMode?: (mode: 'school' | 'ege') => void;
  onSchoolView?: (view: SchoolView) => void;
  history?: HistoryEntry[];
  onResume?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const go = (p: Page) => {
    onNavigate(p);
    setOpen(false);
  };
  const nav = (p: Page, label: string, Icon: typeof Home) => (
    <button key={p} className={page === p ? 'active' : ''} onClick={() => go(p)}>
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );
  return (
    <>
      {open && (
        <button
          className="studio-sidebar-shade"
          aria-label="Закрыть меню"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`studio-sidebar ${open ? 'open' : ''}`}>
        <button
          className="studio-brand"
          onClick={() => (schoolMode ? onSchoolView?.('today') : go('home'))}
        >
          <span className="studio-emblem">
            <Orbit size={28} />
          </span>
          <span>
            <b>Cosmos</b>
            <small>ТВОЯ ОРБИТА ЗНАНИЙ</small>
          </span>
        </button>
        <div className="school-mode-switch" aria-label="Режим обучения">
          <button
            className={schoolMode ? 'active' : ''}
            aria-pressed={schoolMode}
            onClick={() => {
              onMode?.('school');
              setOpen(false);
            }}
          >
            Школа
          </button>
          <button
            className={!schoolMode ? 'active' : ''}
            aria-pressed={!schoolMode}
            onClick={() => {
              onMode?.('ege');
              setOpen(false);
            }}
          >
            ЕГЭ
          </button>
        </div>
        <nav aria-label="Основная навигация">
          {nav('homework-desk', 'Домашние задания', BookOpen)}
          {schoolMode ? (
            <>
              <span className="studio-nav-label">МОЯ ШКОЛА · {schoolGrade} КЛАСС</span>
              {(
                [
                  { view: 'today', label: 'Сегодня', Icon: Home },
                  { view: 'subjects', label: 'Все школьные предметы', Icon: BookOpen },
                  { view: 'plan', label: 'Мой школьный план', Icon: CalendarDays },
                  { view: 'documents', label: 'Школьные конспекты', Icon: FileText },
                  { view: 'memory', label: 'Школьная память', Icon: Brain },
                ] as const
              ).map((item) => (
                <button
                  key={item.view}
                  className={page === 'school' && schoolView === item.view ? 'active' : ''}
                  onClick={() => {
                    onSchoolView?.(item.view);
                    setOpen(false);
                  }}
                >
                  <item.Icon size={18} />
                  <span>{item.label}</span>
                </button>
              ))}
              <span className="studio-nav-label">МОЁ ПРОСТРАНСТВО</span>
              {nav('backgrounds', 'Каталог фонов', Telescope)}
            </>
          ) : (
            <>
              <span className="studio-nav-label">ПОДГОТОВКА</span>
              {nav('home', 'Главная', Home)}
              {nav('plan', 'План подготовки', CalendarDays)}
              {nav('curriculum', 'Все темы ЕГЭ', BookOpen)}
              {nav('exam-workshop', 'Как решать ЕГЭ', ClipboardCheck)}
              {nav('hq', 'Мой прогресс', TrendingUp)}
              <span className="studio-nav-label">УЧЕБНЫЕ КОМНАТЫ</span>
              {subjects.map((s) => {
                const Icon = icons[s.id];
                return (
                  <button
                    className={page === 'room' && subject === s.id ? 'active' : ''}
                    key={s.id}
                    onClick={() => {
                      onRoom(s.id);
                      setOpen(false);
                    }}
                  >
                    <Icon size={18} style={{ color: s.color }} />
                    <span>{s.title}</span>
                    {page === 'room' && subject === s.id && <span className="studio-nav-dot" />}
                  </button>
                );
              })}
              <span className="studio-nav-label">МОЁ ПРОСТРАНСТВО</span>
              {nav('documents', 'Мои конспекты', FileText)}
              {nav('memory', 'Память Cosmos', Brain)}
              {nav('backgrounds', 'Каталог фонов', Telescope)}
            </>
          )}
        </nav>
        <ConversationHistory
          entries={history}
          onResume={(id) => {
            onResume?.(id);
            setOpen(false);
          }}
        />
        <div className="studio-sidebar-bottom">
          <button className="studio-cosmos-tip" onClick={onConnect}>
            <Sparkles size={20} />
            <strong>Ты справишься</strong>
            <p>По одному понятному шагу каждый день.</p>
            <span>
              {connected ? 'Преподаватель подключён' : 'Подключить преподавателя'}{' '}
              <ChevronRight size={14} />
            </span>
          </button>
          {nav('settings', 'Настройки', Settings2)}
          <button
            className="studio-profile"
            onClick={() => (schoolMode ? onSchoolView?.('memory') : go('memory'))}
          >
            <span>{name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{name}</strong>
              <small>
                {schoolMode ? `${schoolGrade} класс · школьный маршрут` : '10 класс · путь к ЕГЭ'}
              </small>
            </div>
            <ChevronRight size={14} />
          </button>
        </div>
      </aside>
      <header className="studio-topbar">
        <button
          className="icon-button studio-menu"
          aria-label="Открыть меню"
          onClick={() => setOpen(!open)}
        >
          <Menu size={21} />
        </button>
        <div className="studio-breadcrumb">
          <span>Моё пространство</span>
          <ChevronRight size={14} />
          <strong>{page === 'room' ? subjects.find((s) => s.id === subject)?.title : title}</strong>
        </div>
        <div>
          <button className="studio-top-search" onClick={onSearch}>
            <Search size={17} />
            <span>Быстрый поиск</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button className="studio-connection-pill" onClick={onConnect}>
            <span className={connected ? 'online' : ''} />
            {connected ? 'OpenAI подключён' : 'Подключить OpenAI'}
          </button>
        </div>
      </header>
    </>
  );
}
