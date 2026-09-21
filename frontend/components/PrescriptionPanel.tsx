"use client";

import { useEffect, useRef, useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import type { PatientPrescription, ProductSearchResult } from "@/lib/api";
import type { SelectedDrug } from "@/lib/prescription";

type PrescriptionPanelProps = {
  label: string;
  drugs: SelectedDrug[];
  search: (query: string) => Promise<ProductSearchResult[]>;
  onAdd: (name: string, known?: boolean) => void;
  onRemoveDrug: (name: string) => void;
  onRemovePanel?: () => void;
  // Đơn thuốc đã lưu trong hồ sơ (tab "Đơn thuốc của tôi") để chọn nhập vào panel
  // này. 0 đơn -> ẩn hẳn nút; đúng 1 đơn -> bấm là nhập luôn (như hành vi cũ);
  // từ 2 đơn trở lên -> hiện danh sách để chọn đúng 1 đơn.
  savedPrescriptions?: PatientPrescription[];
  onImportFrom?: (prescriptionId: string) => void;
  // Cho phép đổi tên đơn thuốc qua nút sửa (bấm mới cho sửa). Không truyền prop
  // này thì tên đơn hiển thị tĩnh, không sửa được (VD: bàn cân tương tác của bệnh nhân).
  onRename?: (label: string) => void;
  inputId: string;
};

export default function PrescriptionPanel({ label, drugs, search, onAdd, onRemoveDrug, onRemovePanel, savedPrescriptions, onImportFrom, onRename, inputId }: PrescriptionPanelProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ProductSearchResult[]>([]);
  const [importPickerOpen, setImportPickerOpen] = useState(false);
  const importPickerRef = useRef<HTMLDivElement>(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label);

  useEffect(() => setDraftLabel(label), [label]);

  useEffect(() => {
    if (query.trim().length < 2) { setSuggestions([]); return; }
    const timer = setTimeout(() => search(query.trim()).then(setSuggestions).catch(() => setSuggestions([])), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (!importPickerOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (importPickerRef.current && !importPickerRef.current.contains(e.target as Node)) setImportPickerOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [importPickerOpen]);

  function handleImportClick() {
    if (!savedPrescriptions || !onImportFrom) return;
    if (savedPrescriptions.length === 1) onImportFrom(savedPrescriptions[0].id);
    else setImportPickerOpen((open) => !open);
  }

  function add(name: string, known = true) {
    onAdd(name, known);
    setQuery("");
    setSuggestions([]);
  }

  function saveLabel() {
    const trimmed = draftLabel.trim();
    setEditingLabel(false);
    if (!trimmed || trimmed === label) { setDraftLabel(label); return; }
    onRename?.(trimmed);
  }

  return (
    <div className="prescription-panel panel">
      <div className="prescription-panel__header">
        {editingLabel && onRename ? (
          <input
            className="prescription-panel__label-input"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onBlur={saveLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") { setDraftLabel(label); setEditingLabel(false); }
            }}
            aria-label="Tên đơn thuốc"
            autoFocus
          />
        ) : (
          <h3>{label}</h3>
        )}
        <div className="prescription-panel__header-actions">
          {onRename && !editingLabel && (
            <button type="button" className="prescription-panel__edit" onClick={() => setEditingLabel(true)} aria-label="Sửa tên đơn thuốc" title="Sửa tên đơn thuốc">
              <MaterialIcon name="edit" size={16} />
            </button>
          )}
          {onRemovePanel && (
            <button type="button" className="prescription-panel__remove" onClick={onRemovePanel} aria-label={`Xóa ${label}`}>
              <MaterialIcon name="close" size={18} />
            </button>
          )}
        </div>
      </div>
      {savedPrescriptions && savedPrescriptions.length > 0 && onImportFrom && (
        <div className="prescription-panel__actions">
          <div className="prescription-panel__import" ref={importPickerRef}>
            <button type="button" className="prescription-panel__tool" onClick={handleImportClick} title="Nhập từ hồ sơ thuốc đang dùng">
              <MaterialIcon name="download" size={16} /><span>Nhập từ hồ sơ</span>
            </button>
            {importPickerOpen && (
              <ul className="prescription-panel__import-menu">
                {savedPrescriptions.map((p) => (
                  <li key={p.id} onClick={() => { onImportFrom(p.id); setImportPickerOpen(false); }}>
                    <div><strong>{p.label}</strong><small>{p.medications.length} thuốc</small></div>
                    <MaterialIcon name="chevron_right" size={17} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="interaction-search__input icon-input-spacing">
        <MaterialIcon name="search" size={19} />
        <input
          id={inputId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nhập tên thuốc, ví dụ Panadol"
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (suggestions[0]) add(suggestions[0].ten_thuoc);
            else if (query.trim()) add(query.trim(), false);
          }}
        />
        {query && (
          <button type="button" onClick={() => { setQuery(""); setSuggestions([]); }} aria-label="Xóa tìm kiếm">
            <MaterialIcon name="close" size={16} />
          </button>
        )}
      </div>
      {suggestions.length > 0 ? (
        <ul className="interaction-suggestions interaction-suggestions--inline">
          {suggestions.slice(0, 5).map((item) => (
            <li
              key={item.id}
              className={drugs.some((drug) => drug.name.toLowerCase() === item.ten_thuoc.toLowerCase()) ? "interaction-suggestion--selected" : undefined}
              aria-disabled={drugs.some((drug) => drug.name.toLowerCase() === item.ten_thuoc.toLowerCase())}
              onClick={() => {
                if (!drugs.some((drug) => drug.name.toLowerCase() === item.ten_thuoc.toLowerCase())) add(item.ten_thuoc);
              }}
            >
              <div><strong>{item.ten_thuoc}</strong><small>{drugs.some((drug) => drug.name.toLowerCase() === item.ten_thuoc.toLowerCase()) ? "Đã chọn trong đơn" : "Thuốc trong cơ sở dữ liệu"}</small></div>
              <MaterialIcon name={drugs.some((drug) => drug.name.toLowerCase() === item.ten_thuoc.toLowerCase()) ? "check" : "add_circle_outline"} size={19} />
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 && (
        <button type="button" className="interaction-unknown" onClick={() => add(query.trim(), false)}>
          <div><strong>Không tìm thấy "{query.trim()}"</strong><small>Thêm thuốc chưa cập nhật trong cơ sở dữ liệu</small></div>
          <MaterialIcon name="add_circle_outline" size={19} />
        </button>
      )}

      <div className="prescription-panel__list">
        {drugs.length === 0 && <p className="prescription-panel__empty">Chưa có thuốc nào trong đơn này.</p>}
        {drugs.map((item) => (
          <div className={`selected-medication ${!item.known ? "selected-medication--unknown" : ""}`} key={item.name}>
            <span className="selected-medication__icon"><MaterialIcon name="medication" size={18} /></span>
            <div><strong>{item.name}</strong><small>{item.known ? "Thuốc trong cơ sở dữ liệu" : "Chưa cập nhật trong cơ sở dữ liệu"}</small></div>
            <button type="button" onClick={() => onRemoveDrug(item.name)} aria-label={`Xóa ${item.name}`}><MaterialIcon name="close" size={17} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
