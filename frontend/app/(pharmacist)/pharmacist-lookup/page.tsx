"use client";

import { useState, type FormEvent } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import PrescriptionPanel from "@/components/PrescriptionPanel";
import InteractionOverview from "@/components/graph/InteractionOverview";
import { ApiError, checkProductsAsPharmacist, searchProducts, type MedicationCheckResponse } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { createPrescription, mergedDrugNames, nonEmptyPrescriptions, toPrescriptionCheckInput, type Prescription } from "@/lib/prescription";
import { scrollBelowStickyHeader } from "@/lib/scroll";
import MediFox from "@/components/MediFox";

function renumberDefaultPrescriptions(items: Prescription[]) {
  return items.map((prescription, index) => ({
    ...prescription,
    label: /^Đơn thuốc \d+$/.test(prescription.label)
      ? `Đơn thuốc ${index + 1}`
      : prescription.label,
  }));
}

// Cùng bàn cân (PrescriptionPanel + prescription-board) và cùng khung kết quả
// (InteractionOverview, audience="pharmacist") với luồng "Tương tác" của bệnh
// nhân - chỉ khác: không có "Nhập từ hồ sơ" (PrescriptionPanel không nhận
// savedPrescriptions/onImportFrom ở đây), giọng điệu AI khoa học/chuyên nghiệp hơn
// (xem InteractionOverview + build_overview_explanation audience="pharmacist"), và
// không lưu draft vào sessionStorage - đúng tinh thần "công cụ tra cứu nội bộ,
// không lưu lịch sử" đã có từ trước.
export default function PharmacistLookupPage() {
  const session = getSession();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(() => [createPrescription(1)]);
  const [result, setResult] = useState<MedicationCheckResponse | null>(null);
  const [resultPrescriptions, setResultPrescriptions] = useState<Prescription[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const boardMode = prescriptions.length > 1;

  const searchFn = (q: string) => (session ? searchProducts(q, session.accessToken) : Promise.resolve([]));

  function addDrugTo(prescriptionId: string, name: string, known = true) {
    setPrescriptions((prev) => prev.map((p) => {
      if (p.id !== prescriptionId) return p;
      if (p.drugs.some((d) => d.name.toLowerCase() === name.toLowerCase())) return p;
      return { ...p, drugs: [...p.drugs, { name, known }] };
    }));
    setResult(null);
  }

  function removeDrugFrom(prescriptionId: string, name: string) {
    setPrescriptions((prev) => prev.map((p) => (p.id === prescriptionId ? { ...p, drugs: p.drugs.filter((d) => d.name !== name) } : p)));
    setResult(null);
  }

  function renamePrescription(id: string, newLabel: string) {
    setPrescriptions((prev) => prev.map((p) => (p.id === id ? { ...p, label: newLabel } : p)));
  }

  function addPrescription() {
    setPrescriptions((prev) => {
      const normalized = renumberDefaultPrescriptions(prev);
      return [...normalized, createPrescription(normalized.length + 1)];
    });
  }

  function removePrescription(id: string) {
    setPrescriptions((prev) => {
      if (prev.length <= 1) return prev;
      return renumberDefaultPrescriptions(prev.filter((p) => p.id !== id));
    });
    setResult(null);
  }

  async function runCheck(e?: FormEvent) {
    e?.preventDefault();
    if (!session) return;
    const activePrescriptions = nonEmptyPrescriptions(prescriptions);
    if (mergedDrugNames(activePrescriptions).length < 2) { setError("Hãy chọn ít nhất 2 thuốc để phân tích tương tác."); return; }
    setError(null); setLoading(true);
    try {
      const data = await checkProductsAsPharmacist(toPrescriptionCheckInput(activePrescriptions), session.accessToken);
      setResult(data);
      setResultPrescriptions(activePrescriptions);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollBelowStickyHeader("pharmacist-interaction-result");
        });
      });
    } catch (err) { setError(err instanceof ApiError ? err.message : "Không thể phân tích tương tác lúc này."); }
    finally { setLoading(false); }
  }

  if (!session) return null;

  return (
    <main>
      <section className="greeting">
        <p className="eyebrow">SỔ TAY DƯỢC SĨ</p>
        <h1 className="greeting__title page-title-icon"><MaterialIcon name="analytics" size={25} />Tra cứu tương tác thuốc</h1>
        <p className="greeting__subtitle">Công cụ tra cứu nội bộ — không lưu lịch sử, không gắn với bệnh nhân nào.</p>
      </section>

      {error && <p className="error-text" role="alert">{error}</p>}
      {result && (result.unknown_products?.length ?? 0) > 0 && (
        <div className="guest-mode-banner">
          <MaterialIcon name="info" size={18} />
          <span>Không tìm thấy trong CSDL: {result.unknown_products!.join(", ")}.</span>
        </div>
      )}

      <section className="prescription-board-wrap">
        <div className="prescription-board prescription-board--slider">
          {prescriptions.map((p) => (
            <PrescriptionPanel key={p.id} label={p.label} drugs={p.drugs} search={searchFn}
              onAdd={(name, known) => addDrugTo(p.id, name, known)}
              onRemoveDrug={(name) => removeDrugFrom(p.id, name)}
              onRemovePanel={boardMode ? () => removePrescription(p.id) : undefined}
              onRename={(newLabel) => renamePrescription(p.id, newLabel)}
              inputId={`pharmacist-prescription-search-${p.id}`} />
          ))}
          <button type="button" className="prescription-board__add" onClick={addPrescription}>
            <MaterialIcon name="add_circle" size={26} /><span>Thêm đơn thuốc</span>
          </button>
        </div>
        <button className="interaction-run" type="button" onClick={() => void runCheck()} disabled={loading || mergedDrugNames(prescriptions).length < 2}>
          <MaterialIcon name="analytics" size={19} />{loading ? "Đang phân tích..." : "Phân tích tương tác"}
        </button>
        {loading && <div className="pharmacist-mascot-loading" role="status"><MediFox variant="loading" className="pharmacist-mascot-loading__image" /><strong>Cáo Medi đang rà soát các tương tác thuốc...</strong></div>}
      </section>

      {result && (
        <section id="pharmacist-interaction-result">
          <InteractionOverview result={result} prescriptions={resultPrescriptions ?? []} session={session} audience="pharmacist" />
        </section>
      )}
    </main>
  );
}
