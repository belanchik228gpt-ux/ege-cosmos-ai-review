import { useState } from 'react';
import {
  PreferenceChoice,
  PreferenceToggle,
  PreferenceRange,
  PreferenceDemo,
} from './PreferenceControls';
import { Sparkles, BookOpen, Save, Trash2, RotateCcw, Volume2, ShieldCheck } from 'lucide-react';
import { createState, subjects, type LearningState } from '../domain';
import { preferencePresets, type Preferences } from '../domain/preferences';

type Props = {
  section: 'motion' | 'workspace' | 'study' | 'documents' | 'profiles';
  state: LearningState;
  setState: React.Dispatch<React.SetStateAction<LearningState>>;
  notify: (message: string) => void;
};
export function PersonalizationSettings({ section, state, setState, notify }: Props) {
  const settings = state.settings;
  const [profileName, setProfileName] = useState('');
  const [demoCount, setDemoCount] = useState(0);
  const update = (patch: Partial<Preferences>) =>
    setState((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  if (section === 'profiles')
    return (
      <div className="preferences-grid">
        <section className="panel wide">
          <h2>Настроение твоего Cosmos</h2>
          <p>Готовые сочетания можно изменять. Учебные результаты остаются прежними.</p>
          <div className="preferences-presets">
            {preferencePresets.map((preset) => (
              <button
                className="preference-preset"
                key={preset.id}
                onClick={() => {
                  update(preset.patch);
                  notify(`Оформление «${preset.title}» применено.`);
                }}
              >
                <Sparkles size={25} />
                <strong>{preset.title}</strong>
                <span>{preset.description}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="panel wide">
          <h2>Мои сочетания</h2>
          <p>
            Сохрани текущие настройки, чтобы потом вернуться к ним одним нажатием. До 12 вариантов
            на этом компьютере.
          </p>
          <form
            className="preference-profile-form"
            onSubmit={(event) => {
              event.preventDefault();
              const name = profileName.trim().slice(0, 40);
              if (!name) return;
              if ((state.preferenceProfiles?.length || 0) >= 12) {
                notify('Сохранено 12 сочетаний. Удали ненужное, чтобы добавить новое.');
                return;
              }
              setState((current) => ({
                ...current,
                preferenceProfiles: [
                  ...(current.preferenceProfiles || []),
                  {
                    id: crypto.randomUUID(),
                    name,
                    settings: { ...current.settings },
                    createdAt: new Date().toISOString(),
                  },
                ],
              }));
              setProfileName('');
              notify('Сочетание сохранено.');
            }}
          >
            <input
              aria-label="Название сочетания настроек"
              placeholder="Например: вечер перед экзаменом"
              maxLength={40}
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
            />
            <button className="button primary" disabled={!profileName.trim()}>
              <Save size={17} />
              Сохранить сочетание
            </button>
          </form>
          <div className="saved-preferences">
            {state.preferenceProfiles?.map((profile) => (
              <div className="saved-preference" key={profile.id}>
                <button
                  onClick={() => {
                    setState((current) => ({ ...current, settings: { ...profile.settings } }));
                    notify(`Вернулись к «${profile.name}».`);
                  }}
                >
                  <strong>{profile.name}</strong>
                  <small>{new Date(profile.createdAt).toLocaleDateString('ru-RU')}</small>
                </button>
                <button
                  className="icon-button"
                  aria-label={`Удалить сочетание ${profile.name}`}
                  onClick={() =>
                    setState((current) => ({
                      ...current,
                      preferenceProfiles: current.preferenceProfiles?.filter(
                        (item) => item.id !== profile.id,
                      ),
                    }))
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="settings-note">
            <ShieldCheck size={19} />
            <span>
              Сочетания хранят оформление, движение, голос и настройки занятий. Они не меняют имя,
              ответы, документы или прогресс.
            </span>
          </div>
        </section>
        <section className="panel">
          <h2>Вернуть начало</h2>
          <p>
            Сбросит параметры интерфейса и занятий. Сохранённые сочетания и учебная история
            останутся.
          </p>
          <button
            className="button secondary"
            onClick={() => {
              setState((current) => ({ ...current, settings: createState().settings }));
              notify('Настройки возвращены к исходным.');
            }}
          >
            <RotateCcw size={17} />
            Сбросить параметры
          </button>
        </section>
        <PreferenceDemo count={demoCount} onClick={() => setDemoCount((count) => count + 1)} />
      </div>
    );
  if (section === 'motion')
    return (
      <div className="preferences-grid">
        <section className="panel preferences-section">
          <h2>Живой интерфейс</h2>
          <p>От тихих переходов до выразительного отклика.</p>
          <PreferenceChoice
            settings={settings}
            update={update}
            title="Движение интерфейса"
            description="Переходы экранов и появление элементов."
            field="uiMotion"
            options={[
              ['off', 'Без движения'],
              ['gentle', 'Мягкое'],
              ['expressive', 'Выразительное'],
            ]}
          />
          <PreferenceChoice
            settings={settings}
            update={update}
            title="Темп интерфейса"
            description="Длительность декоративных переходов."
            field="motionSpeed"
            options={[
              ['slow', 'Спокойный'],
              ['normal', 'Обычный'],
              ['fast', 'Быстрый'],
            ]}
          />
          <PreferenceChoice
            settings={settings}
            update={update}
            title="Сила неона"
            description="Свечение кнопок, контуров и активных карточек."
            field="glow"
            options={[
              ['off', 'Без свечения'],
              ['soft', 'Мягкий свет'],
              ['vivid', 'Яркий неон'],
            ]}
          />
          <PreferenceToggle
            settings={settings}
            update={update}
            title="Отклик при наведении"
            description="Карточки и кнопки мягко реагируют на курсор."
            field="hoverEffects"
          />
          <PreferenceToggle
            settings={settings}
            update={update}
            title="Живое пространство"
            description="Медленное движение фоновых орбит. В лёгком режиме отключается."
            field="animatedBackground"
          />
          <div className="settings-note">
            <ShieldCheck size={19} />
            <span>
              «Уменьшить движение» и системная настройка Windows имеют приоритет. Уроками всегда
              можно управлять вручную.
            </span>
          </div>
        </section>
        <section className="panel preferences-section">
          <h2>Темп учебной сцены</h2>
          <p>Настройки старта нового урока. Во время занятия темп можно менять в плеере.</p>
          <PreferenceToggle
            settings={settings}
            update={update}
            title="Автоматически запускать сцены"
            description="Объяснение начинается сразу после открытия урока."
            field="sceneAutoplay"
          />
          <PreferenceChoice
            settings={settings}
            update={update}
            title="Начальная скорость сцены"
            description="Общая скорость движения и пояснений."
            field="sceneSpeed"
            options={[
              ['0.5', '0,5× · спокойно'],
              ['1', '1× · обычно'],
              ['1.5', '1,5× · быстрее'],
              ['2', '2× · повторение'],
            ]}
          />
          <PreferenceToggle
            settings={settings}
            update={update}
            title="Уменьшить движение"
            description="Остановить декоративные анимации и автостарт учебной сцены."
            field="reducedMotion"
          />
          <PreferenceDemo count={demoCount} onClick={() => setDemoCount((count) => count + 1)} />
        </section>
      </div>
    );
  if (section === 'workspace')
    return (
      <div className="preferences-grid">
        <section className="panel">
          <h2>Пространство для учёбы</h2>
          <PreferenceChoice
            settings={settings}
            update={update}
            title="Плотность карточек"
            description="Больше воздуха или больше содержания на экране."
            field="density"
            options={[
              ['comfortable', 'Просторно'],
              ['compact', 'Компактно'],
            ]}
          />
          <PreferenceChoice
            settings={settings}
            update={update}
            title="Форма элементов"
            description="Скругление карточек, полей и кнопок."
            field="cornerStyle"
            options={[
              ['soft', 'Мягкие углы'],
              ['rounded', 'Сильное скругление'],
              ['square', 'Почти прямые'],
            ]}
          />
          <PreferenceChoice
            settings={settings}
            update={update}
            title="Ширина рабочего пространства"
            description="Полезно для широкого монитора и крупных объяснений."
            field="contentWidth"
            options={[
              ['comfortable', 'Собранное'],
              ['wide', 'Широкое'],
            ]}
          />
          <PreferenceChoice
            settings={settings}
            update={update}
            title="Расположение урока"
            description="На узком экране блоки автоматически идут друг под другом."
            field="lessonLayout"
            options={[
              ['balanced', 'Сбалансированно'],
              ['visual', 'Больше места сцене'],
              ['dialogue', 'Больше места диалогу'],
            ]}
          />
          <PreferenceChoice
            settings={settings}
            update={update}
            title="Характер шрифта"
            description="Используются локальные шрифты Windows."
            field="fontFamily"
            options={[
              ['system', 'Современный'],
              ['humanist', 'Мягкий учебный'],
            ]}
          />
          <PreferenceToggle
            settings={settings}
            update={update}
            title="Раскрывать источники"
            description="Ссылки и версии учебных материалов видны сразу."
            field="sourceDetailsExpanded"
          />
        </section>
        <PreferenceDemo count={demoCount} onClick={() => setDemoCount((count) => count + 1)} />
      </div>
    );
  if (section === 'documents')
    return (
      <div className="preferences-grid">
        <section className="panel">
          <h2>Твой учебный альбом</h2>
          <p>
            Настройки применяются к новым документам. Сохранённые конспекты сохраняют выбранный вид.
          </p>
          <PreferenceChoice
            settings={settings}
            update={update}
            title="Стиль нового конспекта"
            description="Тёмные неоновые страницы или светлая версия для печати."
            field="documentStyle"
            options={[
              ['cosmos', 'Фиолетовый Cosmos'],
              ['paper', 'Светлый для печати'],
            ]}
          />
          <PreferenceChoice
            settings={settings}
            update={update}
            title="Размер текста в конспекте"
            description="При крупном тексте документ может занимать больше страниц."
            field="documentScale"
            options={[
              ['comfortable', 'Обычный'],
              ['large', 'Крупный'],
            ]}
          />
          <div className="settings-note">
            <BookOpen size={19} />
            <span>
              Слева — рисунок и объяснение, справа — определения, формулы и примеры. Учебные примеры
              отмечены отдельно от твоих реальных решений.
            </span>
          </div>
        </section>
        <PreferenceDemo count={demoCount} onClick={() => setDemoCount((count) => count + 1)} />
      </div>
    );
  return (
    <div className="preferences-grid">
      <section className="panel">
        <h2>Твой учебный ритм</h2>
        <div className="preference-control">
          <label>
            <span>
              <strong>Как к тебе обращаться</strong>
              <small>Имя в диалогах и приветствии.</small>
            </span>
            <input
              aria-label="Имя в настройках"
              maxLength={60}
              value={state.profile.name}
              onChange={(event) => {
                const name = event.target.value;
                setState((current) => ({ ...current, profile: { ...current.profile, name } }));
              }}
              onBlur={() => {
                if (!state.profile.name.trim())
                  setState((current) => ({
                    ...current,
                    profile: { ...current.profile, name: 'Ученик' },
                  }));
              }}
            />
          </label>
        </div>
        <div className="preference-control">
          <label>
            <span>
              <strong>Время на день</strong>
              <small>По нему строится план на главной и в штабе.</small>
            </span>
            <select
              aria-label="Время на день"
              value={state.profile.dailyMinutes}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  profile: { ...current.profile, dailyMinutes: Number(event.target.value) },
                }))
              }
            >
              {[10, 15, 20, 30, 45, 60, 90, 120].map((value) => (
                <option value={value} key={value}>
                  {value} минут
                </option>
              ))}
              {![10, 15, 20, 30, 45, 60, 90, 120].includes(state.profile.dailyMinutes) && (
                <option value={state.profile.dailyMinutes}>
                  {state.profile.dailyMinutes} минут
                </option>
              )}
            </select>
          </label>
        </div>
        <h3>Предметы в плане</h3>
        <div className="study-subjects">
          {subjects.map((subject) => (
            <label key={subject.id}>
              <input
                type="checkbox"
                checked={state.profile.selectedSubjects.includes(subject.id)}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    profile: {
                      ...current.profile,
                      selectedSubjects: event.target.checked
                        ? [...new Set([...current.profile.selectedSubjects, subject.id])]
                        : current.profile.selectedSubjects.filter((id) => id !== subject.id),
                    },
                  }))
                }
              />
              {subject.title}
            </label>
          ))}
        </div>
        <PreferenceToggle
          settings={settings}
          update={update}
          title="Домашняя практика после занятия"
          description="После завершения урока появится небольшое задание. Его состояние и повторение сохраняются."
          field="autoHomework"
        />
        <PreferenceToggle
          settings={settings}
          update={update}
          title="Повторения на главной"
          description="Показывать напоминания о темах и домашней практике."
          field="showReviewReminders"
        />
        <PreferenceToggle
          settings={settings}
          update={update}
          title="Enter отправляет ответ"
          description="Если выключено: Enter переносит строку, Ctrl+Enter отправляет."
          field="enterToSend"
        />
      </section>
      <section className="panel">
        <h2>Голос Cosmos</h2>
        <p>
          Озвучивание работает через установленные голоса. Параметры можно проверить одной фразой.
        </p>
        <PreferenceToggle
          settings={settings}
          update={update}
          title="Озвучивание доступно в уроке"
          description="Показывать кнопки прослушивания реплик."
          field="voice"
        />
        <PreferenceRange
          settings={settings}
          update={update}
          title="Скорость голоса"
          description="Медленнее для нового материала, быстрее для повторения."
          field="voiceRate"
          min={0.6}
          max={1.5}
          step={0.1}
        />
        <PreferenceRange
          settings={settings}
          update={update}
          title="Высота голоса"
          description="Небольшая настройка выбранного системного голоса."
          field="voicePitch"
          min={0.7}
          max={1.3}
          step={0.1}
        />
        <PreferenceRange
          settings={settings}
          update={update}
          title="Громкость голоса"
          description="Не меняет общую громкость Windows."
          field="voiceVolume"
          min={0}
          max={1}
          step={0.1}
        />
        <button
          className="button secondary"
          onClick={() => {
            if (!('speechSynthesis' in window)) {
              notify('На этом устройстве голос пока недоступен.');
              return;
            }
            speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(
              'Привет! Давай разберём тему одним небольшим шагом.',
            );
            utterance.lang = 'ru-RU';
            utterance.rate = settings.voiceRate;
            utterance.pitch = settings.voicePitch;
            utterance.volume = settings.voiceVolume;
            speechSynthesis.speak(utterance);
          }}
        >
          <Volume2 size={18} />
          Попробовать голос
        </button>
      </section>
    </div>
  );
}
