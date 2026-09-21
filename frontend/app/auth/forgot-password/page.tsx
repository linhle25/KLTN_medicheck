"use client";

import { useState, type FormEvent } from "react";
import { ApiError, forgotPassword } from "@/lib/api";
import { AuthNotice, AuthPageFooter, AuthPrimaryButton, AuthSupportShell, AuthTextField } from "../AuthSupport";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const response = await forgotPassword(email);
      setResult({
        tone: response.code === "EMAIL_NOT_REGISTERED" ? "error" : "success",
        message: response.message,
      });
    } catch (error) {
      setResult({ tone: "error", message: error instanceof ApiError ? error.message : "Không thể gửi yêu cầu. Vui lòng thử lại." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSupportShell
      eyebrow="Khôi phục tài khoản"
      title="Quên mật khẩu?"
      description="Nhập email đã đăng ký. Chúng tôi sẽ gửi cho bạn một liên kết an toàn để tạo mật khẩu mới."
      icon="key"
    >
      <form onSubmit={submit}>
        <AuthTextField
          id="email"
          label="Email đăng ký"
          icon="mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="ban@vidu.com"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={loading}
        />
        {result && <AuthNotice tone={result.tone}>{result.message}</AuthNotice>}
        <AuthPrimaryButton type="submit" loading={loading} icon="send">Gửi liên kết đặt lại</AuthPrimaryButton>
      </form>
      <AuthPageFooter />
    </AuthSupportShell>
  );
}
