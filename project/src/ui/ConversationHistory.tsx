import { useState } from 'react';
import { History, Search } from 'lucide-react';
export interface HistoryEntry {
  id: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  completed: boolean;
}
export function ConversationHistory({
  entries,
  onResume,
}: {
  entries: HistoryEntry[];
  onResume: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const filtered = entries
    .filter((e) =>
      `${e.title} ${e.subtitle}`.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <section className="conversation-history" aria-label="История диалогов">
      <h3>
        <History size={16} /> История диалогов <small>{entries.length}</small>
      </h3>
      <label>
        <Search size={14} />
        <input
          aria-label="Поиск прошлых диалогов"
          placeholder="Найти тему или предмет"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="conversation-history-list">
        {filtered.slice(0, expanded || query ? undefined : 6).map((e) => (
          <button key={e.id} title={e.title} onClick={() => onResume(e.id)}>
            <strong>{e.title}</strong>
            <span>{e.subtitle}</span>
            <small>
              {new Date(e.updatedAt).toLocaleDateString('ru-RU')} ·{' '}
              {e.completed ? 'Завершён' : 'Продолжить'}
            </small>
          </button>
        ))}
      </div>
      {!filtered.length && (
        <p>{entries.length ? 'По этому запросу диалогов нет' : 'Здесь появятся твои занятия'}</p>
      )}
      {!query && filtered.length > 6 && (
        <button className="history-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Свернуть историю' : `Все диалоги (${filtered.length})`}
        </button>
      )}
    </section>
  );
}
