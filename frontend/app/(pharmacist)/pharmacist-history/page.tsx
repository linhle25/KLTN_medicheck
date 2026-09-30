"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import MaterialIcon from "@/components/MaterialIcon";
import { ApiError, deleteAllPharmacistLookups, deletePharmacistLookup } from "@/lib/api";
import { usePharmacistLookups, usePharmacistCacheMutators } from "@/lib/hooks";
import { getSession } from "@/lib/auth";
import { formatVietnameseDateTime } from "@/lib/datetime";
import MediFox from "@/components/MediFox";
import { useMediAlert } from "@/components/MediAlertProvider";

export default function PharmacistHistoryPage() {
  const router = useRouter();
  const { confirm, notify } = useMediAlert();
  const session = getSession();

  const {
    data: lookups = [],
    isLoading,
    error: fetchError,
    mutate,
  } = usePharmacistLookups(session?.userId, session?.accessToken);
  const { revalidateLookups } = usePharmacistCacheMutators(session?.userId);
  const error = fetchError ? "Không tải được lịch sử tra cứu" : null;

  const sortedLookups = useMemo(
    () =>
      [...lookups].sort(
        (a, b) => new Date(b.thoi_gian_kiem_tra).getTime() - new Date(a.thoi_gian_kiem_tra).getTime()
      ),
    [lookups]
  );

  const handleDeleteAll = async () => {
    if (!session) return;
    if (
      !(await confirm({
        title: "Xóa toàn bộ lịch sử?",
        message: "Bạn có chắc chắn muốn xóa tất cả lịch sử tra cứu?",
        confirmLabel: "Xóa tất cả",
        tone: "danger",
      }))
    )
      return;
    try {
      await deleteAllPharmacistLookups(session.accessToken);
      mutate();
      revalidateLookups();
    } catch (err) {
      await notify({
        title: "Không thể xóa lịch sử",
        message: err instanceof ApiError ? err.message : "Lỗi khi xóa tất cả lịch sử",
        tone: "danger",
      });
    }
  };

  const handleDeleteLookup = async (e: React.MouseEvent, lookupId: string) => {
    e.stopPropagation();
    if (!session) return;
    if (
      !(await confirm({
        title: "Xóa lượt tra cứu?",
        message: "Bạn có chắc chắn muốn xóa lượt tra cứu này?",
        confirmLabel: "Xóa lượt tra cứu",
        tone: "danger",
      }))
    )
      return;
    try {
      await deletePharmacistLookup(lookupId, session.accessToken);
      mutate();
      revalidateLookups();
    } catch (err) {
      await notify({
        title: "Không thể xóa lượt tra cứu",
        message: err instanceof ApiError ? err.message : "Lỗi khi xóa lượt tra cứu",
        tone: "danger",
      });
    }
  };

  if (!session) return null;
  return (
    <main className="history-page">
      <section
        className="page-intro"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <div>
          <p className="eyebrow">SỔ TAY DƯỢC SĨ</p>
          <h1 className="page-title-icon">
            <MaterialIcon name="history" size={25} />
            Lịch sử tra cứu
          </h1>
          <p>Xem lại các lần bạn tra cứu tương tác thuốc trên công cụ nội bộ.</p>
        </div>
        {lookups.length > 0 && (
          <button className="btn-severe" onClick={handleDeleteAll} style={{ padding: "8px 16px", borderRadius: "8px" }}>
            <MaterialIcon name="delete" size={18} /> Xóa tất cả
          </button>
        )}
      </section>
      {isLoading && (
        <div className="loading-row">
          <span className="spinner" /> Đang tải lịch sử...
        </div>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      {!isLoading && lookups.length === 0 && !error && (
        <div className="empty-state">
          <MediFox variant="empty" className="empty-state__mascot" />
          <strong>Chưa có lịch sử tra cứu</strong>
          <span>Các lần tra cứu tương tác thuốc sẽ xuất hiện ở đây.</span>
        </div>
      )}
      <div className="history-grid">
        {sortedLookups.map((lookup) => {
          const checkedDrugs = lookup.thuoc_da_kiem_tra.join(", ");
          return (
            <div
              className="history-tile"
              key={lookup.id}
              onClick={() => router.push(`/pharmacist-lookup-result?lookupId=${lookup.id}`)}
              style={{ cursor: "pointer", position: "relative" }}
            >
              <div className="history-tile__top">
                <span>{formatVietnameseDateTime(lookup.thoi_gian_kiem_tra)}</span>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    onClick={(e) => handleDeleteLookup(e, lookup.id)}
                    className="history-tile__delete"
                    title="Xóa"
                  >
                    <MaterialIcon name="delete" size={20} />
                  </button>
                </div>
              </div>
              <strong>Thuốc đã tra cứu</strong>
              <div className="history-tile__chips">
                <span title={checkedDrugs || "Không có thông tin thuốc trong lượt tra cứu này"}>
                  <MaterialIcon name="medication" size={15} />
                  <b>{checkedDrugs || "Không có thông tin thuốc"}</b>
                </span>
              </div>
              <div className="history-tile__bottom">
                <span>{lookup.co_canh_bao_nang ? "Có cảnh báo cần chú ý" : "Chưa phát hiện cảnh báo nghiêm trọng"}</span>
                <MaterialIcon name="chevron_right" size={20} />
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
