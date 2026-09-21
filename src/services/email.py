"""Provider-neutral email adapter for MediCheck transactional emails.

Supports two delivery paths:
- SMTP (smtplib) - used when no Gmail OAuth refresh token is configured.
  Works for local dev, but most PaaS hosts (Render included) block outbound
  SMTP at the network level, so this path is unusable there.
- Gmail API over HTTPS - used when GMAIL_OAUTH_REFRESH_TOKEN is set. HTTPS
  egress isn't blocked the way SMTP is, so this is the path production uses.
"""

import base64
import logging
import smtplib
import ssl
import time
from email.message import EmailMessage
from email.utils import formataddr
from html import escape
from urllib.parse import urlencode

import httpx

from src.config import get_settings

logger = logging.getLogger(__name__)

GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"


def _build_email_html(
    *,
    title: str,
    greeting: str,
    message: str,
    button_text: str | None = None,
    button_url: str | None = None,
    note: str | None = None,
) -> str:
    """Create a reusable branded HTML email template."""

    button = ""
    if button_text and button_url:
        safe_url = escape(button_url, quote=True)
        button = f"""
        <table role="presentation" cellspacing="0" cellpadding="0"
               style="margin:28px auto;">
          <tr>
            <td style="border-radius:10px;background:#3568c5;">
              <a href="{safe_url}"
                 style="
                    display:inline-block;
                    padding:13px 24px;
                    color:#ffffff;
                    text-decoration:none;
                    font-size:15px;
                    font-weight:600;
                    border-radius:10px;
                 ">
                {escape(button_text)}
              </a>
            </td>
          </tr>
        </table>

        <p style="margin:20px 0 8px;color:#64748b;font-size:13px;">
          Nếu nút trên không hoạt động, hãy sao chép liên kết sau vào trình duyệt:
        </p>
        <p style="
            margin:0;
            padding:12px;
            background:#f1f5f9;
            border-radius:8px;
            color:#3568c5;
            font-size:12px;
            word-break:break-all;
        ">
          {safe_url}
        </p>
        """

    note_html = ""
    if note:
        note_html = f"""
        <div style="
            margin-top:24px;
            padding:14px 16px;
            background:#eff6ff;
            border-left:4px solid #3568c5;
            border-radius:6px;
            color:#475569;
            font-size:13px;
            line-height:1.6;
        ">
          {escape(note)}
        </div>
        """

    return f"""\
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
         style="background:#f1f5f9;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="
                  max-width:600px;
                  background:#ffffff;
                  border-radius:16px;
                  overflow:hidden;
                  box-shadow:0 4px 18px rgba(15,23,42,0.08);
               ">
          <tr>
            <td style="
                padding:24px 32px;
                background:linear-gradient(135deg,#7095df,#3568c5);
                color:#ffffff;
            ">
              <div style="font-size:24px;font-weight:700;">MediCheck</div>
              <div style="margin-top:5px;font-size:13px;opacity:0.9;">
                Hỗ trợ kiểm tra tương tác thuốc an toàn
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:32px;color:#1e293b;">
              <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;">
                {escape(title)}
              </h1>

              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
                {escape(greeting)}
              </p>

              <p style="margin:0;font-size:15px;line-height:1.7;color:#475569;">
                {escape(message)}
              </p>

              {button}
              {note_html}

              <p style="margin:28px 0 0;font-size:14px;line-height:1.6;color:#475569;">
                Trân trọng,<br>
                <strong>Đội ngũ MediCheck</strong>
              </p>
            </td>
          </tr>

          <tr>
            <td style="
                padding:20px 32px;
                background:#f8fafc;
                border-top:1px solid #e2e8f0;
                color:#94a3b8;
                font-size:12px;
                line-height:1.6;
                text-align:center;
            ">
              Đây là email tự động từ MediCheck, vui lòng không trả lời email này.
              <br>
              Không chia sẻ liên kết xác minh hoặc đặt lại mật khẩu với người khác.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def _gmail_access_token(settings) -> str:
    response = httpx.post(
        GMAIL_TOKEN_URL,
        data={
            "client_id": settings.gmail_oauth_client_id,
            "client_secret": settings.gmail_oauth_client_secret,
            "refresh_token": settings.gmail_oauth_refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=settings.smtp_timeout_seconds,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def _send_via_gmail_api(settings, message: EmailMessage) -> None:
    access_token = _gmail_access_token(settings)
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    response = httpx.post(
        GMAIL_SEND_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        json={"raw": raw},
        timeout=settings.smtp_timeout_seconds,
    )
    response.raise_for_status()


def _send_via_smtp(settings, message: EmailMessage) -> None:
    tls_context = ssl.create_default_context()
    if settings.smtp_ssl:
        connection = smtplib.SMTP_SSL(
            settings.smtp_host,
            settings.smtp_port,
            timeout=settings.smtp_timeout_seconds,
            context=tls_context,
        )
    else:
        connection = smtplib.SMTP(
            settings.smtp_host,
            settings.smtp_port,
            timeout=settings.smtp_timeout_seconds,
        )

    with connection as smtp:
        if settings.smtp_starttls:
            smtp.starttls(context=tls_context)
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)


def _send(
    to: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> None:
    settings = get_settings()
    use_gmail_api = bool(settings.gmail_oauth_refresh_token)

    if not use_gmail_api and (not settings.smtp_host or not settings.smtp_from):
        if settings.app_env == "production":
            raise RuntimeError("SMTP chưa được cấu hình")

        logger.warning(
            "SMTP not configured; auth email was not sent to %s (subject=%s)",
            to,
            subject,
        )
        return

    message = EmailMessage()
    message["From"] = (
        formataddr((settings.smtp_from_name, settings.smtp_from))
        if settings.smtp_from_name
        else settings.smtp_from
    )
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text_body)

    if html_body:
        message.add_alternative(html_body, subtype="html")

    attempts = settings.smtp_max_retries
    for attempt in range(1, attempts + 1):
        try:
            if use_gmail_api:
                _send_via_gmail_api(settings, message)
            else:
                _send_via_smtp(settings, message)
            return
        except (OSError, smtplib.SMTPException, httpx.HTTPError):
            logger.warning(
                "Email delivery attempt %s/%s failed for %s (subject=%s)",
                attempt,
                attempts,
                to,
                subject,
                exc_info=attempt == attempts,
            )
            if attempt == attempts:
                raise
            time.sleep(settings.smtp_retry_delay_seconds * attempt)


def send_verification_email(email: str, token: str) -> None:
    settings = get_settings()
    query = urlencode({"token": token})
    url = (
        f"{settings.frontend_url.rstrip('/')}"
        f"/auth/verify-email?{query}"
    )

    subject = "Xác minh địa chỉ email của bạn | MediCheck"

    text_body = f"""\
Xin chào,

Cảm ơn bạn đã đăng ký tài khoản MediCheck.

Vui lòng mở liên kết dưới đây trong vòng 24 giờ để xác minh địa chỉ email:

{url}

Nếu bạn không đăng ký tài khoản MediCheck, bạn có thể bỏ qua email này.

Trân trọng,
Đội ngũ MediCheck
"""

    html_body = _build_email_html(
        title="Xác minh địa chỉ email",
        greeting="Xin chào,",
        message=(
            "Cảm ơn bạn đã đăng ký tài khoản MediCheck. "
            "Vui lòng xác minh địa chỉ email để hoàn tất đăng ký "
            "và bắt đầu sử dụng hệ thống."
        ),
        button_text="Xác minh email",
        button_url=url,
        note=(
            "Liên kết có hiệu lực trong 24 giờ và chỉ được sử dụng một lần. "
            "Nếu bạn không đăng ký MediCheck, hãy bỏ qua email này."
        ),
    )

    _send(email, subject, text_body, html_body)


def send_password_reset_email(email: str, token: str) -> None:
    settings = get_settings()
    query = urlencode({"token": token})
    url = (
        f"{settings.frontend_url.rstrip('/')}"
        f"/auth/reset-password?{query}"
    )

    subject = "Yêu cầu đặt lại mật khẩu | MediCheck"

    text_body = f"""\
Xin chào,

MediCheck đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.

Vui lòng mở liên kết dưới đây trong vòng 30 phút:

{url}

Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email. Mật khẩu hiện tại
của bạn sẽ không thay đổi.

Trân trọng,
Đội ngũ MediCheck
"""

    html_body = _build_email_html(
        title="Đặt lại mật khẩu",
        greeting="Xin chào,",
        message=(
            "MediCheck đã nhận được yêu cầu đặt lại mật khẩu "
            "cho tài khoản của bạn."
        ),
        button_text="Đặt lại mật khẩu",
        button_url=url,
        note=(
            "Liên kết có hiệu lực trong 30 phút và chỉ được sử dụng một lần. "
            "Nếu bạn không thực hiện yêu cầu này, mật khẩu hiện tại "
            "sẽ không thay đổi."
        ),
    )

    _send(email, subject, text_body, html_body)


def send_pharmacist_decision_email(
    email: str,
    approved: bool,
    reason: str | None = None,
) -> None:
    settings = get_settings()
    login_url = f"{settings.frontend_url.rstrip('/')}/auth"

    if approved:
        subject = "Hồ sơ dược sĩ đã được phê duyệt | MediCheck"

        text_body = f"""\
Xin chào,

Hồ sơ dược sĩ MediCheck của bạn đã được phê duyệt.

Bạn có thể đăng nhập và sử dụng các chức năng dành cho dược sĩ tại:

{login_url}

Trân trọng,
Đội ngũ MediCheck
"""

        html_body = _build_email_html(
            title="Hồ sơ dược sĩ đã được phê duyệt",
            greeting="Xin chào,",
            message=(
                "Hồ sơ chuyên môn của bạn đã được quản trị viên phê duyệt. "
                "Bạn có thể đăng nhập và sử dụng các chức năng dành cho dược sĩ."
            ),
            button_text="Đăng nhập MediCheck",
            button_url=login_url,
            note=(
                "Vui lòng bảo mật thông tin tài khoản và không chia sẻ "
                "quyền truy cập với người khác."
            ),
        )
    else:
        safe_reason = reason.strip() if reason else None
        reason_text = (
            f"\n\nLý do: {safe_reason}"
            if safe_reason
            else ""
        )

        subject = "Kết quả xét duyệt hồ sơ dược sĩ | MediCheck"

        text_body = f"""\
Xin chào,

Hồ sơ đăng ký vai trò dược sĩ của bạn hiện chưa được phê duyệt.
Tài khoản đã được chuyển sang vai trò người dùng thông thường.{reason_text}

Nếu cần hỗ trợ, vui lòng liên hệ quản trị viên MediCheck.

Trân trọng,
Đội ngũ MediCheck
"""

        note = (
            f"Lý do: {safe_reason}"
            if safe_reason
            else (
                "Nếu cần thêm thông tin về kết quả xét duyệt, "
                "vui lòng liên hệ quản trị viên MediCheck."
            )
        )

        html_body = _build_email_html(
            title="Kết quả xét duyệt hồ sơ dược sĩ",
            greeting="Xin chào,",
            message=(
                "Hồ sơ đăng ký vai trò dược sĩ của bạn hiện chưa được "
                "phê duyệt. Tài khoản vẫn có thể được sử dụng với vai trò "
                "người dùng thông thường."
            ),
            note=note,
        )

    _send(email, subject, text_body, html_body)
