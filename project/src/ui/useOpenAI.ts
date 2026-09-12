import { useCallback, useEffect, useRef, useState } from 'react';
const initial: CosmosOpenAIStatus = {
  available: false,
  runtimeAvailable: false,
  authenticated: null,
  state: 'connecting',
  busy: false,
  models: [],
};
export function useOpenAI() {
  const [status, setStatus] = useState<CosmosOpenAIStatus>(initial);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const actionInFlight = useRef(false),
    alive = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const next = window.cosmos?.getOpenAIStatus
        ? await window.cosmos.getOpenAIStatus()
        : { ...initial, state: 'unavailable' as const };
      if (alive.current) setStatus(next);
    } catch {
      // A failed probe proves neither logout nor completion of the active turn.
      if (alive.current) setStatus((s) => ({ ...s, state: 'offline' }));
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => {
      alive.current = false;
      window.removeEventListener('focus', focus);
    };
  }, [refresh]);
  useEffect(() => {
    if (status.state !== 'signing-in') return;
    const timer = setInterval(() => void refresh(), 2500);
    return () => clearInterval(timer);
  }, [status.state, refresh]);
  async function perform(
    operation: (
      bridge: NonNullable<Window['cosmos']>,
    ) => Promise<{ ok: boolean; error?: string; loginId?: string; authUrl?: string }>,
  ) {
    if (actionInFlight.current)
      return { ok: false, error: 'Дождись завершения текущего действия.' };
    actionInFlight.current = true;
    setWorking(true);
    setError('');
    try {
      const result = window.cosmos
        ? await operation(window.cosmos)
        : { ok: false, error: 'Подключение OpenAI доступно в установленном приложении Cosmos.' };
      if (!result.ok && alive.current)
        setError(result.error || 'Действие не завершено. Попробуй ещё раз.');
      await refresh();
      return result;
    } catch {
      const result = {
        ok: false,
        error: 'Сейчас не удалось выполнить действие. Сохранённый вход не удалён.',
      };
      if (alive.current) setError(result.error);
      await refresh();
      return result;
    } finally {
      actionInFlight.current = false;
      if (alive.current) setWorking(false);
    }
  }
  const login = () => perform((bridge) => bridge.loginOpenAI());
  const logout = () => perform((bridge) => bridge.logoutOpenAI());
  const selectModel = (id: string) => perform((bridge) => bridge.selectOpenAIModel(id));
  const cancelLogin = () =>
    perform(async (bridge) => {
      const canceled = await bridge.cancelOpenAILogin();
      return {
        ok: canceled,
        ...(!canceled ? { error: 'Активной попытки входа уже нет. Статус обновлён.' } : {}),
      };
    });
  return { status, working, error, refresh, login, logout, selectModel, cancelLogin };
}
export type OpenAIController = ReturnType<typeof useOpenAI>;
