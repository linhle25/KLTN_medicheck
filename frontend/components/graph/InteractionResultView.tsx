"use client";

import type { MedicationCheckResponse } from "@/lib/api";
import type { Session } from "@/lib/auth";
import type { Prescription } from "@/lib/prescription";
import InteractionOverview from "./InteractionOverview";
import MediFox from "@/components/MediFox";

type InteractionResultViewProps = {
  result: MedicationCheckResponse;
  prescriptions: Prescription[];
  session: Session | null;
  requireLoginToReview?: boolean;
  showReviewPrompt?: boolean;
  showReviewAction?: boolean;
};

// Dùng ở tab "Tra cứu tương tác" (kết quả vừa tính xong): bọc InteractionOverview,
// vốn tự hiện khung "Nhờ dược sĩ xác nhận" bên trong nó cho MỌI lần tra cứu (không
// còn chỉ dành riêng cho tương tác nghiêm trọng như trước).
export default function InteractionResultView({ result, prescriptions, session, requireLoginToReview = false, showReviewPrompt = true, showReviewAction = true }: InteractionResultViewProps) {
  const hasAnySevere = result.has_severe || result.has_severe_disease_interaction;
  return <>
    <aside className={`interaction-mascot-note ${hasAnySevere ? "interaction-mascot-note--alert" : ""}`}>
      <MediFox variant="alert" className="interaction-mascot-note__image" />
      <div>
        <strong>{hasAnySevere ? "Cáo Medi nhắc bạn cần lưu ý" : "Cáo Medi đã kiểm tra xong"}</strong>
        <p>Thông tin chỉ mang tính tham khảo, không thay thế tư vấn chuyên môn. Không tự ý thay đổi hoặc ngừng thuốc; nên tham khảo dược sĩ hoặc chuyên gia khi cần.</p>
      </div>
    </aside>
    <InteractionOverview result={result} prescriptions={prescriptions} session={session} requireLoginToReview={requireLoginToReview} showReviewPrompt={showReviewPrompt} showReviewAction={showReviewAction} />
  </>;
}
