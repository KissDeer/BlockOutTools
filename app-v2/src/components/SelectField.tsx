interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onCommit: (value: T) => void;
}

export function SelectField<T extends string>({ label, value, options, onCommit }: SelectFieldProps<T>) {
  return (
    <label className="select-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onCommit(event.target.value as T)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
