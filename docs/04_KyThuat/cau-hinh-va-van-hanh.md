# Cấu hình, API và vận hành MediCheck

Tài liệu tham khảo kỹ thuật, tách ra từ README. Cách cài đặt và chạy nhanh nằm ở [README](../../README.md).

## Environment Variables

Chỉ liệt kê tên biến — giá trị thật nằm trong `.env` (không commit vào git).

| Biến                                                                              |       Bắt buộc       | Mô tả                                                                                                                                                                                               |
| --------------------------------------------------------------------------------- | :------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEEPSEEK_API_KEY`                                                                |          ✅          | API key DeepSeek (free tại [platform.deepseek.com](https://platform.deepseek.com)). Không có key này, các cặp thuốc mức nhẹ/trung bình/nặng sẽ không sinh được giải thích (agent cần gọi LLM thật). |
| `DEEPSEEK_BASE_URL`                                                               |          —           | Mặc định `https://api.deepseek.com`, không cần đổi.                                                                                                                                                 |
| `MODEL_NAME`                                                                      |          —           | Mặc định `deepseek-chat`.                                                                                                                                                                           |
| `DATABASE_URL`                                                                    |          ✅          | PostgreSQL (Supabase hoặc local) - users, products, tương tác, lịch sử kiểm tra… Không có giá trị mặc định.                                                                                         |
| `SECRET_KEY`                                                                      | ✅ (khi deploy thật) | Secret ký token HMAC tự làm (`src/services/auth.py`). Có giá trị dev mặc định, **phải đổi trước khi deploy public**.                                                                                |
| `APP_ENV`                                                                         |          —           | `development` / `production` / `test`.                                                                                                                                                              |
| `APP_PORT`, `APP_HOST`                                                            |          —           | Mặc định `8000` / `0.0.0.0`.                                                                                                                                                                        |
| `CORS_ORIGINS`                                                                    |          —           | Domain frontend được phép gọi API.                                                                                                                                                                  |
| `FRONTEND_URL`                                                                    |          ✅          | URL frontend dùng trong liên kết xác minh email/đặt lại mật khẩu.                                                                                                                                   |
| `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`                                |          ✅          | Web Client ID của Google Identity Services; hai phía phải dùng cùng giá trị.                                                                                                                        |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`           |          ✅          | SMTP gửi email xác minh và đặt lại mật khẩu.                                                                                                                                                        |
| `SMTP_STARTTLS`, `SMTP_SSL`                                                       |          —           | Chỉ bật một chế độ: STARTTLS thường dùng cổng 587, SSL trực tiếp thường dùng cổng 465.                                                                                                              |
| `SMTP_TIMEOUT_SECONDS`, `SMTP_MAX_RETRIES`, `SMTP_RETRY_DELAY_SECONDS`            |          —           | Timeout và retry gửi email; mặc định 15 giây, 3 lần, delay 1 giây.                                                                                                                                  |
| `COOKIE_SECURE`, `COOKIE_SAMESITE`, `COOKIE_DOMAIN`                               |    ✅ production     | Chính sách cookie phiên; dùng `Secure=true`, và `SameSite=none` nếu frontend/API khác site.                                                                                                         |
| `ENABLE_DEMO_ACCOUNTS`                                                            |          —           | Hai nút demo luôn hiển thị; đặt `true` để backend cho phép đăng nhập các tài khoản demo.                                                                                                            |
| `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REFRESH_TOKEN` |    ✅ trên Render    | Gửi email qua Gmail API thay SMTP (Render chặn SMTP ra ngoài). Cách lấy: [`docs/04_KyThuat/gmail-api-setup.md`](gmail-api-setup.md). Có refresh token thì các biến `SMTP_*` không cần nữa.     |
| `LLM_TEMPERATURE`                                                                 |          —           | Mặc định `0.3`.                                                                                                                                                                                     |
| `LOG_LEVEL`                                                                       |          —           | `DEBUG` / `INFO` / `WARNING` / `ERROR`.                                                                                                                                                             |

### Thiết lập xác thực production

1. Tạo OAuth Client loại **Web application** trong Google Cloud, cấu hình consent screen và thêm `http://localhost:3000` cùng domain production vào **Authorized JavaScript origins**.
2. Điền Google Client ID và cấu hình email trong `.env` — SMTP cho local, Gmail API cho production vì Render chặn SMTP ([`docs/04_KyThuat/gmail-api-setup.md`](gmail-api-setup.md)). Không cần Google Client Secret cho luồng Sign in with Google bằng ID token.
3. Sao lưu database (hoặc tạo bản sao/nhánh riêng) rồi chạy `python scripts/migrate_auth.py`. Migration chuẩn hóa email, giữ nguyên dữ liệu liên quan và khóa tài khoản cũ không phải demo.
4. Tạo quản trị viên đầu tiên bằng `python scripts/create_admin.py --email admin@example.com --name "Admin"`.
5. Production phải chạy HTTPS, dùng `SECRET_KEY` ngẫu nhiên mạnh, `COOKIE_SECURE=true`, và CORS chỉ chứa domain frontend chính xác.

Frontend không lưu credential trong `localStorage`; access/refresh session nằm trong cookie HttpOnly. Tài khoản email phải bấm link xác minh, còn tài khoản dược sĩ chỉ được cấp quyền sau khi admin duyệt số CCHN và nơi công tác.

### Smoke test auth trên staging

Sau khi deploy backend, migrate database và tạo một tài khoản staging đang hoạt động, đặt các biến môi trường cục bộ rồi chạy:

```powershell
$env:STAGING_API_URL="https://api-staging.example.com"
$env:STAGING_FRONTEND_URL="https://staging.example.com"
$env:SMOKE_AUTH_EMAIL="staging-user@example.com"
$env:SMOKE_AUTH_PASSWORD="<password>"
$env:SMOKE_CROSS_SITE="true"
python scripts/smoke_auth_staging.py
```

Script kiểm tra health, CORS, CSRF, cookie `HttpOnly/Secure/SameSite`, đăng nhập, `/me`, xoay refresh token, chống dùng lại refresh cũ và logout. Google popup và email thật vẫn cần kiểm tra thủ công trên HTTPS: đăng ký một email mới, mở link xác minh nhận qua SMTP, đăng nhập Google thật và xác nhận đúng trang đích theo vai trò.

## Sample Queries

Endpoint không cần đăng nhập, dùng để thử nhanh — `POST /api/v1/guest/medications/check` (nhận thẳng tên hoạt chất/tên gốc, tự chuẩn hóa qua alias):

```bash
curl -X POST http://localhost:8000/api/v1/guest/medications/check \
  -H "Content-Type: application/json" \
  -d '{"medications": ["Aspirin", "Warfarin"]}'
```

Luồng theo tên biệt dược thật (Vietnamese brand name) — `POST /api/v1/guest/products/check`:

```bash
curl -X POST http://localhost:8000/api/v1/guest/products/check \
  -H "Content-Type: application/json" \
  -d '{
    "prescriptions": [
      {"label": "Đơn thuốc 1", "products": ["Aspirin 81", "A.T Warfarin 1 mg"]}
    ]
  }'
```

Tìm kiếm/autocomplete tên biệt dược:

```bash
curl "http://localhost:8000/api/v1/guest/products/search?q=aspirin"
```

## API chính (`/api/v1`)

| Method   | Path                                                                               | Vai trò                | Mô tả                                                                       |
| -------- | ---------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| POST     | `/auth/register`, `/auth/login`                                                    | công khai              | Đăng ký/đăng nhập                                                           |
| GET      | `/products/search`, `/guest/products/search?q=`                                    | công khai/đã đăng nhập | Autocomplete tên biệt dược                                                  |
| POST     | `/products/check`                                                                  | bệnh nhân              | Chạy agent, lưu kết quả, trả về (ẩn field dược sĩ)                          |
| POST     | `/guest/products/check`                                                            | công khai              | Chạy agent, không lưu, không cần đăng nhập                                  |
| GET      | `/patients/{id}/checks[/{check_id}]`                                               | bệnh nhân              | Lịch sử kiểm tra                                                            |
| GET/POST | `/pharmacist/requests`, `/pharmacist/reviews`                                      | dược sĩ                | Danh sách yêu cầu, xem đầy đủ (có `xu_tri`) + xác nhận                      |
| GET/PUT  | `/diseases/search`, `/patients/{id}/conditions`                                    | bệnh nhân              | Bệnh nền của bệnh nhân (dùng để lọc cảnh báo thuốc–bệnh)                    |
| GET/POST | `/admin/overview`, `/admin/users`, `/admin/pharmacists/pending`, `/admin/feedback` | admin                  | Duyệt tài khoản dược sĩ (CCHN), quản lý người dùng, dữ liệu thuốc, phản hồi |

Danh sách endpoint đầy đủ + request/response schema: [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger, tự sinh từ code).
