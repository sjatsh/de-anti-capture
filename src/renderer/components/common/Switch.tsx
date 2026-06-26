interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  title?: string;
  small?: boolean;
}

export function Switch({ checked, onChange, label, title, small }: SwitchProps) {
  return (
    <label className={`switch${small ? ' sm' : ''}`} title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track"><span className="thumb" /></span>
      <span className="switch-label">{label}</span>
    </label>
  );
}
