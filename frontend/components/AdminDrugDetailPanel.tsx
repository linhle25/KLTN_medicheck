"use client";

import { useEffect, useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import {
  ApiError,
  getAdminDrugDetail,
  updateAdminDrug,
  type AdminDrugDetail,
  type AdminDrugUpdate,
  type AdminInteractionRow,
} from "@/lib/api";

const SEVERITY: Record<string, { label: string; cls: string }> = {
  nang: { label: "Nghiêm trọng", cls: "nang" },
  trung_binh: { label: "Trung bình", cls: "trung_binh" },
  nhe: { label: "Nhẹ", cls: "nhe" },
  chua_phan_loai: { label: "Chưa phân loại", cls: "chua" },
};

type Form = {
  name: string;
  ten_biet_duoc: string;
  hoat_chat: string;
  mo_ta: string;
  is_duoc_lieu: boolean;
  loai: string;
  nguon_du_lieu: string;
  aliases: string;
};

const toForm = (d: AdminDrugDetail): Form => ({
  name: d.name,
  ten_biet_duoc: d.ten_biet_duoc ?? "",
  hoat_chat: d.hoat_chat ?? "",
  mo_ta: d.mo_ta ?? "",
  is_duoc_lieu: Boolean(d.is_duoc_lieu),
  loai: d.loai ?? "",
  nguon_du_lieu: d.nguon_du_lieu ?? "",
  aliases: d.aliases.map((a) => a.alias).join(", "),
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="admin-drug-field"><span>{label}</span>{children}</label>;
}

function ReadRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="admin-drug-read">
      <dt>{label}</dt>
      <dd>{value || <em>Chưa có dữ liệu</em>}</dd>
    </div>
  );
}

function InteractionList({
  title,
  icon,
  rows,
  total,
  targetLabel,
}: {
  title: string;
  icon: string;
  rows: AdminInteractionRow[];
  total: number;
  targetLabel: string;
}) {
  return (
    <section className="admin-drug-section">
      <h3><MaterialIcon name={icon} size={20} />{title}<span className="admin-drug-count">{total}</span></h3>
      {rows.length === 0 ? (
        <p className="admin-drug-empty">Chưa có dữ liệu.</p>
      ) : (
        <ul className="admin-drug-rows">
          {rows.map((row) => {
            const sev = SEVERITY[row.muc_do ?? "chua_phan_loai"] ?? SEVERITY.chua_phan_loai;
            return (
              <li key={row.id}>
                <details>
                  <summary>
                    <span className="admin-drug-row__name">
                      <small>{targetLabel}</small>
                      {row.doi_tuong_vi || row.doi_tuong}
                      {row.doi_tuong_vi && row.doi_tuong_vi !== row.doi_tuong && <em> ({row.doi_tuong})</em>}
                    </span>
                    <span className={`admin-drug-sev admin-drug-sev--${sev.cls}`}>{sev.label}</span>
                  </summary>
                  <dl>
                    <ReadRow label="Mô tả" value={row.mo_ta_dich || row.mo_ta} />
                    {row.mo_ta_dich && row.mo_ta && <ReadRow label="Mô tả gốc (DDInter)" value={row.mo_ta} />}
                    {(row.xu_tri_dich || row.xu_tri) && <ReadRow label="Hướng xử trí" value={row.xu_tri_dich || row.xu_tri} />}
                    {row.thay_the && <ReadRow label="Thuốc thay thế tham khảo" value={row.thay_the} />}
                    <ReadRow label="Nguồn trích dẫn" value={row.nguon_trich_dan} />
                  </dl>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      {total > rows.length && <p className="admin-drug-more">Đang hiển thị {rows.length}/{total} mục (ưu tiên mức độ nặng).</p>}
    </section>
  );
}

export default function AdminDrugDetailPanel({
  kind,
  id,
  onClose,
  onSaved,
}: {
  kind: "medication" | "product";
  id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState<AdminDrugDetail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setEditing(false); setNotice(null);
    getAdminDrugDetail(kind, id)
      .then((d) => { if (!cancelled) { setDetail(d); setForm(toForm(d)); } })
      .catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : "Không tải được chi tiết thuốc."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind, id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const save = async () => {
    if (!detail || !form) return;
    if (!form.name.trim()) { setError("Tên thuốc không được để trống."); return; }
    const body: AdminDrugUpdate = { name: form.name, nguon_du_lieu: form.nguon_du_lieu };
    if (kind === "medication") {
      body.ten_biet_duoc = form.ten_biet_duoc;
      body.hoat_chat = form.hoat_chat;
      body.mo_ta = form.mo_ta;
      body.aliases = form.aliases.split(/[,\n]/).map((a) => a.trim()).filter(Boolean);
    } else {
      body.is_duoc_lieu = form.is_duoc_lieu;
      body.loai = form.loai as AdminDrugUpdate["loai"];
    }
    setSaving(true); setError(null); setNotice(null);
    try {
      const updated = await updateAdminDrug(kind, id, body);
      setDetail(updated); setForm(toForm(updated)); setEditing(false);
      setNotice("Đã lưu thay đổi.");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không lưu được thay đổi.");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => { if (detail) setForm(toForm(detail)); setEditing(false); setError(null); };

  return (
    <div className="admin-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <aside className="admin-drawer" role="dialog" aria-modal="true" aria-label="Chi tiết thuốc">
        <header className="admin-drawer__header">
          <span className="admin-drawer__icon"><MaterialIcon name={kind === "medication" ? "science" : "medication"} size={24} /></span>
          <div>
            <p className="eyebrow">{kind === "medication" ? "HOẠT CHẤT" : "BIỆT DƯỢC"}</p>
            <h2>{detail?.name ?? "Đang tải..."}</h2>
          </div>
          <div className="admin-drawer__actions">
            {detail && !editing && <button type="button" onClick={() => { setEditing(true); setNotice(null); }}><MaterialIcon name="edit" size={18} />Chỉnh sửa</button>}
            <button type="button" className="secondary" onClick={onClose} aria-label="Đóng" disabled={saving}><MaterialIcon name="close" size={20} /></button>
          </div>
        </header>

        <div className="admin-drawer__body">
          {loading && <div className="admin-loading"><span className="spinner" />Đang tải chi tiết...</div>}
          {error && <div className="admin-alert admin-alert--error"><MaterialIcon name="error" size={20} />{error}</div>}
          {notice && <div className="admin-alert admin-alert--ok"><MaterialIcon name="check_circle" size={20} />{notice}</div>}

          {detail && form && (
            <>
              <section className="admin-drug-section">
                <h3><MaterialIcon name="badge" size={20} />Thông tin chung</h3>
                {editing ? (
                  <div className="admin-drug-form">
                    <Field label={kind === "medication" ? "Tên chuẩn hóa *" : "Tên thuốc *"}>
                      <input value={form.name} maxLength={kind === "medication" ? 255 : 500} onChange={(e) => set("name", e.target.value)} />
                    </Field>
                    {kind === "medication" ? (
                      <>
                        <Field label="Tên biệt dược"><input value={form.ten_biet_duoc} maxLength={255} onChange={(e) => set("ten_biet_duoc", e.target.value)} /></Field>
                        <Field label="Hoạt chất"><input value={form.hoat_chat} maxLength={255} onChange={(e) => set("hoat_chat", e.target.value)} /></Field>
                        <Field label="Mô tả (DDInter)"><textarea rows={5} value={form.mo_ta} onChange={(e) => set("mo_ta", e.target.value)} /></Field>
                        <Field label="Tên gọi khác / viết tắt (cách nhau bằng dấu phẩy)">
                          <textarea rows={2} value={form.aliases} onChange={(e) => set("aliases", e.target.value)} placeholder="vd: asa, aspirine" />
                        </Field>
                      </>
                    ) : (
                      <>
                        <Field label="Loại thuốc">
                          <select value={form.loai} onChange={(e) => set("loai", e.target.value)}>
                            <option value="">Chưa phân loại</option>
                            <option value="ke_don">Kê đơn</option>
                            <option value="khong_ke_don">Không kê đơn</option>
                          </select>
                        </Field>
                        <label className="admin-drug-check"><input type="checkbox" checked={form.is_duoc_lieu} onChange={(e) => set("is_duoc_lieu", e.target.checked)} />Là dược liệu</label>
                      </>
                    )}
                    <Field label="Nguồn dữ liệu"><input value={form.nguon_du_lieu} maxLength={100} onChange={(e) => set("nguon_du_lieu", e.target.value)} /></Field>
                    <div className="admin-drug-form__actions">
                      <button type="button" onClick={save} disabled={saving}>{saving ? "Đang lưu..." : "Lưu thay đổi"}</button>
                      <button type="button" className="secondary" onClick={cancel} disabled={saving}>Hủy</button>
                    </div>
                  </div>
                ) : (
                  <dl>
                    {kind === "medication" ? (
                      <>
                        <ReadRow label="Tên chuẩn hóa" value={detail.name} />
                        <ReadRow label="Tên biệt dược" value={detail.ten_biet_duoc} />
                        <ReadRow label="Hoạt chất" value={detail.hoat_chat} />
                        <ReadRow label="Mô tả (DDInter)" value={detail.mo_ta} />
                        <div className="admin-drug-read">
                          <dt>Tên gọi khác / viết tắt</dt>
                          <dd>{detail.aliases.length ? <span className="admin-drug-chips">{detail.aliases.map((a) => <span key={a.id}>{a.alias}</span>)}</span> : <em>Chưa có dữ liệu</em>}</dd>
                        </div>
                      </>
                    ) : (
                      <>
                        <ReadRow label="Tên thuốc" value={detail.name} />
                        <ReadRow label="Loại thuốc" value={detail.loai === "ke_don" ? "Kê đơn" : detail.loai === "khong_ke_don" ? "Không kê đơn" : detail.loai} />
                        <ReadRow label="Dược liệu" value={detail.is_duoc_lieu ? "Có" : "Không"} />
                      </>
                    )}
                    <ReadRow label="Nguồn dữ liệu" value={detail.nguon_du_lieu} />
                  </dl>
                )}
              </section>

              {kind === "product" && (
                <section className="admin-drug-section">
                  <h3><MaterialIcon name="science" size={20} />Thành phần hoạt chất<span className="admin-drug-count">{detail.ingredients.length}</span></h3>
                  {detail.ingredients.length === 0 ? <p className="admin-drug-empty">Chưa có dữ liệu thành phần.</p> : (
                    <ul className="admin-drug-rows">
                      {detail.ingredients.map((ing) => (
                        <li key={ing.id} className="admin-drug-ingredient">
                          <span>{ing.ten_hoat_chat_clean || ing.ten_hoat_chat_raw || "—"}{ing.ten_hoat_chat_raw && ing.ten_hoat_chat_raw !== ing.ten_hoat_chat_clean && <small>Gốc: {ing.ten_hoat_chat_raw}</small>}</span>
                          <span className={`admin-drug-sev ${ing.medication_name ? "admin-drug-sev--nhe" : "admin-drug-sev--chua"}`}>
                            {ing.medication_name ? `Khớp: ${ing.medication_name}` : "Chưa khớp hoạt chất"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {kind === "medication" && (
                <>
                  <section className="admin-drug-section">
                    <h3><MaterialIcon name="medication" size={20} />Biệt dược chứa hoạt chất này<span className="admin-drug-count">{detail.products_total}</span></h3>
                    {detail.products.length === 0 ? <p className="admin-drug-empty">Chưa có biệt dược liên kết.</p> : (
                      <span className="admin-drug-chips">{detail.products.map((p) => <span key={p.id}>{p.ten_thuoc}</span>)}</span>
                    )}
                    {detail.products_total > detail.products.length && <p className="admin-drug-more">Đang hiển thị {detail.products.length}/{detail.products_total} biệt dược.</p>}
                  </section>
                  <InteractionList title="Tương tác thuốc – thuốc" icon="hub" rows={detail.drug_interactions} total={detail.drug_interactions_total} targetLabel="Với thuốc" />
                  <InteractionList title="Tương tác thuốc – thực phẩm" icon="restaurant" rows={detail.food_interactions} total={detail.food_interactions_total} targetLabel="Thực phẩm" />
                  <InteractionList title="Tương tác thuốc – bệnh nền" icon="health_and_safety" rows={detail.disease_interactions} total={detail.disease_interactions_total} targetLabel="Bệnh nền" />
                </>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
