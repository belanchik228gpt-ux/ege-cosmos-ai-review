import { sheetMathText } from './sheet-math-text';

export type SheetAssignment = {
  text?: string;
  image?: { dataUrl: string; name: string };
};

export const ASSIGNMENT_LIMITS = {
  text: 4000,
  dataUrl: Math.ceil((10 * 1024 * 1024) / 3) * 4 + 40,
  pixels: 32_000_000,
};

/** Only embedded raster attachments: never fetch URLs or interpret SVG/HTML. */
export function cleanSheetAssignment(value?: SheetAssignment): SheetAssignment | undefined {
  if (!value) return undefined;
  const text =
    typeof value.text === 'string' ? value.text.trim().slice(0, ASSIGNMENT_LIMITS.text) : '';
  const candidate = value.image;
  const image =
    candidate &&
    typeof candidate.dataUrl === 'string' &&
    candidate.dataUrl.length <= ASSIGNMENT_LIMITS.dataUrl &&
    /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(candidate.dataUrl)
      ? { dataUrl: candidate.dataUrl, name: String(candidate.name || 'Условие').slice(0, 200) }
      : undefined;
  return text || image ? { ...(text ? { text } : {}), ...(image ? { image } : {}) } : undefined;
}

export function assignmentCheckContext(assignment: SheetAssignment | undefined, context: string) {
  if (!assignment) return context;
  return [
    'На изображении две отдельные области. Верхняя «УСЛОВИЕ ЗАДАНИЯ» — исходное условие или фотография задания, не моя самостоятельная работа. Нижняя «МОЁ РЕШЕНИЕ» — мои рукописные шаги: проверяй именно их. Не засчитывай напечатанные ответы из условия как моё решение. Если знак на фото неразборчив, уточни его.',
    assignment.text ? `Текст условия: ${assignment.text}` : '',
    context.trim() ? `Моё пояснение: ${context.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function wrapAssignmentText(
  text: string,
  measure: (value: string) => number,
  maxWidth: number,
) {
  const lines: string[] = [];
  let current = '';
  // Preserve every character while permitting long equations/tokens to wrap.
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ')) {
    if (current && measure(`${current} ${word}`) <= maxWidth) {
      current += ` ${word}`;
      continue;
    }
    if (current) {
      lines.push(current);
      current = '';
    }
    for (const ch of word) {
      if (current && measure(current + ch) > maxWidth) {
        lines.push(current);
        current = '';
      }
      current += ch;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function loadAssignmentImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const photo = new Image();
    const timer = window.setTimeout(() => {
      photo.onload = photo.onerror = null;
      reject(new Error('image timeout'));
    }, 8000);
    photo.onload = () => {
      clearTimeout(timer);
      if (
        !photo.naturalWidth ||
        !photo.naturalHeight ||
        photo.naturalWidth * photo.naturalHeight > ASSIGNMENT_LIMITS.pixels
      )
        reject(new Error('image dimensions'));
      else resolve(photo);
    };
    photo.onerror = () => {
      clearTimeout(timer);
      reject(new Error('image decode'));
    };
    photo.src = dataUrl;
  });
}

/** Keeps original ink coordinates; assignment is added above, never painted over the draft. */
export async function composeSheetPng(sheet: HTMLCanvasElement, assignment?: SheetAssignment) {
  if (!assignment) return sheet.toDataURL('image/png');
  const reference = cleanSheetAssignment(assignment);
  if (!reference || (assignment.image && !reference.image)) throw new Error('invalid assignment');
  const photo = reference.image ? await loadAssignmentImage(reference.image.dataUrl) : undefined;
  const output = document.createElement('canvas');
  output.width = sheet.width;
  const ctx = output.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.font = '22px "Segoe UI", sans-serif';
  const allLines = wrapAssignmentText(
    sheetMathText(reference.text || ''),
    (value) => ctx.measureText(value).width,
    output.width - 64,
  );
  const lines = allLines.slice(0, 20);
  if (allLines.length > 20) lines.push('… Полный текст условия передан в сообщении.');
  const scale = photo
    ? Math.min((output.width - 64) / photo.naturalWidth, 460 / photo.naturalHeight, 1)
    : 0;
  const photoHeight = photo ? Math.ceil(photo.naturalHeight * scale) : 0;
  const top = 116 + lines.length * 28 + (photo ? photoHeight + 20 : 0);
  output.height = top + sheet.height;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, output.width, output.height);
  ctx.fillStyle = '#f0edf8';
  ctx.fillRect(0, 0, output.width, top - 44);
  ctx.fillStyle = '#59378f';
  ctx.font = 'bold 20px "Segoe UI", sans-serif';
  ctx.fillText('УСЛОВИЕ ЗАДАНИЯ · исходный материал', 32, 34);
  ctx.fillStyle = '#202334';
  ctx.font = '22px "Segoe UI", sans-serif';
  lines.forEach((line, index) => ctx.fillText(line, 32, 69 + index * 28));
  if (photo)
    ctx.drawImage(
      photo,
      (output.width - photo.naturalWidth * scale) / 2,
      64 + lines.length * 28,
      photo.naturalWidth * scale,
      photoHeight,
    );
  ctx.fillStyle = '#e9eff7';
  ctx.fillRect(0, top - 44, output.width, 44);
  ctx.fillStyle = '#18243b';
  ctx.font = 'bold 20px "Segoe UI", sans-serif';
  ctx.fillText('МОЁ РЕШЕНИЕ · самостоятельные рукописные шаги', 32, top - 15);
  ctx.drawImage(sheet, 0, top);
  return output.toDataURL('image/png');
}
