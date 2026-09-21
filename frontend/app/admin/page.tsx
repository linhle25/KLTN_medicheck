"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/AdminUI";
import MaterialIcon from "@/components/MaterialIcon";
import { ApiError, getAdminOverview, type AdminOverview } from "@/lib/api";

const number = new Intl.NumberFormat("vi-VN");

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminOverview()
      .then(setData)
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : "Không tải được dữ liệu tổng quan.",
        ),
      );
  }, []);

  const cards = [
    {
      label: "Tổng người dùng",
      value: data?.total_users,
      icon: "group",
      tone: "blue",
    },
    {
      label: "Bệnh nhân",
      value: data?.patients,
      icon: "personal_injury",
      tone: "cyan",
    },
    {
      label: "Dược sĩ",
      value: data?.pharmacists,
      icon: "local_pharmacy",
      tone: "violet",
    },
    {
      label: "Chờ duyệt",
      value: data?.pending_pharmacists,
      icon: "pending_actions",
      tone: "amber",
    },
    {
      label: "Tài khoản khóa",
      value: data?.locked_users,
      icon: "lock",
      tone: "rose",
    },
    {
      label: "Phản hồi mở",
      value: data?.open_feedback,
      icon: "feedback",
      tone: "green",
    },
  ];

  return (
    <main className="admin-page">
      <AdminPageHeader
        eyebrow="TỔNG QUAN"
        title="Dashboard quản trị"
        icon="dashboard"
        description="Theo dõi người dùng, dữ liệu thuốc và các công việc cần xử lý trong hệ thống."
      />
      {error && (
        <div className="admin-alert admin-alert--error">
          <MaterialIcon name="error" size={20} />
          {error}
        </div>
      )}
      <section className="admin-stat-grid" aria-label="Thống kê hệ thống">
        {cards.map((card) => (
          <article
            className={`admin-stat-card admin-stat-card--${card.tone}`}
            key={card.label}
          >
            <span className="admin-stat-card__icon">
              <MaterialIcon name={card.icon} size={25} />
            </span>
            <div>
              <p>{card.label}</p>
              <strong>{data ? number.format(card.value || 0) : "—"}</strong>
            </div>
          </article>
        ))}
      </section>

      <section className="admin-dashboard-grid">
        <article className="panel admin-data-summary">
          <div className="admin-section-title">
            <div>
              <p className="eyebrow">DỮ LIỆU Y KHOA</p>
              <h2>Kho dữ liệu MediCheck</h2>
            </div>
            <Link href="/admin/drugs">
              Xem dữ liệu <MaterialIcon name="arrow_forward" size={18} />
            </Link>
          </div>
          <div className="admin-data-summary__grid">
            <div>
              <MaterialIcon name="pill" size={22} />
              <span>Hoạt chất</span>
              <strong>{number.format(data?.medications || 0)}</strong>
            </div>
            <div>
              <MaterialIcon name="medication" size={22} />
              <span>Biệt dược</span>
              <strong>{number.format(data?.products || 0)}</strong>
            </div>
            <div>
              <MaterialIcon name="hub" size={22} />
              <span>Thuốc – thuốc</span>
              <strong>{number.format(data?.drug_interactions || 0)}</strong>
            </div>
            <div>
              <MaterialIcon name="restaurant" size={22} />
              <span>Thuốc – thực phẩm</span>
              <strong>{number.format(data?.food_interactions || 0)}</strong>
            </div>
            <div>
              <MaterialIcon name="cardiology" size={22} />
              <span>Thuốc – bệnh</span>
              <strong>{number.format(data?.disease_interactions || 0)}</strong>
            </div>
          </div>
        </article>

        <article className="panel admin-quick-actions">
          <div className="admin-section-title">
            <div>
              <p className="eyebrow">CÔNG VIỆC</p>
              <h2>Truy cập nhanh</h2>
            </div>
          </div>
          <Link href="/admin/pharmacists">
            <span>
              <MaterialIcon name="verified_user" size={21} />
            </span>
            <div>
              <strong>Duyệt hồ sơ dược sĩ</strong>
              <p>{data?.pending_pharmacists || 0} hồ sơ đang chờ</p>
            </div>
            <MaterialIcon name="chevron_right" size={22} />
          </Link>
          <Link href="/admin/users">
            <span>
              <MaterialIcon name="manage_accounts" size={21} />
            </span>
            <div>
              <strong>Quản lý tài khoản</strong>
              <p>Khóa hoặc mở lại tài khoản</p>
            </div>
            <MaterialIcon name="chevron_right" size={22} />
          </Link>
        </article>
      </section>
    </main>
  );
}
