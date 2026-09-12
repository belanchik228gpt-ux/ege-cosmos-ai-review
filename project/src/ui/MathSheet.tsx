import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  Pencil,
  Eraser,
  Minus,
  Square,
  Circle,
  Type,
  Undo2,
  Redo2,
  Trash2,
  Download,
  Send,
  X,
  Expand,
} from 'lucide-react';
import {
  emptySheet,
  readSheet,
  sheetPoint,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  SHEET_LIMITS,
  type SheetDraft,
  type SheetStroke,
  type SheetTool,
} from '../domain/math-sheet';
import { renderSheet } from './math-sheet-render';
import {
  assignmentCheckContext,
  cleanSheetAssignment,
  composeSheetPng,
  type SheetAssignment,
} from './math-sheet-assignment';
import './math-sheet.css';
import { TutorMarkdown } from './TutorMarkdown';

const toolset = [
  { id: 'pen', label: 'Карандаш', Icon: Pencil },
  { id: 'eraser', label: 'Ластик', Icon: Eraser },
  { id: 'line', label: 'Прямая', Icon: Minus },
  { id: 'rectangle', label: 'Прямоугольник', Icon: Square },
  { id: 'ellipse', label: 'Овал', Icon: Circle },
  { id: 'text', label: 'Надпись', Icon: Type },
] as const;
export function MathSheet({
  lessonId,
  title,
  onClose,
  onCheck,
  assignment,
}: {
  lessonId: string;
  title: string;
  onClose: () => void;
  onCheck: (image: { dataUrl: string; name: string }, context: string) => void;
  assignment?: SheetAssignment;
}) {
  const reference = cleanSheetAssignment(assignment);
  const invalidReference = Boolean(assignment?.image && !reference?.image);
  const [referenceOpen, setReferenceOpen] = useState(false),
    [exporting, setExporting] = useState(false),
    [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => {
    setPhotoFailed(false);
    setReferenceOpen(false);
  }, [assignment?.image?.dataUrl]);
  const key = `cosmos-math-sheet-v1:${lessonId}`;
  const [draft, setDraft] = useState<SheetDraft>(() => {
    try {
      return readSheet(localStorage.getItem(key));
    } catch {
      return emptySheet();
    }
  });
  const [status, setStatus] = useState(''),
    [tool, setTool] = useState<SheetTool>('pen'),
    [color, setColor] = useState('#18243b'),
    [size, setSize] = useState(4),
    [zoom, setZoom] = useState(1),
    [label, setLabel] = useState('');
  const [savedPng, setSavedPng] = useState('');
  const [undo, setUndo] = useState<SheetStroke[][]>([]),
    [redo, setRedo] = useState<SheetStroke[][]>([]);
  const dialog = useRef<HTMLDialogElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    ink = useRef<HTMLCanvasElement | null>(null),
    active = useRef<SheetStroke | null>(null),
    pointer = useRef<number | null>(null),
    frame = useRef(0);
  const latest = useRef(draft);
  latest.current = draft;
  const save = (next: SheetDraft) => {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setStatus('Лист сохранён на этом компьютере');
    } catch {
      setStatus('Не удалось сохранить черновик. Скачай PNG, чтобы не потерять работу.');
    }
  };
  const draw = () => {
    if (!canvas.current) return;
    if (!ink.current) {
      ink.current = document.createElement('canvas');
      ink.current.width = SHEET_WIDTH;
      ink.current.height = SHEET_HEIGHT;
    }
    renderSheet(
      canvas.current,
      ink.current,
      [...latest.current.strokes, ...(active.current ? [active.current] : [])],
      latest.current.grid,
    );
  };
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      cancelAnimationFrame(frame.current);
    };
  }, []);
  useEffect(() => {
    draw();
  }, [draft]);
  const update = (next: SheetDraft) => {
    latest.current = next;
    setDraft(next);
    save(next);
  };
  const commit = (strokes: SheetStroke[]) => {
    const previous = latest.current.strokes;
    setUndo((v) => [...v.slice(-39), previous]);
    setRedo([]);
    update({ ...latest.current, strokes });
  };
  function finish(cancel = false) {
    const stroke = active.current;
    const captured = pointer.current;
    active.current = null;
    pointer.current = null;
    if (captured !== null && canvas.current?.hasPointerCapture(captured))
      canvas.current.releasePointerCapture(captured);
    cancelAnimationFrame(frame.current);
    if (stroke && !cancel) commit([...latest.current.strokes, stroke]);
    else draw();
  }
  function down(e: PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0 || pointer.current !== null) return;
    const total = latest.current.strokes.reduce((n, s) => n + s.points.length, 0);
    if (
      latest.current.strokes.length >= SHEET_LIMITS.strokes ||
      total >= SHEET_LIMITS.points - SHEET_LIMITS.perStroke
    ) {
      setStatus('Лист заполнен. Скачай PNG и начни новый лист.');
      return;
    }
    if (tool === 'text' && !label.trim()) {
      setStatus('Введи надпись в панели, затем нажми на лист.');
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointer.current = e.pointerId;
    active.current = {
      tool,
      color,
      size,
      points: [sheetPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())],
      ...(tool === 'text' ? { text: label.trim() } : {}),
    };
    draw();
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!active.current || pointer.current !== e.pointerId) return;
    if ((e.buttons & 1) === 0) {
      finish();
      return;
    }
    const p = sheetPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()),
      s = active.current;
    if (s.tool === 'text') return;
    if (s.tool === 'pen' || s.tool === 'eraser') {
      if (s.points.length >= SHEET_LIMITS.perStroke) {
        finish();
        return;
      }
      const last = s.points.at(-1)!;
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.6) return;
      s.points.push(p);
    } else s.points = [s.points[0], p];
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
  }
  const undoStroke = () => {
    if (active.current || !undo.length) return;
    setRedo((v) => [...v, draft.strokes]);
    update({ ...draft, strokes: undo.at(-1)! });
    setUndo((v) => v.slice(0, -1));
  };
  const redoStroke = () => {
    if (active.current || !redo.length) return;
    setUndo((v) => [...v, draft.strokes]);
    update({ ...draft, strokes: redo.at(-1)! });
    setRedo((v) => v.slice(0, -1));
  };
  const png = async () => {
    finish();
    draw();
    if (invalidReference || photoFailed) throw new Error('assignment image');
    return composeSheetPng(canvas.current!, reference);
  };
  return (
    <dialog
      ref={dialog}
      className="math-sheet"
      aria-label="Лист для решения"
      onCancel={(e) => {
        e.preventDefault();
        if (referenceOpen) {
          setReferenceOpen(false);
          return;
        }
        finish();
        onClose();
      }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).matches('input,textarea,select')) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          e.shiftKey ? redoStroke() : undoStroke();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
          e.preventDefault();
          redoStroke();
        }
      }}
    >
      <header>
        <div>
          <span>МАТЕМАТИКА · МОЁ РЕШЕНИЕ</span>
          <h2>{title}</h2>
        </div>
        <button
          aria-label="Закрыть лист"
          onClick={() => {
            finish();
            onClose();
          }}
        >
          <X size={22} />
        </button>
      </header>
      <div className="sheet-tools" role="toolbar" aria-label="Инструменты рисования">
        {toolset.map(({ id, label, Icon }) => (
          <button
            key={id}
            title={label}
            aria-label={label}
            aria-pressed={tool === id}
            onClick={() => setTool(id)}
          >
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
        <label>
          Цвет
          <input
            aria-label="Цвет карандаша"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <label>
          Толщина{' '}
          <input
            aria-label="Толщина линии"
            type="range"
            min="1"
            max="20"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
          <small>{size}</small>
        </label>
        <button aria-label="Отменить штрих" disabled={!undo.length} onClick={undoStroke}>
          <Undo2 size={19} />
        </button>
        <button aria-label="Вернуть штрих" disabled={!redo.length} onClick={redoStroke}>
          <Redo2 size={19} />
        </button>
        <button
          aria-label="Очистить лист"
          disabled={!draft.strokes.length}
          onClick={() => commit([])}
        >
          <Trash2 size={19} />
        </button>
        <label>
          <input
            type="checkbox"
            checked={draft.grid}
            onChange={(e) => update({ ...draft, grid: e.target.checked })}
          />
          Клетки
        </label>
        <select
          aria-label="Масштаб листа"
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        >
          <option value="1">Вписать лист</option>
          <option value="1.5">150%</option>
          <option value="2">200%</option>
        </select>
      </div>
      {tool === 'text' && (
        <input
          className="sheet-label"
          aria-label="Текст надписи"
          placeholder="Введи текст и нажми в нужном месте листа"
          maxLength={300}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      )}
      {(reference || invalidReference) && (
        <section className="sheet-assignment" aria-label="Условие над листом">
          <div className="sheet-assignment-heading">
            <strong>Условие перед глазами</strong>
            {reference?.image && !photoFailed && (
              <button onClick={() => setReferenceOpen(true)} aria-label="Увеличить фото задания">
                <Expand size={16} />
                Увеличить фото
              </button>
            )}
          </div>
          <div className="sheet-assignment-content">
            {reference?.image && !photoFailed && (
              <img
                src={reference.image.dataUrl}
                alt={`Фото задания: ${reference.image.name}`}
                onError={() => setPhotoFailed(true)}
                onClick={() => setReferenceOpen(true)}
              />
            )}
            {reference?.text && <TutorMarkdown text={reference.text} />}
            {(invalidReference || photoFailed) && (
              <p role="alert">
                Не удалось открыть фото условия. Черновик сохранён; вернись в диалог и прикрепи
                читаемый PNG, JPEG или WebP.
              </p>
            )}
          </div>
          <small>Ниже — твоё решение. Условие останется на месте, когда ты листаешь лист.</small>
        </section>
      )}
      <div className="sheet-viewport">
        <div className="sheet-paper" style={{ width: `${zoom * 100}%` }}>
          <canvas
            ref={canvas}
            width={SHEET_WIDTH}
            height={SHEET_HEIGHT}
            aria-label="Белый лист для рисования"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={(e) => {
              if (pointer.current === e.pointerId) finish();
            }}
            onPointerCancel={() => finish(true)}
            onLostPointerCapture={() => {
              if (active.current) finish();
            }}
          />
        </div>
      </div>
      <footer>
        <div>
          <label htmlFor="sheet-context">Условие или пояснение — по желанию</label>
          <input
            id="sheet-context"
            placeholder="Можно написать всё прямо на листе"
            maxLength={2000}
            value={draft.context}
            onChange={(e) => update({ ...draft, context: e.target.value })}
          />
          <small role="status">{status || 'Рисуй мышью или пером. Ctrl+Z — отмена.'}</small>
        </div>
        <button
          disabled={!draft.strokes.length || exporting || invalidReference || photoFailed}
          onClick={async () => {
            setSavedPng('');
            setExporting(true);
            try {
              const dataUrl = await png();
              if (window.cosmos?.saveMathSheet) {
                const result = await window.cosmos.saveMathSheet({ dataUrl });
                if (!result.ok || !result.path) throw new Error('save');
                setSavedPng(result.path);
                setStatus('PNG сохранён в папку документов Cosmos');
              } else {
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = 'Cosmos-моё-решение.png';
                a.click();
                setStatus('PNG передан для скачивания браузеру');
              }
            } catch {
              setStatus('Не удалось сохранить PNG. Черновик остаётся на листе — попробуй ещё раз.');
            } finally {
              setExporting(false);
            }
          }}
        >
          <Download size={18} />
          Скачать PNG
        </button>
        <button
          className="sheet-check"
          disabled={
            !draft.strokes.some((s) => s.tool !== 'eraser') ||
            exporting ||
            invalidReference ||
            photoFailed
          }
          onClick={async () => {
            setExporting(true);
            try {
              const dataUrl = await png();
              const pixels = ink
                .current!.getContext('2d')!
                .getImageData(0, 0, SHEET_WIDTH, SHEET_HEIGHT).data;
              if (!pixels.some((value, i) => i % 4 === 3 && value > 0)) {
                setStatus('Лист пустой. Напиши решение перед проверкой.');
                return;
              }
              onCheck(
                { dataUrl, name: 'Моё рукописное решение.png' },
                assignmentCheckContext(reference, draft.context),
              );
            } catch {
              setStatus(
                'Не удалось подготовить условие и решение. Черновик сохранён — попробуй ещё раз.',
              );
            } finally {
              setExporting(false);
            }
          }}
        >
          <Send size={18} />
          Проверить решение
        </button>
      </footer>
      {savedPng && (
        <p className="sheet-export-path" data-path={savedPng}>
          Файл сохранён: {savedPng}
        </p>
      )}
      <p className="sheet-hint">
        Cosmos прочитает изображение и проверит ход решения. Неразборчивые знаки нужно уточнить.
        Черновик остаётся в этом занятии.
      </p>
      {referenceOpen && reference?.image && (
        <div className="sheet-reference-zoom" role="region" aria-label="Увеличенное фото задания">
          <div>
            <strong>Фото задания</strong>
            <button autoFocus onClick={() => setReferenceOpen(false)}>
              <X size={18} />
              Вернуться к листу
            </button>
          </div>
          <img src={reference.image.dataUrl} alt="Условие задания крупно" />
          <p>Рисунок на листе сохранён. Escape — вернуться к решению.</p>
        </div>
      )}
    </dialog>
  );
}
