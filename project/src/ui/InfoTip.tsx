import { useId, useState } from 'react';
import { Info } from 'lucide-react';

/** Secondary context, available to keyboard, pointer and touch users. */
export function InfoTip({ text }: { text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className="info-tip"
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setOpen(false);
          e.stopPropagation();
        }
      }}
    >
      <button
        type="button"
        aria-label="Подробнее"
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Info size={16} />
      </button>
      <span id={id} role="tooltip" className={open ? 'is-open' : ''}>
        {text}
      </span>
    </span>
  );
}
