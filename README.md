# 🛡️ MediCheck

> AI Agent kiểm tra tương tác thuốc và cảnh báo an toàn dùng thuốc cho bệnh nhân và dược sĩ, dựa trên dữ liệu thật **DDInter 2.0**.

🌐 **Dùng thử trực tuyến: [medicheckbyelink.vercel.app](https://medicheckbyelink.vercel.app/)**

## Giới thiệu đề tài

Người bệnh thường dùng nhiều thuốc cùng lúc, từ nhiều đơn của nhiều nơi, và dễ gặp tương tác nguy hiểm mà không ai nhìn thấy, vì mỗi bác sĩ hay dược sĩ chỉ thấy một đơn. MediCheck gộp các đơn thành một danh sách thuốc đang dùng, tra tương tác trong cơ sở dữ liệu DDInter 2.0, xếp hạng mức độ nghiêm trọng và giải thích bằng tiếng Việt kèm nguồn trích dẫn. Khi cần, bệnh nhân gửi kết quả cho dược sĩ xác nhận.

**Nguyên tắc thiết kế**

1. **Tách tra cứu khỏi diễn giải.** Mọi cặp tương tác đến từ cơ sở dữ liệu; mô hình ngôn ngữ chỉ diễn giải kết quả đã tra, không tự tạo hay đổi mức độ.
2. **Guardrail.** Đoạn giải thích thiếu nguồn trích dẫn bị chặn; câu khuyên tự ý đổi, ngừng hay chỉnh liều bị lọc.
3. **Con người quyết định cuối cùng.** Dược sĩ xác nhận kết quả; hướng xử trí và thuốc thay thế chỉ dược sĩ mới thấy.

> AI không chẩn đoán, không khuyên đổi hay ngừng thuốc. Mọi cảnh báo chỉ mang tính tham khảo.

### Dữ liệu

| Loại | Bảng | Số bản ghi |
| --- | --- | ---: |
| Thuốc – thuốc | `interactions` | 160.227 cặp |
| Thuốc – thực phẩm | `food_interactions` | 803 |
| Thuốc – bệnh nền | `disease_interactions` | 7.672 (trên 450 bệnh) |
| Biệt dược Việt Nam → hoạt chất | `products` / `product_ingredients` | 41.302 / 68.562 |
| Danh mục hoạt chất | `medications` | 2.073 (1.939 có ít nhất 1 cặp tương tác) |

### Tác giả

Khóa luận tốt nghiệp **Lê Thị Linh thực hiện** (lớp Công nghệ thông tin 65B, Trường Công nghệ, Đại học Kinh tế Quốc dân), dưới sự hướng dẫn của TS. Tống Thị Hảo Tâm.

Mã nguồn: [github.com/linhle25/KLTN_medicheck](https://github.com/linhle25/KLTN_medicheck)

## Giao diện

| Landing page | Dashboard bệnh nhân |
| --- | --- |
| ![Landing page](docs/screenshots/landing-page.png) | ![Dashboard bệnh nhân](docs/screenshots/patient-dashboard.png) |

| Kết quả kiểm tra tương tác | Dashboard dược sĩ |
| --- | --- |
| ![Kết quả kiểm tra tương tác](docs/screenshots/interaction-result.png) | ![Dashboard dược sĩ](docs/screenshots/pharmacist-dashboard.png) |

## Công nghệ

| Lớp | Công nghệ |
| --- | --- |
| Agent | LangGraph, 5 node tất định (chuẩn hóa → tra cứu → xếp hạng → gắn dữ liệu → guardrail), không node nào gọi LLM |
| LLM | DeepSeek-chat, chạy sau agent để giải thích theo thuốc, tổng quan, thực phẩm và bệnh nền |
| Backend | FastAPI, Uvicorn, SQLAlchemy |
| Cơ sở dữ liệu | PostgreSQL (Supabase) |
| Frontend | Next.js 14 (App Router), TypeScript; 3 vai trò: bệnh nhân, dược sĩ, quản trị viên |
| Kiểm thử | pytest, pytest-asyncio, httpx |
| Triển khai | GitHub Actions → Render (backend) + Vercel (frontend) |

## Cài đặt và chạy

### Yêu cầu

- **Docker** (Docker Desktop trên Windows/macOS, hoặc Docker Engine + Compose trên Linux). Kiểm tra: `docker --version` và `docker compose version`.
- Một **PostgreSQL** đã có dữ liệu thuốc (local hoặc Supabase). Dữ liệu không nằm trong git.
- Một **API key DeepSeek** (tạo tại [platform.deepseek.com](https://platform.deepseek.com)).

Không dùng Docker: cần Python 3.11+ và Node.js 20+, xem [HUONG_DAN_CHAY.md](HUONG_DAN_CHAY.md).

### Các bước

**1. Lấy mã nguồn**

```bash
git clone https://github.com/linhle25/KLTN_medicheck.git
cd KLTN_medicheck
```

**2. Tạo file cấu hình**

```bash
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
```

Mở `.env` và điền tối thiểu:

| Biến | Ý nghĩa |
| --- | --- |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL, ví dụ `postgresql+psycopg2://USER:PASSWORD@HOST:5432/medicheck` |
| `DEEPSEEK_API_KEY` | API key DeepSeek (thiếu thì không sinh được phần giải thích) |
| `SECRET_KEY` | Chuỗi ngẫu nhiên từ 32 byte; phải đổi trước khi triển khai thật |

Đăng nhập bằng email, Google và gửi thư xác minh cần thêm các biến `SMTP_*`, `GOOGLE_CLIENT_ID`. Xem bảng đầy đủ ở [cau-hinh-va-van-hanh.md](docs/04_KyThuat/cau-hinh-va-van-hanh.md).

**3. (Tùy chọn) Nạp dữ liệu**

Nếu cơ sở dữ liệu còn trống, hệ thống vẫn khởi động nhưng mọi tra cứu trả "không có dữ liệu". Để nạp từ nguồn gốc, đặt các bản dump DDInter vào `data/raw/` rồi chạy:

```bash
python scripts/import_ddinter.py
python scripts/import_ddinter_dfi_ddsi.py
python scripts/import_products.py
```

**4. Chạy hệ thống**

```bash
docker compose up --build        # thêm -d để chạy nền
```

**5. Mở và kiểm tra**

| Dịch vụ | Địa chỉ |
| --- | --- |
| Giao diện web | http://localhost:3000 |
| API và Swagger | http://localhost:8000/docs |
| Health check | http://localhost:8000/health (phải thấy `{"status":"ok",...}`) |

**6. Dừng hệ thống**

```bash
docker compose down
```

### Tạo tài khoản quản trị

```bash
python scripts/create_admin.py --email admin@example.com --name "Admin"
```

Tài khoản dược sĩ cần quản trị viên duyệt số chứng chỉ hành nghề trước khi dùng được.

### Chạy kiểm thử

```bash
APP_ENV=test DEEPSEEK_API_KEY=test-key DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/medicheck_test pytest tests/ -q
ruff check src/ tests/
```

Kiểm thử dùng một PostgreSQL riêng và giả lập LLM, không gọi API thật. Hai lệnh này cũng chạy trong CI ([ci.yml](.github/workflows/ci.yml)).

## Cấu trúc dự án

```
src/
├── agents/      # LangGraph: graph.py, state.py, nodes/ (5 node), tools/
├── api/         # routes.py (/api/v1/*), auth_routes.py (đăng nhập và /admin/*), deps.py
├── db/          # models.py (SQLAlchemy), session.py (1 engine PostgreSQL)
├── models/      # schemas.py (Pydantic)
├── services/    # auth, email, llm, tra cứu thực phẩm/bệnh nền, tổng hợp giải thích
├── config.py, main.py
scripts/         # nạp dữ liệu DDInter, migrate, tạo admin
frontend/        # Next.js: (patient), (pharmacist), admin
tests/           # pytest: agent, API, services
eval/            # bộ đánh giá chất lượng giải thích (gold set, giám khảo LLM, scorecard)
don_thuoc_mau/   # hai đơn thuốc mẫu dùng cho demo
docs/            # tài liệu, chia 4 nhóm bên dưới
```

## License

MIT (mã nguồn). Dữ liệu DDInter 2.0 dùng cho mục đích học thuật và giáo dục.
