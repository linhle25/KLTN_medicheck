"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminEmptyState, AdminPageHeader, AdminStatusBadge } from "@/components/AdminUI";
import MaterialIcon from "@/components/MaterialIcon";
import SelectField from "@/components/SelectField";
import { useMediAlert } from "@/components/MediAlertProvider";
import { ApiError, listAdminUsers, updateAdminUserStatus, type AdminUser } from "@/lib/api";

export default function AdminUsersPage() {
  const { toast } = useMediAlert();
  const [items, setItems] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await listAdminUsers({ q: query, role, status });
      setItems(result.items); setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không tải được danh sách người dùng.");
    } finally { setLoading(false); }
  }, [query, role, status]);

  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [load]);

  async function toggle(user: AdminUser) {
    const next = user.account_status === "locked" ? "active" : "locked";
    setBusyId(user.user_id);
    try {
      await updateAdminUserStatus(user.user_id, next);
      toast({ title: next === "locked" ? "Đã khóa tài khoản" : "Đã mở khóa tài khoản", message: user.email, tone: "success" });
      await load();
    } catch (err) {
      toast({ title: "Không thể cập nhật", message: err instanceof ApiError ? err.message : "Vui lòng thử lại.", tone: "info" });
    } finally { setBusyId(null); }
  }

  return (
    <main className="admin-page">
      <AdminPageHeader eyebrow="TÀI KHOẢN" title="Quản lý người dùng" icon="manage_accounts" description="Tra cứu bệnh nhân, dược sĩ và kiểm soát trạng thái truy cập hệ thống." />
      <section className="panel admin-toolbar">
        <label className="admin-search"><MaterialIcon name="search" size={21} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo họ tên hoặc email" /></label>
        <div className="admin-filter-select"><SelectField aria-label="Lọc vai trò" value={role} onChange={setRole} options={[{ value: "", label: "Tất cả vai trò" }, { value: "patient", label: "Bệnh nhân" }, { value: "pharmacist", label: "Dược sĩ" }]} /></div>
        <div className="admin-filter-select"><SelectField aria-label="Lọc trạng thái" value={status} onChange={setStatus} options={[{ value: "", label: "Tất cả trạng thái" }, { value: "active", label: "Đang hoạt động" }, { value: "locked", label: "Đã khóa" }, { value: "pending_email", label: "Chờ xác minh email" }, { value: "pending_pharmacist", label: "Chờ duyệt dược sĩ" }]} /></div>
      </section>
      <div className="admin-list-meta"><strong>{total} tài khoản</strong><span>Tối đa 200 kết quả gần nhất</span></div>
      {error && <div className="admin-alert admin-alert--error"><MaterialIcon name="error" size={20} />{error}</div>}
      {loading ? <div className="admin-loading"><span className="spinner" />Đang tải người dùng...</div> : items.length === 0 ? (
        <AdminEmptyState icon="person_search" title="Không tìm thấy tài khoản" description="Thử thay đổi từ khóa hoặc bộ lọc hiện tại." />
      ) : (
        <section className="panel admin-table-wrap">
          <table className="admin-table"><thead><tr><th>Người dùng</th><th>Vai trò</th><th>Xác minh</th><th>Trạng thái</th><th>Ngày tạo</th><th aria-label="Thao tác" /></tr></thead><tbody>
            {items.map((user) => <tr key={user.user_id}><td><div className="admin-user-cell"><span>{user.ho_ten.charAt(0).toUpperCase()}</span><div><strong>{user.ho_ten}</strong><small>{user.email}</small></div></div></td><td>{user.vai_tro === "pharmacist" ? "Dược sĩ" : "Bệnh nhân"}</td><td><span className={user.email_verified ? "admin-verified" : "admin-unverified"}><MaterialIcon name={user.email_verified ? "verified" : "mail"} size={17} />{user.email_verified ? "Đã xác minh" : "Chưa xác minh"}</span></td><td><AdminStatusBadge status={user.account_status} /></td><td>{user.ngay_tao ? new Date(user.ngay_tao).toLocaleDateString("vi-VN") : "—"}</td><td>{["active", "locked"].includes(user.account_status) ? <button className={user.account_status === "locked" ? "admin-action admin-action--unlock" : "admin-action admin-action--lock"} disabled={busyId === user.user_id} onClick={() => void toggle(user)}><MaterialIcon name={user.account_status === "locked" ? "lock_open" : "lock"} size={18} />{user.account_status === "locked" ? "Mở khóa" : "Khóa"}</button> : <span className="admin-action-pending">Chờ xử lý</span>}</td></tr>)}
          </tbody></table>
        </section>
      )}
    </main>
  );
}
