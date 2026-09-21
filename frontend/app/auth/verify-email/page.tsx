"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError, verifyEmail } from "@/lib/api";
import { AuthNotice, AuthPageFooter, AuthSupportShell } from "../AuthSupport";

type VerificationState = { tone: "info" | "success" | "error" | "pending"; message: string };

export default function VerifyEmailPage() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<VerificationState>({ tone: "info", message: "Đang xác minh địa chỉ email của bạn..." });
  const verificationStarted = useRef(false);

  useEffect(() => {
    // React Strict Mode invokes effects twice in development. Verification
    // tokens are single-use, so only the first invocation may call the API.
    if (verificationStarted.current) return;
    verificationStarted.current = true;

    if (!token) {
      setState({ tone: "error", message: "Liên kết xác minh không hợp lệ hoặc bị thiếu token." });
      return;
    }
    verifyEmail(token)
      .then((result) => setState(result.account_status === "pending_pharmacist"
        ? { tone: "pending", message: "Email đã được xác minh. Hồ sơ dược sĩ của bạn đang chờ quản trị viên duyệt." }
        : { tone: "success", message: "Email đã được xác minh thành công. Bạn có thể đăng nhập vào MediCheck." }))
      .catch((error) => setState({ tone: "error", message: error instanceof ApiError ? error.message : "Không thể xác minh email. Liên kết có thể đã hết hạn." }));
  }, [token]);

  const loading = state.tone === "info";
  return (
    <AuthSupportShell
      eyebrow="Xác thực danh tính"
      title={loading ? "Đang xác minh email" : state.tone === "success" ? "Xác minh thành công" : state.tone === "pending" ? "Đã xác minh email" : "Không thể xác minh"}
      description={loading ? "Quá trình này chỉ mất vài giây. Vui lòng không đóng trang." : "Trạng thái tài khoản của bạn đã được cập nhật bên dưới."}
      icon={loading ? "mark_email_unread" : state.tone === "error" ? "mark_email_read" : "verified"}
    >
      <AuthNotice tone={state.tone}>{state.message}</AuthNotice>
      <AuthPageFooter>{state.tone === "error" ? "Quay lại để nhận liên kết mới" : "Đến trang đăng nhập"}</AuthPageFooter>
    </AuthSupportShell>
  );
}
