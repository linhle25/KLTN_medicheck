"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import MaterialIcon from "@/components/MaterialIcon";

type BottomNavProps = { onCheck?: () => void; checking?: boolean };

export default function BottomNav({ onCheck, checking }: BottomNavProps) {
  const pathname = usePathname();
  const active = (path: string) => pathname === path ? "bottom-nav__item--active" : "";
  return <nav className="bottom-nav" aria-label="Điều hướng chính">
    <Link href="/dashboard" className={`bottom-nav__item ${active("/dashboard")}`}><MaterialIcon name="home" size={22} filled={pathname === "/dashboard"} /><span>Trang chủ</span></Link>
    <Link href="/profile" className={`bottom-nav__item ${pathname === "/profile" || pathname.startsWith("/medications/") ? "bottom-nav__item--active" : ""}`}><MaterialIcon name="medication" size={22} filled={pathname === "/profile" || pathname.startsWith("/medications/")} /><span>Thuốc của tôi</span></Link>
    {onCheck ? <button type="button" className="bottom-nav__item" onClick={onCheck} disabled={checking}>{checking ? <span className="spinner spinner--sm" aria-hidden="true" /> : <MaterialIcon name="analytics" size={22} />}<span>{checking ? "Đang kiểm tra" : "Tương tác"}</span></button> : <Link href="/interaction" className={`bottom-nav__item ${active("/interaction")}`}><MaterialIcon name="analytics" size={22} filled={pathname === "/interaction"} /><span>Tương tác</span></Link>}
    <Link href="/history" className={`bottom-nav__item ${active("/history")}`}><MaterialIcon name="history" size={22} filled={pathname === "/history"} /><span>Lịch sử</span></Link>
  </nav>;
}
