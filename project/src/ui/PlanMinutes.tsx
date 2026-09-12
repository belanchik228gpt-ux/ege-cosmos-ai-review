import { useEffect, useState } from 'react';

export function PlanMinutes({
  value,
  min = 5,
  onCommit,
  label,
}: {
  value: number;
  min?: number;
  onCommit: (value: number) => void;
  label: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next =
      draft.trim() && Number.isFinite(Number(draft))
        ? Math.max(min, Math.min(240, Math.round(Number(draft))))
        : value;
    setDraft(String(next));
    onCommit(next);
  };
  return (
    <input
      type="number"
      min={min}
      max={240}
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
