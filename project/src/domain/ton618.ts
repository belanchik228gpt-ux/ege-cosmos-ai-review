export const ton618Variants = [
  { id: 'bronze', title: 'Бронзовый', color: '#bd9970', image: 'DefaultBackground/ton618-default-static.webp', video: 'ton618-bronze-1920.mp4', bytes: 35344598 },
  { id: 'warm-gold', title: 'Золотой', color: '#f6c871', image: 'PalettePreviews/ton618-palette-warm-gold.webp', video: 'ton618-warm-gold-1920.mp4', bytes: 34834472 },
  { id: 'deep-blue', title: 'Синий', color: '#6caaff', image: 'PalettePreviews/ton618-palette-deep-blue.webp', video: 'ton618-deep-blue-1920.mp4', bytes: 33385792 },
  { id: 'violet', title: 'Фиолетовый', color: '#b090ff', image: 'PalettePreviews/ton618-palette-violet-cosmos.webp', video: 'ton618-violet-1920.mp4', bytes: 32534149 },
  { id: 'red-solar', title: 'Красный', color: '#ff796a', image: 'PalettePreviews/ton618-palette-red-solar.webp', video: 'ton618-red-solar-1920.mp4', bytes: 32912664 },
  { id: 'monochrome', title: 'Чёрно-белый', color: '#d2d6dc', image: 'PalettePreviews/ton618-palette-monochrome.webp', video: 'ton618-monochrome-1920.mp4', bytes: 32515151 },
] as const;
export type Ton618Variant = typeof ton618Variants[number];
export function ton618Variant(background: string): Ton618Variant | undefined {
  if (['cosmos', 'cosmos-ton618'].includes(background)) return ton618Variants[0];
  return ton618Variants.find(v => background === `ton618-${v.id}`);
}
// Relative URLs work with the desktop file:// entry point and Vite's base path.
export const ton618Poster = (v: Ton618Variant) => `ton618/${v.image}`;
export const ton618Video = (v: Ton618Variant) => 'video' in v ? `ton618/PaletteVideos/${v.video}` : undefined;
