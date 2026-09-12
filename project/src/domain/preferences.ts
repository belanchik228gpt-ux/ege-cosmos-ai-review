import type { LearningState } from './types';
export type Preferences = LearningState['settings'];

const enumOptions = {
  quality: ['high', 'medium', 'low', 'static'],
  palette: ['cosmos', 'aurora', 'ocean', 'amber', 'rose', 'custom'],
  textScale: ['normal', 'comfortable', 'large'],
  contrast: ['soft', 'high'],
  uiMotion: ['off', 'gentle', 'expressive'],
  motionSpeed: ['slow', 'normal', 'fast'],
  glow: ['off', 'soft', 'vivid'],
  density: ['comfortable', 'compact'],
  cornerStyle: ['soft', 'rounded', 'square'],
  contentWidth: ['comfortable', 'wide'],
  lessonLayout: ['balanced', 'visual', 'dialogue'],
  fontFamily: ['system', 'humanist'],
  documentStyle: ['cosmos', 'paper'],
  documentScale: ['comfortable', 'large'],
} as const;
const booleans = [
  'reducedMotion',
  'voice',
  'focusMode',
  'hoverEffects',
  'animatedBackground',
  'sceneAutoplay',
  'sourceDetailsExpanded',
  'enterToSend',
  'autoHomework',
  'showReviewReminders',
] as const;

/** Read only known keys. Importing a visual preference never imports learning evidence. */
export function hydratePreferences(input: unknown, defaults: Preferences): Preferences {
  const out = { ...defaults };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  const raw = input as Record<string, unknown>;
  for (const [key, options] of Object.entries(enumOptions)) {
    if (typeof raw[key] === 'string' && (options as readonly string[]).includes(raw[key] as string))
      (out as unknown as Record<string, unknown>)[key] = raw[key];
  }
  for (const key of booleans) if (typeof raw[key] === 'boolean') out[key] = raw[key];
  for (const key of ['accentColor', 'spaceColor'] as const)
    if (typeof raw[key] === 'string' && /^#[0-9a-f]{6}$/i.test(raw[key])) out[key] = raw[key];
  if (typeof raw.background === 'string' && raw.background.length <= 200)
    out.background = raw.background;
  if ([0.5, 1, 1.5, 2].includes(raw.sceneSpeed as number))
    out.sceneSpeed = raw.sceneSpeed as Preferences['sceneSpeed'];
  for (const [key, min, max] of [
    ['voiceRate', 0.6, 1.5],
    ['voicePitch', 0.7, 1.3],
    ['voiceVolume', 0, 1],
  ] as const) {
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max)
      out[key] = value;
  }
  return out;
}

export const preferencePresets: Array<{
  id: string;
  title: string;
  description: string;
  patch: Partial<Preferences>;
}> = [
  {
    id: 'neon',
    title: 'Неоновая ночь',
    description: 'Яркое свечение, живая орбита и выразительные переходы.',
    patch: {
      palette: 'cosmos',
      glow: 'vivid',
      uiMotion: 'expressive',
      motionSpeed: 'normal',
      hoverEffects: true,
      animatedBackground: true,
      reducedMotion: false,
      quality: 'high',
      contrast: 'soft',
      cornerStyle: 'rounded',
    },
  },
  {
    id: 'quiet',
    title: 'Тихая библиотека',
    description: 'Минимум движения, спокойные карточки и крупный текст.',
    patch: {
      palette: 'aurora',
      glow: 'soft',
      uiMotion: 'gentle',
      motionSpeed: 'slow',
      animatedBackground: false,
      textScale: 'comfortable',
      hoverEffects: true,
      contrast: 'soft',
      cornerStyle: 'soft',
    },
  },
  {
    id: 'lightweight',
    title: 'Лёгкий Cosmos',
    description: 'Без декоративного движения и свечения. Учебные шаги остаются.',
    patch: {
      quality: 'low',
      glow: 'off',
      uiMotion: 'off',
      hoverEffects: false,
      animatedBackground: false,
      sceneAutoplay: false,
      contrast: 'high',
    },
  },
  {
    id: 'read',
    title: 'Всё хорошо видно',
    description: 'Текст +20%, чёткие границы и больше места для объяснений.',
    patch: {
      textScale: 'large',
      contrast: 'high',
      density: 'comfortable',
      lessonLayout: 'dialogue',
      glow: 'soft',
      contentWidth: 'wide',
    },
  },
];
