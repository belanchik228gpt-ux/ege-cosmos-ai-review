import { useRef, useState } from 'react';
import { ArrowLeft, BookOpen, ImagePlus, Plus, X } from 'lucide-react';
import type { LearningState } from '../domain';
import { createHomeworkLesson } from '../domain/homework-desk';
import { schoolSubjects, type SchoolGrade, type SchoolSubjectId } from '../domain/school-program';
import type { SchoolState } from '../domain/school-state';
import { SchoolRoom, type UpdateSchool } from './SchoolRoom';
import { SchoolDocuments } from './SchoolWorkspace';
import type { OpenAIController } from './useOpenAI';
import './homework-desk.css';

export function HomeworkDesk({
  desk,
  update,
  settings,
  name,
  ai,
  onConnect,
  notify,
}: {
  desk: SchoolState;
  update: UpdateSchool;
  settings: LearningState['settings'];
  name: string;
  ai: OpenAIController;
  onConnect: () => void;
  notify: (s: string) => void;
}) {
  const [subject, setSubject] = useState<SchoolSubjectId>(desk.subject),
    [grade, setGrade] = useState<SchoolGrade>(desk.grade);
  const [text, setText] = useState(''),
    [photo, setPhoto] = useState<{ dataUrl: string; name: string }>(),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState('');
  const file = useRef<HTMLInputElement>(null),
    selection = useRef(0);
  const lesson = desk.view === 'room' ? desk.lessons[desk.activeLessonId || ''] : undefined;
  const back = () => update((s) => ({ ...s, view: 'today' }));
  async function attach(selected?: File) {
    const token = ++selection.current;
    if (!selected) return;
    if (!/^image\/(png|jpeg)$/.test(selected.type) || selected.size > 10 * 1024 * 1024) {
      notify('Выбери PNG или JPEG до 10 МБ.');
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(selected);
      });
      if (token === selection.current) setPhoto({ dataUrl, name: selected.name });
    } catch {
      notify('Фото не удалось прочитать. Попробуй другой файл.');
    }
  }
  async function create() {
    if (busy || (!text.trim() && !photo)) return;
    setBusy(true);
    try {
      const saved = photo ? await window.cosmos?.saveHomeworkImage(photo) : undefined;
      if (photo && (!saved?.ok || !saved.id)) {
        notify('Не удалось сохранить фото на компьютере. Работа пока не создана — попробуй снова.');
        return;
      }
      const next = createHomeworkLesson(subject, grade, {
        text,
        ...(saved?.id ? { imageId: saved.id, imageName: photo?.name } : {}),
      });
      update((s) => ({
        ...s,
        subject,
        grade,
        view: 'room',
        activeLessonId: next.id,
        lessons: { ...s.lessons, [next.id]: next },
      }));
      setText('');
      setPhoto(undefined);
    } catch {
      notify('Не удалось открыть работу. Условие осталось в форме.');
    } finally {
      setBusy(false);
    }
  }
  if (lesson)
    return (
      <SchoolRoom
        key={lesson.id}
        school={desk}
        lesson={lesson}
        settings={settings}
        name={name}
        update={update}
        ai={ai}
        onConnect={onConnect}
        onBack={back}
        onDocument={() => update((s) => ({ ...s, view: 'documents' }))}
        notify={notify}
      />
    );
  if (desk.view === 'documents')
    return (
      <>
        <button className="button" onClick={back}>
          <ArrowLeft size={16} />К домашним заданиям
        </button>
        <SchoolDocuments
          homework
          school={desk}
          update={update}
          settings={settings}
          notify={notify}
        />
      </>
    );
  const works = Object.values(desk.lessons)
    .filter(
      (l) =>
        !query.trim() ||
        `${l.title} ${schoolSubjects.find((s) => s.id === l.subject)?.title}`
          .toLocaleLowerCase('ru')
          .includes(query.toLocaleLowerCase('ru')),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <section className="homework-desk" aria-label="Разбор домашних заданий">
      <header>
        <span className="school-eyebrow">ТВОЯ ЗАДАЧА · ТВОЙ ТЕМП</span>
        <h1>Домашние задания</h1>
        <p>
          Пришли условие. Разберём по шагам, исправим ошибки и попробуем похожее самостоятельно.
        </p>
      </header>
      <div className="homework-layout">
        <form
          className="school-panel homework-new"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <h2>
            <Plus size={21} /> Новая работа
          </h2>
          <div className="homework-selectors">
            <label>
              Предмет
              <select
                aria-label="Предмет домашней работы"
                value={subject}
                disabled={busy}
                onChange={(e) => {
                  const next = schoolSubjects.find((s) => s.id === e.target.value)!;
                  setSubject(next.id);
                  if (!next.grades.includes(grade)) setGrade(next.grades[0]);
                }}
              >
                {schoolSubjects.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Класс
              <select
                aria-label="Класс домашней работы"
                value={grade}
                disabled={busy}
                onChange={(e) => setGrade(Number(e.target.value) as SchoolGrade)}
              >
                {schoolSubjects
                  .find((s) => s.id === subject)!
                  .grades.map((g) => (
                    <option key={g} value={g}>
                      {g} класс
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label>
            Условие задания
            <textarea
              aria-label="Условие домашнего задания"
              maxLength={12000}
              value={text}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              placeholder="Например: реши уравнение 3(x − 2) = 15. Я не понимаю, с чего начать. Можно отправить только фото."
            />
          </label>
          {photo && (
            <div className="homework-upload">
              <img src={photo.dataUrl} alt="Фото новой домашней работы" />
              <span>{photo.name}</span>
              <button
                type="button"
                disabled={busy}
                aria-label="Убрать фото условия"
                onClick={() => {
                  selection.current++;
                  setPhoto(undefined);
                }}
              >
                <X size={18} />
              </button>
            </div>
          )}
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(e) => {
              void attach(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <div className="school-actions">
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={() => file.current?.click()}
            >
              <ImagePlus size={18} />
              Прикрепить фото
            </button>
            <button
              className="button primary"
              disabled={busy || (!text.trim() && !photo)}
              type="submit"
            >
              {busy ? 'Сохраняю условие…' : 'Открыть разбор'} <BookOpen size={18} />
            </button>
          </div>
          <p className="school-muted">
            В математике условие будет закреплено над белым листом. Рисуй решение мышкой и отправляй
            на проверку.
          </p>
        </form>
        <aside className="school-panel homework-method">
          <span className="school-eyebrow">ОТ УСЛОВИЯ К САМОСТОЯТЕЛЬНОСТИ</span>
          <ol>
            <li>
              <b>Поймём задание</b>
              <span>Что известно, что нужно найти и где возник вопрос.</span>
            </li>
            <li>
              <b>Разберём один шаг</b>
              <span>Простое объяснение и рисунок к твоему примеру.</span>
            </li>
            <li>
              <b>Проверим твою попытку</b>
              <span>Найдём первый неверный переход и исправим его.</span>
            </li>
            <li>
              <b>Попробуем похожее</b>
              <span>Новый пример без готового ответа, затем итог работы.</span>
            </li>
          </ol>
        </aside>
      </div>
      <div className="homework-history-heading">
        <h2>
          Мои работы <small>{Object.keys(desk.lessons).length}</small>
        </h2>
        <button className="button" onClick={() => update((s) => ({ ...s, view: 'documents' }))}>
          Конспекты домашних работ
        </button>
      </div>
      <input
        className="homework-search"
        aria-label="Поиск домашних работ"
        placeholder="Найти работу или предмет…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="homework-cards">
        {works.map((l) => (
          <button
            key={l.id}
            className="school-panel homework-work"
            style={{ borderTopColor: schoolSubjects.find((s) => s.id === l.subject)?.color }}
            onClick={() =>
              update((s) => ({
                ...s,
                view: 'room',
                activeLessonId: l.id,
                grade: l.grade,
                subject: l.subject,
              }))
            }
          >
            <small>
              {schoolSubjects.find((s) => s.id === l.subject)?.title} · {l.grade} класс
            </small>
            <h3>{l.title}</h3>
            <p>
              {l.completedAt ? 'Разбор завершён' : 'Продолжить разбор'} ·{' '}
              {l.messages.filter((m) => m.role === 'user').length} попыток и вопросов
            </p>
            <span>{new Date(l.updatedAt).toLocaleDateString('ru-RU')}</span>
          </button>
        ))}
      </div>
      {!works.length && (
        <p className="school-muted">
          {query
            ? 'По этому запросу работ нет.'
            : 'Здесь появятся твои работы. К любой можно вернуться из истории слева.'}
        </p>
      )}
    </section>
  );
}
