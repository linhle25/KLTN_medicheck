"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import MaterialIcon from "@/components/MaterialIcon";
import ThemeModeToggle from "@/components/ThemeModeToggle";
import { useMediAlert } from "@/components/MediAlertProvider";
import { getMe, logout as logoutApi } from "@/lib/api";
import {
  clearSession,
  saveSession,
  sessionFromAuth,
  type Session,
} from "@/lib/auth";

const navigation = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/users", label: "Quản lý người dùng", icon: "group" },
  { href: "/admin/pharmacists", label: "Duyệt dược sĩ", icon: "verified_user" },
  { href: "/admin/drugs", label: "Dữ liệu thuốc", icon: "medication" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useMediAlert();
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => setMobileSidebarOpen(false), [pathname]);

  useEffect(() => {
    let active = true;
    getMe()
      .then((auth) => {
        if (!active) return;
        if (auth.vai_tro !== "admin") throw new Error("Admin access required");
        const current = sessionFromAuth(auth);
        saveSession(current);
        setSession(current);
      })
      .catch(() => {
        if (!active) return;
        clearSession();
        router.replace("/auth");
      })
      .finally(() => {
        if (active) setChecked(true);
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function logout() {
    await logoutApi().catch(() => undefined);
    clearSession();
    toast({
      title: "Đã đăng xuất",
      message: "Phiên quản trị đã được kết thúc an toàn.",
      tone: "info",
    });
    router.replace("/auth");
  }

  if (!checked || !session) return null;

  const fullName = session.hoTen.trim() || "Quản trị viên";
  const avatarLetter =
    fullName.split(/\s+/).pop()?.charAt(0).toUpperCase() || "A";

  return (
    <div
      className={`app-shell app-shell--with-nav admin-shell ${sidebarCollapsed ? "app-shell--sidebar-collapsed" : ""}`}
    >
      <header className="patient-header admin-header">
        <div className="admin-header__context">
          <MaterialIcon name="admin_panel_settings" size={22} />
          <span>Trung tâm quản trị</span>
        </div>
        <div className="patient-header__actions">
          {/* <ThemeModeToggle /> */}
          <div
            className="patient-header__identity admin-header__identity"
            aria-label={`Quản trị viên ${fullName}`}
          >
            <span className="patient-header__name">{fullName}</span>
            <span className="patient-header__avatar" aria-hidden="true">
              {avatarLetter}
            </span>
            <span className="patient-header__tooltip" role="tooltip">
              {fullName} · {session.email}
            </span>
          </div>
          <button
            className="icon-btn"
            onClick={logout}
            aria-label="Đăng xuất"
            title="Đăng xuất"
          >
            <MaterialIcon name="logout" size={20} />
          </button>
        </div>
      </header>

      <div className="app-content admin-content">{children}</div>

      <button
        type="button"
        className="sidebar-mobile-toggle"
        onClick={() => setMobileSidebarOpen((open) => !open)}
        aria-label={mobileSidebarOpen ? "Đóng menu" : "Mở menu"}
        aria-expanded={mobileSidebarOpen}
      >
        <MaterialIcon name={mobileSidebarOpen ? "close" : "menu"} size={25} />
      </button>
      {mobileSidebarOpen && (
        <button
          type="button"
          className="sidebar-mobile-backdrop"
          aria-label="Đóng menu"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <nav
        className={`bottom-nav sidebar admin-sidebar ${sidebarCollapsed ? "sidebar--collapsed" : ""} ${mobileSidebarOpen ? "sidebar--mobile-open" : ""}`}
        aria-label="Điều hướng quản trị"
      >
        <div className="sidebar__brand-row">
          <Link
            href="/admin"
            className="sidebar__brand-link"
            aria-label="Về dashboard quản trị"
          >
            <BrandLogo size="sm" className="sidebar__brand" />
          </Link>
          <button
            type="button"
            className="sidebar__toggle"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={
              sidebarCollapsed
                ? "Mở rộng thanh điều hướng"
                : "Thu gọn thanh điều hướng"
            }
            title={sidebarCollapsed ? "Mở rộng" : "Thu gọn"}
          >
            <MaterialIcon
              name={sidebarCollapsed ? "chevron_right" : "chevron_left"}
              size={30}
            />
          </button>
        </div>
        <p className="admin-sidebar__eyebrow">QUẢN TRỊ HỆ THỐNG</p>
        {navigation.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`bottom-nav__item ${active ? "bottom-nav__item--active" : ""}`}
            >
              <MaterialIcon name={item.icon} size={22} filled={active} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <div className="admin-sidebar__footer">
          <MaterialIcon name="shield" size={18} />
          <span>Phiên quản trị bảo mật</span>
        </div>
      </nav>
      <span className="sr-only">Đang ở trang {pathname}</span>
    </div>
  );
}
