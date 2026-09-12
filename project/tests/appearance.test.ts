import { describe, expect, it } from 'vitest';
import { createState, hydrateState, startSession } from '../src/domain';
import { contrastRatio, palettes, themeValues } from '../src/ui/appearance';

describe('readable appearance and personal lesson tools', () => {
  it('keeps text and primary actions legible in every preset and extreme custom hue', () => {
    const base = createState().settings;
    const variants = [
      ...palettes.map((p) => ({ ...base, palette: p.id })),
      ...['#000000', '#ffffff', '#ff0000', '#0000ff'].flatMap((accentColor) =>
        ['#000000', '#ffffff', '#00ff00'].map((spaceColor) => ({
          ...base,
          palette: 'custom' as const,
          accentColor,
          spaceColor,
        })),
      ),
    ];
    for (const settings of variants) {
      const v = themeValues(settings);
      expect(contrastRatio(v['--text'], v['--surface'])).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(v['--accent'], v['--space'])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(v['--accent'], v['--accent-ink'])).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('migrates old settings safely and rejects arbitrary CSS values', () => {
    const original = createState('Оля');
    const old = {
      ...original,
      settings: {
        quality: 'low',
        background: 'quiet',
        palette: 'unknown',
        accentColor: 'url(https://example.com)',
        spaceColor: '#fff',
      },
      bookmarks: ['math-rectangle', 'missing-topic', 'math-rectangle'],
    };
    const result = hydrateState(old);
    expect(result.settings.palette).toBe('cosmos');
    expect(result.settings.accentColor).toBe('#bca5f5');
    expect(result.settings.spaceColor).toBe('#0e0d16');
    expect(result.settings.quality).toBe('low');
    expect(result.bookmarks).toEqual(['math-rectangle']);
  });
  it('restores a note, palette and bookmarks without converting the note to an attempt', () => {
    const started = startSession(createState('Оля'), 'math-rectangle');
    started.state.sessions[started.sessionId].note = '7 + 7 + 7. Проверю умножением.';
    started.state.settings = {
      ...started.state.settings,
      palette: 'ocean',
      textScale: 'large',
      focusMode: true,
    };
    started.state.bookmarks = ['math-rectangle'];
    const restored = hydrateState(JSON.parse(JSON.stringify(started.state)));
    expect(restored.sessions[started.sessionId].note).toContain('7 + 7');
    expect(restored.settings.palette).toBe('ocean');
    expect(restored.settings.focusMode).toBe(true);
    expect(restored.bookmarks).toEqual(['math-rectangle']);
    expect(restored.progress['math-rectangle']?.attempts ?? []).toEqual([]);
  });
});
