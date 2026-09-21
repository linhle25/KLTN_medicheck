export type Role = "patient" | "pharmacist" | "admin";

export type Session = {
  /** Deprecated compatibility marker; the API ignores it and it is not a credential. */
  accessToken: "cookie";
  userId: string;
  hoTen: string;
  vaiTro: Role;
};

const STORAGE_KEY = "medguard_session";
const SESSION_UPDATED_EVENT = "medguard_session_updated";

export function saveSession(session: Session): void {
  if (typeof window === "undefined") return;
  const { accessToken: _compatibilityMarker, ...safeProfile } = session;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeProfile));
  // Layout (header) doc session 1 lan luc mount va giu trong state rieng, khong
  // tu remount khi chuyen trang (Next.js App Router giu layout song xuyen route) -
  // phat event de layout dang mo cap nhat lai ngay, khong can F5.
  window.dispatchEvent(new Event(SESSION_UPDATED_EVENT));
}

export function sessionFromAuth(auth: { user_id: string; ho_ten: string; vai_tro: Role }): Session {
  return { accessToken: "cookie", userId: auth.user_id, hoTen: auth.ho_ten, vaiTro: auth.vai_tro };
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
    const session: Session = { userId: stored.userId, hoTen: stored.hoTen, vaiTro: stored.vaiTro, accessToken: "cookie" };
    // Rewrite old records once so legacy bearer credentials disappear from storage.
    if (stored.accessToken) saveSession(session);
    return session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
