"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MaterialIcon from "@/components/MaterialIcon";
import {
  ApiError,
  markNotificationRead,
  removePatientMedication,
  type NotificationItem,
} from "@/lib/api";
import { usePatientChecks, usePatientNotifications, usePatientPrescriptions } from "@/lib/hooks";
import { getSession } from "@/lib/auth";
import { formatVietnameseDateTime } from "@/lib/datetime";
import MediFox from "@/components/MediFox";
import { useMediAlert } from "@/components/MediAlertProvider";

export default function PatientDashboardPage() {
  const router = useRouter();
  const { confirm } = useMediAlert();
  const session = getSession();

  // Cache qua SWR (frontend/lib/hooks.ts) - quay lại trang này sau khi ghé trang
  // khác hiện NGAY dữ liệu đã tải trước đó thay vì phải đợi gọi API lại từ đầu.
  const {
    data: prescriptions = [],
    isLoading: prescriptionsLoading,
    mutate: mutatePrescriptions,
  } = usePatientPrescriptions(session?.userId, session?.accessToken);
  const { data: history = [], isLoading: historyLoading } = usePatientChecks(
    session?.userId,
    session?.accessToken
  );
  const {
    data: notifications = [],
    isLoading: notificationsLoading,
    mutate: mutateNotifications,
  } = usePatientNotifications(session?.userId, session?.accessToken, { refreshInterval: 30000 });

  const loading = prescriptionsLoading || historyLoading || notificationsLoading;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOpenNotification(n: NotificationItem) {
    if (!session) return;
    try {
      await markNotificationRead(session.userId, n.id, session.accessToken);
      mutateNotifications(
        (prev) => prev?.map((item) => (item.id === n.id ? { ...item, da_doc: true } : item)),
        { revalidate: false }
      );
    } catch { /* điều hướng dù lỗi mark-read, không chặn người dùng */ }
    if (n.interaction_check_id) router.push(`/check-result?checkId=${n.interaction_check_id}`);
  }

  const totalMedications = prescriptions.reduce((sum, p) => sum + p.medications.length, 0);

  async function handleDelete(prescriptionId: string, medicationId: string) {
    if (!session || !(await confirm({ title: "Xóa thuốc khỏi hồ sơ?", message: "Thuốc này sẽ bị xóa khỏi đơn đang lưu.", confirmLabel: "Xóa thuốc", tone: "danger" }))) return;
    setDeletingId(medicationId); setError(null);
    try {
      await removePatientMedication(session.userId, medicationId, session.accessToken);
      mutatePrescriptions(
        (prev) =>
          prev?.map((p) =>
            p.id === prescriptionId
              ? { ...p, medications: p.medications.filter((m) => m.id !== medicationId) }
              : p
          ),
        { revalidate: false }
      );
    } catch (err) { setError(err instanceof ApiError ? err.message : "Không xóa được thuốc"); }
    finally { setDeletingId(null); }
  }

  if (!session) return null;
  const unresolvedSevere = history.filter((h) => h.co_canh_bao_nang && h.trang_thai_xac_nhan !== "da_xac_nhan").length;
  const fullName = session.hoTen.trim() || "bạn";
  const shortName = fullName.split(/\s+/).pop() || fullName;

  return (
    <main className="dashboard-page">
      <section className="dashboard-hero dashboard-hero--patient">
        <div>
          <h1 className="dashboard-title" style={{ margin: 0, fontSize: "28px" }}>
            <span className="dashboard-title__desktop">Xin chào, {fullName}</span>
            <span className="dashboard-title__mobile">Xin chào, {shortName}</span>
          </h1>
          <p className="dashboard-subtitle">Hãy dành vài phút kiểm tra đơn thuốc để dùng thuốc an toàn và yên tâm hơn mỗi ngày.</p>
        </div>
        <MediFox variant="welcome" className="dashboard-hero__mascot" alt="Cáo Medi đồng hành cùng bạn" />

      </section>

      <aside className="mascot-tip">
        <MediFox variant="wellbeing" className="mascot-tip__image" />
        <div><p className="eyebrow">GỢI Ý TỪ CÁO MEDI</p><strong>Không tự ý mua hoặc dùng thuốc khi chưa có hướng dẫn của bác sĩ.</strong><span>Nếu có băn khoăn về thuốc, hãy hỏi bác sĩ hoặc dược sĩ trước khi sử dụng.</span></div>
      </aside>

      {loading && <div className="loading-row"><span className="spinner" /> Đang tải hồ sơ...</div>}
      {error && <p className="error-text" role="alert">{error}</p>}

      {notifications.filter((n) => !n.da_doc).length > 0 && (
        <section className="dashboard-notifications">
          {notifications.filter((n) => !n.da_doc).slice(0, 3).map((n) => (
            <button type="button" className="dashboard-notification" key={n.id} onClick={() => void handleOpenNotification(n)}>
              <span className="dashboard-notification__icon"><MaterialIcon name="notifications_active" size={22} filled /></span>
              <span className="dashboard-notification__content">
                <span className="dashboard-notification__meta"><b>Cập nhật từ dược sĩ</b><small>{formatVietnameseDateTime(n.thoi_gian_tao)}</small></span>
                <strong>{n.noi_dung}</strong>
              </span>
              <span className="dashboard-notification__arrow"><MaterialIcon name="arrow_forward" size={19} /></span>
            </button>
          ))}
        </section>
      )}

      <section className="dashboard-summary-row"><div><span className="dashboard-summary-number">{totalMedications}</span><span> thuốc đang theo dõi</span></div><div><span className="dashboard-summary-number">{unresolvedSevere}</span><span> cảnh báo chưa xử lý</span></div></section>

      <section className="dashboard-section">
        <div className="dashboard-section__header"><h2 className="section-heading-icon"><MaterialIcon name="medication" size={21} />Đơn thuốc của tôi</h2><Link href="/profile?tab=prescriptions">Xem tất cả <MaterialIcon name="arrow_forward" size={17} /></Link></div>
        {!loading && totalMedications === 0 && <div className="empty-state"><MediFox variant="empty" className="empty-state__mascot" /><strong>Chưa có thuốc trong hồ sơ</strong><span>Thêm thuốc để bắt đầu kiểm tra tương tác.</span></div>}
        {totalMedications > 0 && (
          <div className="prescription-board prescription-board--slider">
            {prescriptions.filter((p) => p.medications.length > 0).map((p) => (
              <div className="prescription-panel panel prescription-panel--readonly" key={p.id}>
                <div className="prescription-panel__header">
                  <h3>{p.label}</h3>
                </div>
                <div className="prescription-panel__list">
                  {p.medications.map((m) => (
                    <div className="selected-medication" key={m.id}>
                      <span className="selected-medication__icon"><MaterialIcon name="medication" size={18} /></span>
                      <div><strong>{m.ten_thuoc}</strong><small>{m.ngay_bat_dau ? `Bắt đầu từ ${m.ngay_bat_dau}` : "Được thêm hôm nay"}</small></div>
                      <button type="button" onClick={() => handleDelete(p.id, m.id)} disabled={deletingId === m.id} aria-label={`Xóa ${m.ten_thuoc}`}>
                        {deletingId === m.id ? <span className="spinner spinner--sm" /> : <MaterialIcon name="close" size={17} />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {history.length > 0 && <section className="dashboard-history"><div className="dashboard-section__header"><h2 className="section-heading-icon"><MaterialIcon name="history" size={21} />Lịch sử kiểm tra gần đây</h2><Link href="/history">Xem tất cả <MaterialIcon name="arrow_forward" size={17} /></Link></div>{history.slice(0, 3).map((h) => <button className="history-card" key={h.id} onClick={() => router.push(`/check-result?checkId=${h.id}`)}><span>{formatVietnameseDateTime(h.thoi_gian_kiem_tra)}</span><strong>{h.co_canh_bao_nang ? "Có cảnh báo cần chú ý" : "Chưa phát hiện cảnh báo nghiêm trọng"}</strong><MaterialIcon name="chevron_right" size={20} /></button>)}</section>}

      {!loading && totalMedications >= 2 && (
        <Link className="btn interaction-run" href="/interaction" style={{ marginTop: "16px" }}>
          <MaterialIcon name="analytics" size={19} />Tra cứu tương tác
        </Link>
      )}
    </main>
  );
}
