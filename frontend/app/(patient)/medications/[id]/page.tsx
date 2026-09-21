"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import MaterialIcon from "@/components/MaterialIcon";
import { ApiError, listPatientMedications, type MedicationItem } from "@/lib/api";
import { getSession } from "@/lib/auth";

export default function MedicationDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const session = getSession();
  const [medication, setMedication] = useState<MedicationItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !id) return;
    listPatientMedications(session.userId, session.accessToken)
      .then((items) => setMedication(items.find((item) => item.id === id) ?? null))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Không tải được chi tiết thuốc"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!session) return null;
  if (error) return <main><p className="error-text" role="alert">{error}</p></main>;
  if (!medication) return <main><div className="loading-row"><span className="spinner" /> Đang tải chi tiết thuốc...</div></main>;
  return <main className="medication-detail-page"><header className="med-detail-header"><div><button className="med-detail-back" onClick={() => router.push("/profile?tab=prescriptions")}><MaterialIcon name="arrow_back" size={21} /> Đơn thuốc của tôi</button><div className="med-detail-title"><h1>{medication.ten_thuoc}</h1><span className="med-status med-status--confirmed"><MaterialIcon name="check_circle" size={14} /> Đang sử dụng</span></div><p>Thuốc trong đơn hiện tại của bạn</p></div><div className="med-detail-actions"><button className="secondary"><MaterialIcon name="edit" size={18} /> Chỉnh sửa</button><button className="btn-severe"><MaterialIcon name="block" size={18} /> Ngừng sử dụng</button></div></header><section className="med-detail-overview"><div className="med-detail-photo"><MaterialIcon name="medication" size={58} /></div><div className="med-detail-facts"><h2>Chi tiết liều lượng</h2><div className="med-fact-grid"><div><small>TÊN THUỐC</small><strong>{medication.ten_thuoc}</strong></div><div><small>DẠNG BÀO CHẾ</small><strong>Viên nén</strong></div></div><p className="med-stock"><MaterialIcon name="inventory_2" size={20} /> Đang theo dõi trong hồ sơ</p></div><div className="med-schedule"><h2><MaterialIcon name="schedule" size={21} /> Thời gian uống</h2><div className="schedule-slot schedule-slot--active"><MaterialIcon name="light_mode" size={22} /><strong>Buổi sáng</strong><b>08:00 AM</b></div><div className="schedule-slot schedule-slot--muted"><MaterialIcon name="dark_mode" size={22} /><span>Buổi tối</span><small>Chưa thiết lập</small></div><p>Tần suất: theo hướng dẫn bác sĩ</p></div></section><section className="med-detail-content"><article className="usage-guide"><h2><MaterialIcon name="restaurant" size={22} /> Hướng dẫn sử dụng</h2><ul><li><MaterialIcon name="check" size={18} /> Uống thuốc theo đúng hướng dẫn của bác sĩ hoặc dược sĩ.</li><li><MaterialIcon name="check" size={18} /> Duy trì cùng một thời điểm mỗi ngày để dễ nhớ.</li><li><MaterialIcon name="warning" size={18} /> Nếu quên liều, không tự ý uống gấp đôi liều tiếp theo.</li></ul></article><aside className="side-effect-card"><h2><MaterialIcon name="healing" size={22} /> Tác dụng phụ thường gặp</h2><p>Nếu gặp triệu chứng nghiêm trọng, hãy liên hệ bác sĩ ngay lập tức.</p><ul><li>Ho khan, ho dai dẳng</li><li>Chóng mặt khi đứng lên</li><li>Mệt mỏi, nhức đầu</li></ul></aside></section><section className="med-history"><div className="dashboard-section__header"><h2><MaterialIcon name="history" size={22} /> Lịch sử dùng thuốc gần đây</h2><span>Xem tất cả</span></div><div className="med-history-table"><div><small>NGÀY</small><strong>Hôm nay</strong></div><div><small>THỜI GIAN QUY ĐỊNH</small><strong>08:00 AM</strong></div><div><small>TRẠNG THÁI</small><span className="med-status med-status--confirmed">Đang theo dõi</span></div></div></section></main>;
}
