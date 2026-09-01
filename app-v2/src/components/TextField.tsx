import { useEffect, useState } from "react";

interface TextFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}

export function TextField({ label, value, onCommit }: TextFieldProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="text-field">
      <span>{label}</span>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = draft.trim();
          if (next && next !== value) onCommit(next);
          else setDraft(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") { setDraft(value); event.currentTarget.blur(); }
        }}
      />
    </label>
  );
}
