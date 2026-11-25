export type Role = "patient" | "pharmacist" | "admin";

export type Session = {
  /** Deprecated compatibility marker; the API ignores it and it is not a credential. */
  accessToken: "cookie";
  userId: string;
  hoTen: string;
  email: string;
  vaiTro: Role;
};

const STORAGE_KEY = "medguard_session";
const SESSION_UPDATED_EVENT = "medguard_session_updated";

export function saveSession(session: Session): void {
  if (typeof window === "undefined") return;
  // accessToken luôn là "cookie" (marker tương thích ngược, không phải credential
  // thật) - loại khỏi bản lưu localStorage chứ không đọc giá trị.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accessToken: _compatibilityMarker, ...safeProfile } = session;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeProfile));
  // Layout (header) doc session 1 lan luc mount va giu trong state rieng, khong
  // tu remount khi chuyen trang (Next.js App Router giu layout song xuyen route) -
  // phat event de layout dang mo cap nhat lai ngay, khong can F5.
  window.dispatchEvent(new Event(SESSION_UPDATED_EVENT));
}

export function sessionFromAuth(auth: { user_id: string; ho_ten: string; email: string; vai_tro: Role }): Session {
  return { accessToken: "cookie", userId: auth.user_id, hoTen: auth.ho_ten, email: auth.email, vaiTro: auth.vai_tro };
}

export function onSessionUpdated(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SESSION_UPDATED_EVENT, callback);
  return () => window.removeEventListener(SESSION_UPDATED_EVENT, callback);
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Omit<Session, "accessToken"> & { accessToken?: string };
    const session: Session = { userId: stored.userId, hoTen: stored.hoTen, email: stored.email ?? "", vaiTro: stored.vaiTro, accessToken: "cookie" };
    // Rewrite old records once so legacy bearer credentials disappear from storage.
    if (stored.accessToken) saveSession(session);
    return session;
  } catch {
    return null;
  }
}

// Dữ liệu tạm của tab "Tra cứu tương tác" (đơn đang nhập, kết quả, lựa chọn cá nhân hóa) -
// lưu trong sessionStorage để không mất khi chuyển tab/tải lại, nhưng phải xóa khi kết thúc
// phiên đăng nhập để lần dùng sau (kể cả người khác trên cùng trình duyệt) bắt đầu từ trạng
// thái ban đầu.
export const INTERACTION_STORAGE_KEYS = {
  draft: "medguard_interaction_draft",
  result: "medguard_interaction_result",
  resultPrescriptions: "medguard_interaction_result_prescriptions",
  personalized: "medicheck_interaction_personalized",
  lastCheck: "medguard_last_check",
} as const;

export function clearSession(): void {
  if (typeof window === "undefined") return;
  // Chỉ reset khi thật sự có phiên đăng nhập đang kết thúc - khách (không có phiên)
  // gọi hàm này mỗi lần kiểm tra đăng nhập thất bại, không được xóa bản nháp của họ.
  const hadSession = window.localStorage.getItem(STORAGE_KEY) !== null;
  window.localStorage.removeItem(STORAGE_KEY);
  if (!hadSession) return;
  try {
    for (const key of Object.values(INTERACTION_STORAGE_KEYS)) window.sessionStorage.removeItem(key);
  } catch {
    // sessionStorage có thể bị chặn - bỏ qua.
  }
}
