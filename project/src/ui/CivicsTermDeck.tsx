import { useState } from 'react';
import registry from '../../shared/civics-terms.json';
export function CivicsTermDeck({ focus = '' }: { focus?: string }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(
    () =>
      registry.terms.find((t) =>
        [t.term, ...t.topicAliases].some(
          (a) => a.toLocaleLowerCase('ru') === focus.toLocaleLowerCase('ru'),
        ),
      )?.id || registry.terms[0].id,
  );
  const [reveal, setReveal] = useState(false);
  const term = registry.terms.find((t) => t.id === selected)!;
  const choices = registry.terms.filter((t) =>
    `${t.term} ${t.plainDefinition}`
      .toLocaleLowerCase('ru')
      .includes(query.toLocaleLowerCase('ru')),
  );
  return (
    <details className="school-panel term-deck">
      <summary>
        Термины без путаницы <small>{registry.terms.length} карточек · пример и самопроверка</small>
      </summary>
      <div className="term-deck-layout">
        <div>
          <label>
            Найти термин
            <input
              aria-label="Найти термин"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Например, инфляция"
            />
          </label>
          <div className="term-deck-choices">
            {choices.map((t) => (
              <button
                key={t.id}
                aria-pressed={t.id === selected}
                onClick={() => {
                  setSelected(t.id);
                  setReveal(false);
                }}
              >
                {t.term}
              </button>
            ))}
          </div>
          {!choices.length && (
            <p>Такой карточки пока нет. Термин можно обсудить с преподавателем.</p>
          )}
        </div>
        <article className="term-deck-card" key={term.id}>
          <small>ПОНИМАЮ СМЫСЛ</small>
          <h3>{term.term}</h3>
          <p className="term-deck-plain">{term.plainDefinition}</p>
          <div className="term-deck-pair">
            <section>
              <b>Пример</b>
              <p>{term.example}</p>
            </section>
            <section>
              <b>Не путай с этим</b>
              <p>{term.counterexample}</p>
            </section>
          </div>
          <details>
            <summary>Точное определение и границы понятия</summary>
            <p>{term.formalDefinition}</p>
            <p>{term.boundary}</p>
            {registry.sources
              .filter((s) => term.sourceIds.includes(s.id))
              .map((s) => (
                <a key={s.id} href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
              ))}
          </details>
          <div className="term-deck-question">
            <b>Проверь себя</b>
            <p>{term.question}</p>
            <button className="button" onClick={() => setReveal(!reveal)}>
              {reveal ? 'Скрыть объяснение' : 'Сверить своё рассуждение'}
            </button>
            {reveal && <p>{term.answer}</p>}
          </div>
          <small>
            Самопроверка помогает вспомнить понятие. Просмотр ответа не засчитывается как освоение
            темы.
          </small>
        </article>
      </div>
    </details>
  );
}
