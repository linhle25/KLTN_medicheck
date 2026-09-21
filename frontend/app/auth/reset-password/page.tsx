"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import { ApiError, resetPassword } from "@/lib/api";
import { AuthIconButton, AuthNotice, AuthPageFooter, AuthPrimaryButton, AuthSupportShell, AuthTextField } from "../AuthSupport";

export default function ResetPasswordPage() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setResult({ tone: "error", message: "Mật khẩu xác nhận không khớp." });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const response = await resetPassword(token, password);
      setResult({ tone: "success", message: response.message });
      // Never persist a password in Web Storage. Keep only a one-time,
      // non-sensitive marker so the login page can show a success message.
      sessionStorage.removeItem("medicheck-reset-credentials");
      sessionStorage.setItem("medicheck-password-reset-success", "1");
      setPassword("");
      setConfirm("");
    } catch (error) {
      setResult({ tone: "error", message: error instanceof ApiError ? error.message : "Không thể đặt lại mật khẩu. Vui lòng thử lại." });
    } finally {
      setLoading(false);
    }
  }

  const visibilityButton = <AuthIconButton onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword}>
    <MaterialIcon name={showPassword ? "visibility_off" : "visibility"} size={20} />
  </AuthIconButton>;

  return (
    <AuthSupportShell
      eyebrow="Tạo mật khẩu mới"
      title="Đặt lại mật khẩu"
      description="Chọn một mật khẩu mạnh và khác với những mật khẩu bạn đã sử dụng trước đây."
      icon="lock_reset"
    >
      <form onSubmit={submit}>
        <AuthTextField
          id="new-password"
          label="Mật khẩu mới"
          icon="lock"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          placeholder="Tối thiểu 8 ký tự"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          trailing={visibilityButton}
          hint="Nên kết hợp chữ hoa, chữ thường, số và ký tự đặc biệt."
          disabled={loading || !token}
        />
        <AuthTextField
          id="confirm-password"
          label="Xác nhận mật khẩu"
          icon="verified_user"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          placeholder="Nhập lại mật khẩu mới"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          disabled={loading || !token}
        />
        {!token && <AuthNotice tone="error">Liên kết đặt lại mật khẩu không hợp lệ hoặc bị thiếu token. Hãy yêu cầu một liên kết mới.</AuthNotice>}
        {result && <AuthNotice tone={result.tone}>{result.message}</AuthNotice>}
        <AuthPrimaryButton type="submit" loading={loading} icon="check" disabled={!token}>Cập nhật mật khẩu</AuthPrimaryButton>
      </form>
      <AuthPageFooter />
    </AuthSupportShell>
  );
}
