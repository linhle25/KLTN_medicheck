"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import BrandLogo from "@/components/BrandLogo";
import MaterialIcon from "@/components/MaterialIcon";
import NotificationBell from "@/components/NotificationBell";
import { clearSession, getSession, onSessionUpdated, type Session } from "@/lib/auth";
import Link from "next/link";
import { useMediAlert } from "@/components/MediAlertProvider";
import ThemeModeToggle from "@/components/ThemeModeToggle";
import { getMe, logout as logoutApi } from "@/lib/api";
import { saveSession, sessionFromAuth } from "@/lib/auth";

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { toast } = useMediAlert();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    let active = true;
    getMe().then((auth) => {
      if (!active) return;
      const current = sessionFromAuth(auth); saveSession(current);
      if (current.vaiTro !== "patient" && pathname !== "/interaction") router.replace("/");
      setSession(current);
    }).catch(() => {
      clearSession();
      if (pathname !== "/interaction") router.replace("/");
      else setSession(null);
    }).finally(() => { if (active) setChecked(true); });
    return () => { active = false; };
  }, [router]);

  useEffect(() => onSessionUpdated(() => setSession(getSession())), []);

  if (!checked) return null;

  if (!session && pathname === "/interaction") {
    return <div className="app-shell"><header className="patient-header"><BrandLogo size="sm" /><Link className="guest-login-link" href="/">Đăng nhập để lưu lịch sử</Link></header><div className="app-content">{children}</div></div>;
  }
  if (!session) return null;

  const fullName = session.hoTen.trim() || "Người dùng MediCheck";
  const avatarLetter = fullName.split(/\s+/).pop()?.charAt(0).toUpperCase() || "M";

  async function logout() {
    await logoutApi().catch(() => undefined);
    clearSession();
    toast({ title: "Đã đăng xuất", message: "Hẹn gặp lại bạn tại MediCheck.", tone: "info" });
    router.replace("/");
  }

  return (
    <div className={`app-shell app-shell--with-nav ${sidebarCollapsed ? "app-shell--sidebar-collapsed" : ""}`}>
      <header className="patient-header">
        <div className="patient-header__actions" style={{ marginLeft: "auto" }}>
          {/* <ThemeModeToggle /> */}
          <NotificationBell patientId={session.userId} token={session.accessToken} />
          <Link
            className="patient-header__identity"
            href="/profile"
            aria-label={`Hồ sơ của ${fullName}`}
            aria-describedby="patient-header-name-tooltip"
          >
            <span className="patient-header__name">{fullName}</span>
            <span className="patient-header__avatar" aria-hidden="true">
              {avatarLetter}
            </span>
            <span className="patient-header__tooltip" id="patient-header-name-tooltip" role="tooltip">
              {fullName} · {session.email}
            </span>
          </Link>
          <button className="icon-btn" onClick={logout} aria-label="Đăng xuất" title="Đăng xuất">
            <MaterialIcon name="logout" size={20} />
          </button>
        </div>
      </header>
      <div className="app-content">{children}</div>
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed((current) => !current)} />
      <span className="sr-only">Đang ở trang {pathname}</span>
    </div>
  );
}
