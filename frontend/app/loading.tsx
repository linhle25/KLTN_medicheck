import MediFox from "@/components/MediFox";

export default function Loading() {
  return (
    <main className="medi-page-loading" role="status" aria-live="polite" aria-label="Đang tải trang">
      <div className="medi-page-loading__card">
        <MediFox variant="loading" className="medi-page-loading__fox" alt="Cáo Medi đang tải" />
        <div>
          <p className="medi-page-loading__eyebrow">MEDICHECK</p>
          <strong>Cáo Medi đang chuẩn bị trang cho bạn...</strong>
          <p>Vui lòng chờ trong giây lát.</p>
        </div>
      </div>
    </main>
  );
}
