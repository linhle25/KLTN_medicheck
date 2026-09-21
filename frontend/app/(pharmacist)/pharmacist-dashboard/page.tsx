"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MaterialIcon from "@/components/MaterialIcon";
import {
  ApiError,
  listPharmacistRequests,
  type ReviewRequestSummary,
} from "@/lib/api";
import { getSession } from "@/lib/auth";
import { formatVietnameseDateTime } from "@/lib/datetime";
import { getInitials } from "@/lib/format";
import MediFox from "@/components/MediFox";

export default function PharmacistDashboardPage() {
  const router = useRouter();
  const session = getSession();
  const [requests, setRequests] = useState<ReviewRequestSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    listPharmacistRequests(session.accessToken)
      .then(setRequests)
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : "Không tải được dữ liệu tổng quan",
        ),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!session) return null;
  const urgent = requests.filter(
    (r) => r.co_canh_bao_nang && r.trang_thai_xac_nhan !== "da_xac_nhan",
  );

  return (
    <main className="dashboard-page">
      <section className="dashboard-hero dashboard-hero--pharmacist">
        <div>
          <p
            className="eyebrow"
            style={{ color: "#4a5b7c", fontWeight: "bold" }}
          >
            TRUNG TÂM DƯỢC SĨ
          </p>
          <h1
            className="dashboard-title"
            style={{ margin: "4px 0", fontSize: "28px", color: "#1a2b4c" }}
          >
            Xin chào, {session.hoTen}
          </h1>
          <p style={{ margin: 0, color: "#4a5b7c", fontSize: "15px" }}>
            Tổng quan các hồ sơ đang cần bạn xem xét.
          </p>
        </div>

        {!loading && (
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <div
              className="stat-card"
              style={{
                background: "rgba(255,255,255,0.7)",
                flex: 1,
                minWidth: "200px",
                padding: "20px",
              }}
            >
              <MaterialIcon name="list_alt" size={24} />
              <div
                className="stat-value"
                style={{ fontSize: "28px", marginTop: "8px" }}
              >
                {requests.length}
              </div>
              <div className="stat-label">Tổng yêu cầu</div>
            </div>
            <div
              className={`stat-card ${urgent.length ? "attention" : ""}`}
              style={{
                background: "rgba(255,255,255,0.7)",
                flex: 1,
                minWidth: "200px",
                padding: "20px",
              }}
            >
              <MaterialIcon name="priority_high" size={24} />
              <div
                className="stat-value"
                style={{ fontSize: "28px", marginTop: "8px" }}
              >
                {urgent.length}
              </div>
              <div className="stat-label">Cần xử lý gấp</div>
            </div>
          </div>
        )}
      </section>
      {loading && (
        <div className="loading-row">
          <span className="spinner" /> Đang tải...
        </div>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <section className="dashboard-section">
        <div className="dashboard-section__header">
          <h2 className="section-heading-icon"><MaterialIcon name="priority_high" size={21} />Cần xử lý gấp</h2>
        </div>
        {!loading && urgent.length === 0 && (
          <div className="empty-state">
            <MediFox variant="pharmacist-empty" className="empty-state__mascot" />
            <strong>Không có cảnh báo nào cần xử lý</strong>
            <span>Tất cả hồ sơ bệnh nhân hiện đang ổn định.</span>
          </div>
        )}
        <section className="patient-list">
          {urgent.map((r) => (
            <article
              key={r.check_id}
              className={`patient-card patient-card--large ${r.co_canh_bao_nang && r.trang_thai_xac_nhan !== "da_xac_nhan" ? "patient-card--urgent" : ""}`}
            >
              <div className="patient-card__info">
                <span className="avatar avatar--large">
                  {getInitials(r.patient_name)}
                </span>
                <div>
                  <h2>{r.patient_name}</h2>
                  <p>{formatVietnameseDateTime(r.thoi_gian_kiem_tra)}</p>
                </div>
              </div>
              <div className="patient-card__footer">
                {r.trang_thai_xac_nhan === "da_xac_nhan" ? (
                  <span className="badge badge-confirmed">
                    <MaterialIcon name="check_circle" size={14} /> Đã xử lý
                  </span>
                ) : r.co_canh_bao_nang ? (
                  <span className="badge badge-urgent">
                    <MaterialIcon name="warning" size={14} /> Cần xử lý gấp
                  </span>
                ) : (
                  <span className="badge">
                    <MaterialIcon name="pending" size={14} /> Chờ xử lý
                  </span>
                )}
                <button
                  className="secondary"
                  onClick={() => router.push(`/review?checkId=${r.check_id}`)}
                >
                  Xem hồ sơ <MaterialIcon name="arrow_forward" size={18} />
                </button>
              </div>
            </article>
          ))}
        </section>
      </section>

      {!loading &&
        requests.some(
          (r) => !urgent.some((item) => item.check_id === r.check_id),
        ) && (
          <section className="dashboard-section">
            <div className="dashboard-section__header">
              <h2 className="section-heading-icon"><MaterialIcon name="task_alt" size={21} />Yêu cầu đã xử lý và chờ xem xét</h2>
            </div>
            <section className="patient-list">
              {requests
                .filter(
                  (r) => !urgent.some((item) => item.check_id === r.check_id),
                )
                .map((r) => (
                  <article
                    key={r.check_id}
                    className="patient-card patient-card--large"
                  >
                    <div className="patient-card__info">
                      <span className="avatar avatar--large">
                        {getInitials(r.patient_name)}
                      </span>
                      <div>
                        <h2>{r.patient_name}</h2>
                        <p>{formatVietnameseDateTime(r.thoi_gian_kiem_tra)}</p>
                      </div>
                    </div>
                    <div className="patient-card__footer">
                      {r.trang_thai_xac_nhan === "da_xac_nhan" ? (
                        <span className="badge badge-confirmed">
                          <MaterialIcon name="check_circle" size={14} /> Đã xử
                          lý
                        </span>
                      ) : (
                        <span className="badge">
                          <MaterialIcon name="pending" size={14} /> Chờ xử lý
                        </span>
                      )}
                      <button
                        className="secondary"
                        onClick={() =>
                          router.push(`/review?checkId=${r.check_id}`)
                        }
                      >
                        {r.trang_thai_xac_nhan === "da_xac_nhan"
                          ? "Xem lại hồ sơ"
                          : "Xem hồ sơ"}{" "}
                        <MaterialIcon name="arrow_forward" size={18} />
                      </button>
                    </div>
                  </article>
                ))}
            </section>
          </section>
        )}

      <section className="dashboard-section">
        <div className="dashboard-section__header">
          <h2 className="section-heading-icon"><MaterialIcon name="bolt" size={21} />Truy cập nhanh</h2>
        </div>
        <div className="dashboard-med-grid">
          <button
            className="dashboard-med-card dashboard-med-card--add"
            onClick={() => router.push("/pharmacist-lookup")}
          >
            <MaterialIcon name="analytics" size={23} />
            <span>Tra cứu tương tác thuốc</span>
          </button>
        </div>
      </section>
    </main>
  );
}
