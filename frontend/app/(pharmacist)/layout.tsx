"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getSession, onSessionUpdated, type Session } from "@/lib/auth";
import BrandLogo from "@/components/BrandLogo";
import MaterialIcon from "@/components/MaterialIcon";
import { useMediAlert } from "@/components/MediAlertProvider";
import ThemeModeToggle from "@/components/ThemeModeToggle";
import { getMe, logout as logoutApi } from "@/lib/api";
import { saveSession, sessionFromAuth } from "@/lib/auth";

export default function PharmacistLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { toast } = useMediAlert();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    let active = true;
    getMe().then((auth) => {
      if (!active) return;
      const s = sessionFromAuth(auth); saveSession(s);
      if (s.vaiTro !== "pharmacist") router.replace("/");
      else setSession(s);
    }).catch(() => { clearSession(); router.replace("/"); })
      .finally(() => { if (active) setChecked(true); });
    return () => { active = false; };
  }, [router]);

  useEffect(() => onSessionUpdated(() => setSession(getSession())), []);

  async function handleLogout() {
    await logoutApi().catch(() => undefined);
    clearSession();
    toast({ title: "Đã đăng xuất", message: "Hẹn gặp lại bạn tại MediCheck.", tone: "info" });
    router.replace("/");
  }

  if (!checked || !session) return null;

  const fullName = session.hoTen.trim() || "Dược sĩ MediCheck";
  const avatarLetter = fullName.split(/\s+/).pop()?.charAt(0).toUpperCase() || "M";

  return (
    <div className={`app-shell app-shell--with-nav ${sidebarCollapsed ? "app-shell--sidebar-collapsed" : ""}`}>
      <header className="patient-header">
        <div className="patient-header__actions" style={{ marginLeft: "auto" }}>
          {/* <ThemeModeToggle /> */}
          <Link
            className="patient-header__identity"
            href="/pharmacist-profile"
            aria-label={`Hồ sơ của ${fullName}`}
            aria-describedby="pharmacist-header-name-tooltip"
          >
            <span className="patient-header__name">{fullName}</span>
            <span className="patient-header__avatar" aria-hidden="true">
              {avatarLetter}
            </span>
            <span className="patient-header__tooltip" id="pharmacist-header-name-tooltip" role="tooltip">
              {fullName} · {session.email}
            </span>
          </Link>
          <button className="icon-btn" onClick={handleLogout} aria-label="Đăng xuất" title="Đăng xuất">
            <MaterialIcon name="logout" size={20} />
          </button>
        </div>
      </header>
      <div className="app-content">{children}</div>
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
      <nav className={`bottom-nav sidebar ${sidebarCollapsed ? "sidebar--collapsed" : ""} ${mobileSidebarOpen ? "sidebar--mobile-open" : ""}`} aria-label="Điều hướng chính">
        <div className="sidebar__brand-row">
          <Link href="/pharmacist-dashboard" className="sidebar__brand-link" aria-label="Về trang chủ dược sĩ">
            <BrandLogo size="sm" className="sidebar__brand" />
          </Link>
          <button
            type="button"
            className="sidebar__toggle"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
            title={sidebarCollapsed ? "Mở rộng" : "Thu gọn"}
          >
            <MaterialIcon name={sidebarCollapsed ? "chevron_right" : "chevron_left"} size={30} />
          </button>
        </div>
        <Link href="/pharmacist-dashboard" className={`bottom-nav__item ${pathname === "/pharmacist-dashboard" ? "bottom-nav__item--active" : ""}`}>
          <MaterialIcon name="home" size={22} filled={pathname === "/pharmacist-dashboard"} />
          <span>Trang chủ</span>
        </Link>
        <Link href="/pharmacist-lookup" className={`bottom-nav__item ${pathname === "/pharmacist-lookup" ? "bottom-nav__item--active" : ""}`}>
          <MaterialIcon name="analytics" size={22} filled={pathname === "/pharmacist-lookup"} />
          <span>Tra cứu tương tác</span>
        </Link>
        <Link href="/pharmacist-history" className={`bottom-nav__item ${pathname === "/pharmacist-history" ? "bottom-nav__item--active" : ""}`}>
          <MaterialIcon name="history" size={22} filled={pathname === "/pharmacist-history"} />
          <span>Lịch sử tra cứu</span>
        </Link>
        <Link href="/pharmacist-profile" className={`bottom-nav__item ${pathname === "/pharmacist-profile" ? "bottom-nav__item--active" : ""}`}>
          <MaterialIcon name="person" size={22} filled={pathname === "/pharmacist-profile"} />
          <span>Hồ sơ cá nhân</span>
        </Link>
      </nav>
      <span className="sr-only">Đang ở trang {pathname}</span>
    </div>
  );
}
