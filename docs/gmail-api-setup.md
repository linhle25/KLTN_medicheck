# Gửi email qua Gmail API (thay SMTP)

> Tài liệu này thay cho `docs/GMAIL_API_SETUP.md` cũ (đã xoá ở commit `96c695d`) mà
> [`.env.example`](../.env.example) và [`scripts/gmail_oauth_setup.py`](../scripts/gmail_oauth_setup.py)
> còn trỏ tới.

## Vì sao cần

Backend gửi 2 loại email giao dịch: xác minh email khi đăng ký và đặt lại mật khẩu
([`src/services/email.py`](../src/services/email.py)). Render chặn kết nối SMTP ra ngoài ở
tầng mạng, nên trên production không dùng `smtplib` được. Khi
`GMAIL_OAUTH_REFRESH_TOKEN` có giá trị, `email.py` gửi qua **Gmail API bằng HTTPS** thay
vì SMTP; các biến `SMTP_*` khi đó không cần thiết.

Chạy local (không bị chặn SMTP) thì vẫn dùng `SMTP_*` bình thường — không bắt buộc làm
theo tài liệu này.

## Ba biến cần lấy

```
GMAIL_OAUTH_CLIENT_ID=
GMAIL_OAUTH_CLIENT_SECRET=
GMAIL_OAUTH_REFRESH_TOKEN=
```

## Các bước

1. **Google Cloud Console** → chọn (hoặc tạo) project → **APIs & Services → Library** →
   bật **Gmail API**.
2. **APIs & Services → OAuth consent screen**: kiểu *External*, điền tên app + email hỗ
   trợ, thêm scope `https://www.googleapis.com/auth/gmail.send`, và thêm chính tài khoản
   Gmail dùng để gửi (ví dụ `medichecksupport@gmail.com`) vào **Test users**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, loại
   **Desktop app** (script dưới đây nhận callback ở `http://localhost:8080/`). Ghi lại
   Client ID và Client secret.
4. Chạy **một lần duy nhất** trên máy local, đăng nhập bằng đúng tài khoản Gmail dùng để
   gửi mail:

   ```bash
   python scripts/gmail_oauth_setup.py --client-id XXX --client-secret YYY
   ```

   Script mở trình duyệt, nhận `code` qua callback localhost, đổi lấy refresh token và in
   ra màn hình.
5. Đặt cả 3 giá trị vào `.env` (local) và vào Environment Variables của Render
   (production). Không commit vào git.

## Kiểm tra

Đăng ký một tài khoản mới trên môi trường tương ứng và xác nhận nhận được email xác minh.
Thiếu cấu hình email hợp lệ thì `validate_production_auth_settings()` trong
[`src/config.py`](../src/config.py) sẽ chặn backend khởi động ở chế độ `APP_ENV=production`.
