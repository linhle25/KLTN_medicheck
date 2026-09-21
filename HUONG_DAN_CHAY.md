# Hướng dẫn chạy MediCheck

## Yêu cầu

- Docker Desktop (Windows/macOS) hoặc Docker Engine + Compose (Linux).
- Nếu chạy không dùng Docker: Python 3.11+, Node.js 20+ và npm.
- Một cơ sở dữ liệu đã có dữ liệu thuốc. Cách đơn giản nhất để phát triển cục bộ là đặt file SQLite tại `data/app.db`.

## Cấu hình

Tạo file cấu hình từ mẫu:

```bash
cp .env.example .env
```

Trên PowerShell:

```powershell
Copy-Item .env.example .env
```

Tối thiểu, đặt `DEEPSEEK_API_KEY` trong `.env`. Chọn một cấu hình cơ sở dữ liệu:

```env
# SQLite cục bộ
DATABASE_URL=sqlite:///./data/app.db
DATABASE_URL_FACTS=

# Hoặc PostgreSQL
# DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/medicheck
# DATABASE_URL_FACTS=
```

## Chạy toàn bộ bằng Docker

```bash
docker compose up --build
```

Sau khi các service sẵn sàng:

- Web: http://localhost:3000
- API và Swagger: http://localhost:8000/docs
- Health check: http://localhost:8000/health

Dừng service:

```bash
docker compose down
```

## Chạy từng service cục bộ

### Backend

```bash
python -m venv .venv
```

Kích hoạt môi trường rồi cài dependencies:

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

Trên macOS/Linux, thay lệnh kích hoạt bằng `source .venv/bin/activate`.

### Frontend

Mở terminal khác:

```bash
cd frontend
npm ci
npm run dev
```

Mặc định frontend gọi API tại `http://localhost:8000`. Có thể thay đổi bằng `NEXT_PUBLIC_API_URL` trong `frontend/.env.local`.

## Kiểm tra nhanh

```bash
curl http://localhost:8000/health
```

Nếu API khởi động nhưng không trả dữ liệu tương tác, kiểm tra lại `DATABASE_URL` và dữ liệu thuốc tại `data/app.db` hoặc PostgreSQL.
