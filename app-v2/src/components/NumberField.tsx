import { useEffect, useState } from "react";

interface NumberFieldProps {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  step?: number;
  min?: number;
  unit?: string;
}

export function NumberField({ label, value, onCommit, step = 10, min, unit = "cm" }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(Number(value.toFixed(3)))), [value]);

  function commit() {
    const next = Number(draft);
    if (!Number.isFinite(next) || (min != null && next < min)) {
      setDraft(String(value));
      return;
    }
    if (next !== value) onCommit(next);
  }

  return (
    <label className="number-field">
      <span>{label}</span>
      <span className="number-input-wrap">
        <input
          type="number"
          value={draft}
          step={step}
          min={min}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(String(value));
              event.currentTarget.blur();
            }
          }}
        />
        {unit ? <small>{unit}</small> : null}
      </span>
    </label>
  );
}
