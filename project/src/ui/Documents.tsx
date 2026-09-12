import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  Download,
  Edit3,
  Eye,
  FileText,
  FolderOpen,
  Plus,
  Save,
  X,
} from 'lucide-react';
import {
  subjects,
  topics,
  type LearningDocument,
  type LearningState,
  type SubjectId,
} from '../domain';
import {
  buildDocumentContent,
  documentSessions,
  documentTypes,
  type DocumentKind,
} from '../domain/document-content';
import { Heading, IconBadge, dateLabel } from './App';
import { StudioDocumentCover } from './StudioDocumentCover';
import { renderDocument } from '../../shared/document-renderer.mjs';
import './documents.css';
import './reading-flow.css';

type Props = {
  state: LearningState;
  setState: React.Dispatch<React.SetStateAction<LearningState>>;
  notify: (s: string) => void;
  initialSessionId?: string;
};
const sessionDate = (date: string) =>
  new Date(date).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
function DocumentPreview({
  document,
  scale,
}: {
  document: LearningDocument;
  scale: 'comfortable' | 'large';
}) {
  const html = useMemo(
    () =>
      renderDocument({
        title: document.title,
        content: document.content,
        drawings: document.drawings,
        topicId: document.topicId,
        documentType: document.type,
        style: document.style,
        scale,
      }),
    [
      document.title,
      document.content,
      document.drawings,
      document.topicId,
      document.type,
      document.style,
      scale,
    ],
  );
  return (
    <iframe
      className="album-preview"
      title="Учебный альбом — предпросмотр"
      srcDoc={html}
      sandbox=""
    />
  );
}

export function Documents({ state, setState, notify, initialSessionId }: Props) {
  const initial =
    documentSessions(state).find((session) => session.id === initialSessionId) ||
    documentSessions(state)[0];
  const [editing, setEditing] = useState<LearningDocument | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [type, setType] = useState<DocumentKind>(documentTypes[0]);
  const [subject, setSubject] = useState<SubjectId>(initial?.subject || 'math');
  const [topicId, setTopicId] = useState(initial?.topicId || topics[0].id);
  const [sessionId, setSessionId] = useState(initial?.id || '');
  const [includeAnswers, setIncludeAnswers] = useState(false);
  const [includeModelReplies, setIncludeModelReplies] = useState(false);
  const [filter, setFilter] = useState('all');
  const [preview, setPreview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<'txt' | 'md' | 'html' | 'pdf' | 'docx'>('pdf');
  const [creating, setCreating] = useState(!!initialSessionId);
  useEffect(() => {
    if (!initialSessionId) return;
    const lesson = state.sessions[initialSessionId];
    if (!lesson || !topics.some((candidate) => candidate.id === lesson.topicId)) return;
    setSubject(lesson.subject);
    setTopicId(lesson.topicId);
    setSessionId(lesson.id);
    setCreating(true);
  }, [initialSessionId]);
  const lessons = documentSessions(state, subject, topicId);
  const selectedLesson = lessons.find((session) => session.id === sessionId);
  const topic = topics.find((topic) => topic.id === topicId && topic.subject === subject)!;
  const attempts = selectedLesson
    ? (state.progress[topicId]?.attempts || []).filter(
        (attempt) =>
          attempt.sessionId === selectedLesson.id &&
          topic.tasks.some((task) => task.id === attempt.taskId),
      )
    : [];
  const visibleDocuments = state.documents.filter(
    (document) => filter === 'all' || document.subject === filter,
  );

  function chooseSubject(value: SubjectId) {
    const lesson = documentSessions(state, value)[0];
    setSubject(value);
    setTopicId(lesson?.topicId || topics.find((topic) => topic.subject === value)!.id);
    setSessionId(lesson?.id || '');
  }
  function chooseTopic(value: string) {
    setTopicId(value);
    setSessionId(documentSessions(state, subject, value)[0]?.id || '');
  }
  function create() {
    if (editing && dirty) {
      setEditorOpen(true);
      return;
    }
    try {
      const now = new Date().toISOString();
      const content = buildDocumentContent(state, {
        type,
        subject,
        topicId,
        sessionId: selectedLesson?.id,
        includeAnswers,
        includeModelReplies,
        now,
      });
      setEditing({
        ...content,
        id: crypto.randomUUID(),
        createdAt: now,
        style: state.settings.documentStyle,
      });
      setEditorOpen(true);
      setDirty(true);
      setPreview(true);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : 'Не получилось собрать черновик. Выбери тему ещё раз.',
      );
    }
  }
  function edit(patch: Partial<LearningDocument>) {
    setEditing((document) => (document ? { ...document, ...patch } : null));
    setDirty(true);
  }
  async function save() {
    if (!editing || busy) return;
    if (!window.cosmos) {
      notify(
        'Экспорт файлов доступен в установленном приложении. Здесь можно проверить и отредактировать черновик.',
      );
      return;
    }
    setBusy(true);
    try {
      const result = await window.cosmos.exportDocument({
        title: editing.title,
        subject: editing.subject,
        content: editing.content,
        drawings: editing.drawings,
        format,
        topicId: editing.topicId,
        documentType: editing.type,
        style: editing.style || state.settings.documentStyle,
        scale: state.settings.documentScale,
      });
      if (!result.ok || !result.path) {
        notify(result.error || 'Файл не был сохранён. Попробуй ещё раз.');
        return;
      }
      const saved = { ...editing, path: result.path, updatedAt: new Date().toISOString() };
      setState((previous) => ({
        ...previous,
        documents: [saved, ...previous.documents.filter((document) => document.id !== saved.id)],
      }));
      setEditing(saved);
      setDirty(false);
      notify(`Файл ${format.toUpperCase()} сохранён. Документ добавлен в библиотеку.`);
    } catch {
      notify('Не удалось сохранить файл. Черновик остаётся открытым.');
    } finally {
      setBusy(false);
    }
  }
  async function openSaved() {
    if (!editing?.path || !window.cosmos) return;
    if (!(await window.cosmos.openPath(editing.path)))
      notify('Не удалось открыть сохранённый файл. Его можно экспортировать ещё раз.');
  }

  return (
    <div className="page documents-page">
      <Heading
        eyebrow="ТВОЯ УЧЕБНАЯ БИБЛИОТЕКА"
        title="Документы"
        description="Собери своё занятие в конспект, карточки или разбор ошибок. Всё можно прочитать и отредактировать перед сохранением."
        action={
          <button className="button primary" onClick={() => setCreating(true)}>
            <Plus size={18} />
            Новый документ
          </button>
        }
      />
      {creating && (
        <section className="panel document-create flow-document-create">
          <div className="document-create-intro">
            <IconBadge>
              <FileText size={22} />
            </IconBadge>
            <div>
              <h2>Сохрани то, что понял</h2>
              <p>
                Учебный альбом с иллюстрациями, понятными разборами и твоими результатами занятия.
              </p>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Свернуть создание документа"
              onClick={() => setCreating(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="document-form">
            <div className="two-inputs">
              <label>
                Тип документа
                <select
                  aria-label="Тип документа"
                  value={type}
                  onChange={(event) => setType(event.target.value as DocumentKind)}
                >
                  {documentTypes.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Занятие для документа
              <select
                aria-label="Занятие для документа"
                value={selectedLesson?.id || ''}
                onChange={(event) => {
                  const lesson = state.sessions[event.target.value];
                  if (lesson) {
                    setSubject(lesson.subject);
                    setTopicId(lesson.topicId);
                  }
                  setSessionId(lesson?.id || '');
                }}
              >
                <option value="">Без занятия — учебный шаблон</option>
                {documentSessions(state).map((value) => (
                  <option key={value.id} value={value.id}>
                    {topics.find((candidate) => candidate.id === value.topicId)?.title} ·{' '}
                    {sessionDate(value.startedAt)}
                  </option>
                ))}
              </select>
            </label>
            <p className="flow-context-line">
              <span className={`flow-subject-dot subject-${subject}`} />
              {subjects.find((candidate) => candidate.id === subject)?.title} · {topic.title}
            </p>
            <details className="flow-disclosure">
              <summary>Выбрать предмет и тему вручную</summary>
              <div className="two-inputs">
                <label>
                  Предмет
                  <select
                    value={subject}
                    onChange={(event) => chooseSubject(event.target.value as SubjectId)}
                  >
                    {subjects.map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Тема
                  <select value={topicId} onChange={(event) => chooseTopic(event.target.value)}>
                    {topics
                      .filter((value) => value.subject === subject)
                      .map((value) => (
                        <option key={value.id} value={value.id}>
                          {value.title}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </details>
            <details className="flow-disclosure">
              <summary>Состав документа и данные занятия</summary>
              <div className="document-session-note">
                {selectedLesson ? (
                  <>
                    <strong>
                      {selectedLesson.completedAt ? 'Итог занятия' : 'Промежуточные данные'}
                    </strong>
                    <span>
                      {' '}
                      {attempts.length} проверенных попыток ·{' '}
                      {attempts.filter((attempt) => attempt.correct && !attempt.assisted).length}{' '}
                      верных самостоятельно ·{' '}
                      {attempts.filter((attempt) => attempt.correct && attempt.assisted).length} с
                      помощью
                    </span>
                  </>
                ) : (
                  'В шаблон войдут материалы темы и источники. Результаты занятий не будут подставлены.'
                )}
              </div>
              <div className="document-options">
                <label className="document-option">
                  <input
                    type="checkbox"
                    checked={includeAnswers}
                    onChange={(event) => setIncludeAnswers(event.target.checked)}
                  />
                  <span>Добавить ответы к заданиям занятия для самопроверки</span>
                </label>
                <label className="document-option">
                  <input
                    type="checkbox"
                    checked={includeModelReplies}
                    onChange={(event) => setIncludeModelReplies(event.target.checked)}
                  />
                  <span>Включить ответы модели отдельным непроверенным разделом</span>
                </label>
              </div>
            </details>
            <button className="button primary" onClick={create}>
              <Plus size={18} />
              {editing && dirty ? 'Продолжить черновик' : 'Создать документ'}
              <ArrowRight size={17} />
            </button>
          </div>
        </section>
      )}
      <div className="section-title">
        <div>
          <h2>Сохранённые документы</h2>
          <p>Файлы появятся здесь после успешного экспорта.</p>
        </div>
        <select
          aria-label="Фильтр документов по предмету"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">Все предметы</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.title}
            </option>
          ))}
        </select>
      </div>
      {visibleDocuments.length ? (
        <div className="document-grid">
          {visibleDocuments.map((document) => (
            <button
              key={document.id}
              className={`saved-document flow-saved-document subject-${document.subject}`}
              onClick={() => {
                setEditing(document);
                setEditorOpen(true);
                setDirty(false);
                setPreview(true);
              }}
            >
              <StudioDocumentCover title={document.title} kind={document.type} />
              <span className="mini-tag">{document.type}</span>
              <h3>{document.title}</h3>
              <p>
                {dateLabel(document.createdAt)} ·{' '}
                {subjects.find((subject) => subject.id === document.subject)?.title ||
                  'Штаб подготовки'}
              </p>
              <span className="card-action">
                Открыть документ
                <ArrowRight size={16} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="panel empty-state">
          <FileText size={34} />
          <h3>
            {state.documents.length
              ? 'В этом предмете пока нет документов'
              : 'Здесь будут твои конспекты'}
          </h3>
          <p>Начни с одного занятия. Предпросмотр появится до сохранения файла.</p>
          {!creating && (
            <button className="button secondary" onClick={() => setCreating(true)}>
              Выбрать занятие <ArrowRight size={16} />
            </button>
          )}
        </div>
      )}
      {editing &&
        editorOpen &&
        createPortal(
          <div className="modal-backdrop cosmos-studio">
            <section
              className="document-modal album-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Редактор документа"
            >
              <div className="document-modal-header">
                <div>
                  <div className="eyebrow">
                    {dirty ? 'ЧЕРНОВИК · ИЗМЕНЕНИЯ ЕЩЁ НЕ СОХРАНЕНЫ' : 'ДОКУМЕНТ СОХРАНЁН'}
                  </div>
                  <input
                    aria-label="Название документа"
                    value={editing.title}
                    onChange={(event) => edit({ title: event.target.value })}
                    maxLength={160}
                  />
                </div>
                <button
                  className="icon-button"
                  aria-label="Закрыть документ"
                  disabled={busy}
                  onClick={() => setEditorOpen(false)}
                >
                  <X />
                </button>
              </div>
              <div className="document-tools">
                <div className="tabs">
                  <button className={!preview ? 'active' : ''} onClick={() => setPreview(false)}>
                    <Edit3 size={16} />
                    Редактирование
                  </button>
                  <button className={preview ? 'active' : ''} onClick={() => setPreview(true)}>
                    <Eye size={16} />
                    Предпросмотр
                  </button>
                </div>
                <label className="album-style-label">
                  Оформление
                  <select
                    aria-label="Оформление документа"
                    value={editing.style || state.settings.documentStyle}
                    onChange={(event) => edit({ style: event.target.value as 'cosmos' | 'paper' })}
                  >
                    <option value="cosmos">Фиолетовый Cosmos</option>
                    <option value="paper">Светлая бумага</option>
                  </select>
                </label>
              </div>
              {preview ? (
                <DocumentPreview
                  document={{ ...editing, style: editing.style || state.settings.documentStyle }}
                  scale={state.settings.documentScale}
                />
              ) : (
                <textarea
                  className="document-editor"
                  aria-label="Содержание документа"
                  value={editing.content}
                  onChange={(event) => edit({ content: event.target.value })}
                />
              )}
              <div className="document-actions">
                {editing.path && (
                  <button className="button secondary" onClick={openSaved}>
                    <FolderOpen size={17} />
                    Открыть сохранённый файл
                  </button>
                )}
                <label>
                  Формат
                  <select
                    aria-label="Формат"
                    value={format}
                    onChange={(event) => setFormat(event.target.value as typeof format)}
                  >
                    {(['pdf', 'docx', 'md', 'html', 'txt'] as const).map((value) => (
                      <option key={value} value={value}>
                        {value === 'docx' ? 'DOCX (текст)' : value.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button primary"
                  disabled={busy || !editing.title.trim() || !editing.content.trim()}
                  onClick={save}
                >
                  {busy ? <Save size={17} /> : <Download size={17} />}
                  {busy ? 'Сохраняем файл…' : 'Сохранить и экспортировать'}
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </div>
  );
}
