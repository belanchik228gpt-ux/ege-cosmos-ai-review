import { ExternalLink, ShieldCheck, FileText } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';
import { PreferencesContext } from './PreferencesContext';
import { sources } from '../domain/sources';
import type { SubjectId } from '../domain';
type Reference = Awaited<ReturnType<NonNullable<Window['cosmos']>['listReferences']>>[number];
let referenceList: Promise<Reference[]> | undefined;

export function SourceLinks({
  ids,
  subject,
  label = 'Источники для сверки',
  compact = false,
}: {
  ids: string[];
  subject: SubjectId;
  label?: string;
  compact?: boolean;
}) {
  const preferences = useContext(PreferencesContext);
  const [expanded, setExpanded] = useState(preferences?.sourceDetailsExpanded || false);
  useEffect(
    () => setExpanded(preferences?.sourceDetailsExpanded || false),
    [preferences?.sourceDetailsExpanded],
  );
  const [references, setReferences] = useState<Reference[]>([]),
    [opening, setOpening] = useState(''),
    [problem, setProblem] = useState('');
  useEffect(() => {
    let live = true;
    if (window.cosmos?.listReferences) {
      referenceList ||= window.cosmos.listReferences().catch(() => []);
      referenceList.then((items) => {
        if (live) setReferences(items);
      });
    }
    return () => {
      live = false;
    };
  }, []);
  async function openPdf(id: string) {
    setOpening(id);
    setProblem('');
    try {
      const result = await window.cosmos?.openReference(id);
      if (!result?.ok) setProblem('Файл сейчас не открылся. Можно перейти к официальной ссылке.');
    } catch {
      setProblem('Файл сейчас не открылся. Можно перейти к официальной ссылке.');
    } finally {
      setOpening('');
    }
  }
  const items = [...new Set(ids)]
    .map((id) => sources.find((s) => s.id === id && s.subjects.includes(subject)))
    .filter((s) => s && s.url.startsWith('https://'));
  if (!items.length) return null;
  return (
    <details
      className={`source-links ${compact ? 'compact' : ''}`}
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <ShieldCheck size={14} />
        {label}
        <span>{items.length}</span>
      </summary>
      <div>
        {items.map(
          (source) =>
            source && (
              <div key={source.id} className="source-entry">
                <a href={source.url} target="_blank" rel="noreferrer">
                  <span>
                    <strong>{source.title}</strong>
                    <small>
                      {source.version} · Проверено{' '}
                      {new Date(source.checkedAt).toLocaleDateString('ru-RU')}
                    </small>
                    {!compact && (
                      <em>
                        {source.status === 'official-reference'
                          ? 'Официальная программа и формат экзамена.'
                          : 'Материал издателя для проверки учебных фактов и правил.'}
                      </em>
                    )}
                  </span>
                  <ExternalLink size={14} />
                </a>
                <div className="reference-buttons">
                  {references
                    .filter((ref) => ref.sourceId === source.id && ref.subject === subject)
                    .map((ref) => (
                      <button
                        type="button"
                        key={ref.id}
                        data-reference-id={ref.id}
                        disabled={!!opening}
                        aria-label={`Открыть PDF: ${ref.title}`}
                        title={ref.title}
                        onClick={() => void openPdf(ref.id)}
                      >
                        <FileText size={13} />
                        {opening === ref.id
                          ? 'Открываем…'
                          : ref.kind === 'codifier'
                            ? 'Кодификатор · PDF'
                            : ref.kind === 'navigator'
                              ? 'Навигатор · PDF'
                              : `Спецификация${ref.title.includes('профиль') ? ' · профиль' : ref.title.includes('базов') ? ' · база' : ''} · PDF`}
                      </button>
                    ))}
                </div>
              </div>
            ),
        )}
        {problem && (
          <p className="small" role="status">
            {problem}
          </p>
        )}
      </div>
    </details>
  );
}
