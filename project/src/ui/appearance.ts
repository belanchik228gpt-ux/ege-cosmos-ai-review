import type { LearningState } from '../domain';

export const palettes = [
  {
    id: 'cosmos',
    title: 'Тихая орбита',
    accent: '#bca5f5',
    space: '#0e0d16',
    description: 'Лавандовый свет и глубокий индиго',
  },
  {
    id: 'aurora',
    title: 'Северное сияние',
    accent: '#8cdec0',
    space: '#0b1413',
    description: 'Мята, хвоя и спокойное свечение',
  },
  {
    id: 'ocean',
    title: 'Далёкий океан',
    accent: '#88cff2',
    space: '#0b121c',
    description: 'Голубые акценты в ночном космосе',
  },
  {
    id: 'amber',
    title: 'Золотая пыль',
    accent: '#edc38c',
    space: '#17110d',
    description: 'Тёплый янтарный свет',
  },
  {
    id: 'rose',
    title: 'Розовая туманность',
    accent: '#ecaacb',
    space: '#180e16',
    description: 'Мягкий розовый и сливовые оттенки',
  },
] as const;
const validHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
function rgb(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
export function mixColors(a: string, b: string, ratio: number) {
  const x = rgb(a),
    y = rgb(b);
  return (
    '#' +
    x
      .map((v, i) =>
        Math.round(v * (1 - ratio) + y[i] * ratio)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
function luminance(hex: string) {
  return rgb(hex)
    .map((v) => {
      const n = v / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
export function contrastRatio(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function themeValues(settings: LearningState['settings']) {
  const preset = palettes.find((p) => p.id === settings.palette) || palettes[0];
  let space =
    settings.palette === 'custom' && validHex(settings.spaceColor)
      ? settings.spaceColor
      : preset.space;
  // The application intentionally remains dark; arbitrary chosen hues retain readable light text.
  while (luminance(space) > 0.035) space = mixColors(space, '#000000', 0.12);
  let accent =
    settings.palette === 'custom' && validHex(settings.accentColor)
      ? settings.accentColor
      : preset.accent;
  while (contrastRatio(accent, space) < 5) accent = mixColors(accent, '#ffffff', 0.12);
  const surface = mixColors(space, accent, 0.055),
    raised = mixColors(space, accent, 0.1);
  const ink =
    contrastRatio(accent, '#101015') >= contrastRatio(accent, '#ffffff') ? '#101015' : '#ffffff';
  return {
    '--space': space,
    '--accent': accent,
    '--accent-ink': ink,
    '--accent-soft': mixColors(space, accent, 0.16),
    '--accent-glow': accent + '25',
    '--surface': surface,
    '--surface-raised': raised,
    '--text': settings.contrast === 'high' ? '#ffffff' : '#efedf8',
    '--muted': settings.contrast === 'high' ? '#d1ceda' : '#b3adbf',
    '--stroke': settings.contrast === 'high' ? '#ffffff55' : '#ffffff16',
    '--text-scale': String({ normal: 1, comfortable: 1.1, large: 1.2 }[settings.textScale] || 1),
  };
}
export function applyAppearance(settings: LearningState['settings']) {
  for (const [key, value] of Object.entries(themeValues(settings)))
    document.documentElement.style.setProperty(key, value);
  document.documentElement.dataset.contrast = settings.contrast;
  document.documentElement.dataset.palette = settings.palette;
  const root = document.documentElement;
  const attributes = {
    uiMotion: settings.uiMotion,
    motionSpeed: settings.motionSpeed,
    glow: settings.glow,
    hoverEffects: String(settings.hoverEffects),
    animatedBackground: String(settings.animatedBackground),
    reducedMotion: String(settings.reducedMotion),
    quality: settings.quality,
    density: settings.density,
    cornerStyle: settings.cornerStyle,
    contentWidth: settings.contentWidth,
    lessonLayout: settings.lessonLayout,
    fontFamily: settings.fontFamily,
    background: settings.background,
  };
  for (const [key, value] of Object.entries(attributes)) root.dataset[key] = value;
  root.style.setProperty(
    '--panel-radius',
    settings.cornerStyle === 'rounded'
      ? '26px'
      : settings.cornerStyle === 'square'
        ? '5px'
        : '18px',
  );
  root.style.setProperty(
    '--control-radius',
    settings.cornerStyle === 'rounded'
      ? '16px'
      : settings.cornerStyle === 'square'
        ? '4px'
        : '10px',
  );
  root.style.setProperty(
    '--content-width',
    settings.contentWidth === 'comfortable' ? '1380px' : '1740px',
  );
  root.style.setProperty(
    '--body-font',
    settings.fontFamily === 'humanist'
      ? "'Trebuchet MS', 'Segoe UI', sans-serif"
      : "'Segoe UI Variable', 'Segoe UI', sans-serif",
  );
}
