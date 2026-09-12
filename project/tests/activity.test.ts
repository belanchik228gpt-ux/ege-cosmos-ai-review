import { describe, it, expect } from 'vitest';
import { acceptsActivity } from '../src/ui/useLessonActivity';
describe('native visibility overrides stale Chromium focus', () => {
  it('does not count a hidden or minimized native window even when Chromium still reports focused', () => {
    expect(
      acceptsActivity({ visible: true, focused: true }, { visible: false, focused: true }),
    ).toBe(false);
    expect(
      acceptsActivity({ visible: true, focused: true }, { visible: true, focused: false }),
    ).toBe(false);
    expect(acceptsActivity({ visible: true, focused: true }, null)).toBe(false);
  });
  it('allows ordinary active native and browser lessons', () => {
    expect(
      acceptsActivity({ visible: true, focused: true }, { visible: true, focused: true }),
    ).toBe(true);
    expect(acceptsActivity({ visible: true, focused: true })).toBe(true);
    expect(
      acceptsActivity({ visible: false, focused: true }, { visible: true, focused: true }),
    ).toBe(false);
  });
});
