import { useEffect } from 'react';
import { LogIn, RefreshCw, ShieldCheck, X, ExternalLink, CheckCircle2 } from 'lucide-react';
import type { OpenAIController } from './useOpenAI';
export function OpenAIConnection({ ai, onClose }: { ai: OpenAIController; onClose: () => void }) {
  const { status, working, error } = ai;
  const controlsBusy = working || status.busy;
  // A modal does not trigger a window focus event: query real turn state here.
  useEffect(() => {
    void ai.refresh();
    const timer = setInterval(() => void ai.refresh(), 3000);
    return () => clearInterval(timer);
  }, [ai.refresh]);
  return (
    <div className="studio-modal-backdrop" onClick={onClose}>
      <section
        className="studio-modal auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="icon-button close-modal"
          aria-label="Закрыть подключение"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <span className="studio-emblem">
          <ShieldCheck size={28} />
        </span>
        <h2 id="auth-title">Преподаватель с OpenAI</h2>
        <p>
          Войди в аккаунт ChatGPT в официальном окне. Cosmos сохранит сессию на этом компьютере и
          будет обновлять её автоматически.
        </p>
        {error && (
          <div className="studio-chat-error" role="alert">
            <p>{error}</p>
          </div>
        )}
        {status.authenticated === true ? (
          <>
            <div className="studio-success">
              <CheckCircle2 size={20} />
              <div>
                <strong>Аккаунт подключён</strong>
                <small>
                  {status.account?.email || 'Сессия ChatGPT'}{' '}
                  {status.account?.planType ? `· ${status.account.planType}` : ''}
                </small>
              </div>
            </div>
            {status.state === 'offline' && (
              <div className="studio-soft-note">
                {status.detail ||
                  'Сессия сохранена. Связь сейчас недоступна — повтори проверку позже.'}
              </div>
            )}
            <label className="studio-field">
              Модель преподавателя
              <select
                value={status.selectedModel || ''}
                disabled={controlsBusy || !status.models.length}
                onChange={(e) => void ai.selectModel(e.target.value)}
              >
                {status.models.length ? (
                  status.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))
                ) : (
                  <option value="">Модель аккаунта</option>
                )}
              </select>
            </label>
            {status.busy && (
              <p className="studio-small">
                Сменить модель или выйти можно после ответа. Его можно остановить в занятии.
              </p>
            )}
            <p className="studio-small">
              Используется официальный вход ChatGPT через Codex. Доступные модели и лимиты зависят
              от аккаунта. Это подключение не является API-ключом.
            </p>
            <button className="button primary" onClick={onClose}>
              Вернуться к занятию
            </button>
            <button
              className="text-button"
              disabled={controlsBusy}
              onClick={() => void ai.logout()}
            >
              Выйти из аккаунта в Cosmos
            </button>
          </>
        ) : (
          <>
            <div className="studio-soft-note">
              {status.state === 'signing-in'
                ? 'Заверши вход в открывшемся браузере. После входа можно вернуться сюда.'
                : status.state === 'offline'
                  ? 'Соединение сейчас недоступно. Проверь сеть и повтори подключение.'
                  : !status.runtimeAvailable && status.state !== 'connecting'
                    ? 'Компонент подключения пока недоступен в этой сборке. Учебные материалы можно открывать без него.'
                    : 'Пароль вводится на странице OpenAI. Cosmos не получает твой пароль.'}
            </div>
            <button
              className="button primary"
              disabled={controlsBusy || status.state === 'signing-in' || !status.runtimeAvailable}
              onClick={() => void ai.login()}
            >
              <LogIn size={17} />
              {status.state === 'signing-in' ? 'Ожидаем вход' : 'Войти через ChatGPT'}
            </button>
            {status.state === 'signing-in' && (
              <button
                className="text-button"
                disabled={working}
                onClick={() => void ai.cancelLogin()}
              >
                Отменить вход
              </button>
            )}
          </>
        )}
        <button className="text-button" disabled={working} onClick={() => void ai.refresh()}>
          <RefreshCw size={15} />
          Проверить подключение
        </button>
        <a
          className="studio-small"
          href="https://learn.chatgpt.com/docs/auth"
          target="_blank"
          rel="noreferrer"
        >
          Об официальном входе <ExternalLink size={13} />
        </a>
      </section>
    </div>
  );
}
