"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminEmptyState, AdminPageHeader, AdminStatusBadge } from "@/components/AdminUI";
import MaterialIcon from "@/components/MaterialIcon";
import SelectField from "@/components/SelectField";
import { useMediAlert } from "@/components/MediAlertProvider";
import { ApiError, listAdminFeedback, updateAdminFeedback, type AdminFeedback } from "@/lib/api";

const categories: Record<string, string> = { wrong_result: "Kết quả chưa chính xác", technical: "Lỗi kỹ thuật", account: "Tài khoản", other: "Khác" };

export default function AdminFeedbackPage() {
  const { toast } = useMediAlert();
  const [items, setItems] = useState<AdminFeedback[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await listAdminFeedback(status)); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Không tải được phản hồi."); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { void load(); }, [load]);

  async function update(item: AdminFeedback, next: AdminFeedback["status"]) {
    try {
      await updateAdminFeedback(item.id, next, note);
      toast({ title: "Đã cập nhật phản hồi", message: `Trạng thái: ${next === "resolved" ? "Đã xử lý" : "Đang xử lý"}.`, tone: "success" });
      setExpanded(null); setNote(""); await load();
    } catch (err) { toast({ title: "Không thể cập nhật", message: err instanceof ApiError ? err.message : "Vui lòng thử lại.", tone: "info" }); }
  }

  return (
    <main className="admin-page">
      <AdminPageHeader eyebrow="HỖ TRỢ" title="Phản hồi & báo lỗi" icon="feedback" description="Theo dõi phản ánh về kết quả kiểm tra, lỗi kỹ thuật và vấn đề tài khoản." action={<div className="admin-filter-select"><SelectField aria-label="Lọc phản hồi" value={status} onChange={setStatus} options={[{ value: "", label: "Tất cả trạng thái" }, { value: "new", label: "Mới" }, { value: "in_progress", label: "Đang xử lý" }, { value: "resolved", label: "Đã xử lý" }]} /></div>} />
      {error && <div className="admin-alert admin-alert--error"><MaterialIcon name="error" size={20} />{error}</div>}
      {loading ? <div className="admin-loading"><span className="spinner" />Đang tải phản hồi...</div> : items.length === 0 ? <AdminEmptyState icon="mark_email_read" title="Không có phản hồi trong mục này" description="Các phản hồi mới của người dùng sẽ xuất hiện tại đây." /> : (
        <section className="admin-feedback-list">{items.map((item) => <article className="panel admin-feedback-card" key={item.id}><div className="admin-feedback-card__top"><span className="admin-feedback-card__icon"><MaterialIcon name={item.category === "wrong_result" ? "fact_check" : item.category === "technical" ? "bug_report" : "support_agent"} size={22} /></span><div><div className="admin-feedback-card__meta"><span>{categories[item.category] || item.category}</span><time>{new Date(item.ngay_tao).toLocaleString("vi-VN")}</time></div><h2>{item.title}</h2><p className="admin-feedback-card__user">{item.user_name} · {item.user_email}</p></div><AdminStatusBadge status={item.status} /></div><p className="admin-feedback-card__description">{item.description}</p>{item.resolution_note && <div className="admin-feedback-card__resolution"><MaterialIcon name="task_alt" size={18} /><p><strong>Ghi chú xử lý:</strong> {item.resolution_note}</p></div>}<div className="admin-feedback-card__actions">{item.status !== "resolved" && <button className="secondary" onClick={() => { setExpanded(expanded === item.id ? null : item.id); setNote(item.resolution_note || ""); }}><MaterialIcon name="edit_note" size={18} />Cập nhật xử lý</button>}</div>{expanded === item.id && <div className="admin-feedback-editor"><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú cách xử lý hoặc kết quả kiểm tra..." /><div><button className="secondary" onClick={() => void update(item, "in_progress")}>Đánh dấu đang xử lý</button><button className="primary" onClick={() => void update(item, "resolved")}><MaterialIcon name="check" size={18} />Hoàn tất</button></div></div>}</article>)}</section>
      )}
    </main>
  );
}
