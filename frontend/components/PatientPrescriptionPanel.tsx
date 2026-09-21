"use client";

import { useEffect, useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import { useMediAlert } from "@/components/MediAlertProvider";
import type { MedicationItem, PatientPrescription, ProductSearchResult } from "@/lib/api";

type PatientPrescriptionPanelProps = {
  prescription: PatientPrescription;
  canRemove: boolean;
  search: (query: string) => Promise<ProductSearchResult[]>;
  onAddDrug: (productName: string) => Promise<void>;
  onRemoveDrug: (medication: MedicationItem) => Promise<void>;
  onRename: (label: string) => Promise<void>;
  onRemovePanel: () => Promise<void>;
  inputId: string;
};

// Khác PrescriptionPanel (bàn cân tương tác - chỉ sống trong session, sửa gì cũng
// tức thời ở state cục bộ): đây là đơn thuốc ĐÃ LƯU trong hồ sơ, nên mọi thao tác
// (thêm/xóa thuốc, đổi tên, xóa đơn) đều là 1 lệnh gọi API - cần trạng thái
// pending/lỗi riêng cho từng hành động thay vì cập nhật local ngay lập tức.
export default function PatientPrescriptionPanel({
  prescription,
  canRemove,
  search,
  onAddDrug,
  onRemoveDrug,
  onRename,
  onRemovePanel,
  inputId,
}: PatientPrescriptionPanelProps) {
  const { confirm } = useMediAlert();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ProductSearchResult[]>([]);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removingPanel, setRemovingPanel] = useState(false);
  const [label, setLabel] = useState(prescription.label);
  const [renaming, setRenaming] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setLabel(prescription.label), [prescription.label]);

  useEffect(() => {
    if (query.trim().length < 2) { setSuggestions([]); return; }
    const timer = setTimeout(() => search(query.trim()).then(setSuggestions).catch(() => setSuggestions([])), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function add(name: string) {
    setAdding(true); setError(null);
    try { await onAddDrug(name); setQuery(""); setSuggestions([]); }
    catch { setError("Không thể thêm thuốc vào đơn này"); }
    finally { setAdding(false); }
  }

  async function remove(item: MedicationItem) {
    setRemovingId(item.id); setError(null);
    try { await onRemoveDrug(item); }
    catch { setError("Không thể xóa thuốc"); }
    finally { setRemovingId(null); }
  }

  async function saveLabel() {
    const trimmed = label.trim();
    setEditingLabel(false);
    if (!trimmed || trimmed === prescription.label) { setLabel(prescription.label); return; }
    setRenaming(true); setError(null);
    try { await onRename(trimmed); }
    catch { setError("Không thể đổi tên đơn thuốc"); setLabel(prescription.label); }
    finally { setRenaming(false); }
  }

  async function removePanel() {
    if (!(await confirm({ title: "Xóa đơn thuốc?", message: `Xóa "${prescription.label}" cùng toàn bộ thuốc trong đơn này?`, confirmLabel: "Xóa đơn", tone: "danger" }))) return;
    setRemovingPanel(true); setError(null);
    try { await onRemovePanel(); }
    catch { setError("Không thể xóa đơn thuốc này"); setRemovingPanel(false); }
  }

  return (
    <div className="prescription-panel panel">
      <div className="prescription-panel__header">
        {editingLabel ? (
          <input
            className="prescription-panel__label-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={saveLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") { setLabel(prescription.label); setEditingLabel(false); }
            }}
            disabled={renaming}
            aria-label="Tên đơn thuốc"
            autoFocus
          />
        ) : (
          <h3>{prescription.label}</h3>
        )}
        {renaming && <span className="spinner spinner--sm" />}
        <div className="prescription-panel__header-actions">
          {!editingLabel && (
            <button type="button" className="prescription-panel__edit" onClick={() => setEditingLabel(true)} aria-label="Sửa tên đơn thuốc" title="Sửa tên đơn thuốc">
              <MaterialIcon name="edit" size={16} />
            </button>
          )}
          {canRemove && (
            <button type="button" className="prescription-panel__remove" onClick={() => void removePanel()} disabled={removingPanel} aria-label={`Xóa ${prescription.label}`}>
              {removingPanel ? <span className="spinner spinner--sm" /> : <MaterialIcon name="close" size={18} />}
            </button>
          )}
        </div>
      </div>

      <div className="interaction-search__input icon-input-spacing">
        <MaterialIcon name="search" size={19} />
        <input
          id={inputId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nhập tên thuốc, ví dụ Panadol"
          autoComplete="off"
          disabled={adding}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (suggestions[0]) void add(suggestions[0].ten_thuoc);
          }}
        />
        {query && (
          <button type="button" onClick={() => { setQuery(""); setSuggestions([]); }} aria-label="Xóa tìm kiếm">
            <MaterialIcon name="close" size={16} />
          </button>
        )}
      </div>
      {suggestions.length > 0 && (
        <ul className="interaction-suggestions interaction-suggestions--inline">
          {suggestions.slice(0, 5).map((item) => (
            <li
              key={item.id}
              className={prescription.medications.some((medication) => medication.ten_thuoc.toLowerCase() === item.ten_thuoc.toLowerCase()) ? "interaction-suggestion--selected" : undefined}
              aria-disabled={prescription.medications.some((medication) => medication.ten_thuoc.toLowerCase() === item.ten_thuoc.toLowerCase())}
              onClick={() => {
                if (!prescription.medications.some((medication) => medication.ten_thuoc.toLowerCase() === item.ten_thuoc.toLowerCase())) void add(item.ten_thuoc);
              }}
            >
              <div><strong>{item.ten_thuoc}</strong><small>{prescription.medications.some((medication) => medication.ten_thuoc.toLowerCase() === item.ten_thuoc.toLowerCase()) ? "Đã chọn trong đơn" : "Thuốc trong cơ sở dữ liệu"}</small></div>
              <MaterialIcon name={prescription.medications.some((medication) => medication.ten_thuoc.toLowerCase() === item.ten_thuoc.toLowerCase()) ? "check" : "add_circle_outline"} size={19} />
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error-text" role="alert">{error}</p>}

      <div className="prescription-panel__list">
        {prescription.medications.length === 0 && <p className="prescription-panel__empty">Chưa có thuốc nào trong đơn này.</p>}
        {prescription.medications.map((item) => (
          <div className="selected-medication" key={item.id}>
            <span className="selected-medication__icon"><MaterialIcon name="medication" size={18} /></span>
            <div><strong>{item.ten_thuoc}</strong><small>{item.ngay_bat_dau ? `Bắt đầu từ ${item.ngay_bat_dau}` : "Được thêm hôm nay"}</small></div>
            <button type="button" onClick={() => void remove(item)} disabled={removingId === item.id} aria-label={`Xóa ${item.ten_thuoc}`}>
              {removingId === item.id ? <span className="spinner spinner--sm" /> : <MaterialIcon name="close" size={17} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
