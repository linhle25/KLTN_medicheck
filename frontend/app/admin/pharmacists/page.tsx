"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminEmptyState, AdminPageHeader } from "@/components/AdminUI";
import MaterialIcon from "@/components/MaterialIcon";
import { useMediAlert } from "@/components/MediAlertProvider";
import { ApiError, approvePharmacist, listPendingPharmacists, rejectPharmacist, type PendingPharmacist } from "@/lib/api";

export default function AdminPharmacistsPage() {
  const { toast } = useMediAlert();
  const [items, setItems] = useState<PendingPharmacist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingPharmacist | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await listPendingPharmacists()); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Không tải được danh sách hồ sơ."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function approve(item: PendingPharmacist) {
    setBusyId(item.user_id);
    try {
      await approvePharmacist(item.user_id);
      toast({ title: "Đã duyệt dược sĩ", message: `${item.ho_ten} có thể sử dụng chức năng dược sĩ.`, tone: "success" });
      await load();
    } catch (err) { toast({ title: "Không thể phê duyệt", message: err instanceof ApiError ? err.message : "Vui lòng thử lại.", tone: "info" }); }
    finally { setBusyId(null); }
  }

  async function reject() {
    if (!rejecting || reason.trim().length < 3) return;
    setBusyId(rejecting.user_id);
    try {
      await rejectPharmacist(rejecting.user_id, reason.trim());
      toast({ title: "Đã từ chối hồ sơ", message: "Tài khoản được chuyển sang vai trò bệnh nhân.", tone: "info" });
      setRejecting(null); setReason(""); await load();
    } catch (err) { toast({ title: "Không thể từ chối", message: err instanceof ApiError ? err.message : "Vui lòng thử lại.", tone: "info" }); }
    finally { setBusyId(null); }
  }

  return (
    <main className="admin-page">
      <AdminPageHeader eyebrow="XÁC MINH CHUYÊN MÔN" title="Duyệt hồ sơ dược sĩ" icon="verified_user" description="Đối chiếu số chứng chỉ hành nghề và nơi công tác trước khi cấp quyền dược sĩ." action={<button className="secondary" onClick={() => void load()} disabled={loading}><MaterialIcon name="refresh" size={18} />Làm mới</button>} />
      <div className="admin-review-banner"><span><MaterialIcon name="policy" size={24} /></span><div><strong>Nguyên tắc xét duyệt</strong><p>Chỉ phê duyệt khi thông tin CCHN và nơi công tác có thể đối chiếu. Khi từ chối, tài khoản vẫn được sử dụng với vai trò bệnh nhân.</p></div></div>
      {error && <div className="admin-alert admin-alert--error"><MaterialIcon name="error" size={20} />{error}</div>}
      {loading ? <div className="admin-loading"><span className="spinner" />Đang tải hồ sơ...</div> : items.length === 0 ? <AdminEmptyState icon="assignment_turned_in" title="Không có hồ sơ đang chờ" description="Tất cả yêu cầu đăng ký dược sĩ đã được xử lý." /> : (
        <section className="admin-pharmacist-grid">{items.map((item) => <article className="panel admin-pharmacist-card" key={item.user_id}><div className="admin-pharmacist-card__header"><span>{item.ho_ten.charAt(0).toUpperCase()}</span><div><h2>{item.ho_ten}</h2><p>{item.email}</p></div><small><MaterialIcon name="schedule" size={15} />{new Date(item.ngay_tao).toLocaleDateString("vi-VN")}</small></div><dl><div><dt><MaterialIcon name="license" size={19} />Số CCHN</dt><dd>{item.so_chung_chi_hanh_nghe || "Chưa cung cấp"}</dd></div><div><dt><MaterialIcon name="apartment" size={19} />Nơi công tác</dt><dd>{item.noi_cong_tac || "Chưa cung cấp"}</dd></div></dl><div className="admin-pharmacist-card__actions"><button className="admin-reject-button" onClick={() => { setRejecting(item); setReason(""); }} disabled={busyId === item.user_id}><MaterialIcon name="close" size={19} />Từ chối</button><button className="primary" onClick={() => void approve(item)} disabled={busyId === item.user_id}>{busyId === item.user_id ? <span className="spinner spinner--sm" /> : <MaterialIcon name="check" size={19} />}Duyệt dược sĩ</button></div></article>)}</section>
      )}
      {rejecting && <div className="admin-modal-backdrop" role="presentation" onMouseDown={() => setRejecting(null)}><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="reject-title" onMouseDown={(e) => e.stopPropagation()}><div className="admin-modal__icon"><MaterialIcon name="person_cancel" size={26} /></div><h2 id="reject-title">Từ chối hồ sơ dược sĩ</h2><p>Nhập lý do để <strong>{rejecting.ho_ten}</strong> biết thông tin nào chưa đạt yêu cầu.</p><label>Lý do từ chối<textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: Không thể đối chiếu số chứng chỉ hành nghề..." autoFocus /></label><div className="admin-modal__actions"><button className="secondary" onClick={() => setRejecting(null)}>Hủy</button><button className="admin-reject-button" disabled={reason.trim().length < 3 || busyId === rejecting.user_id} onClick={() => void reject()}><MaterialIcon name="close" size={18} />Xác nhận từ chối</button></div></section></div>}
    </main>
  );
}
