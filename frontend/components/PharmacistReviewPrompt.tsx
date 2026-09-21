"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useState } from "react";
import Link from "next/link";
import MaterialIcon from "@/components/MaterialIcon";
import { getPharmacists, listPatientChecks, requestReview, type PharmacistSummary } from "@/lib/api";

type PharmacistReviewPromptProps = {
  checkId: string;
  token?: string;
  // true: lần tra từ "Đơn thuốc của tôi"; false: tra cứu chung, có thể tra cứu hộ.
  personalized?: boolean;
  // Cần để tự tra lại trạng thái xác nhận thật của lần kiểm tra này (không chỉ
  // dựa vào state cục bộ "assigned" - state đó mất ngay khi rời trang/reload).
  patientId?: string;
  onAssigned?: () => void;
  // Báo cho khung kết quả sau khi danh sách đã thật sự xuất hiện trong DOM. Bên
  // ngoài dùng mốc này để cuộn chính xác, thay vì đoán thời điểm React render.
  onListVisible?: () => void;
  // Ẩn CTA mặc định khi bên gọi đã có một nút kích hoạt riêng. Component vẫn
  // được mount để ref có thể mở trực tiếp danh sách dược sĩ.
  hideCollapsed?: boolean;
};

export type PharmacistReviewPromptHandle = {
  toggleList: () => boolean;
};

type KnownStatus = "chua_xac_nhan" | "cho_xac_nhan" | "da_xac_nhan";
type Step = "cta" | "list" | "form";

// Gợi ý gửi lần kiểm tra hiện tại cho dược sĩ xem lại - tách từ check-result/page.tsx
// để dùng lại được ở mọi nơi hiện kết quả (InteractionOverview render widget này
// cho MỌI lần tra cứu, không riêng gì tương tác nghiêm trọng).
const PharmacistReviewPrompt = forwardRef<PharmacistReviewPromptHandle, PharmacistReviewPromptProps>(function PharmacistReviewPrompt(
  { checkId, token, personalized = false, patientId, onAssigned, onListVisible, hideCollapsed = false },
  ref,
) {
  const [step, setStep] = useState<Step>("cta");
  const [pharmacists, setPharmacists] = useState<PharmacistSummary[]>([]);
  const [pharmacistsLoading, setPharmacistsLoading] = useState(false);
  const [selected, setSelected] = useState<PharmacistSummary | null>(null);
  // Hồ sơ cá nhân là dữ liệu tùy chọn và cần được người dùng chủ động đồng ý chia sẻ.
  // Lựa chọn này chỉ chi phối dữ liệu dược sĩ được xem, không chi phối lần tra tương tác.
  const [attachProfile, setAttachProfile] = useState(!personalized);
  const [manualName, setManualName] = useState("");
  const [manualDob, setManualDob] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [assigned, setAssigned] = useState(false);
  const [knownStatus, setKnownStatus] = useState<KnownStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(Boolean(token && patientId));

  // Hỏi backend xem lần kiểm tra này đã từng được gửi/xác nhận chưa, để không
  // hỏi lại "bạn có muốn nhờ dược sĩ..." mỗi khi vào lại trang (reload, chuyển
  // tab rồi quay lại) sau khi đã lỡ gửi yêu cầu trong một lượt xem trước đó.
  useEffect(() => {
    if (!token || !patientId) { setStatusLoading(false); return; }
    let cancelled = false;
    setStatusLoading(true);
    listPatientChecks(patientId, token)
      .then((checks) => {
        if (cancelled) return;
        const match = checks.find((c) => c.id === checkId);
        setKnownStatus((match?.trang_thai_xac_nhan as KnownStatus) ?? "chua_xac_nhan");
      })
      .catch(() => { if (!cancelled) setKnownStatus("chua_xac_nhan"); })
      .finally(() => { if (!cancelled) setStatusLoading(false); });
    return () => { cancelled = true; };
  }, [checkId, token, patientId]);

  async function handleShowPharmacists() {
    setStep("list");
    setPharmacistsLoading(true);
    try { setPharmacists(await getPharmacists(token as string)); } catch { /* để trống, người dùng có thể thử lại */ }
    finally { setPharmacistsLoading(false); }
  }

  useImperativeHandle(ref, () => ({
    toggleList: () => {
      if (step === "cta") {
        void handleShowPharmacists();
        return true;
      }
      setSelected(null);
      setStep("cta");
      return false;
    },
  }));

  useLayoutEffect(() => {
    if (step !== "list" || statusLoading) return;
    onListVisible?.();
  }, [step, statusLoading, onListVisible]);

  function handleSelectPharmacist(p: PharmacistSummary) {
    setSelected(p);
    setAttachProfile(!personalized);
    setManualName("");
    setManualDob("");
    setManualNote("");
    setQuestion("");
    setSubmitError(null);
    setStep("form");
  }

  async function handleSubmitRequest() {
    if (!selected) return;
    setSubmitting(true); setSubmitError(null);
    try {
      await requestReview(checkId, selected.id, token as string, {
        guiKemHoSo: attachProfile,
        tenNguoiDuocKiemTra: !personalized && !attachProfile ? manualName.trim() || undefined : undefined,
        ngaySinhNhapTay: !personalized && !attachProfile ? manualDob || undefined : undefined,
        ghiChuNhapTay: !personalized && !attachProfile ? manualNote.trim() || undefined : undefined,
        cauHoi: question.trim() || undefined,
      });
      setAssigned(true);
      onAssigned?.();
    } catch {
      setSubmitError("Lỗi khi gửi yêu cầu, vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="pharmacist-prompt pharmacist-prompt--cta-row">
        <p className="pharmacist-prompt__title">Bạn có muốn nhờ dược sĩ xác nhận lại tương tác thuốc này không?</p>
        <Link href="/" className="guest-login-link">Đăng nhập để gửi yêu cầu cho dược sĩ</Link>
      </div>
    );
  }

  if (statusLoading) {
    if (hideCollapsed) return null;
    return (
      <div className="pharmacist-prompt pharmacist-prompt--loading">
        <span className="spinner spinner--sm" /> Đang kiểm tra trạng thái gửi dược sĩ...
      </div>
    );
  }

  if (assigned || knownStatus === "cho_xac_nhan") {
    return (
      <div className="pharmacist-prompt--done">
        <MaterialIcon name="check_circle" size={20} /> Đã gửi yêu cầu xem xét cho dược sĩ thành công! Dược sĩ sẽ xem xét và phản hồi sớm nhất.
      </div>
    );
  }

  if (knownStatus === "da_xac_nhan") {
    return (
      <div className="pharmacist-prompt--confirmed">
        <MaterialIcon name="check_circle" size={20} /> Dược sĩ đã xem xét và xác nhận tương tác này.
      </div>
    );
  }

  if (step === "form" && selected) {
    return (
      <div className="pharmacist-prompt">
        <button type="button" className="pharmacist-prompt__back" onClick={() => setStep("list")}>
          <MaterialIcon name="arrow_back" size={16} /> Chọn dược sĩ khác
        </button>
        <p className="pharmacist-prompt__title">Gửi yêu cầu tới <strong>{selected.ho_ten}</strong></p>
        {personalized ? (
          <div className="pharmacist-prompt__attach-toggle">
            <label className={attachProfile ? "pharmacist-prompt__attach-option pharmacist-prompt__attach-option--active" : "pharmacist-prompt__attach-option"}>
              <input
                type="checkbox"
                checked={attachProfile}
                onChange={(event) => setAttachProfile(event.target.checked)}
              />
              <span>
                <strong>Chia sẻ hồ sơ cá nhân của tôi với dược sĩ</strong>
                <small>Dược sĩ sẽ được xem thông tin cá nhân, bệnh nền và dị ứng thuốc trong hồ sơ của bạn.</small>
              </span>
            </label>
            <p className="pharmacist-prompt__privacy-note">
              <MaterialIcon name="shield" size={17} />
              Không bắt buộc. Dù không chia sẻ hồ sơ, dược sĩ vẫn nhận được danh sách thuốc và kết quả tra tương tác này.
            </p>
          </div>
        ) : (
          <>
            <div className="pharmacist-prompt__attach-toggle">
              <label className={attachProfile ? "pharmacist-prompt__attach-option pharmacist-prompt__attach-option--active" : "pharmacist-prompt__attach-option"}>
                <input type="radio" name={`attach-mode-${checkId}`} checked={attachProfile} onChange={() => setAttachProfile(true)} />
                Gửi kèm hồ sơ cá nhân của tôi
              </label>
              <label className={!attachProfile ? "pharmacist-prompt__attach-option pharmacist-prompt__attach-option--active" : "pharmacist-prompt__attach-option"}>
                <input type="radio" name={`attach-mode-${checkId}`} checked={!attachProfile} onChange={() => setAttachProfile(false)} />
                Nhập thông tin khác (tra cứu hộ người khác)
              </label>
            </div>
            {!attachProfile && (
              <div className="pharmacist-prompt__manual-form">
                <div className="field"><label>Họ tên người được kiểm tra</label><input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Ví dụ: Nguyễn Văn A" /></div>
                <div className="field"><label>Ngày sinh</label><input type="date" value={manualDob} onChange={(e) => setManualDob(e.target.value)} /></div>
                <div className="field"><label>Ghi chú (bệnh nền, dị ứng...)</label><textarea rows={2} value={manualNote} onChange={(e) => setManualNote(e.target.value)} placeholder="Không bắt buộc" /></div>
              </div>
            )}
          </>
        )}
        <div className="field">
          <label>Câu hỏi cho dược sĩ (không bắt buộc)</label>
          <textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ví dụ: Tôi có nên uống cách xa bữa ăn không?" />
        </div>
        {submitError && <p className="error-text" role="alert">{submitError}</p>}
        <button type="button" className="pharmacist-prompt__cta" disabled={submitting} onClick={() => void handleSubmitRequest()}>
          {submitting ? "Đang gửi..." : "Gửi yêu cầu"}
        </button>
      </div>
    );
  }

  if (step === "cta" && hideCollapsed) return null;

  return (
    <div className={`pharmacist-prompt ${step === "cta" ? "pharmacist-prompt--cta-row" : ""}`}>
      <p className="pharmacist-prompt__title">Bạn có muốn nhờ dược sĩ xác nhận lại tương tác thuốc này không?</p>
      {step === "cta" ? (
        <button type="button" className="pharmacist-prompt__cta" onClick={() => void handleShowPharmacists()}>Nhờ dược sĩ xác nhận</button>
      ) : (
        <div className={`pharmacist-prompt__list${pharmacistsLoading ? " pharmacist-prompt__list--loading" : ""}`}>
          {pharmacistsLoading ? <p className="pharmacist-prompt__loading">Đang tải danh sách dược sĩ...</p> : pharmacists.map((p) => {
            // Chỉ 2 dòng: tên, rồi nơi làm việc + mô tả ngắn gộp chung 1 dòng (cắt
            // bớt bằng ellipsis nếu quá dài) - tránh tràn ra ngoài khung danh sách.
            const subtitle = [p.noi_cong_tac, p.mo_ta_ngan].filter(Boolean).join(" • ") || "Chưa cập nhật thông tin";
            return (
              <button type="button" className="pharmacist-prompt__item" key={p.id} onClick={() => handleSelectPharmacist(p)}>
                <div className="pharmacist-prompt__item-body">
                  <div className="pharmacist-prompt__name">{p.ho_ten}</div>
                  <div className="pharmacist-prompt__bio">{subtitle}</div>
                </div>
                <MaterialIcon name="chevron_right" size={18} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default PharmacistReviewPrompt;
