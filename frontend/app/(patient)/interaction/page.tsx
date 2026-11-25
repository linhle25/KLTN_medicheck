"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import MaterialIcon from "@/components/MaterialIcon";
import PrescriptionPanel from "@/components/PrescriptionPanel";
import InteractionResultView from "@/components/graph/InteractionResultView";
import {
  ApiError,
  checkGuestProducts,
  checkProducts,
  listPatientPrescriptions,
  searchGuestProducts,
  searchProducts,
  type MedicationCheckResponse,
  type PatientPrescription,
} from "@/lib/api";
import { INTERACTION_STORAGE_KEYS, getSession } from "@/lib/auth";
import { scrollBelowStickyHeader } from "@/lib/scroll";
import {
  createPrescription,
  isDefaultPrescriptionLabel,
  mergeSavedIntoPrescriptions,
  mergedDrugNames,
  nonEmptyPrescriptions,
  toPrescriptionCheckInput,
  type Prescription,
} from "@/lib/prescription";
import MediFox from "@/components/MediFox";
import { useMediAlert } from "@/components/MediAlertProvider";

// Lưu tạm các đơn/thuốc đang nhập dở và kết quả phân tích gần nhất trong phiên
// trình duyệt, để reload trang hoặc chuyển sang tab khác rồi quay lại Tra cứu
// tương tác không làm mất dữ liệu/kết quả đã có.
const DRAFT_KEY = INTERACTION_STORAGE_KEYS.draft;
const PERSONALIZE_KEY = INTERACTION_STORAGE_KEYS.personalized;
const RESULT_KEY = INTERACTION_STORAGE_KEYS.result;
// Ảnh chụp danh sách đơn thuốc (đã lọc rỗng) TẠI THỜI ĐIỂM chạy check tạo ra
// RESULT_KEY - phải dùng đúng danh sách này (không phải state `prescriptions` đang
// sống, có thể đã bị sửa tiếp) để dựng lại đúng đồ thị/origins phía client (xem
// drugOrigins trong lib/prescription.ts), khớp với dữ liệu lúc chạy check.
const RESULT_PRESCRIPTIONS_KEY = INTERACTION_STORAGE_KEYS.resultPrescriptions;

function renumberDefaultPrescriptions(
  prescriptions: Prescription[],
): Prescription[] {
  return prescriptions.map((prescription, index) => ({
    ...prescription,
    label: /^Đơn thuốc \d+$/.test(prescription.label)
      ? `Đơn thuốc ${index + 1}`
      : prescription.label,
  }));
}

function loadDraftPrescriptions(): Prescription[] | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function loadDraftResult(): MedicationCheckResponse | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(RESULT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MedicationCheckResponse;
  } catch {
    return null;
  }
}

function loadDraftResultPrescriptions(): Prescription[] | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(RESULT_PRESCRIPTIONS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function parseLandingDrugs(value: string | null): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  return value
    .split(/[,;|\n]/)
    .map((name) => name.trim())
    .filter((name) => {
      const key = name.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 2);
}

function InteractionPageContent() {
  const session = getSession();
  const { confirm, toast } = useMediAlert();
  const searchParams = useSearchParams();
  // Chỉ tự nhập thuốc từ hồ sơ khi được điều hướng tới từ nút "Kiểm tra tương tác"
  // (ví dụ ở trang Hồ sơ, gắn ?import=profile) - không tự ý ghi đè khi người dùng
  // chỉ đơn thuần bấm vào tab "Tương tác" trên thanh điều hướng.
  const shouldImportFromProfile = searchParams.get("import") === "profile";
  const landingDrugs = parseLandingDrugs(searchParams.get("drugs"));
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(() => {
    if (landingDrugs.length) {
      const prescription = createPrescription(1);
      return [
        {
          ...prescription,
          drugs: landingDrugs.map((name) => ({ name, known: true })),
        },
      ];
    }
    return renumberDefaultPrescriptions(
      loadDraftPrescriptions() ?? [createPrescription(1)],
    );
  });
  const [savedPrescriptions, setSavedPrescriptions] = useState<
    PatientPrescription[]
  >([]);
  const [result, setResult] = useState<MedicationCheckResponse | null>(() =>
    loadDraftResult(),
  );
  const [resultPrescriptions, setResultPrescriptions] = useState<
    Prescription[] | null
  >(() => loadDraftResultPrescriptions());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cá nhân hóa theo hồ sơ: hỏi 1 lần mỗi phiên khi vào tab, đổi lại được bằng công tắc.
  const [personalized, setPersonalized] = useState(false);

  const boardMode = prescriptions.length > 1;
  const primary = prescriptions[0];

  useEffect(() => {
    if (!session) return;
    listPatientPrescriptions(session.userId, session.accessToken)
      .then((saved) => {
        setSavedPrescriptions(saved);
        // Chỉ điều hướng tới đây kèm ?import=(VD từ nút "Kiểm tra tương tác"
        // ở tab Đơn thuốc của tôi) mới tự nạp đơn đã lưu thành các panel tương ứng -
        // bấm thẳng vào tab Tương tác không tự ý ghi đè bàn cân. Gộp theo nhãn đơn
        // (mergeSavedIntoPrescriptions) thay vì thay thế toàn bộ, để import nhiều
        // lần liên tiếp nối tiếp nhau vào bàn cân thay vì xóa mất lần import trước.
        if (shouldImportFromProfile && saved.length > 0)
          setPrescriptions((prev) => mergeSavedIntoPrescriptions(prev, saved));
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!session) return;
    const stored = window.sessionStorage.getItem(PERSONALIZE_KEY);
    if (stored !== null) {
      setPersonalized(stored === "1");
      return;
    }
    void confirm({
      title: "Cá nhân hóa theo hồ sơ?",
      message:
        "Nếu bật, cảnh báo thuốc - bệnh nền sẽ lọc theo bệnh nền trong hồ sơ của bạn, và đơn thuốc vừa tra sẽ được lưu vào Đơn thuốc của tôi (đơn đã có sẽ không lưu lại).",
      confirmLabel: "Cá nhân hóa",
      cancelLabel: "Không, tra cứu chung",
    }).then((yes) => {
      setPersonalized(yes);
      window.sessionStorage.setItem(PERSONALIZE_KEY, yes ? "1" : "0");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function togglePersonalized(value: boolean) {
    if (loading) return;
    setPersonalized(value);
    window.sessionStorage.setItem(PERSONALIZE_KEY, value ? "1" : "0");
  }
  useEffect(() => {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(prescriptions));
  }, [prescriptions]);
  useEffect(() => {
    if (result)
      window.sessionStorage.setItem(RESULT_KEY, JSON.stringify(result));
    else window.sessionStorage.removeItem(RESULT_KEY);
  }, [result]);
  useEffect(() => {
    if (resultPrescriptions)
      window.sessionStorage.setItem(
        RESULT_PRESCRIPTIONS_KEY,
        JSON.stringify(resultPrescriptions),
      );
    else window.sessionStorage.removeItem(RESULT_PRESCRIPTIONS_KEY);
  }, [resultPrescriptions]);

  const searchFn = (q: string) =>
    session ? searchProducts(q, session.accessToken) : searchGuestProducts(q);

  function addDrugTo(prescriptionId: string, name: string, known = true) {
    setPrescriptions((prev) =>
      prev.map((p) => {
        if (p.id !== prescriptionId) return p;
        if (p.drugs.some((d) => d.name.toLowerCase() === name.toLowerCase()))
          return p;
        return { ...p, drugs: [...p.drugs, { name, known }] };
      }),
    );
    setResult(null);
  }

  function removeDrugFrom(prescriptionId: string, name: string) {
    setPrescriptions((prev) =>
      prev.map((p) =>
        p.id === prescriptionId
          ? { ...p, drugs: p.drugs.filter((d) => d.name !== name) }
          : p,
      ),
    );
    setResult(null);
  }

  function addPrescription() {
    if (loading) return;
    setPrescriptions((prev) => {
      const renumbered = renumberDefaultPrescriptions(prev);
      return [...renumbered, createPrescription(renumbered.length + 1)];
    });
  }

  function removePrescription(id: string) {
    if (loading) return;
    // Xóa đơn cuối cùng thì quay về 1 đơn trống mới (bàn cân luôn có ít nhất 1 panel).
    setPrescriptions((prev) =>
      prev.length <= 1
        ? [createPrescription(1)]
        : renumberDefaultPrescriptions(
            prev.filter((prescription) => prescription.id !== id),
          ),
    );
    setResult(null);
  }

  function importFromProfile(
    prescriptionId: string,
    sourcePrescriptionId: string,
  ) {
    const source = savedPrescriptions.find(
      (p) => p.id === sourcePrescriptionId,
    );
    if (!source) return;
    setPrescriptions((prev) =>
      prev.map((p) => {
        if (p.id !== prescriptionId) return p;
        const existing = new Set(p.drugs.map((d) => d.name.toLowerCase()));
        const toAdd = source.medications
          .filter((item) => !existing.has(item.ten_thuoc.toLowerCase()))
          .map((item) => ({ name: item.ten_thuoc, known: true }));
        // Đơn đã lưu có tên tự đặt thì panel lấy luôn tên đó - chỉ khi panel đang rỗng
        // còn mang nhãn mặc định (không đè tên người dùng vừa đặt/đã có thuốc). Trùng
        // tên panel khác (vd nhập cùng 1 đơn vào 2 panel) thì thêm hậu tố "(2)", "(3)"...
        // Đơn tên mặc định "Đơn thuốc N" giữ nguyên số thứ tự.
        const takeName =
          p.drugs.length === 0 &&
          isDefaultPrescriptionLabel(p.label) &&
          !isDefaultPrescriptionLabel(source.label);
        let label = p.label;
        if (takeName) {
          const taken = new Set(
            prev.filter((other) => other.id !== p.id).map((other) => other.label),
          );
          label = source.label;
          for (let n = 2; taken.has(label); n++) label = `${source.label} (${n})`;
        }
        return toAdd.length ? { ...p, label, drugs: [...p.drugs, ...toAdd] } : p;
      }),
    );
    setResult(null);
  }

  async function resetAll() {
    if (
      !(await confirm({
        title: "Làm mới tra cứu?",
        message:
          "Xóa toàn bộ đơn thuốc, thuốc đã nhập và kết quả tra cứu hiện tại?",
        confirmLabel: "Làm mới",
        tone: "danger",
      }))
    )
      return;
    setPrescriptions([createPrescription(1)]);
    setResult(null);
    setResultPrescriptions(null);
    setError(null);
  }

  async function runCheck(e?: FormEvent) {
    e?.preventDefault();
    const activePrescriptions = nonEmptyPrescriptions(prescriptions);
    if (mergedDrugNames(activePrescriptions).length < 2) {
      setError("Hãy chọn ít nhất 2 thuốc để phân tích tương tác.");
      return;
    }
    setError(null);
    setLoading(true);
    const payload = toPrescriptionCheckInput(activePrescriptions);
    try {
      const data = session
        ? await checkProducts(payload, session.accessToken, { personalized })
        : await checkGuestProducts(payload);
      setResult(data);
      const saved = data.saved_prescriptions ?? [];
      const created = saved.filter((s) => s.created);
      const existed = saved.filter((s) => !s.created);
      if (created.length || existed.length) {
        toast({
          title: created.length
            ? `Đã lưu ${created.length} đơn vào Đơn thuốc của tôi`
            : "Đơn đã có trong Đơn thuốc của tôi",
          message: existed.length
            ? `Không lưu lại: ${existed.map((s) => s.label).join(", ")}`
            : undefined,
          tone: created.length ? "success" : "info",
        });
      }
      setResultPrescriptions(activePrescriptions);
      window.sessionStorage.setItem(
        INTERACTION_STORAGE_KEYS.lastCheck,
        JSON.stringify(data),
      );
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollBelowStickyHeader("interaction-result");
        });
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Không thể phân tích tương tác lúc này.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="interaction-page">
      {!session && (
        <div className="guest-mode-banner">
          <MaterialIcon name="visibility" size={18} />
          <span>
            Chế độ khách: kết quả chỉ hiển thị tạm thời và không được lưu vào
            lịch sử.
          </span>
        </div>
      )}
      <section className="page-intro page-intro--with-action">
        <div>
          <p className="eyebrow">PHÂN TÍCH AN TOÀN</p>
          <h1 className="page-title-icon">
            <MaterialIcon name="hub" size={26} />
            Kiểm Tra Tương Tác Thuốc
          </h1>
        </div>
        {(result || boardMode || primary.drugs.length > 0) && (
          <button
            type="button"
            className="interaction-reset"
            onClick={resetAll}
          >
            <MaterialIcon name="restart_alt" size={17} /> Làm mới
          </button>
        )}
      </section>

      <section className="interaction-guide" aria-label="Cáo Medi gợi ý">
        <MediFox variant="search" className="interaction-guide__fox" />
        <div>
          <span className="interaction-guide__eyebrow">CÁO MEDI GỢI Ý</span>
          <h2 className="section-heading-icon">
            <MaterialIcon name="search" size={21} />
            Chọn thuốc để bắt đầu tra cứu
          </h2>
          <p>
            Thêm ít nhất 2 thuốc vào đơn, hoặc nhập từ Đơn thuốc của tôi để so
            sánh tương tác với các thuốc khác.
          </p>
        </div>
      </section>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {result && (result.unknown_products?.length ?? 0) > 0 && (
        <div className="guest-mode-banner">
          <MaterialIcon name="info" size={18} />
          <span>
            Không tìm thấy trong CSDL: {result.unknown_products!.join(", ")}.
          </span>
        </div>
      )}

      <section className="prescription-board-wrap">
        <div className="prescription-board prescription-board--slider">
          {prescriptions.map((p) => (
            <PrescriptionPanel
              key={p.id}
              label={p.label}
              drugs={p.drugs}
              search={searchFn}
              onAdd={(name, known) => addDrugTo(p.id, name, known)}
              onRemoveDrug={(name) => removeDrugFrom(p.id, name)}
              onRemovePanel={() => removePrescription(p.id)}
              savedPrescriptions={session ? savedPrescriptions : undefined}
              onImportFrom={
                session
                  ? (sourceId) => importFromProfile(p.id, sourceId)
                  : undefined
              }
              inputId={`prescription-search-${p.id}`}
            />
          ))}
          <button
            type="button"
            className="prescription-board__add"
            onClick={addPrescription}
            disabled={loading}
          >
            <MaterialIcon name="add_circle" size={26} />
            <span>Thêm đơn thuốc</span>
          </button>
        </div>
        {session && (
          <label
            className={`interaction-personalize ${personalized ? "interaction-personalize--on" : ""} ${loading ? "interaction-personalize--disabled" : ""}`}
          >
            <span className="interaction-personalize__icon" aria-hidden="true">
              <MaterialIcon name="health_and_safety" size={22} filled={personalized} />
            </span>
            <span className="interaction-personalize__text">
              <strong>Cá nhân hóa theo hồ sơ</strong>
              <small>
                {personalized
                  ? "Lọc cảnh báo theo bệnh nền của bạn và lưu đơn vào Đơn thuốc của tôi"
                  : "Đang tra cứu chung, đơn thuốc sẽ không được lưu"}
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="interaction-personalize__input"
              checked={personalized}
              disabled={loading}
              onChange={(e) => togglePersonalized(e.target.checked)}
            />
            <span className="interaction-personalize__switch" aria-hidden="true" />
          </label>
        )}
        <button
          className="interaction-run"
          type="button"
          onClick={() => void runCheck()}
          disabled={loading || mergedDrugNames(prescriptions).length < 2}
        >
          <MaterialIcon name="analytics" size={19} />
          {loading ? "Đang phân tích..." : "Phân tích tương tác"}
        </button>
        {loading && (
          <div className="mascot-loading" role="status">
            <MediFox variant="loading" className="mascot-loading__image" />
            <span>Cáo Medi đang rà soát các tương tác thuốc...</span>
          </div>
        )}
      </section>

      {result && (
        <section id="interaction-result">
          <InteractionResultView
            result={result}
            prescriptions={resultPrescriptions ?? []}
            session={session}
          />
        </section>
      )}
    </main>
  );
}

export default function InteractionPage() {
  return (
    <Suspense
      fallback={
        <main className="interaction-page">
          <div className="loading-row">
            <span className="spinner" /> Đang tải...
          </div>
        </main>
      }
    >
      <InteractionPageContent />
    </Suspense>
  );
}
