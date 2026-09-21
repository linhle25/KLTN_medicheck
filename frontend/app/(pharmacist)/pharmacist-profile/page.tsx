"use client";

import { useEffect, useState, type FormEvent } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import { ApiError, getPharmacistProfile, updatePharmacistProfile } from "@/lib/api";
import { getSession, saveSession } from "@/lib/auth";

export default function PharmacistProfilePage() {
  const session = getSession();
  const [hoTen, setHoTen] = useState("");
  const [noiCongTac, setNoiCongTac] = useState("");
  const [moTaNgan, setMoTaNgan] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    getPharmacistProfile(session.userId, session.accessToken)
      .then((info) => {
        setHoTen(info.ho_ten ?? session.hoTen ?? "");
        setNoiCongTac(info.noi_cong_tac ?? "");
        setMoTaNgan(info.mo_ta_ngan ?? "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Không tải được thông tin cá nhân"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile(e?: FormEvent) {
    e?.preventDefault();
    if (!session) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      await updatePharmacistProfile(session.userId, {
        ho_ten: hoTen || null,
        noi_cong_tac: noiCongTac || null,
        mo_ta_ngan: moTaNgan || null,
      }, session.accessToken);
      setSaved(true);
      if (hoTen && hoTen !== session.hoTen) {
        saveSession({ ...session, hoTen });
      }
    } catch (err) { setError(err instanceof ApiError ? err.message : "Không thể lưu thông tin cá nhân"); }
    finally { setSaving(false); }
  }

  if (!session) return null;

  return (
    <main className="profile-page">
      <div className="page-header page-header--in-content">
        <div>
          <p className="eyebrow">HỒ SƠ CỦA TÔI</p>
          <h1 className="page-header__title page-title-icon"><MaterialIcon name="account_circle" size={25} />Hồ sơ cá nhân</h1>
        </div>
      </div>

      <section className="profile-intro">
        <div className="profile-avatar"><MaterialIcon name="local_pharmacy" size={26} /></div>
        <div>
          <h2>{hoTen || session.hoTen}</h2>
          <p>Thông tin này hiện với bệnh nhân khi họ chọn dược sĩ để nhờ xác nhận tương tác thuốc.</p>
        </div>
      </section>

      <form onSubmit={saveProfile} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {loading ? <div className="panel"><div className="loading-row"><span className="spinner" /> Đang tải...</div></div> : (
          <div className="panel profile-add-form">
            <div className="field">
              <label>Họ và tên</label>
              <div className="profile-field-control">
                <MaterialIcon name="person" size={23} />
                <input type="text" value={hoTen} onChange={(e) => setHoTen(e.target.value)} placeholder="Nhập họ và tên" />
              </div>
            </div>
            <div className="field">
              <label>Nơi công tác</label>
              <div className="profile-field-control">
                <MaterialIcon name="apartment" size={23} />
                <input type="text" value={noiCongTac} onChange={(e) => setNoiCongTac(e.target.value)} placeholder="Ví dụ: Bệnh viện Chợ Rẫy" />
              </div>
            </div>
            <div className="field">
              <label>Mô tả ngắn</label>
              <div className="profile-field-control profile-field-control--textarea">
                <MaterialIcon name="description" size={23} />
                <textarea rows={3} value={moTaNgan} onChange={(e) => setMoTaNgan(e.target.value)} placeholder="Ví dụ: 10 năm kinh nghiệm dược lâm sàng, chuyên tư vấn tương tác thuốc tim mạch..." />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "16px" }}>
              {error && <p className="error-text" role="alert" style={{ margin: 0 }}>{error}</p>}
              {saved && <p className="success-text" style={{ margin: 0 }}><MaterialIcon name="check_circle" size={18} /> Đã lưu thông tin</p>}
              <button type="submit" className="primary" disabled={saving}>
                {saving ? <span className="spinner spinner--sm" /> : <MaterialIcon name="save" size={20} />} Lưu thông tin
              </button>
            </div>
          </div>
        )}
      </form>
    </main>
  );
}
