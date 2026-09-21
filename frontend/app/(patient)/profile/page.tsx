"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import MaterialIcon from "@/components/MaterialIcon";
import MediFox from "@/components/MediFox";
import PatientPrescriptionPanel from "@/components/PatientPrescriptionPanel";
import SelectField from "@/components/SelectField";
import InteractionResultView from "@/components/graph/InteractionResultView";
import {
  ApiError,
  addPatientMedication,
  checkProducts,
  createPatientPrescription,
  deletePatientPrescription,
  getPatientConditions,
  getPatientProfile,
  listPatientPrescriptions,
  removePatientMedication,
  renamePatientPrescription,
  searchDiseases,
  searchProducts,
  updatePatientConditions,
  updatePatientProfile,
  type DiseaseInfo,
  type MedicationItem,
  type MedicationCheckResponse,
  type PatientPrescription,
} from "@/lib/api";
import { getSession, saveSession } from "@/lib/auth";
import type { Prescription } from "@/lib/prescription";
import { scrollBelowStickyHeader } from "@/lib/scroll";

type ProfileTab = "personal" | "prescriptions";
type ProfileField = "ngaySinh" | "canNang" | "chieuCao";

function ProfilePageContent() {
  const searchParams = useSearchParams();
  const session = getSession();
  const accessToken = session?.accessToken;
  const activeTab: ProfileTab =
    searchParams.get("tab") === "prescriptions" ? "prescriptions" : "personal";
  const now = new Date();
  const maxBirthDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const [prescriptions, setPrescriptions] = useState<PatientPrescription[]>([]);
  const [prescriptionsLoading, setPrescriptionsLoading] = useState(true);
  const [prescriptionsError, setPrescriptionsError] = useState<string | null>(
    null,
  );
  const [addingPrescription, setAddingPrescription] = useState(false);
  const [prescriptionCheck, setPrescriptionCheck] = useState<MedicationCheckResponse | null>(null);
  const [prescriptionCheckLoading, setPrescriptionCheckLoading] = useState(false);

  const [hoTen, setHoTen] = useState("");
  const [ngaySinh, setNgaySinh] = useState("");
  const [gioiTinh, setGioiTinh] = useState("");
  const [canNang, setCanNang] = useState("");
  const [chieuCao, setChieuCao] = useState("");
  const [benhNenGhiChu, setBenhNenGhiChu] = useState("");
  const [diUngThuoc, setDiUngThuoc] = useState("");
  const [tinhTrangKhac, setTinhTrangKhac] = useState("");
  const [selectedConditions, setSelectedConditions] = useState<DiseaseInfo[]>([]);
  const [conditionQuery, setConditionQuery] = useState("");
  const [conditionSuggestions, setConditionSuggestions] = useState<DiseaseInfo[]>([]);
  const [conditionSearchLoading, setConditionSearchLoading] = useState(false);
  const [conditionSearchCompleted, setConditionSearchCompleted] = useState(false);
  const [conditionSearchError, setConditionSearchError] = useState<string | null>(null);

  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileFieldErrors, setProfileFieldErrors] = useState<
    Partial<Record<ProfileField, string>>
  >({});

  useEffect(() => {
    if (!session) return;
    listPatientPrescriptions(session.userId, session.accessToken)
      .then(setPrescriptions)
      .catch((err) =>
        setPrescriptionsError(
          err instanceof ApiError ? err.message : "Không tải được đơn thuốc",
        ),
      )
      .finally(() => setPrescriptionsLoading(false));
    Promise.all([
      getPatientProfile(session.userId, session.accessToken),
      getPatientConditions(session.userId, session.accessToken),
    ])
      .then(([info, conditions]) => {
        setHoTen(info.ho_ten ?? session.hoTen ?? "");
        setNgaySinh(info.ngay_sinh ?? "");
        setGioiTinh(info.gioi_tinh ?? "");
        setCanNang(info.can_nang?.toString() ?? "");
        setChieuCao(info.chieu_cao?.toString() ?? "");
        setBenhNenGhiChu(info.benh_nen_ghi_chu ?? "");
        setDiUngThuoc(info.di_ung_thuoc ?? "");
        setTinhTrangKhac(info.tinh_trang_khac ?? "");
        setSelectedConditions(conditions);
      })
      .catch((err) =>
        setProfileError(
          err instanceof ApiError
            ? err.message
            : "Không tải được thông tin cá nhân",
        ),
      )
      .finally(() => setProfileLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const term = conditionQuery.trim();
    if (!accessToken || term.length < 2) {
      setConditionSuggestions([]);
      setConditionSearchLoading(false);
      setConditionSearchCompleted(false);
      setConditionSearchError(null);
      return;
    }

    let cancelled = false;
    setConditionSearchLoading(true);
    setConditionSearchCompleted(false);
    setConditionSearchError(null);
    const timer = window.setTimeout(() => {
      searchDiseases(term, accessToken)
        .then((items) => {
          if (cancelled) return;
          const selectedIds = new Set(selectedConditions.map((condition) => condition.id));
          setConditionSuggestions(items.filter((item) => !selectedIds.has(item.id)));
          setConditionSearchCompleted(true);
        })
        .catch((err) => {
          if (cancelled) return;
          setConditionSuggestions([]);
          setConditionSearchCompleted(true);
          setConditionSearchError(
            err instanceof ApiError ? err.message : "Không thể tìm kiếm danh mục bệnh",
          );
        })
        .finally(() => {
          if (!cancelled) setConditionSearchLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [accessToken, conditionQuery, selectedConditions]);

  function addCondition(condition: DiseaseInfo) {
    setSelectedConditions((prev) =>
      prev.some((item) => item.id === condition.id) ? prev : [...prev, condition],
    );
    setConditionQuery("");
    setConditionSuggestions([]);
    setConditionSearchCompleted(false);
    setConditionSearchError(null);
    setProfileSaved(false);
  }

  function removeCondition(diseaseId: number) {
    setSelectedConditions((prev) => prev.filter((condition) => condition.id !== diseaseId));
    setProfileSaved(false);
  }

  function validateProfile() {
    const errors: Partial<Record<ProfileField, string>> = {};
    if (ngaySinh) {
      const birthDate = new Date(`${ngaySinh}T00:00:00`);
      const today = new Date();
      const age =
        today.getFullYear() -
        birthDate.getFullYear() -
        Number(
          today.getMonth() < birthDate.getMonth() ||
            (today.getMonth() === birthDate.getMonth() &&
              today.getDate() < birthDate.getDate()),
        );
      if (Number.isNaN(birthDate.getTime()) || age < 0 || age > 120) {
        errors.ngaySinh = "Tuổi phải nằm trong khoảng 0–120.";
      }
    }

    const validateNumber = (
      value: string,
      field: "canNang" | "chieuCao",
      min: number,
      max: number,
      label: string,
      pattern: RegExp,
    ) => {
      if (!value) return;
      const number = Number(value);
      if (
        !pattern.test(value) ||
        !Number.isFinite(number) ||
        number < min ||
        number > max
      ) {
        errors[field] = `${label} phải nằm trong khoảng ${min}–${max}.`;
      }
    };
    validateNumber(
      canNang,
      "canNang",
      1,
      300,
      "Cân nặng (kg)",
      /^\d{1,3}(\.\d)?$/,
    );
    validateNumber(
      chieuCao,
      "chieuCao",
      30,
      250,
      "Chiều cao (cm)",
      /^\d{1,3}$/,
    );
    setProfileFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function saveProfile(e?: FormEvent) {
    e?.preventDefault();
    if (!session) return;
    if (!validateProfile()) {
      setProfileError(
        "Vui lòng kiểm tra lại các thông tin sức khỏe trước khi lưu.",
      );
      setProfileSaved(false);
      return;
    }
    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);
    let conditionsSaved = false;
    try {
      const savedConditions = await updatePatientConditions(
        session.userId,
        selectedConditions.map((condition) => condition.id),
        session.accessToken,
      );
      conditionsSaved = true;
      await updatePatientProfile(
        session.userId,
        {
          ho_ten: hoTen || null,
          ngay_sinh: ngaySinh || null,
          gioi_tinh: gioiTinh || null,
          can_nang: canNang ? parseFloat(canNang) : null,
          chieu_cao: chieuCao ? parseFloat(chieuCao) : null,
          benh_nen_ghi_chu: benhNenGhiChu || null,
          di_ung_thuoc: diUngThuoc || null,
          tinh_trang_khac: tinhTrangKhac || null,
        },
        session.accessToken,
      );
      setSelectedConditions(savedConditions);
      setProfileSaved(true);
      if (hoTen && hoTen !== session.hoTen) {
        saveSession({ ...session, hoTen });
      }
    } catch (err) {
      setProfileError(
        conditionsSaved
          ? "Bệnh nền đã được lưu, nhưng các thông tin cá nhân khác chưa lưu được. Vui lòng thử lại."
          : err instanceof ApiError
          ? err.message
          : "Không thể lưu thông tin cá nhân",
      );
    } finally {
      setProfileSaving(false);
    }
  }

  const searchFn = (q: string) => searchProducts(q, session!.accessToken);

  async function handleAddDrug(prescriptionId: string, productName: string) {
    if (!session) return;
    const item = await addPatientMedication(
      session.userId,
      productName,
      session.accessToken,
      prescriptionId,
    );
    setPrescriptions((prev) =>
      prev.map((p) =>
        p.id === prescriptionId
          ? { ...p, medications: [...p.medications, item] }
          : p,
      ),
    );
  }

  async function handleRemoveDrug(
    prescriptionId: string,
    medication: MedicationItem,
  ) {
    if (!session) return;
    await removePatientMedication(
      session.userId,
      medication.id,
      session.accessToken,
    );
    setPrescriptions((prev) =>
      prev.map((p) =>
        p.id === prescriptionId
          ? {
              ...p,
              medications: p.medications.filter((m) => m.id !== medication.id),
            }
          : p,
      ),
    );
  }

  async function handleRename(prescriptionId: string, label: string) {
    if (!session) return;
    await renamePatientPrescription(
      session.userId,
      prescriptionId,
      label,
      session.accessToken,
    );
    setPrescriptions((prev) =>
      prev.map((p) => (p.id === prescriptionId ? { ...p, label } : p)),
    );
  }

  async function handleRemovePanel(prescriptionId: string) {
    if (!session) return;
    await deletePatientPrescription(
      session.userId,
      prescriptionId,
      session.accessToken,
    );
    const remaining = prescriptions.filter((prescription) => prescription.id !== prescriptionId);
    const renumbered = remaining.map((prescription, index) => {
      const nextLabel = /^Đơn thuốc \d+$/.test(prescription.label)
        ? `Đơn thuốc ${index + 1}`
        : prescription.label;
      return { ...prescription, label: nextLabel };
    });
    await Promise.all(
      renumbered
        .filter((prescription, index) => prescription.label !== remaining[index].label)
        .map((prescription) =>
          renamePatientPrescription(
            session.userId,
            prescription.id,
            prescription.label,
            session.accessToken,
          ),
        ),
    );
    setPrescriptions(renumbered);
    setPrescriptionCheck(null);
  }

  async function handleAddPrescription() {
    if (!session) return;
    setAddingPrescription(true);
    setPrescriptionsError(null);
    try {
      const created = await createPatientPrescription(
        session.userId,
        `Đơn thuốc ${prescriptions.length + 1}`,
        session.accessToken,
      );
      setPrescriptions((prev) => [...prev, created]);
    } catch (err) {
      setPrescriptionsError(
        err instanceof ApiError ? err.message : "Không thể tạo đơn thuốc mới",
      );
    } finally {
      setAddingPrescription(false);
    }
  }

  async function checkSavedPrescriptions() {
    if (!session) return;
    const prescriptionsForCheck: Prescription[] = prescriptions
      .filter((prescription) => prescription.medications.length > 0)
      .map((prescription) => ({
        id: prescription.id,
        label: prescription.label,
        drugs: prescription.medications.map((medication) => ({
          name: medication.ten_thuoc,
          known: true,
        })),
      }));
    const uniqueDrugs = new Set(
      prescriptionsForCheck.flatMap((prescription) =>
        prescription.drugs.map((drug) => drug.name.toLowerCase()),
      ),
    );
    if (prescriptionsForCheck.length < 2) {
      setPrescriptionsError("Hãy thêm thuốc vào tối thiểu 2 đơn để phân tích tương tác giữa các đơn.");
      return;
    }
    if (uniqueDrugs.size < 2) {
      setPrescriptionsError("Hãy có ít nhất 2 thuốc khác nhau để phân tích tương tác.");
      return;
    }
    setPrescriptionCheckLoading(true);
    setPrescriptionsError(null);
    try {
      const result = await checkProducts(
        prescriptionsForCheck.map((prescription) => ({
          label: prescription.label,
          products: prescription.drugs.map((drug) => drug.name),
        })),
        session.accessToken,
        { personalized: true },
      );
      setPrescriptionCheck(result);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollBelowStickyHeader("saved-prescription-result");
        });
      });
    } catch (err) {
      setPrescriptionsError(
        err instanceof ApiError ? err.message : "Không thể phân tích tương tác lúc này.",
      );
    } finally {
      setPrescriptionCheckLoading(false);
    }
  }

  if (!session) return null;

  return (
    <main className="profile-page">
      <div className="page-header page-header--in-content">
        <div>
          <p className="eyebrow">
            {activeTab === "personal" ? "HỒ SƠ CỦA TÔI" : "HỒ SƠ CỦA TÔI / ĐƠN THUỐC"}
          </p>
          {activeTab === "personal" && <h1 className="page-header__title page-title-icon"><MaterialIcon name="person" size={25} />Thông tin cá nhân</h1>}
        </div>
      </div>

      {activeTab === "personal" && (
        <section className="profile-intro">
          <div className="profile-avatar">
            <MaterialIcon name="person" size={26} />
          </div>
          <div>
            <h2>{hoTen || session.hoTen}</h2>
            <p>
              {activeTab === "personal"
                ? "Xem và cập nhật thông tin cá nhân, tiền sử bệnh lý của bạn để hệ thống tư vấn chính xác hơn."
                : "Quản lý các đơn thuốc đang sử dụng — thêm, đổi tên hoặc xóa đơn để kiểm tra tương tác thuốc."}
            </p>
          </div>
          <span className="profile-intro__state">
            <MaterialIcon name="verified_user" size={18} /> Hồ sơ bảo mật
          </span>
        </section>
      )}

      {activeTab === "prescriptions" && (
        <section
          className="prescription-guide"
          aria-label="Hướng dẫn quản lý đơn thuốc"
        >
          <MediFox
            variant="pharmacist-empty"
            className="prescription-guide__fox"
          />
          <div className="prescription-guide__content">
            <span className="prescription-guide__eyebrow">CÁO MEDI GỢI Ý</span>
            <h2 className="section-heading-icon"><MaterialIcon name="medication" size={21} />Quản lý đơn thuốc</h2>
            <p>
              Đây là nơi lưu các đơn thuốc bạn đang sử dụng. Bạn có thể{" "}
              <strong>tra cứu tương tác giữa các đơn.</strong>
            </p>
          </div>
        </section>
      )}

      {activeTab === "personal" && (
        <form className="profile-details-form" onSubmit={saveProfile}>
          {profileLoading ? (
            <div className="panel">
              <div className="loading-row">
                <span className="spinner" /> Đang tải...
              </div>
            </div>
          ) : (
            <div className="profile-details-grid">
              {/* Cột 1: Thông tin cơ bản */}
              <section className="panel profile-details-card">
                <h3 className="profile-details-card__title">
                  <MaterialIcon name="person" size={20} /> Thông tin cơ bản
                </h3>
                <p className="profile-details-card__hint">
                  Thông tin được lưu an toàn và kiểm tra trước khi dùng cho phân
                  tích thuốc.
                </p>

                <div className="field">
                  <label>Họ và tên</label>
                  <input
                    type="text"
                    value={hoTen}
                    onChange={(e) => setHoTen(e.target.value)}
                    placeholder="Nhập họ và tên"
                  />
                </div>

                <div className="profile-details-row">
                  <div className="field">
                    <label>Ngày sinh</label>
                    <input
                      type="date"
                      max={maxBirthDate}
                      value={ngaySinh}
                      aria-invalid={Boolean(profileFieldErrors.ngaySinh)}
                      aria-describedby={
                        profileFieldErrors.ngaySinh
                          ? "birth-date-error"
                          : undefined
                      }
                      onChange={(e) => {
                        setNgaySinh(e.target.value);
                        setProfileFieldErrors((prev) => ({
                          ...prev,
                          ngaySinh: undefined,
                        }));
                      }}
                    />
                    {profileFieldErrors.ngaySinh && (
                      <p id="birth-date-error" className="profile-field-error">
                        {profileFieldErrors.ngaySinh}
                      </p>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="gender">Giới tính</label>
                    <SelectField
                      id="gender"
                      value={gioiTinh}
                      onChange={setGioiTinh}
                      options={[
                        { value: "Nam", label: "Nam" },
                        { value: "Nữ", label: "Nữ" },
                        { value: "Khác", label: "Khác" },
                      ]}
                    />
                  </div>
                </div>

                <div className="profile-details-row">
                  <div className="field">
                    <label>Cân nặng (kg)</label>
                    <input
                      type="number"
                      min="1"
                      max="300"
                      step="0.1"
                      inputMode="decimal"
                      value={canNang}
                      aria-invalid={Boolean(profileFieldErrors.canNang)}
                      aria-describedby={
                        profileFieldErrors.canNang ? "weight-error" : undefined
                      }
                      onChange={(e) => {
                        setCanNang(e.target.value);
                        setProfileFieldErrors((prev) => ({
                          ...prev,
                          canNang: undefined,
                        }));
                      }}
                      placeholder="Ví dụ: 65"
                    />
                    {profileFieldErrors.canNang && (
                      <p id="weight-error" className="profile-field-error">
                        {profileFieldErrors.canNang}
                      </p>
                    )}
                  </div>
                  <div className="field">
                    <label>Chiều cao (cm)</label>
                    <input
                      type="number"
                      min="30"
                      max="250"
                      step="1"
                      inputMode="numeric"
                      value={chieuCao}
                      aria-invalid={Boolean(profileFieldErrors.chieuCao)}
                      aria-describedby={
                        profileFieldErrors.chieuCao ? "height-error" : undefined
                      }
                      onChange={(e) => {
                        setChieuCao(e.target.value);
                        setProfileFieldErrors((prev) => ({
                          ...prev,
                          chieuCao: undefined,
                        }));
                      }}
                      placeholder="Ví dụ: 168"
                    />
                    {profileFieldErrors.chieuCao && (
                      <p id="height-error" className="profile-field-error">
                        {profileFieldErrors.chieuCao}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* Cột 2: Tiền sử y tế */}
              <section className="panel profile-details-card profile-details-card--medical">
                <h3 className="profile-details-card__title">
                  <MaterialIcon name="medical_services" size={20} /> Tiền sử y
                  tế
                </h3>

                <div className="field condition-selector">
                  <label htmlFor="condition-search">Bệnh lý nền đã được chẩn đoán</label>
                  <p className="condition-selector__hint">
                    Chọn từ danh mục chuẩn hóa để MediCheck cá nhân hóa cảnh báo thuốc–bệnh.
                  </p>
                  {selectedConditions.length > 0 ? (
                    <div className="condition-chips" aria-label="Bệnh lý nền đã chọn">
                      {selectedConditions.map((condition) => (
                        <span className="condition-chip" key={condition.id}>
                          <span>
                            <strong>{condition.ten_benh_vi || condition.ten_benh}</strong>
                            {condition.ten_benh_vi && condition.ten_benh_vi !== condition.ten_benh && (
                              <small>{condition.ten_benh}</small>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeCondition(condition.id)}
                            aria-label={`Xóa ${condition.ten_benh_vi || condition.ten_benh}`}
                          >
                            <MaterialIcon name="close" size={16} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="condition-selector__empty">Chưa chọn bệnh lý nền nào.</p>
                  )}

                  <div className="condition-search-wrap">
                    <MaterialIcon name="search" size={19} />
                    <input
                      id="condition-search"
                      type="search"
                      value={conditionQuery}
                      onChange={(event) => setConditionQuery(event.target.value)}
                      placeholder="Nhập ít nhất 2 ký tự để tìm bệnh..."
                      autoComplete="off"
                      disabled={selectedConditions.length >= 100}
                      aria-autocomplete="list"
                      aria-controls="condition-search-results"
                      aria-expanded={conditionSuggestions.length > 0}
                    />
                    {conditionSearchLoading && <span className="spinner spinner--sm" />}
                  </div>

                  {conditionSuggestions.length > 0 && (
                    <ul
                      id="condition-search-results"
                      className="interaction-suggestions interaction-suggestions--inline condition-suggestions--disease"
                      role="listbox"
                    >
                      {conditionSuggestions.slice(0, 5).map((condition) => (
                        <li
                          key={condition.id}
                          role="option"
                          aria-selected="false"
                          tabIndex={0}
                          onClick={() => addCondition(condition)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              addCondition(condition);
                            }
                          }}
                        >
                          <div>
                            <strong>{condition.ten_benh_vi || condition.ten_benh}</strong>
                            <small>{condition.ten_benh}</small>
                          </div>
                          <MaterialIcon name="add_circle_outline" size={19} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {conditionSearchError && (
                    <p className="profile-field-error" role="alert">
                      {conditionSearchError}
                    </p>
                  )}
                  {conditionSearchCompleted &&
                    !conditionSearchLoading &&
                    !conditionSearchError &&
                    conditionSuggestions.length === 0 && (
                      <p className="condition-selector__empty">
                        Không tìm thấy bệnh phù hợp hoặc bệnh này đã được chọn.
                      </p>
                    )}
                </div>

                <div className="field">
                  <label>Ghi chú bệnh lý khác</label>
                  <textarea
                    rows={2}
                    value={benhNenGhiChu}
                    onChange={(e) => setBenhNenGhiChu(e.target.value)}
                    placeholder="Thông tin bổ sung hoặc bệnh chưa tìm thấy trong danh mục..."
                  />
                </div>

                <div className="field">
                  <label>Dị ứng thuốc</label>
                  <textarea
                    rows={2}
                    value={diUngThuoc}
                    onChange={(e) => setDiUngThuoc(e.target.value)}
                    placeholder="Nhập chi tiết các loại thuốc gây dị ứng..."
                  />
                </div>

                <div className="field">
                  <label>Tình trạng mang thai hoặc trường hợp khác</label>
                  <textarea
                    rows={2}
                    value={tinhTrangKhac}
                    onChange={(e) => setTinhTrangKhac(e.target.value)}
                    placeholder="Ghi chú thêm nếu đang mang thai, cho con bú..."
                  />
                </div>
              </section>

              {/* Hành động */}
              <div className="profile-details-actions">
                {profileError && (
                  <p className="error-text" role="alert" style={{ margin: 0 }}>
                    {profileError}
                  </p>
                )}
                {profileSaved && (
                  <p className="success-text" style={{ margin: 0 }}>
                    <MaterialIcon name="check_circle" size={18} /> Đã lưu thông
                    tin
                  </p>
                )}
                <button
                  type="submit"
                  className="primary"
                  disabled={profileSaving}
                >
                  {profileSaving ? (
                    <span className="spinner spinner--sm" />
                  ) : (
                    <MaterialIcon name="save" size={20} />
                  )}{" "}
                  Lưu thông tin
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      {activeTab === "prescriptions" && (
        <>
        <section className="prescription-board-wrap">
          <div className="dashboard-section__header">
            <h2 className="section-heading-icon"><MaterialIcon name="inventory_2" size={21} />Danh sách đơn đang dùng ({prescriptions.length})</h2>
          </div>
          {prescriptionsError && (
            <p className="error-text" role="alert">
              {prescriptionsError}
            </p>
          )}
          {prescriptionsLoading ? (
            <div className="panel">
              <div className="loading-row">
                <span className="spinner" /> Đang tải...
              </div>
            </div>
          ) : (
            <div className="prescription-board prescription-board--slider">
              {prescriptions.map((p) => (
                <PatientPrescriptionPanel
                  key={p.id}
                  prescription={p}
                  canRemove={prescriptions.length > 1}
                  search={searchFn}
                  onAddDrug={(name) => handleAddDrug(p.id, name)}
                  onRemoveDrug={(med) => handleRemoveDrug(p.id, med)}
                  onRename={(label) => handleRename(p.id, label)}
                  onRemovePanel={() => handleRemovePanel(p.id)}
                  inputId={`patient-prescription-search-${p.id}`}
                />
              ))}
              <button
                type="button"
                className="prescription-board__add"
                onClick={() => void handleAddPrescription()}
                disabled={addingPrescription}
              >
                {addingPrescription ? (
                  <span className="spinner spinner--sm" />
                ) : (
                  <MaterialIcon name="add_circle" size={26} />
                )}
                <span>Thêm đơn thuốc</span>
              </button>
            </div>
          )}
          <button
            className="interaction-run profile-interaction-run"
            type="button"
            onClick={() => void checkSavedPrescriptions()}
            disabled={
              prescriptionCheckLoading ||
              prescriptions.filter((prescription) => prescription.medications.length > 0).length < 2
            }
          >
            {prescriptionCheckLoading ? <span className="spinner spinner--sm" /> : <MaterialIcon name="analytics" size={19} />}
            {prescriptionCheckLoading ? "Đang phân tích..." : "Phân tích tương tác giữa các đơn"}
          </button>
        </section>
        {prescriptionCheck && (
          <section id="saved-prescription-result" className="profile-interaction-result">
            <div className="profile-interaction-result__header">
              <div>
                <span className="eyebrow">KẾT QUẢ TRA CỨU</span>
                <h2 className="section-heading-icon"><MaterialIcon name="hub" size={21} />Tương tác giữa các đơn thuốc</h2>
              </div>
              <button type="button" className="secondary" onClick={() => setPrescriptionCheck(null)}>
                Đóng kết quả
              </button>
            </div>
            <InteractionResultView
              result={prescriptionCheck}
              prescriptions={prescriptions
                .filter((prescription) => prescription.medications.length > 0)
                .map((prescription) => ({
                  id: prescription.id,
                  label: prescription.label,
                  drugs: prescription.medications.map((medication) => ({ name: medication.ten_thuoc, known: true })),
                }))}
              session={session}
            />
          </section>
        )}
        </>
      )}
    </main>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <main className="profile-page">
          <div className="loading-row">
            <span className="spinner" /> Đang tải...
          </div>
        </main>
      }
    >
      <ProfilePageContent />
    </Suspense>
  );
}
