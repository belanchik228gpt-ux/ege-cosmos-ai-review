import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  FileText,
  Home,
  Palette,
  Search,
  Star,
  Target,
  Brain,
  Library,
} from 'lucide-react';
import type { Page } from './App';
import { searchQuickJumpTopics } from '../domain/quick-jump';
import { matchesSearchText } from './search-text';

export function QuickJump({
  open,
  onClose,
  onPage,
  onTopic,
  onSchoolTopic,
  onCurriculum,
  onResume,
  bookmarks,
}: {
  open: boolean;
  onClose: () => void;
  onPage: (page: Page) => void;
  onTopic: (id: string) => void;
  onSchoolTopic?: (id: string) => void;
  onCurriculum: (id?: string) => void;
  onResume: () => void;
  bookmarks: string[];
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(''),
    [active, setActive] = useState(0);
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      if (!dialog.current?.open) dialog.current?.showModal();
      input.current?.focus();
    } else dialog.current?.close();
  }, [open]);
  const q = query.toLocaleLowerCase('ru').trim();
  const actions = [
    {
      id: 'checkin',
      title: 'Короткая диагностика знаний',
      detail: 'Три вопроса в переписке с Cosmos',
      icon: Brain,
      run: () => onPage('checkin'),
    },
    {
      id: 'homework',
      title: 'Домашняя работа',
      detail: 'Выданные задания и повторения',
      icon: BookOpen,
      run: () => onPage('homework'),
    },
    {
      id: 'resume',
      title: 'Продолжить занятие',
      detail: 'Вернуться к последней незавершённой теме',
      icon: BookOpen,
      run: onResume,
    },
    { id: 'home', title: 'Главная', detail: 'Мой космос', icon: Home, run: () => onPage('home') },
    {
      id: 'plan',
      title: 'План на неделю и месяц',
      detail: 'Дни, темы, повторы и школьная программа',
      icon: Target,
      run: () => onPage('plan'),
    },
    {
      id: 'curriculum',
      title: 'Все темы ЕГЭ',
      detail: 'Каталог ФИПИ и свои вопросы',
      icon: Library,
      run: () => onCurriculum(),
    },
    {
      id: 'knowledge',
      title: 'База знаний',
      detail: 'Локальные карточки и проверенные источники',
      icon: Library,
      run: () => onPage('knowledge'),
    },
    {
      id: 'documents',
      title: 'Создать документ',
      detail: 'Конспекты и реальные результаты занятий',
      icon: FileText,
      run: () => onPage('documents'),
    },
    {
      id: 'settings',
      title: 'Палитра и настройки',
      detail: 'Цвет, размер текста и комфорт',
      icon: Palette,
      run: () => onPage('settings'),
    },
    {
      id: 'memory',
      title: 'Что Cosmos помнит обо мне',
      detail: 'Учебные факты и профиль',
      icon: Brain,
      run: () => onPage('memory'),
    },
  ];
  const rows = [
    ...actions.filter((a) => matchesSearchText(a.title + ' ' + a.detail, q)),
    ...searchQuickJumpTopics(q,bookmarks).map((topic)=>({
      id:topic.id,title:topic.title,detail:topic.detail,
      icon:topic.pinned?Star:topic.kind==='school'?Library:BookOpen,
      run:()=>topic.kind==='school'?(onSchoolTopic?onSchoolTopic(topic.id):onCurriculum(topic.curriculumNodeId)):onTopic(topic.id),
    })),
  ].slice(0, q ? 14 : 10);
  function choose(index: number) {
    const row = rows[index];
    if (row) {
      onClose();
      row.run();
    }
  }
  return (
    <dialog
      ref={dialog}
      className="command-dialog"
      aria-label="Быстрый переход"
      onCancel={onClose}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) {
          const box = dialog.current.getBoundingClientRect();
          if (
            e.clientX < box.left ||
            e.clientX > box.right ||
            e.clientY < box.top ||
            e.clientY > box.bottom
          )
            onClose();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          setActive((i) =>
            rows.length ? (i + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length : 0,
          );
        } else if (e.key === 'Enter' && e.target === input.current) {
          e.preventDefault();
          choose(active);
        }
      }}
    >
      <div className="command-search">
        <Search size={22} />
        <input
          ref={input}
          value={query}
          aria-label="Поиск темы или действия"
          placeholder="Куда отправимся? Тема или действие…"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
        />
        <button type="button" onClick={onClose} aria-label="Закрыть быстрый переход">
          Esc
        </button>
      </div>
      <div className="command-results">
        <p>{q ? 'РЕЗУЛЬТАТЫ ПОИСКА' : 'ПОД РУКОЙ'}</p>
        {rows.map((row, i) => (
          <button
            className="command-result"
            type="button"
            data-active={i === active}
            key={row.id}
            onClick={() => choose(i)}
          >
            <row.icon size={19} />
            <span>
              <strong>{row.title}</strong>
              <small>{row.detail}</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
        ))}
        {!rows.length && (
          <div className="empty-state">
            <p>Такой темы пока нет. Попробуй название предмета или открой базу знаний.</p>
          </div>
        )}
      </div>
      <div className="command-footer">
        <span>↑ ↓ — выбрать</span>
        <span>Enter — открыть</span>
        <span>Ctrl + K — быстрый переход</span>
      </div>
    </dialog>
  );
}
