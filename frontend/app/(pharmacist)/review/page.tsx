"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MaterialIcon from "@/components/MaterialIcon";
import InteractionOverview from "@/components/graph/InteractionOverview";
import {
  ApiError,
  getInteractionCheckDetail,
  getSharedPatientProfile,
  listPharmacistRequests,
  submitPharmacistReview,
  type AgentCheckResult,
  type PatientProfileInfo,
  type ReviewRequestSummary,
} from "@/lib/api";
import { getSession } from "@/lib/auth";
import { productNamesFromExplanations } from "@/lib/interactionGraph";
import { mergedDrugNames, type Prescription } from "@/lib/prescription";

function ReviewContent() {
  const router = useRouter();
  const checkId = useSearchParams().get("checkId");
  const session = getSession();
  const [reviewRequest, setReviewRequest] = useState<ReviewRequestSummary | null>(null);
  const [profile, setProfile] = useState<PatientProfileInfo | null>(null);
  const [detail, setDetail] = useState<AgentCheckResult | null>(null);
  const [ghiChu, setGhiChu] = useState("");
  const [cauTraLoi, setCauTraLoi] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!session || !checkId) return;

    setLoading(true);
    listPharmacistRequests(session.accessToken).then(requests => {
      const req = requests.find(r => r.check_id === checkId);
      if (req) {
        setReviewRequest(req);
        // Chỉ đọc hồ sơ cá nhân (chung, không snapshot) khi bệnh nhân CHỌN gửi kèm -
        // nếu không, dùng đúng thông tin tự nhập lúc gửi yêu cầu (xem req bên dưới).
        if (req.gui_kem_ho_so) {
          getSharedPatientProfile(checkId, session.accessToken).then(setProfile).catch(err => console.error(err));
        }
      }
    }).catch(err => console.error(err));

    getInteractionCheckDetail(checkId, session.accessToken)
      .then(setDetail)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Không tải được chi tiết lần kiểm tra"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkId]);

  // Dược sĩ xem lại ĐÚNG Y HỆT những gì bệnh nhân đã thấy (đồ thị, tóm tắt tổng
  // quan, chi tiết từng cặp, sắp xếp theo mức độ) - dùng chung InteractionOverview
  // với trang check-result của bệnh nhân. Ưu tiên đúng cấu trúc đơn thuốc gốc
  // (detail.prescriptions) để dựng lại đúng "bàn cân" nhiều đơn như lúc bệnh nhân
  // kiểm tra (đồ thị + chi tiết chỉ tính tương tác GIỮA các đơn khi có từ 2 đơn
  // trở lên). Dữ liệu lịch sử cũ chưa có field này rơi về gộp thành 1 "đơn thuốc"
  // tổng hợp như hành vi cũ - ưu tiên checked_products (đầy đủ mọi thuốc đã nhập,
  // kể cả thuốc không có tương tác); chỉ suy ra từ các cặp giải thích khi cả 2
  // field trên đều chưa có.
  const prescriptions: Prescription[] = useMemo(() => {
    if (!detail) return [];
    if (detail.prescriptions?.length) {
      return detail.prescriptions.map((p, i) => ({
        id: `review-check-${i}`,
        label: p.label,
        drugs: p.products.map((name) => ({ name, known: true })),
      }));
    }
    const names = detail.checked_products?.length
      ? detail.checked_products
      : productNamesFromExplanations(detail.explanations ?? []);
    return [{ id: "review-check", label: "Thuốc đã kiểm tra", drugs: names.map((name) => ({ name, known: true })) }];
  }, [detail]);

  // Chỉ hiện ĐÚNG danh sách thuốc của LẦN TRA CỨU NÀY (từ detail.explanations),
  // không phải "đơn thuốc của tôi" chung của bệnh nhân - gộp từ MỌI đơn (không chỉ
  // đơn đầu tiên) để không thiếu thuốc khi bệnh nhân so nhiều đơn cùng lúc.
  const productNames = mergedDrugNames(prescriptions);
  const patientConditionNames = useMemo(
    () =>
      Array.from(
        new Set(
          (detail?.patient_conditions_snapshot ?? [])
            .map((condition) => condition.ten_benh_vi || condition.ten_benh)
            .filter(Boolean)
        )
      ),
    [detail]
  );
  const isConfirmed = reviewRequest?.trang_thai_xac_nhan === "da_xac_nhan";

  async function handleConfirm() {
    if (!session || !checkId) return;
    setSubmitting(true); setError(null);
    try {
      await submitPharmacistReview(checkId, ghiChu, session.accessToken, cauTraLoi.trim() || undefined);
      setSubmitted(true);
      router.replace("/pharmacist-dashboard");
    } catch (err) { setError(err instanceof ApiError ? err.message : "Không xác nhận được"); }
    finally { setSubmitting(false); }
  }

  if (!session) return null;
  if (!checkId) {
    return (
      <main>
        <div className="empty-state">
          <MaterialIcon name="search" size={40} />
          <strong>Không tìm thấy yêu cầu</strong>
          <span>Vui lòng chọn yêu cầu xét duyệt từ bảng điều khiển.</span>
          <button onClick={() => router.push("/pharmacist-dashboard")}>Về trang chủ</button>
        </div>
      </main>
    );
  }

  return (
    <main className="pharmacist-review-page">
      <div className="page-header page-header--in-content">
        <button className="page-header__back" onClick={() => router.push("/pharmacist-dashboard")} aria-label="Quay lại">
          <MaterialIcon name="arrow_back" size={22} />
        </button>
        <div>
          <p className="eyebrow">XEM XÉT CHUYÊN MÔN</p>
          <h1 className="page-header__title page-title-icon"><MaterialIcon name="assignment_ind" size={25} />{reviewRequest ? `Yêu cầu: ${reviewRequest.patient_name}` : "Chi tiết cảnh báo"}</h1>
        </div>
      </div>

      {loading && <div className="loading-row"><span className="spinner" /> Đang tải...</div>}
      {error && <p className="error-text" role="alert">{error}</p>}

      <div className="review-layout">
        <div className="review-layout__main">
          {!loading && (
        <section className="panel profile-medications">
          <div className="dashboard-section__header"><h2 className="section-heading-icon"><MaterialIcon name="person_search" size={21} />Thông tin người được kiểm tra</h2></div>
          {reviewRequest?.gui_kem_ho_so ? (
            profile ? (
              <div className="field" style={{ marginBottom: 16 }}>
                {profile.ho_ten && <p><strong>Họ tên:</strong> {profile.ho_ten}</p>}
                {profile?.ngay_sinh && <p><strong>Ngày sinh:</strong> {profile.ngay_sinh}</p>}
                {profile?.gioi_tinh && <p><strong>Giới tính:</strong> {profile.gioi_tinh}</p>}
                {profile?.can_nang != null && <p><strong>Cân nặng:</strong> {profile.can_nang} kg</p>}
                {profile?.chieu_cao != null && <p><strong>Chiều cao:</strong> {profile.chieu_cao} cm</p>}
                {patientConditionNames.length > 0 && <p><strong>Bệnh nền:</strong> {patientConditionNames.join(", ")}</p>}
                {profile?.benh_nen_ghi_chu && <p><strong>Ghi chú bệnh nền:</strong> {profile.benh_nen_ghi_chu}</p>}
                {profile?.di_ung_thuoc && <p><strong>Dị ứng thuốc:</strong> {profile.di_ung_thuoc}</p>}
                {profile?.tinh_trang_khac && <p><strong>Tình trạng khác:</strong> {profile.tinh_trang_khac}</p>}
              </div>
            ) : (
              <p className="empty-state__hint">Bệnh nhân chưa cập nhật thông tin cá nhân.</p>
            )
          ) : reviewRequest?.ten_nguoi_duoc_kiem_tra ? (
            <div className="field" style={{ marginBottom: 16 }}>
              <p><strong>Người được kiểm tra:</strong> {reviewRequest.ten_nguoi_duoc_kiem_tra}</p>
              {reviewRequest.ngay_sinh_nhap_tay && <p><strong>Ngày sinh:</strong> {reviewRequest.ngay_sinh_nhap_tay}</p>}
              {reviewRequest.ghi_chu_nhap_tay && <p><strong>Ghi chú:</strong> {reviewRequest.ghi_chu_nhap_tay}</p>}
            </div>
          ) : (
            <p className="empty-state__hint">Người bệnh không gửi kèm thông tin cá nhân.</p>
          )}

          <h3 style={{ marginBottom: 8 }}>Thuốc trong lần tra cứu này</h3>
          {productNames.length === 0 && <p className="empty-state__hint">Không có thuốc nào.</p>}
          {/* Y hệt style bàn cân "Tra cứu tương tác" của bệnh nhân (prescription-board
              slider, mỗi đơn 1 thẻ cuộn ngang) - chỉ bỏ mọi control chỉnh sửa (tìm
              thuốc, đổi tên, xóa) vì dược sĩ chỉ xem lại, không sửa được đơn của
              bệnh nhân. */}
          {productNames.length > 0 && (
            <div className="prescription-board-wrap">
              <div className="prescription-board prescription-board--slider">
                {prescriptions.map((p) => (
                  <div className="prescription-panel panel" key={p.id}>
                    <div className="prescription-panel__header"><h3>{p.label}</h3></div>
                    <div className="prescription-panel__list">
                      {p.drugs.length === 0 && <p className="prescription-panel__empty">Chưa có thuốc nào trong đơn này.</p>}
                      {p.drugs.map((drug) => (
                        <div className="selected-medication" key={drug.name}>
                          <span className="selected-medication__icon"><MaterialIcon name="medication" size={18} /></span>
                          <div><strong>{drug.name}</strong></div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}


      {detail && prescriptions.length > 0 && (
        <InteractionOverview
          result={{
            explanations: detail.explanations ?? [],
            has_severe: detail.has_severe ?? false,
            has_unclassified: detail.has_unclassified ?? false,
            product_explanations: detail.product_explanations ?? [],
            overview: detail.overview,
            food_interactions: detail.food_interactions ?? [],
            disease_interactions: detail.disease_interactions ?? [],
            disease_interaction_scope: detail.disease_interaction_scope,
            patient_conditions_snapshot: detail.patient_conditions_snapshot ?? [],
            canh_bao_thuc_pham_benh_nen: detail.canh_bao_thuc_pham_benh_nen,
          }}
          prescriptions={prescriptions}
          session={session}
          showReviewPrompt={false}
          showAiSummaryAction={false}
          graphPaneScrollable={false}
        />
      )}
        </div>

        <div className="review-layout__sidebar">
          {checkId && isConfirmed ? (
            <section className="review-form panel" style={{ margin: 0 }}>
              <div className="section__header">
                <h2 className="section__title"><MaterialIcon name="check_circle" size={20} /> Đã xem xét</h2>
              </div>
              {reviewRequest.cau_hoi && (
                <div className="field" style={{ marginBottom: 16 }}>
                  <p className="eyebrow" style={{ marginBottom: 6 }}>CÂU HỎI CỦA BỆNH NHÂN</p>
                  <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{reviewRequest.cau_hoi}</p>
                  <p className="eyebrow" style={{ marginTop: 14, marginBottom: 6 }}>CÂU TRẢ LỜI CỦA BẠN</p>
                  <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{reviewRequest.cau_tra_loi || "Bạn chưa trả lời câu hỏi này."}</p>
                </div>
              )}
              <p className="eyebrow" style={{ marginBottom: 10 }}>NHẬN XÉT ĐÃ LƯU</p>
              <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{reviewRequest.ghi_chu || "Dược sĩ chưa để lại ghi chú."}</p>
              {reviewRequest.thoi_gian_xac_nhan && (
                <p className="empty-state__hint" style={{ marginTop: 14 }}>
                  Xác nhận lúc {new Date(reviewRequest.thoi_gian_xac_nhan).toLocaleString("vi-VN")}
                </p>
              )}
              <button className="secondary" style={{ marginTop: 18 }} onClick={() => router.push("/pharmacist-dashboard")}>
                <MaterialIcon name="arrow_back" size={18} /> Về trang chủ
              </button>
            </section>
          ) : checkId && (
            <section className="review-form panel" style={{ margin: 0 }}>
              <div className="section__header"><h2 className="section__title"><MaterialIcon name="edit_note" size={20} /> Ghi nhận xét chuyên môn</h2></div>
              {reviewRequest?.cau_hoi && (
                <div className="field">
                  <label>Câu hỏi của bệnh nhân</label>
                  <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{reviewRequest.cau_hoi}</p>
                  <label htmlFor="cau_tra_loi" style={{ marginTop: 10, display: "block" }}>Câu trả lời của bạn</label>
                  <textarea id="cau_tra_loi" rows={3} value={cauTraLoi} onChange={(e) => setCauTraLoi(e.target.value)} placeholder="Trả lời câu hỏi trên của bệnh nhân..." />
                </div>
              )}
              <div className="field">
                <label htmlFor="ghi_chu">Ghi chú của dược sĩ</label>
                <textarea id="ghi_chu" rows={4} value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} placeholder="Ví dụ: Đã tư vấn bệnh nhân, trao đổi với bác sĩ điều trị..." />
              </div>
              <button className="btn-block" onClick={handleConfirm} disabled={submitting}>
                {submitting ? <><span className="spinner spinner--sm" /> Đang lưu...</> : <><MaterialIcon name="check_circle" size={20} /> Xác nhận đã xem xét</>}
              </button>
              {submitted && <p className="success-text"><MaterialIcon name="check_circle" size={18} /> Đã xác nhận thành công</p>}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

export default function PharmacistReviewPage() {
  return (
    <Suspense fallback={<main><div className="loading-row"><span className="spinner" /> Đang tải...</div></main>}>
      <ReviewContent />
    </Suspense>
  );
}
