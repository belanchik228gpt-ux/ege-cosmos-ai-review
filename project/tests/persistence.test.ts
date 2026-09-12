import { describe, expect, it, vi } from 'vitest';
import { createState } from '../src/domain';
import {
  chooseRestoredState,
  createSaveCoordinator,
  stateFingerprint,
} from '../src/ui/useLearning';

describe('state persistence recovery', () => {
  it('writes a recovery journal before asynchronous work and advances its base after each committed write', async () => {
    const initial = createState('Начало');
    const first = createState('Первое');
    const latest = createState('Последнее');
    const pending: ((ok: boolean) => void)[] = [];
    const save = vi.fn(() => new Promise<boolean>((resolve) => pending.push(resolve)));
    const journals: { version: 1; base: string; state: ReturnType<typeof createState> }[] = [];
    const clear = vi.fn();
    const error = vi.fn();
    const writes = createSaveCoordinator(
      {
        save,
        writeRecovery: (record) => journals.push(structuredClone(record)),
        clearRecovery: clear,
        onError: error,
      },
      stateFingerprint(initial),
    );
    void writes.persist(first);
    expect(journals.at(-1)?.state.profile.name).toBe('Первое');
    expect(save).not.toHaveBeenCalled();
    void writes.persist(latest);
    expect(journals.at(-1)?.state.profile.name).toBe('Последнее');
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    pending[0](true);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    const journal = journals.at(-1)!;
    expect(journal.base).toBe(stateFingerprint(first));
    expect(journal.state.profile.name).toBe('Последнее');
    expect(chooseRestoredState(first, journal).state.profile.name).toBe('Последнее');
    expect(chooseRestoredState(first, journal).replay).toBe(true);
    expect(clear).not.toHaveBeenCalled();
    pending[1](true);
    await writes.flush();
    expect(clear).toHaveBeenCalledOnce();
    expect(writes.pending).toBe(false);
    expect(error).toHaveBeenLastCalledWith(false);
  });

  it('preserves both copies when loading fails or journal and disk have diverged', async () => {
    const disk = createState('На диске');
    const journal = {
      version: 1 as const,
      base: stateFingerprint(null),
      state: createState('Новая попытка'),
    };
    const failed = chooseRestoredState({ loadError: true }, journal, true);
    expect(failed.blocked).toBe(true);
    expect(failed.state.profile.name).toBe('Новая попытка');
    expect(chooseRestoredState(disk, journal).blocked).toBe(true);
    expect(chooseRestoredState({ version: 999 }).blocked).toBe(true);
    const save = vi.fn(async () => true);
    const recover = vi.fn();
    const writes = createSaveCoordinator(
      { save, writeRecovery: recover, clearRecovery: vi.fn(), onError: vi.fn() },
      journal.base,
      false,
    );
    await writes.persist(journal.state);
    expect(save).not.toHaveBeenCalled();
    expect(recover).toHaveBeenCalledOnce();
    expect(writes.pending).toBe(true);
  });

  it('continues after write failure without clearing the latest pending change', async () => {
    const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const clear = vi.fn();
    const error = vi.fn();
    const writes = createSaveCoordinator(
      { save, writeRecovery: vi.fn(), clearRecovery: clear, onError: error },
      stateFingerprint(null),
    );
    await writes.persist(createState('Первое'));
    expect(clear).not.toHaveBeenCalled();
    expect(error).toHaveBeenLastCalledWith(true);
    await writes.persist(createState('Второе'));
    expect(clear).toHaveBeenCalledOnce();
    expect(error).toHaveBeenLastCalledWith(false);
  });

  it('does not replay an already committed journal and accepts a first-run crash journal', () => {
    const state = createState('Ученик после первого запуска');
    const journal = { version: 1 as const, base: stateFingerprint(null), state };
    expect(chooseRestoredState(state, journal)).toMatchObject({ blocked: false, replay: false });
    expect(chooseRestoredState(null, journal)).toMatchObject({ blocked: false, replay: true });
    expect(chooseRestoredState(null).blocked).toBe(false);
  });
});
