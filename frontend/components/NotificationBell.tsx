"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MaterialIcon from "@/components/MaterialIcon";
import { markNotificationRead, type NotificationItem } from "@/lib/api";
import { usePatientNotifications } from "@/lib/hooks";
import { formatVietnameseDateTime } from "@/lib/datetime";

type NotificationBellProps = {
  patientId: string;
  token: string;
};

// Chuông thông báo ở header - liệt kê TOÀN BỘ thông báo (đã đọc lẫn chưa đọc) mới
// nhất trước, chưa đọc thì in đậm + chấm xanh. Bấm 1 thông báo -> đánh dấu đã đọc
// rồi điều hướng tới kết quả lần kiểm tra liên quan (nếu có).
//
// Chuông sống trong layout - mount 1 lần duy nhất cho cả phiên, không remount mỗi
// khi chuyển trang như các page component (VD dashboard) - nên vẫn cần tự làm mới
// định kỳ để thông báo mới từ dược sĩ xác nhận hiện ra không cần tải lại cả trang.
// Trước đây tự quản lý setInterval + visibilitychange thủ công; giờ dùng SWR
// (refreshInterval/revalidateOnFocus) cho việc đó, đồng thời DÙNG CHUNG cache key
// với dashboard (frontend/lib/hooks.ts) - 2 nơi cùng hiện notifications không còn
// gọi API trùng lặp, và đánh dấu đã đọc ở nơi này cũng phản ánh ngay ở nơi kia.
export default function NotificationBell({ patientId, token }: NotificationBellProps) {
  const router = useRouter();
  const { data: notifications = [], mutate } = usePatientNotifications(patientId, token, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  });
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    mutate();
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.da_doc).length;

  async function handleClickNotification(n: NotificationItem) {
    if (!n.da_doc) {
      try {
        await markNotificationRead(patientId, n.id, token);
        mutate(
          (prev) => prev?.map((item) => (item.id === n.id ? { ...item, da_doc: true } : item)),
          { revalidate: false }
        );
      } catch { /* vẫn điều hướng dù lỡ đánh dấu đã đọc thất bại */ }
    }
    setOpen(false);
    if (n.interaction_check_id) router.push(`/check-result?checkId=${n.interaction_check_id}`);
  }

  return (
    <div className="notification-bell" ref={panelRef}>
      <button type="button" className="icon-btn" onClick={() => setOpen((v) => !v)} aria-label="Thông báo" title="Thông báo">
        <MaterialIcon name="notifications" size={20} />
        {unreadCount > 0 && <span className="notification-bell__badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {open && (
        <div className="notification-bell__panel">
          <p className="notification-bell__title">Thông báo</p>
          {notifications.length === 0 ? (
            <p className="notification-bell__empty">Chưa có thông báo nào.</p>
          ) : (
            <ul className="notification-bell__list">
              {notifications.map((n) => (
                <li key={n.id} className={n.da_doc ? "" : "notification-bell__item--unread"} onClick={() => void handleClickNotification(n)}>
                  {!n.da_doc && <span className="notification-bell__dot" />}
                  <div>
                    <p>{n.noi_dung}</p>
                    <small>{formatVietnameseDateTime(n.thoi_gian_tao)}</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
