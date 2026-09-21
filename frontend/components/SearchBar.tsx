import MaterialIcon from "@/components/MaterialIcon";

type SearchBarProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  icon?: string;
  required?: boolean;
};

export default function SearchBar({
  id,
  value,
  onChange,
  placeholder = "Tìm tên thuốc...",
  label,
  icon = "clinical_notes",
  required,
}: SearchBarProps) {
  return (
    <div className="search-bar">
      {label && (
        <label htmlFor={id} className="search-bar__label">
          {label}
        </label>
      )}
      <div className="search-bar__field icon-input-spacing">
        <MaterialIcon name={icon} size={20} className="search-bar__icon" />
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
        />
      </div>
    </div>
  );
}
