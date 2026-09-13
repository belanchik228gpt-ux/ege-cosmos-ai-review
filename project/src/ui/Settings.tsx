import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  FolderOpen,
  Gauge,
  Image,
  Import,
  Monitor,
  Moon,
  Settings2,
  ShieldCheck,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { type LearningState, type SubjectId } from '../domain';
import { createSchoolState } from '../domain/school-state';
import type { SchoolGrade } from '../domain/school-program';
import { sources } from '../domain/sources';
import { Heading, IconBadge } from './App';
import { OrbitArt } from './OrbitArt';
import { Ton618Catalog } from './Ton618';
import { AppearanceSettings } from './AppearanceSettings';
import { PersonalizationSettings } from './PersonalizationSettings';
import './reading-flow.css';
type Props = {
  page: 'settings' | 'backgrounds';
  state: LearningState;
  setState: React.Dispatch<React.SetStateAction<LearningState>>;
  notify: (s: string) => void;
  model: { available: boolean; model: string };
  saveError: boolean;
  connected: boolean;
  onConnect: () => void;
};
export function Settings({ page, state, setState, notify, model, saveError, connected, onConnect }: Props) {
  const [tab, setTab] = useState('visual');
  const [visualTab, setVisualTab] = useState('color');
  const [sourceSubject, setSourceSubject] = useState<SubjectId | 'all'>('all');
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourcePage, setSourcePage] = useState(0);
  const filteredSources = sources.filter(
    (source) =>
      (sourceSubject === 'all' || source.subjects.includes(sourceSubject)) &&
      `${source.title} ${source.publisher}`
        .toLocaleLowerCase('ru')
        .includes(sourceQuery.trim().toLocaleLowerCase('ru')),
  );
  const sourcePages = Math.max(1, Math.ceil(filteredSources.length / 6));
  const currentSourcePage = Math.min(sourcePage, sourcePages - 1);
  const [diagnostics, setDiagnostics] = useState<unknown[]>([]);
  const [backgrounds, setBackgrounds] = useState<any[]>([]);
  const [runtimeStatus, setRuntimeStatus] = useState<CosmosModelStatus | null>(null);
  const [backendSaving, setBackendSaving] = useState(false);

  useEffect(() => {
    if (page !== 'settings' || tab !== 'model' || !window.cosmos) return;
    let active = true,
      timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const status = await window.cosmos!.modelStatus();
        if (active) setRuntimeStatus(status);
      } catch {
        /* Local lessons stay available if model status cannot be read. */
      } finally {
        if (active) timer = setTimeout(refresh, 2000);
      }
    };
    void refresh();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [page, tab]);
  const currentModel = runtimeStatus || model;
  const modelLocked = backendSaving || runtimeStatus?.busy || runtimeStatus?.state === 'starting';
  async function changeBackend(backend: 'auto' | 'gpu' | 'cpu') {
    if (!window.cosmos || modelLocked) return;
    setBackendSaving(true);
    try {
      const result = await window.cosmos.updateModelBackend(backend);
      if (!result.ok) {
        notify(result.error || 'Не получилось изменить режим модели.');
        return;
      }
      setRuntimeStatus(await window.cosmos.modelStatus());
      notify('Режим сохранён. Он будет использован при следующем вопросе.');
    } catch {
      notify('Не получилось сохранить режим. Попробуй ещё раз.');
    } finally {
      setBackendSaving(false);
    }
  }
  useEffect(() => {
    if (page === 'settings' && tab === 'diagnostics')
      window.cosmos
        ?.getDiagnostics()
        .then(setDiagnostics)
        .catch(() => {});
  }, [tab, page]);
  useEffect(() => {
    window.cosmos
      ?.listBackgrounds()
      .then(setBackgrounds)
      .catch(() => {});
  }, [page]);
  const update = (patch: Partial<LearningState['settings']>) =>
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  async function importBackground() {
    if (!window.cosmos) {
      notify('Импорт доступен в настольном приложении.');
      return;
    }
    const result = await window.cosmos.importBackground();
    if (result.ok) {
      setBackgrounds(await window.cosmos.listBackgrounds());
      notify('Пакет фона импортирован.');
    }
  }
  if (page === 'backgrounds')
    return (
      <>
        <Heading
          eyebrow="ПРОСТРАНСТВО ДЛЯ ТВОИХ ОТКРЫТИЙ"
          title="Каталог фонов"
          description="Спокойный космос, который помогает сосредоточиться."
          action={
            <button className="button secondary" onClick={() => void importBackground()}>
              <Import size={17} />
              Импортировать пакет
            </button>
          }
        />
        <Ton618Catalog settings={state.settings} update={update} />
        <div className="background-grid">
          <div className="background-card">
            <div className="background-preview">
              <OrbitArt compact />
            </div>
            <div className="background-info">
              <span className="eyebrow">КОЛЛЕКЦИЯ COSMOS</span>
              <h2>Тихая орбита</h2>
              <p>Глубокий индиго, мягкий свет и пространство для мысли.</p>
              <div className="card-bottom">
                <span className="small muted">Локальная SVG-композиция</span>
                <button
                  className="button secondary"
                  onClick={() => update({ background: 'cosmos-orbit' })}
                >
                  {state.settings.background === 'cosmos-orbit' ? (
                    <Check size={16} />
                  ) : (
                    <Image size={16} />
                  )}
                  Установить
                </button>
              </div>
            </div>
          </div>
          <div className="background-card">
            <div className="background-preview quiet-preview">
              <Moon size={80} strokeWidth={0.6} />
            </div>
            <div className="background-info">
              <span className="eyebrow">НИЧЕГО ЛИШНЕГО</span>
              <h2>Глубокий космос</h2>
              <p>Неподвижный тёмный фон для спокойной работы.</p>
              <div className="card-bottom">
                <span className="small muted">Статичный · низкая нагрузка</span>
                <button
                  className="button secondary"
                  onClick={() => update({ background: 'quiet' })}
                >
                  {state.settings.background === 'quiet' ? (
                    <Check size={16} />
                  ) : (
                    <Image size={16} />
                  )}
                  Установить
                </button>
              </div>
            </div>
          </div>
          {backgrounds.map((bg) => (
            <div className="background-card" key={bg.id}>
              <div className="background-preview">
                <img src={bg.previewUrl} alt={bg.title} />
              </div>
              <div className="background-info">
                <span className="eyebrow">
                  {bg.createdWith === 'Unreal Engine 5'
                    ? 'СОЗДАНО В UNREAL ENGINE'
                    : 'ИМПОРТИРОВАННЫЙ ФОН'}
                </span>
                <h2>{bg.title}</h2>
                <p>
                  {bg.author || 'Локальный пакет'} · версия {bg.version}
                </p>
                <button className="button secondary" onClick={() => update({ background: bg.id })}>
                  <Check size={16} />
                  Установить
                </button>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  return (
    <>
      <Heading
        eyebrow="ТВОЙ COSMOS. ТВОИ НАСТРОЙКИ."
        title="Настройки"
        description="Внешний вид, преподаватель OpenAI, локальная практика и источники материалов."
      />
      <div className="flow-settings-layout">
        <nav className="flow-settings-nav" aria-label="Разделы настроек">
          {[
            {
              title: 'Комфорт',
              tone: 'purple',
              items: [
                { id: 'visual', label: 'Внешний вид' },
                { id: 'motion', label: 'Неон и движение' },
                { id: 'workspace', label: 'Рабочее место' },
                { id: 'profiles', label: 'Мои сочетания' },
              ],
            },
            {
              title: 'Учёба',
              tone: 'cyan',
              items: [
                { id: 'study', label: 'Учёба' },
                { id: 'documents', label: 'Конспекты' },
                { id: 'connection', label: 'Подключение' },
              ],
            },
            {
              title: 'Система',
              tone: 'amber',
              items: [
                { id: 'sources', label: 'Источники' },
                { id: 'diagnostics', label: 'Для разработчика' },
                { id: 'model', label: 'Локальная модель' },
              ],
            },
          ].map((group) => (
            <div className={`flow-settings-group tone-${group.tone}`} key={group.title}>
              <strong>{group.title}</strong>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  aria-current={tab === item.id ? 'page' : undefined}
                  className={tab === item.id ? 'active' : ''}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="flow-settings-content">
          {tab === 'connection' && <section className="panel">
            <h2>Подключение OpenAI</h2>
            <p role="status">{connected ? 'OpenAI подключён' : 'OpenAI не подключён'}</p>
            <button className="button" onClick={onConnect}>{connected ? 'Управлять подключением' : 'Подключить OpenAI'}</button>
          </section>}
          {tab === 'study' && <section className="panel study-profile-settings">
            <h2>Школьная программа</h2>
            <label>Класс
              <select aria-label="Школьный класс" value={(state.school || createSchoolState()).grade} onChange={e => {
                const grade = Number(e.target.value) as SchoolGrade;
                setState(s => ({ ...s, school: { ...(s.school || createSchoolState()), grade, view: 'subjects' } }));
              }}>
                {[7, 8, 9, 10, 11].map(g => <option key={g} value={g}>{g} класс</option>)}
              </select>
            </label>
            <p>{(state.school || createSchoolState()).grade >= 10 ? 'Общая программа · базовый уровень 10–11' : 'Общая программа · 7–9 классы'}</p>
          </section>}
          {['motion', 'workspace', 'study', 'documents', 'profiles'].includes(tab) && (
            <PersonalizationSettings
              section={tab as 'motion' | 'workspace' | 'study' | 'documents' | 'profiles'}
              state={state}
              setState={setState}
              notify={notify}
            />
          )}
          {tab === 'visual' && (
            <div>
              <nav className="flow-reader-tabs" aria-label="Изображение и звук">
                {[
                  { id: 'color', label: 'Цвет и текст' },
                  { id: 'scenes', label: 'Учебные сцены' },
                  { id: 'sound', label: 'Звук' },
                ].map((item) => (
                  <button
                    key={item.id}
                    aria-pressed={visualTab === item.id}
                    className={visualTab === item.id ? 'active' : ''}
                    onClick={() => setVisualTab(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
              {visualTab === 'color' && (
                <AppearanceSettings settings={state.settings} update={update} />
              )}
              {visualTab === 'scenes' && (
                <section className="panel">
                  <IconBadge>
                    <Monitor size={25} />
                  </IconBadge>
                  <h2>Качество учебных сцен</h2>
                  <p>
                    Выбери баланс детализации и нагрузки. Все шаги объяснения сохраняются в каждом
                    режиме.
                  </p>
                  <div className="quality-options">
                    {[
                      {
                        id: 'high',
                        label: 'Высокое',
                        desc: 'Свечение и плавные переходы',
                      },
                      { id: 'medium', label: 'Среднее', desc: 'Основные анимации' },
                      { id: 'low', label: 'Низкое', desc: 'Без тяжёлых эффектов' },
                      {
                        id: 'static',
                        label: 'Статичное',
                        desc: 'Шаги переключаются вручную',
                      },
                    ].map((q) => (
                      <button
                        key={q.id}
                        className={state.settings.quality === q.id ? 'selected' : ''}
                        onClick={() => update({ quality: q.id as any })}
                      >
                        <strong>{q.label}</strong>
                        <span>{q.desc}</span>
                        {state.settings.quality === q.id && <Check size={18} />}
                      </button>
                    ))}
                  </div>
                  <label className="setting-toggle">
                    <div>
                      <strong>Уменьшить движение</strong>
                      <span>Сохранить шаги объяснения без автоматической анимации.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={state.settings.reducedMotion}
                      onChange={(event) => update({ reducedMotion: event.target.checked })}
                    />
                  </label>
                </section>
              )}
              {visualTab === 'sound' && (
                <section className="panel">
                  <IconBadge color="cyan">
                    <Settings2 size={25} />
                  </IconBadge>
                  <h2>Звук во время занятий</h2>
                  <label className="setting-toggle">
                    <div>
                      <strong>Озвучивание объяснений</strong>
                      <span>Кнопка «Послушать» рядом с ответом Cosmos.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={state.settings.voice}
                      onChange={(e) => update({ voice: e.target.checked })}
                    />
                  </label>
                  <details className="flow-disclosure">
                    <summary>Голоса и распознавание речи</summary>
                    <div className="gentle-note">
                      <Volume2 size={21} />
                      <p>
                        Озвучивание использует установленные системные голоса. Для русского языка
                        может понадобиться голос Windows. Микрофон зависит от доступного
                        распознавания; отдельный офлайн-пакет речи пока не включён.
                      </p>
                    </div>
                  </details>
                </section>
              )}
            </div>
          )}
          {tab === 'model' && (
            <div className="settings-grid flow-model-settings">
              <section className="panel model-panel">
                <IconBadge color="green">
                  <Cpu size={26} />
                </IconBadge>
                <span className="pill">
                  <span className="status-dot" />
                  {currentModel.available
                    ? 'Локальная модель подключена'
                    : 'Локальная учебная библиотека доступна'}
                </span>
                <h2>Твой преподаватель Cosmos</h2>
                <p>
                  Модель отвечает внутри приложения. Учебные задания, память и визуализации работают
                  независимо от неё.
                </p>
                <details className="flow-disclosure">
                  <summary>Модель и последний запуск</summary>
                  <div className="model-summary">
                    <span>Вход в аккаунт</span>
                    <strong>Не требуется</strong>
                    <span>Обработка вопросов</span>
                    <strong>На этом компьютере</strong>
                    <span>Модель</span>
                    <strong>{currentModel.model || 'Пакет ещё не подключён'}</strong>
                    <span>Текущий запуск</span>
                    <strong>
                      {runtimeStatus?.state === 'starting'
                        ? 'Модель запускается'
                        : runtimeStatus?.mode === 'gpu'
                          ? 'На видеокарте'
                          : runtimeStatus?.mode === 'cpu'
                            ? 'На процессоре'
                            : 'При следующем вопросе'}
                    </strong>
                    {runtimeStatus?.lastElapsedMs !== undefined && (
                      <>
                        <span>Последний ответ</span>
                        <strong>
                          {(runtimeStatus.lastElapsedMs / 1000).toLocaleString('ru-RU', {
                            maximumFractionDigits: 1,
                          })}{' '}
                          с
                        </strong>
                      </>
                    )}
                  </div>
                </details>
                <h3>Режим работы модели</h3>
                <details className="flow-disclosure">
                  <summary>Как проверяется ответ</summary>
                  <div className="gentle-note">
                    <ShieldCheck size={21} />
                    <p>
                      Сверка ответа обязательна. Cosmos подбирает локальные учебные фрагменты и
                      отдельно проверяет по ним свой ответ. Если подтверждения нет, покажет
                      авторскую подсказку или попросит уточнение. Фрагменты и источники можно
                      раскрыть под репликой. Автоматический поиск по интернету пока не подключён;
                      даже сверенный ответ может содержать ошибку.
                    </p>
                  </div>
                </details>
                <div className="quality-options" role="group" aria-label="Режим работы модели">
                  {(
                    [
                      {
                        id: 'auto',
                        label: 'Авто',
                        description: 'Сначала видеокарта; процессор — если её запуск не удался.',
                      },
                      {
                        id: 'gpu',
                        label: 'Видеокарта',
                        description:
                          'Для ответов используется видеокарта. Нагрузка других программ влияет на скорость.',
                      },
                      {
                        id: 'cpu',
                        label: 'Процессор',
                        description:
                          'Модель не использует видеопамять. Удобно, когда видеокарта занята другой работой.',
                      },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      className={(runtimeStatus?.backend || 'auto') === option.id ? 'selected' : ''}
                      aria-pressed={(runtimeStatus?.backend || 'auto') === option.id}
                      disabled={!!modelLocked || !window.cosmos}
                      onClick={() => void changeBackend(option.id)}
                    >
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                      {(runtimeStatus?.backend || 'auto') === option.id && <Check size={18} />}
                    </button>
                  ))}
                </div>
                <details className="flow-disclosure">
                  <summary>Скорость и замена файла модели</summary>
                  <p>
                    {modelLocked
                      ? 'Настройки можно изменить после завершения ответа или запуска модели.'
                      : 'Скорость зависит от нагрузки компьютера. Авто не переключается на процессор только из-за медленного ответа.'}
                  </p>
                  {runtimeStatus?.lastElapsedMs !== undefined && (
                    <p className="small muted">
                      Показано время последнего ответа с учётом запуска, если он понадобился. Это
                      измерение, а не прогноз скорости.
                    </p>
                  )}
                  <button
                    className="button secondary"
                    disabled={!!modelLocked || !window.cosmos}
                    onClick={async () => {
                      const result = await window.cosmos?.chooseModel();
                      if (result?.ok) {
                        setRuntimeStatus(await window.cosmos!.modelStatus());
                        notify('Модель выбрана. Открой комнату для проверки.');
                      } else if (result?.error) notify(result.error);
                    }}
                  >
                    <FolderOpen size={17} />
                    Выбрать файл модели
                  </button>
                </details>
              </section>
              <details className="panel flow-disclosure flow-lesson-principles">
                <summary>Как устроено занятие</summary>
                <div className="learning-principles">
                  {[
                    'Короткое объяснение и наглядная сцена',
                    'Твоя самостоятельная попытка',
                    'Проверка по правилам учебного задания',
                    'Подсказка при затруднении',
                    'Повторение через некоторое время',
                  ].map((s, i) => (
                    <div key={s}>
                      <span>0{i + 1}</span>
                      <p>{s}</p>
                    </div>
                  ))}
                </div>
                <p>
                  Модель пока экспериментальная: проверка выявила ошибки в исторических подсказках.
                  Для фактов опирайся на учебные материалы и источники. Ответы модели не повышают
                  прогресс автоматически.
                </p>
              </details>
            </div>
          )}
          {tab === 'sources' && (
            <>
              <div className="gentle-note">
                <ShieldCheck size={21} />
                <p>
                  Библиотека этой версии состоит из авторских тренировочных примеров. Официальные
                  ссылки приведены для сверки. Материалы ФИПИ на 2027 год на дату проверки
                  опубликованы как проекты.
                </p>
              </div>
              <label className="flow-source-filter">
                Предмет источников
                <select
                  value={sourceSubject}
                  onChange={(event) => {
                    setSourceSubject(event.target.value as SubjectId | 'all');
                    setSourcePage(0);
                  }}
                >
                  <option value="all">Все предметы</option>
                  <option value="math">Математика</option>
                  <option value="russian">Русский язык</option>
                  <option value="history">История</option>
                  <option value="social">Обществознание</option>
                </select>
              </label>
              <label className="flow-source-filter">
                Найти материал
                <input
                  aria-label="Поиск источника"
                  type="search"
                  placeholder="ФИПИ, модуль, история…"
                  maxLength={160}
                  value={sourceQuery}
                  onChange={(event) => {
                    setSourceQuery(event.target.value);
                    setSourcePage(0);
                  }}
                />
              </label>
              <p className="small muted" role="status">
                Найдено источников: {filteredSources.length}. Страница {currentSourcePage + 1} из{' '}
                {sourcePages}.
              </p>
              <div className="sources-grid">
                {filteredSources
                  .slice(currentSourcePage * 6, currentSourcePage * 6 + 6)
                  .map((source) => (
                    <section
                      className={`source-card subject-${source.subjects[0]}`}
                      key={source.id}
                    >
                      <div className="card-top">
                        <span className="mini-tag">{source.publisher}</span>
                        {source.url && (
                          <a
                            className="icon-button"
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Открыть ${source.title}`}
                          >
                            <ArrowUpRight size={18} />
                          </a>
                        )}
                      </div>
                      <h3>{source.title}</h3>
                      <details className="flow-disclosure">
                        <summary>Что подтверждает источник</summary>
                        <p>{source.note}</p>
                      </details>
                      <div className="source-metadata">
                        <span>Проверено: {source.checkedAt}</span>
                        <span>{source.version}</span>
                      </div>
                    </section>
                  ))}
              </div>
              {!filteredSources.length && <p>Попробуй другое название или выбери все предметы.</p>}
              {sourcePages > 1 && (
                <nav className="source-pagination" aria-label="Страницы источников">
                  <button
                    className="button secondary"
                    disabled={currentSourcePage === 0}
                    onClick={() => setSourcePage(currentSourcePage - 1)}
                  >
                    Предыдущие
                  </button>
                  <span>
                    {currentSourcePage + 1} / {sourcePages}
                  </span>
                  <button
                    className="button secondary"
                    disabled={currentSourcePage === sourcePages - 1}
                    onClick={() => setSourcePage(currentSourcePage + 1)}
                  >
                    Следующие
                  </button>
                </nav>
              )}
            </>
          )}
          {tab === 'diagnostics' && (
            <section className="panel">
              <h2>Диагностика приложения</h2>
              <p>Этот экран содержит технические сведения. Они не добавляются в учебную историю.</p>
              <div className="diagnostic-status">
                <span>Сохранение прогресса</span>
                <strong>{saveError ? 'Требует проверки' : 'Доступно'}</strong>
                <span>Локальная модель</span>
                <strong>{model.available ? 'Доступна' : 'Не запущена'}</strong>
                <span>Среда</span>
                <strong>{window.cosmos ? 'Настольное приложение' : 'Просмотр в браузере'}</strong>
              </div>
              <pre className="diagnostic-log">
                {diagnostics.length
                  ? JSON.stringify(diagnostics, null, 2)
                  : 'В журнале пока нет событий.'}
              </pre>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
