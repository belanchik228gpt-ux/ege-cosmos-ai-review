import { SHEET_HEIGHT, SHEET_WIDTH, type SheetStroke } from '../domain/math-sheet';

export function renderSheet(
  canvas: HTMLCanvasElement,
  ink: HTMLCanvasElement,
  strokes: SheetStroke[],
  grid: boolean,
) {
  const ctx = canvas.getContext('2d'),
    pen = ink.getContext('2d');
  if (!ctx || !pen) throw new Error('canvas');
  pen.clearRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);
  for (const s of strokes) {
    const a = s.points[0],
      b = s.points.at(-1)!;
    pen.save();
    pen.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    pen.strokeStyle = pen.fillStyle = s.color;
    pen.lineWidth = s.tool === 'eraser' ? s.size * 5 : s.size;
    pen.lineCap = pen.lineJoin = 'round';
    pen.beginPath();
    if (s.tool === 'text') {
      pen.font = `${Math.max(20, s.size * 5)}px "Segoe UI", sans-serif`;
      pen.textBaseline = 'top';
      pen.fillText(s.text || '', a.x, a.y, SHEET_WIDTH - a.x);
    } else if (s.tool === 'rectangle') pen.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    else if (s.tool === 'ellipse') {
      pen.ellipse(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        Math.abs(b.x - a.x) / 2,
        Math.abs(b.y - a.y) / 2,
        0,
        0,
        Math.PI * 2,
      );
      pen.stroke();
    } else if (s.points.length === 1) {
      pen.arc(a.x, a.y, pen.lineWidth / 2, 0, Math.PI * 2);
      pen.fill();
    } else {
      pen.moveTo(a.x, a.y);
      for (const p of s.tool === 'line' ? [b] : s.points.slice(1)) pen.lineTo(p.x, p.y);
      pen.stroke();
    }
    pen.restore();
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);
  if (grid) {
    ctx.strokeStyle = '#e7edf5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= SHEET_WIDTH; x += 35) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, SHEET_HEIGHT);
    }
    for (let y = 0; y <= SHEET_HEIGHT; y += 35) {
      ctx.moveTo(0, y);
      ctx.lineTo(SHEET_WIDTH, y);
    }
    ctx.stroke();
  }
  ctx.drawImage(ink, 0, 0);
}
