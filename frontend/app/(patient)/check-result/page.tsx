"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Disclaimer from "@/components/Disclaimer";
import MaterialIcon from "@/components/MaterialIcon";
import InteractionOverview from "@/components/graph/InteractionOverview";
import { ApiError, getPatientCheckDetail, type MedicationCheckResponse } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { productNamesFromExplanations } from "@/lib/interactionGraph";
import type { Prescription } from "@/lib/prescription";

function CheckResultContent() {
  const router = useRouter();
  const checkId = useSearchParams().get("checkId");
  const session = getSession();
  const [result, setResult] = useState<MedicationCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    if (checkId) {
      getPatientCheckDetail(session.userId, checkId, session.accessToken)
        .then(setResult)
        .catch((err) => setError(err instanceof ApiError ? err.message : "Không tải được kết quả"))
        .finally(() => setLoading(false));
      return;
    }
    const raw = window.sessionStorage.getItem("medguard_last_check");
    if (raw) setResult(JSON.parse(raw) as MedicationCheckResponse);
    else setError("Không có kết quả kiểm tra để hiển thị.");
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkId]);

  // Ưu tiên đúng cấu trúc đơn thuốc gốc (result.prescriptions) để dựng lại đúng
  // "bàn cân" nhiều đơn như lúc kiểm tra (đồ thị + chi tiết chỉ tính tương tác
  // GIỮA các đơn khi có từ 2 đơn trở lên, khớp overview backend đã sinh cùng
  // logic). Dữ liệu lịch sử cũ lưu trước khi field này tồn tại (rỗng/undefined)
  // rơi về gộp thành 1 "đơn thuốc" tổng hợp như hành vi cũ - ưu tiên
  // checked_products (đầy đủ mọi thuốc đã nhập, kể cả thuốc không có tương tác);
  // chỉ suy ra từ các cặp giải thích khi cả 2 field trên đều chưa có.
  const prescriptions: Prescription[] = useMemo(() => {
    if (!result) return [];
    if (result.prescriptions?.length) {
      return result.prescriptions.map((p, i) => ({
        id: `history-check-${i}`,
        label: p.label,
        drugs: p.products.map((name) => ({ name, known: true })),
      }));
    }
    const names = result.checked_products?.length
      ? result.checked_products
      : productNamesFromExplanations(result.explanations);
    return [{ id: "history-check", label: "Thuốc đã kiểm tra", drugs: names.map((name) => ({ name, known: true })) }];
  }, [result]);

  if (!session) return null;
  return <main className="check-result-page">
    <div className="page-header page-header--in-content"><button className="page-header__back" onClick={() => router.push("/history")} aria-label="Quay lại"><MaterialIcon name="arrow_back" size={22} /></button><div><p className="eyebrow">PHÂN TÍCH AN TOÀN</p><h1 className="page-header__title">Chi tiết kiểm tra tương tác</h1></div></div>
    {loading && <div className="loading-row"><span className="spinner" /> Đang tải kết quả...</div>}
    {error && <p className="error-text" role="alert">{error}</p>}
    {!loading && result && <>
      {(result.ghi_chu_duoc_si || result.cau_tra_loi_duoc_si) && (
        <section className="pharmacist-note-box">
          <MaterialIcon name="local_pharmacy" size={22} />
          <div>
            <p className="eyebrow">GHI CHÚ TỪ DƯỢC SĨ{result.ten_duoc_si_xac_nhan ? ` — ${result.ten_duoc_si_xac_nhan}` : ""}</p>
            {result.cau_hoi_benh_nhan && (
              <>
                <p><strong>Câu hỏi của bạn:</strong> {result.cau_hoi_benh_nhan}</p>
                <p><strong>Trả lời:</strong> {result.cau_tra_loi_duoc_si || "Dược sĩ chưa trả lời câu hỏi này."}</p>
              </>
            )}
            {result.ghi_chu_duoc_si && <p>{result.ghi_chu_duoc_si}</p>}
          </div>
        </section>
      )}

      <InteractionOverview result={result} prescriptions={prescriptions} session={session} />
    </>}
    <Disclaimer />
    <button className="secondary btn-block" onClick={() => router.push("/history")}><MaterialIcon name="arrow_back" size={20} /> Về lịch sử kiểm tra</button>
  </main>;
}

export default function CheckResultPage() { return <Suspense fallback={<main><div className="loading-row"><span className="spinner" /> Đang tải...</div></main>}><CheckResultContent /></Suspense>; }
