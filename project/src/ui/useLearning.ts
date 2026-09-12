import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { createState, hydrateState, type LearningState } from '../domain';

const KEY = 'ege-cosmos-v1';
const JOURNAL_KEY = `${KEY}-pending`;

type RecoveryRecord = { version: 1; base: string; state: LearningState };
type StoragePort = {
  save: (state: LearningState) => Promise<boolean>;
  writeRecovery: (record: RecoveryRecord) => void;
  clearRecovery: () => void;
  onError: (error: boolean) => void;
};

// Integrity comparison, not a security signature. Avoid storing another full state in the journal.
export function stateFingerprint(value: unknown): string {
  const text = JSON.stringify(value) ?? 'undefined';
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return `${text.length}:${a >>> 0}:${b >>> 0}`;
}

export function createSaveCoordinator(port: StoragePort, base: string, enabled = true) {
  let queue: Promise<void> = Promise.resolve();
  let latest: LearningState | undefined;
  let revision = 0;
  let pending = false;
  function journal() {
    if (latest) port.writeRecovery({ version: 1, base, state: latest });
  }
  return {
    persist(state: LearningState) {
      latest = state;
      pending = true;
      const current = ++revision;
      // Synchronous journal protects a change even if the window closes before IPC can finish.
      try {
        journal();
      } catch {
        port.onError(true);
      }
      if (!enabled) {
        port.onError(true);
        return queue;
      }
      queue = queue
        .catch(() => {})
        .then(async () => {
          try {
            const ok = await port.save(state);
            if (!ok) throw new Error('State write failed');
            base = stateFingerprint(state);
            if (current === revision) {
              pending = false;
              try {
                port.clearRecovery();
              } catch {
                /* Disk contains this exact state. */
              }
              port.onError(false);
            } else {
              // A newer journal must reference the snapshot that has just reached disk.
              try {
                journal();
              } catch {
                port.onError(true);
              }
            }
          } catch {
            port.onError(true);
          }
        });
      return queue;
    },
    flush() {
      return queue;
    },
    get pending() {
      return pending;
    },
  };
}

function isStateRecord(value: unknown): value is LearningState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as Partial<LearningState>;
  return (
    s.version === 1 &&
    !!s.profile &&
    typeof s.profile === 'object' &&
    typeof s.profile.name === 'string' &&
    !!s.sessions &&
    typeof s.sessions === 'object' &&
    !Array.isArray(s.sessions) &&
    !!s.progress &&
    typeof s.progress === 'object' &&
    !Array.isArray(s.progress) &&
    !!s.settings &&
    typeof s.settings === 'object' &&
    Array.isArray(s.documents) &&
    Array.isArray(s.facts)
  );
}

function readRecovery(): RecoveryRecord | undefined {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (!raw) return;
    const record = JSON.parse(raw) as Partial<RecoveryRecord>;
    if (record.version === 1 && typeof record.base === 'string' && isStateRecord(record.state))
      return record as RecoveryRecord;
  } catch {
    /* A damaged journal must not prevent reading the authoritative state. */
  }
}

export function chooseRestoredState(
  primary: unknown,
  recovery?: RecoveryRecord,
  loadFailed = false,
) {
  if (loadFailed)
    return {
      state: recovery ? hydrateState(recovery.state) : createState(),
      blocked: true,
      replay: false,
    };
  if (primary !== null && !isStateRecord(primary))
    return {
      state: recovery ? hydrateState(recovery.state) : createState(),
      blocked: true,
      replay: false,
    };
  const current = primary ? hydrateState(primary) : createState();
  if (!recovery) return { state: current, blocked: false, replay: false };
  if (stateFingerprint(primary) === stateFingerprint(recovery.state))
    return { state: current, blocked: false, replay: false };
  if (recovery.base === stateFingerprint(primary))
    return {
      state: hydrateState(recovery.state),
      blocked: false,
      replay: true,
    };
  // Both copies may contain independent history. Preserve the journal and protect the primary file.
  return { state: hydrateState(recovery.state), blocked: true, replay: false };
}

export function useLearning() {
  const [state, setReactState] = useState<LearningState>(() => createState());
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const latest = useRef(state);
  const mounted = useRef(false);
  const coordinator = useRef<ReturnType<typeof createSaveCoordinator> | undefined>(undefined);
  useEffect(() => {
    let live = true;
    mounted.current = true;
    (async () => {
      let primary: unknown = null;
      let failed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        primary = window.cosmos
          ? await Promise.race([
              window.cosmos.loadState(),
              new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('State read timed out')), 5000);
              }),
            ])
          : JSON.parse(localStorage.getItem(KEY) || 'null');
        if (primary && typeof primary === 'object' && 'loadError' in primary) failed = true;
      } catch {
        failed = true;
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (!live) return;
      const recovery = readRecovery();
      const restored = chooseRestoredState(primary, recovery, failed);
      latest.current = restored.state;
      setReactState(restored.state);
      setSaveError(restored.blocked);
      coordinator.current = createSaveCoordinator(
        {
          save: async (snapshot) => {
            if (window.cosmos) {
              let saveTimer: ReturnType<typeof setTimeout> | undefined;
              try {
                return await Promise.race([
                  window.cosmos.saveState(snapshot),
                  new Promise<boolean>((resolve) => {
                    saveTimer = setTimeout(() => resolve(false), 5000);
                  }),
                ]);
              } finally {
                if (saveTimer) clearTimeout(saveTimer);
              }
            }
            localStorage.setItem(KEY, JSON.stringify(snapshot));
            return true;
          },
          writeRecovery: (record) => localStorage.setItem(JOURNAL_KEY, JSON.stringify(record)),
          clearRecovery: () => localStorage.removeItem(JOURNAL_KEY),
          onError: (error) => {
            if (mounted.current) setSaveError(error);
          },
        },
        recovery && restored.blocked ? recovery.base : stateFingerprint(primary),
        !restored.blocked,
      );
      if (restored.replay) void coordinator.current.persist(restored.state);
      else if (!restored.blocked && recovery) {
        try {
          localStorage.removeItem(JOURNAL_KEY);
        } catch {}
      }
      setReady(true);
    })();
    return () => {
      live = false;
      mounted.current = false;
    };
  }, []);
  const setState: Dispatch<SetStateAction<LearningState>> = useCallback((update) => {
    // Save at the update boundary, including multiple functional updates in one event tick.
    const next = typeof update === 'function' ? update(latest.current) : update;
    if (next === latest.current) return;
    latest.current = next;
    setReactState(next);
    if (coordinator.current) void coordinator.current.persist(next);
  }, []);
  return { state, setState, ready, saveError };
}
