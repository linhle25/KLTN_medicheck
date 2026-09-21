import type { ReactNode } from "react";
import MaterialIcon from "@/components/MaterialIcon";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  icon,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: string;
  action?: ReactNode;
}) {
  return (
    <header className="admin-page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title-icon"><MaterialIcon name={icon} size={27} />{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="admin-page-heading__action">{action}</div>}
    </header>
  );
}

export function AdminEmptyState({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="admin-empty-state">
      <span><MaterialIcon name={icon} size={29} /></span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

const statusLabels: Record<string, string> = {
  active: "Đang hoạt động",
  locked: "Đã khóa",
  pending_email: "Chờ xác minh email",
  pending_pharmacist: "Chờ duyệt dược sĩ",
  rejected: "Đã từ chối",
  new: "Mới",
  in_progress: "Đang xử lý",
  resolved: "Đã xử lý",
};

export function AdminStatusBadge({ status }: { status: string }) {
  return <span className={`admin-status admin-status--${status}`}>{statusLabels[status] || status}</span>;
}
