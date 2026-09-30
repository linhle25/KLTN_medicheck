"use client";

import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import MaterialIcon from "@/components/MaterialIcon";
import {
  ApiError,
  completeGoogleRegistration,
  googleLogin,
  linkGoogle,
  login,
  register,
  resendVerification,
  type AuthResponse,
  type GoogleAuthResult,
} from "@/lib/api";
import { saveSession, sessionFromAuth } from "@/lib/auth";
import MediFox from "@/components/MediFox";
import { useMediAlert } from "@/components/MediAlertProvider";

type Mode = "login" | "register";
type Role = "patient" | "pharmacist";

declare global {
  interface Window {
    google?: {
      accounts: {
        // google.accounts.id (renderButton/One Tap) đã bỏ - widget Google luôn
        // vẽ 1 viền sáng quanh nút bên trong iframe riêng của họ, không có tham
        // số nào tắt được và không thể ghi đè bằng CSS (khác origin). Dùng
        // oauth2.initTokenClient() để tự vẽ nút 100% theo giao diện trang, chỉ
        // gọi Google lúc bấm nút (mở popup OAuth thật của Google, không phải
        // giả mạo) - đổi lại backend xác thực access token qua API thay vì ID
        // token JWT (xem src/services/auth.py::verify_google_credential).
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              error?: string;
            }) => void;
            error_callback?: (error: { type: string }) => void;
          }): { requestAccessToken(): void };
        };
      };
    };
  }
}

const asset = (name: string) => encodeURI("/Bộ nhận diện y tế/" + name);

export default function AuthPage() {
  const router = useRouter();
  const { toast } = useMediAlert();
  const [mode, setMode] = useState<Mode>("login");
  const [role, setRole] = useState<Role>("patient");
  const [hoTen, setHoTen] = useState("");
  const [email, setEmail] = useState("");
  const [matKhau, setMatKhau] = useState("");
  const [soChungChi, setSoChungChi] = useState("");
  const [noiCongTac, setNoiCongTac] = useState("");
  const [googleCredential, setGoogleCredential] = useState<string | null>(null);
  const [linkRequired, setLinkRequired] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [canResend, setCanResend] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const googleTokenClientRef = useRef<{ requestAccessToken(): void } | null>(
    null,
  );

  useEffect(() => {
    const resetSucceeded =
      sessionStorage.getItem("medicheck-password-reset-success") === "1";
    // Remove credentials written by older builds without reading or restoring
    // the plaintext password they may contain.
    sessionStorage.removeItem("medicheck-reset-credentials");
    sessionStorage.removeItem("medicheck-password-reset-success");
    if (resetSucceeded) {
      setMode("login");
      setNotice("Mật khẩu đã được cập nhật. Bạn có thể đăng nhập ngay.");
    }
  }, []);

  useEffect(() => {
    // next/script's onLoad only fires the first time the script tag is
    // injected - on client-side navigation back to this page the script is
    // already loaded so onLoad never re-fires, and the Google button never
    // showed up. Cover that case by also checking on mount.
    if (window.google) initGoogleAuth();
  }, []);

  function changeMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setGoogleCredential(null);
    setLinkRequired(false);
    setCanResend(false);
  }

  async function finish(auth: AuthResponse, wasRegistration = false) {
    saveSession(sessionFromAuth(auth));
    toast({
      title: wasRegistration ? "Đăng ký thành công" : "Đăng nhập thành công",
      message: wasRegistration
        ? `Chào mừng ${auth.ho_ten} đến với MediCheck.`
        : `Chào mừng ${auth.ho_ten} quay lại MediCheck.`,
    });
    router.replace(
      auth.vai_tro === "patient"
        ? "/dashboard"
        : auth.vai_tro === "admin"
          ? "/admin"
          : "/pharmacist-dashboard",
    );
  }

  async function handleAuthResult(
    result: GoogleAuthResult,
    wasRegistration = false,
  ) {
    if ("user_id" in result) return finish(result, wasRegistration);
    setCanResend(result.code === "EMAIL_VERIFICATION_REQUIRED");
    setNotice(
      result.message ||
        (result.account_status === "pending_pharmacist"
          ? "Hồ sơ dược sĩ đang chờ quản trị viên duyệt."
          : "Tài khoản chưa sẵn sàng đăng nhập."),
    );
  }

  async function demo(emailDemo: string) {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await handleAuthResult(await login(emailDemo, "demo1234"));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Không thể đăng nhập tài khoản demo.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (linkRequired && googleCredential) {
        await handleAuthResult(await linkGoogle(googleCredential, matKhau));
      } else if (mode === "login") {
        await handleAuthResult(await login(email, matKhau));
      } else if (googleCredential) {
        const result = await completeGoogleRegistration(
          googleCredential,
          role,
          soChungChi,
          noiCongTac,
        );
        if ("user_id" in result) await finish(result, true);
        else
          setNotice(
            result.message || "Hồ sơ dược sĩ đang chờ quản trị viên duyệt.",
          );
      } else {
        const result = await register(
          hoTen,
          email,
          matKhau,
          role,
          soChungChi,
          noiCongTac,
        );
        setNotice(result.message);
        setCanResend(true);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Có lỗi xảy ra, vui lòng thử lại.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleCredential(credential: string) {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result: GoogleAuthResult = await googleLogin(credential);
      if ("user_id" in result) return await finish(result);
      setGoogleCredential(credential);
      if (result.code === "ACCOUNT_LINK_REQUIRED") {
        setLinkRequired(true);
        setNotice("Nhập mật khẩu hiện tại để liên kết tài khoản Google này.");
      } else if (result.code === "REGISTRATION_REQUIRED") {
        setMode("register");
        setEmail(result.email || "");
        setHoTen(result.ho_ten || "");
        setNotice(
          "Google đã xác minh email. Hãy chọn vai trò để hoàn tất đăng ký.",
        );
      } else setNotice(result.message || "Tài khoản đang chờ xử lý.");
    } catch (err) {
      if (err instanceof ApiError && err.code === "ACCOUNT_LINK_REQUIRED") {
        setGoogleCredential(credential);
        setLinkRequired(true);
        setNotice("Nhập mật khẩu hiện tại để liên kết tài khoản Google này.");
        return;
      }
      setError(
        err instanceof ApiError
          ? err.message
          : "Không thể xác thực với Google.",
      );
    } finally {
      setLoading(false);
    }
  }

  // Không dùng google.accounts.id/renderButton nữa - widget đó luôn vẽ 1 viền
  // sáng quanh nút bên trong iframe riêng của Google (thấy rõ ở kiểu nút "cá
  // nhân hoá" khi trình duyệt đã đăng nhập sẵn Google), không có tham số nào
  // tắt được và không CSS/ghi đè được vì khác origin. Chuyển sang
  // oauth2.initTokenClient(): tự vẽ nút 100% theo giao diện trang
  // (.mc-auth__google-btn, đã có sẵn từ bản dự phòng cũ), bấm mới gọi Google mở
  // popup OAuth thật - không có gì của Google hiện thường trực trên trang nữa.
  function initGoogleAuth() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google) return;
    googleTokenClientRef.current =
      window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "openid email profile",
        callback: (response) => {
          setLoading(false);
          if (response.error || !response.access_token) {
            setError("Không thể xác thực với Google.");
            return;
          }
          void handleGoogleCredential(response.access_token);
        },
        error_callback: () => {
          setLoading(false);
          // Người dùng đóng popup hoặc trình duyệt chặn popup - không phải lỗi hệ
          // thống, không cần báo alert đỏ, chỉ dừng loading lặng lẽ.
        },
      });
    setGoogleReady(true);
  }

  function handleGoogleClick() {
    if (!googleReady || !googleTokenClientRef.current) {
      setError("Google Sign-In đang tải, vui lòng thử lại sau giây lát.");
      return;
    }
    setLoading(true);
    setError(null);
    googleTokenClientRef.current.requestAccessToken();
  }

  return (
    <main className="mc-auth" data-mode={mode}>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={initGoogleAuth}
      />
      <style jsx global>{`
        .mc-auth {
          height: 100dvh;
          min-height: 100vh;
          overflow: hidden;
          background: #f7faff;
          color: #132a4d;
          font-family: Inter, Arial, sans-serif;
        }
        .mc-auth * {
          box-sizing: border-box;
        }
        .mc-auth__shell {
          width: min(1180px, calc(100% - 40px));
          height: 100%;
          margin: auto;
        }
        .mc-auth__header {
          height: 76px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .mc-auth__logo {
          position: relative;
          width: 142px;
          height: 44px;
          display: block;
        }
        .mc-auth__logo img {
          object-fit: contain;
          transform: none;
        }
        .mc-auth__back {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #4167b2;
          font-size: 13px;
          font-weight: 700;
          text-decoration: none;
        }
        .mc-auth__layout {
          position: relative;
          display: grid;
          grid-template-columns: 1fr minmax(400px, 500px);
          align-items: center;
          gap: 70px;
          height: calc(100dvh - 88px);
          min-height: 0;
          max-height: calc(100dvh - 88px);
          padding: clamp(16px, 2.4vh, 30px) 42px;
          border: 1px solid #d3e1f4;
          border-radius: 28px;
          background: linear-gradient(120deg, #fff, #edf4ff 58%, #fff);
          box-shadow: 0 24px 70px #365b8c16;
          overflow: hidden;
        }
        .mc-auth__layout:after {
          content: "";
          position: absolute;
          right: -12%;
          top: -28%;
          width: 58%;
          height: 135%;
          border-radius: 50%;
          background: #bcd5ff66;
          filter: blur(52px);
        }
        .mc-auth__intro,
        .mc-auth__card {
          position: relative;
          z-index: 1;
        }
        .mc-auth__eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0 0 22px;
          color: #4167b2;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.15em;
        }
        .mc-auth__eyebrow b {
          display: grid;
          place-items: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #4167b2;
          color: #fff;
        }
        .mc-auth__intro h1 {
          margin: 0;
          font-size: clamp(42px, 5.3vw, 74px);
          font-weight: 600;
          letter-spacing: 0;
          line-height: 1.08;
        }
        .mc-auth__intro h1 em {
          color: #5572bf;
          font-style: normal;
        }
        .mc-auth__intro p:not(.mc-auth__eyebrow) {
          max-width: 440px;
          margin: 24px 0;
          color: #5d6f88;
          font-size: 16px;
          line-height: 1.7;
        }
        .mc-auth__points {
          display: grid;
          gap: 13px;
          margin-top: 34px;
        }
        .mc-auth__point {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #49607f;
          font-size: 13px;
        }
        .mc-auth__point .material-symbols-outlined {
          color: #4167b2;
        }
        .mc-auth__card {
          width: min(520px, 100%);
          height: min(640px, calc(100dvh - 136px));
          justify-self: end;
          max-height: calc(100dvh - 136px);
          padding: clamp(30px, 2vh, 24px);
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: none;
          -ms-overflow-style: none;
          border: 1px solid #c8d9f0;
          border-radius: 24px;
          background: #ffffffdf;
          box-shadow: 0 22px 45px #3057891b;
          backdrop-filter: blur(18px);
        }
        .mc-auth__card::-webkit-scrollbar {
          display: none;
        }
        .mc-auth__tabs {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 4px;
          padding: 4px;
          border-radius: 14px;
          background: #eaf1fc;
        }
        .mc-auth__tab {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-width: 0;
          height: 44px;
          border: 0;
          border-radius: 10px;
          padding: 0 12px;
          background: transparent;
          color: #6680a4;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
        }
        .mc-auth__tab--active {
          background: #fff;
          color: #244b8d;
          box-shadow: 0 4px 12px #385b8b1c;
        }
        .mc-auth__title {
          margin: clamp(13px, 1.7vh, 18px) 0 4px;
          font-size: 25px;
          letter-spacing: 0;
          line-height: 1.2;
        }
        .mc-auth__subtitle {
          margin: 0 0 clamp(10px, 1.4vh, 14px);
          color: #657790;
          font-size: 14px;
        }
        .mc-auth__demo {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
          margin-bottom: 10px;
        }
        .mc-auth__demo button {
          border: 1px solid #c5d7f0;
          border-radius: 12px;
          padding: 8px;
          background: #f7faff;
          color: #31578f;
          cursor: pointer;
          font: inherit;
          font-size: 12px;
          font-weight: 700;
          box-shadow: 0 4px 12px transparent;
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            background-color 180ms ease,
            box-shadow 180ms ease,
            color 180ms ease;
        }
        .mc-auth__demo button:hover:not(:disabled) {
          transform: translateY(-3px);
          border-color: #7ea1df;
          background: #edf4ff;
          color: #244b8d;
          box-shadow: 0 10px 22px #4167b228;
        }
        .mc-auth__demo button:active:not(:disabled) {
          transform: translateY(0) scale(0.985);
          box-shadow: 0 4px 10px #4167b21c;
        }
        .mc-auth__demo button:focus-visible {
          outline: 3px solid #7399df45;
          outline-offset: 2px;
        }
        .mc-auth__form {
          display: grid;
          gap: 10px 12px;
        }
        .mc-auth__field {
          display: grid;
          gap: 5px;
          min-width: 0;
        }
        .mc-auth__field label {
          display: block;
          margin: 0;
          padding-inline: 2px;
          color: #344d70;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.45;
        }
        .mc-auth__input {
          display: flex;
          align-items: center;
          height: 44px;
          min-height: 44px;
          border: 1px solid #c7d7ef;
          border-radius: 12px;
          background: #fff;
          overflow: hidden;
        }
        .mc-auth__input:focus-within {
          border-color: #6e94d9;
          box-shadow: 0 0 0 3px #7399df22;
        }
        .mc-auth__input .material-symbols-outlined {
          flex: 0 0 20px;
          width: 20px;
          overflow: hidden;
          text-align: center;
          color: #5979af;
        }
        .mc-auth__input input {
          flex: 1 1 0;
          width: 0;
          height: 100%;
          min-height: 0;
          min-width: 0;
          margin: 0;
          padding: 9px 0;
          border: 0 !important;
          border-radius: 0;
          outline: 0 !important;
          background: transparent !important;
          color: #1a3357;
          font: inherit;
          font-size: 14px;
          line-height: 1.5;
          box-shadow: none !important;
          appearance: none;
          -webkit-appearance: none;
        }
        .mc-auth__input input::placeholder {
          overflow: hidden;
          color: #7f91ae;
          text-overflow: ellipsis;
          opacity: 1;
        }
        .mc-auth__input input:-webkit-autofill,
        .mc-auth__input input:-webkit-autofill:hover,
        .mc-auth__input input:-webkit-autofill:focus,
        .mc-auth__input input:-webkit-autofill:active {
          border: 0;
          -webkit-text-fill-color: #1a3357;
          -webkit-box-shadow: 0 0 0 1000px #fff inset !important;
          box-shadow: 0 0 0 1000px #fff inset !important;
          caret-color: #1a3357;
          transition: background-color 9999s ease-out 0s;
        }
        .mc-auth__input input:autofill {
          color: #1a3357;
          background: #fff !important;
          box-shadow: 0 0 0 1000px #fff inset !important;
        }
        .mc-auth__input input[type="password"]::-ms-reveal,
        .mc-auth__input input[type="password"]::-ms-clear {
          display: none;
        }
        .mc-auth__input input::-webkit-credentials-auto-fill-button,
        .mc-auth__input input::-webkit-contacts-auto-fill-button {
          position: absolute;
          right: 0;
          visibility: hidden;
          display: none !important;
          pointer-events: none;
        }
        .mc-auth__role-options {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 7px;
        }
        .mc-auth__role-option {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 42px;
          padding: 0 12px;
          border: 1px solid #c7d7ef;
          border-radius: 12px;
          background: #fff;
          color: #526b8e;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 700;
        }
        .mc-auth__role-option .material-symbols-outlined {
          color: #5979af;
        }
        .mc-auth__role-option--active {
          border-color: #6e94d9;
          background: #edf4ff;
          color: #244b8d;
          box-shadow: 0 0 0 3px #7399df1c;
        }
        .mc-auth__google-wrap {
          margin-top: 10px;
          /* Khớp trần max-width: 420px của .mc-auth__submit ở trên - để 2 nút
             rộng bằng nhau. */
          max-width: 420px;
          margin-left: auto;
          margin-right: auto;
        }
        .mc-auth__google-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          min-height: 44px;
          padding: 8px;
          border: 1px solid #c5d7f0;
          /* pill tròn đều, khớp nút Google thật (shape:"pill") + nút "Đăng nhập"
             (999px) - trước là 12px, bo góc ít hơn hẳn nên trông "vuông" khi
             hiện tạm trong lúc chờ script Google tải (~1-2s mỗi lần vào trang). */
          border-radius: 999px;
          background: #f7faff;
          color: #31578f;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 700;
          box-shadow: 0 4px 12px transparent;
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            background-color 180ms ease,
            box-shadow 180ms ease,
            color 180ms ease;
        }
        /* Nút dự phòng này trước không có bản dark mode - luôn nền sáng #f7faff
           dù đang bật dark mode, nổi bật thành "khối trắng" trên nền tối trong
           lúc chờ nút Google thật tải xong. */
        html[data-theme="dark"] .mc-auth__google-btn {
          border-color: #405b80;
          background: rgba(15, 29, 48, 0.78);
          color: #edf4ff;
        }
        html[data-theme="dark"] .mc-auth__google-btn:hover:not(:disabled) {
          border-color: #83a9e8;
          background: rgba(20, 38, 61, 0.9);
          color: #fff;
        }
        .mc-auth__google-btn:hover:not(:disabled) {
          transform: translateY(-3px);
          border-color: #7ea1df;
          background: #edf4ff;
          color: #244b8d;
          box-shadow: 0 10px 22px #4167b228;
        }
        .mc-auth__google-btn:active:not(:disabled) {
          transform: translateY(0) scale(0.985);
          box-shadow: 0 4px 10px #4167b21c;
        }
        .mc-auth__google-btn:focus-visible {
          outline: 3px solid #7399df45;
          outline-offset: 2px;
        }
        .mc-auth__google-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        .mc-auth__icon {
          display: grid;
          flex: 0 0 30px;
          place-items: center;
          width: 30px;
          height: 30px;
          min-height: 0;
          margin: 0 -5px 0 0;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
          color: #5574a9;
          cursor: pointer;
        }
        .mc-auth__label-row {
          display: flex;
          justify-content: space-between;
        }
        .mc-auth__label-row a {
          color: #4167b2;
          font-size: 11px;
          text-decoration: none;
        }
        .mc-auth__error {
          margin: 0;
          color: #b74151;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.5;
          white-space: pre-line;
        }
        .mc-auth__notice {
          margin: 0;
          color: #4167b2;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.5;
          white-space: pre-line;
        }
        .mc-auth__submit {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          /* Google renderButton() có trần cứng ~400-420px (không cấu hình vượt
             qua được) - giới hạn nút "Đăng nhập" xuống cùng mức + canh giữa để
             2 nút rộng bằng nhau tuyệt đối, thay vì "Đăng nhập" luôn kéo hết
             chiều rộng card (~438px) còn nút Google bị hụt ~18px mỗi lần. */
          max-width: 420px;
          margin: 0 auto;
          min-height: 46px;
          border: 0;
          border-radius: 999px;
          background: linear-gradient(100deg, #7d9ce4, #4167b2);
          color: #fff;
          cursor: pointer;
          font: inherit;
          font-size: 14px;
          font-weight: 800;
          box-shadow: 0 10px 22px #4167b238;
        }
        .mc-auth__submit:disabled,
        .mc-auth__demo button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        .mc-auth__switch {
          margin: 15px 0 0;
          color: #657790;
          text-align: center;
          font-size: 13px;
        }
        .mc-auth__switch button {
          min-height: 0;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
          color: #4167b2;
          cursor: pointer;
          font: inherit;
          font-weight: 800;
        }
        .mc-auth__guest {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 15px;
          color: #4167b2;
          text-decoration: none;
          font-size: 13px;
          font-weight: 700;
        }
        @media (max-width: 850px) {
          .mc-auth {
            height: auto;
            min-height: 100dvh;
            overflow: auto;
            padding: 10px;
          }
          .mc-auth__shell {
            width: min(100%, 740px);
            height: auto;
          }
          .mc-auth__header,
          .mc-auth__intro,
          .mc-auth__mascot {
            display: none;
          }
          .mc-auth__layout {
            grid-template-columns: 1fr;
            gap: 0;
            height: auto;
            min-height: calc(100dvh - 20px);
            max-height: none;
            padding: 46px 34px 36px;
            border-radius: 28px;
          }
          .mc-auth__card {
            max-width: 100%;
            max-height: none;
            width: 100%;
            height: auto;
            justify-self: stretch;
            margin: auto;
            padding: 0;
            overflow: visible;
            scrollbar-gutter: auto;
            border: 0;
            border-radius: 0;
            background: transparent;
            box-shadow: none;
            backdrop-filter: none;
          }
          .mc-auth__tabs {
            padding: 5px;
            border-radius: 18px;
          }
          .mc-auth__tab {
            height: 70px;
            border-radius: 14px;
            font-size: 18px;
          }
          .mc-auth__title {
            margin: 42px 0 9px;
            font-size: 40px;
          }
          .mc-auth__subtitle {
            margin-bottom: 36px;
            font-size: 19px;
          }
          .mc-auth__google-wrap {
            margin-top: 18px;
          }
          .mc-auth__google-btn {
            min-height: 70px;
            border-radius: 999px;
            font-size: 17px;
          }
          .mc-auth__demo {
            gap: 12px;
            margin-bottom: 32px;
          }
          .mc-auth__demo button {
            min-height: 70px;
            border-radius: 16px;
            font-size: 17px;
          }
          .mc-auth__form {
            gap: 24px;
          }
          .mc-auth__field {
            gap: 11px;
          }
          .mc-auth__field label,
          .mc-auth__label-row a {
            font-size: 17px;
          }
          .mc-auth__input {
            height: 74px;
            min-height: 74px;
            padding: 0 20px;
            border-radius: 16px;
          }
          .mc-auth__input input {
            font-size: 19px;
          }
          .mc-auth__role-option {
            min-height: 64px;
            border-radius: 15px;
            font-size: 16px;
          }
          .mc-auth__submit {
            min-height: 74px;
            font-size: 19px;
          }
          .mc-auth__switch {
            margin-top: 46px;
            font-size: 18px;
          }
        }
        @media (max-width: 560px) {
          .mc-auth__shell {
            width: 100%;
          }
          .mc-auth__layout {
            min-height: 0;
            padding: 22px 16px 28px;
            border-radius: 20px;
          }
          .mc-auth__tab {
            height: 54px;
            font-size: 15px;
          }
          .mc-auth__title {
            margin-top: 28px;
            font-size: 30px;
          }
          .mc-auth__subtitle {
            margin-bottom: 24px;
            font-size: 15px;
          }
          .mc-auth__demo {
            grid-template-columns: 1fr;
            margin-bottom: 22px;
          }
          .mc-auth__demo button,
          .mc-auth__submit,
          .mc-auth__google-btn {
            min-height: 56px;
          }
          .mc-auth__input {
            height: 56px;
            min-height: 56px;
            padding-inline: 15px;
          }
          .mc-auth__form {
            gap: 17px;
          }
          .mc-auth__field {
            gap: 7px;
          }
          .mc-auth__field label,
          .mc-auth__label-row a {
            font-size: 14px;
          }
          .mc-auth__input input {
            font-size: 16px;
          }
          .mc-auth__role-options {
            grid-template-columns: 1fr;
          }
          .mc-auth__switch {
            margin-top: 28px;
            font-size: 15px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .mc-auth__demo button,
          .mc-auth__google-btn {
            transition: none;
          }
          .mc-auth__demo button:hover:not(:disabled),
          .mc-auth__demo button:active:not(:disabled),
          .mc-auth__google-btn:hover:not(:disabled),
          .mc-auth__google-btn:active:not(:disabled) {
            transform: none;
          }
        }
      `}</style>
      <div className="mc-auth__shell">
        <header className="mc-auth__header">
          <Link href="/" className="mc-auth__logo" aria-label="MediCheck">
            <Image
              src={asset("2-cropped.png")}
              alt="MediCheck"
              fill
              sizes="190px"
              priority
            />
          </Link>
          <Link href="/" className="mc-auth__back">
            <MaterialIcon name="arrow_back" size={18} />
            <span>Về trang chủ</span>
          </Link>
        </header>
        <section className="mc-auth__layout">
          <MediFox variant="loading" className="mc-auth__mascot" />
          <div className="mc-auth__intro">
            <p className="mc-auth__eyebrow">
              <b>✓</b> MEDICHECK ACCOUNT
            </p>
            <h1>
              {mode === "login" ? (
                <>
                  Chào mừng
                  <br />
                  <em>trở lại.</em>
                </>
              ) : (
                <>
                  Bắt đầu hành trình
                  <br />
                  <em>an toàn hơn.</em>
                </>
              )}
            </h1>
            <p>
              {mode === "login"
                ? "Đăng nhập để tiếp tục theo dõi và kiểm tra tương tác thuốc trong hành trình điều trị của bạn."
                : "Tạo tài khoản MediCheck để quản lý thông tin thuốc và chủ động bảo vệ sức khỏe mỗi ngày."}
            </p>
            <div className="mc-auth__points">
              <span className="mc-auth__point">
                <MaterialIcon name="verified_user" size={20} />
                Dữ liệu y tế đáng tin cậy
              </span>
              <span className="mc-auth__point">
                <MaterialIcon name="history" size={20} />
                Lưu lại lịch sử tra cứu
              </span>
              <span className="mc-auth__point">
                <MaterialIcon name="health_and_safety" size={20} />
                Đồng hành cùng sức khỏe của bạn
              </span>
            </div>
          </div>
          <section className="mc-auth__card">
            <div className="mc-auth__tabs">
              <button
                type="button"
                className={
                  mode === "login"
                    ? "mc-auth__tab mc-auth__tab--active"
                    : "mc-auth__tab"
                }
                onClick={() => changeMode("login")}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                className={
                  mode === "register"
                    ? "mc-auth__tab mc-auth__tab--active"
                    : "mc-auth__tab"
                }
                onClick={() => changeMode("register")}
              >
                Đăng ký
              </button>
            </div>
            <h2 className="mc-auth__title">
              {mode === "login" ? "Đăng nhập MediCheck" : "Tạo tài khoản mới"}
            </h2>
            <p className="mc-auth__subtitle">
              {mode === "login"
                ? "Nhập thông tin của bạn để tiếp tục."
                : "Điền thông tin bên dưới để bắt đầu trải nghiệm."}
            </p>
            {mode === "login" && (
              <div className="mc-auth__demo">
                <button
                  type="button"
                  onClick={() => demo("demo-pharmacist@medguard.local")}
                  disabled={loading}
                >
                  Dược sĩ
                </button>
                <button
                  type="button"
                  onClick={() => demo("demo-patient@medguard.local")}
                  disabled={loading}
                >
                  Người dùng
                </button>
              </div>
            )}
            <form className="mc-auth__form" onSubmit={submit}>
              {mode === "register" && (
                <>
                  <div className="mc-auth__field">
                    <label htmlFor="ho_ten">Họ tên</label>
                    <div className="mc-auth__input icon-input-spacing">
                      <MaterialIcon name="person" size={20} />
                      <input
                        id="ho_ten"
                        required
                        value={hoTen}
                        onChange={(event) => setHoTen(event.target.value)}
                        placeholder="Nguyễn Văn A"
                      />
                    </div>
                  </div>
                  <div className="mc-auth__field">
                    <label id="role-label">Vai trò</label>
                    <div
                      className="mc-auth__role-options"
                      role="radiogroup"
                      aria-labelledby="role-label"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={role === "patient"}
                        className={`mc-auth__role-option${role === "patient" ? " mc-auth__role-option--active" : ""}`}
                        onClick={() => setRole("patient")}
                      >
                        <MaterialIcon name="person" size={19} />
                        Người dùng
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={role === "pharmacist"}
                        className={`mc-auth__role-option${role === "pharmacist" ? " mc-auth__role-option--active" : ""}`}
                        onClick={() => setRole("pharmacist")}
                      >
                        <MaterialIcon name="local_pharmacy" size={19} />
                        Dược sĩ
                      </button>
                    </div>
                  </div>
                  {role === "pharmacist" && (
                    <>
                      <div className="mc-auth__field">
                        <label htmlFor="license">Số chứng chỉ hành nghề</label>
                        <div className="mc-auth__input icon-input-spacing">
                          <MaterialIcon name="verified" size={20} />
                          <input
                            id="license"
                            required
                            value={soChungChi}
                            onChange={(e) => setSoChungChi(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="mc-auth__field">
                        <label htmlFor="workplace">Nơi công tác</label>
                        <div className="mc-auth__input icon-input-spacing">
                          <MaterialIcon name="local_hospital" size={20} />
                          <input
                            id="workplace"
                            required
                            value={noiCongTac}
                            onChange={(e) => setNoiCongTac(e.target.value)}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
              {!googleCredential && (
                <div className="mc-auth__field">
                  <label htmlFor="email">Email</label>
                  <div className="mc-auth__input icon-input-spacing">
                    <MaterialIcon name="mail" size={20} />
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="ban@vidu.com"
                    />
                  </div>
                </div>
              )}
              {(!googleCredential || linkRequired) && (
                <div className="mc-auth__field">
                  <div className="mc-auth__label-row">
                    <label htmlFor="mat_khau">Mật khẩu</label>
                    {mode === "login" && (
                      <Link href="/auth/forgot-password">Quên mật khẩu?</Link>
                    )}
                  </div>
                  <div className="mc-auth__input icon-input-spacing">
                    <MaterialIcon name="lock" size={20} />
                    <input
                      id="mat_khau"
                      type={showPassword ? "text" : "password"}
                      required={!googleCredential || linkRequired}
                      minLength={linkRequired || mode === "login" ? 1 : 8}
                      value={matKhau}
                      onChange={(event) => setMatKhau(event.target.value)}
                      placeholder={
                        linkRequired ? "Mật khẩu hiện tại" : "Tối thiểu 8 ký tự"
                      }
                    />
                    <button
                      type="button"
                      className="mc-auth__icon"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={
                        showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                      }
                    >
                      <MaterialIcon
                        name={showPassword ? "visibility_off" : "visibility"}
                        size={20}
                      />
                    </button>
                  </div>
                </div>
              )}
              {error && (
                <p className="mc-auth__error" role="alert">
                  {error}
                </p>
              )}
              {notice && (
                <p className="mc-auth__notice" role="status" aria-live="polite">
                  {notice}
                </p>
              )}
              {canResend && email && (
                <button
                  type="button"
                  className="mc-auth__tab"
                  onClick={() =>
                    void resendVerification(email)
                      .then((result) => {
                        if (result.code === "EMAIL_NOT_REGISTERED") {
                          setNotice(null);
                          setError(result.message);
                          return;
                        }
                        setError(null);
                        setNotice(result.message);
                      })
                      .catch((err) => {
                        setNotice(null);
                        setError(
                          err instanceof ApiError
                            ? err.message
                            : "Không thể gửi lại email.",
                        );
                      })
                  }
                >
                  Gửi lại email xác minh
                </button>
              )}
              <button
                type="submit"
                className="mc-auth__submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    Đang xử lý...
                  </>
                ) : (
                  <>
                    {linkRequired
                      ? "Liên kết và đăng nhập"
                      : mode === "login"
                        ? "Đăng nhập"
                        : googleCredential
                          ? "Hoàn tất đăng ký Google"
                          : "Tạo tài khoản"}
                    <MaterialIcon name="arrow_forward" size={20} />
                  </>
                )}
              </button>
            </form>
            <div className="mc-auth__google-wrap">
              {/* Nút tự vẽ 100% (không phải widget Google) - bấm mới gọi
                  oauth2.initTokenClient().requestAccessToken() mở popup thật của
                  Google, xem initGoogleAuth()/handleGoogleClick(). */}
              <button
                type="button"
                className="mc-auth__google-btn"
                onClick={handleGoogleClick}
                disabled={loading || !googleReady}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  aria-hidden="true"
                >
                  <path
                    fill="#4285F4"
                    d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
                  />
                  <path
                    fill="#34A853"
                    d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"
                  />
                  <path
                    fill="#EA4335"
                    d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
                  />
                </svg>
                Tiếp tục với Google
              </button>
            </div>
            <p className="mc-auth__switch">
              {mode === "login" ? (
                <>
                  Chưa có tài khoản?{" "}
                  <button type="button" onClick={() => changeMode("register")}>
                    Đăng ký ngay
                  </button>
                </>
              ) : (
                <>
                  Đã có tài khoản?{" "}
                  <button type="button" onClick={() => changeMode("login")}>
                    Đăng nhập
                  </button>
                </>
              )}
            </p>
          </section>
        </section>
      </div>
    </main>
  );
}
