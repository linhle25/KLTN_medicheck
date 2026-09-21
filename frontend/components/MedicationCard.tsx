import MaterialIcon from "@/components/MaterialIcon";

type MedicationCardProps = {
  name: string;
  subtitle?: string | null;
  scheduleLabel?: string;
  scheduleTime?: string;
  onDelete?: () => void;
  deleting?: boolean;
  variant?: "default" | "add";
  onAdd?: () => void;
};

export default function MedicationCard({
  name,
  subtitle,
  scheduleLabel,
  scheduleTime,
  onDelete,
  deleting,
  variant = "default",
  onAdd,
}: MedicationCardProps) {
  if (variant === "add") {
    return (
      <button type="button" className="med-card med-card--add" onClick={onAdd}>
        <MaterialIcon name="add_circle" size={22} />
        <span>Thêm thuốc mới</span>
      </button>
    );
  }

  return (
    <article className="med-card">
      {scheduleLabel && (
        <div className="med-card__badge">
          <span>{scheduleLabel}</span>
          {onDelete && (
            <button
              type="button"
              className="med-card__menu"
              onClick={onDelete}
              disabled={deleting}
              aria-label="Xóa thuốc"
            >
              {deleting ? (
                <span className="spinner spinner--sm" aria-hidden="true" />
              ) : (
                <MaterialIcon name="more_vert" size={20} />
              )}
            </button>
          )}
        </div>
      )}

      <h4 className="med-card__name">{name}</h4>
      {subtitle && <p className="med-card__brand">{subtitle}</p>}

      {(scheduleTime || !scheduleLabel) && (
        <div className="med-card__schedule">
          <MaterialIcon name="schedule" size={16} />
          <span>{scheduleTime ?? (subtitle ? "" : "Đang theo dõi")}</span>
          {!scheduleLabel && onDelete && (
            <button
              type="button"
              className="med-card__menu med-card__menu--inline"
              onClick={onDelete}
              disabled={deleting}
              aria-label="Xóa thuốc"
            >
              {deleting ? (
                <span className="spinner spinner--sm" aria-hidden="true" />
              ) : (
                <MaterialIcon name="delete_outline" size={18} />
              )}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
