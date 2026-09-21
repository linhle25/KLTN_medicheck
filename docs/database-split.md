# Tách CSDL: Supabase (DB chính) + CockroachDB (DB "facts")

> Tài liệu này thay cho `PLAN_migration_cockroach.md` (bản kế hoạch nội bộ, không đưa
> vào git) mà nhiều comment trong code trỏ tới. Nội dung dưới đây là mô tả **hiện
> trạng đang chạy**, đọc trực tiếp từ [`src/db/session.py`](../src/db/session.py).
>
> **Lưu ý:** đây là một cấu hình *tuỳ chọn*, chỉ bật khi đặt `DATABASE_URL_FACTS`.
> Để trống biến này (mặc định) thì toàn bộ chạy trên 1 Postgres duy nhất — không
> cần Supabase hay CockroachDB, phù hợp dev local hoặc production không bị giới
> hạn dung lượng. Supabase/CockroachDB trong tài liệu này chỉ là ví dụ nhà cung
> cấp đã dùng, có thể thay bằng bất kỳ Postgres-compatible nào khác.

## 1. Vì sao tách

Ba bảng dữ liệu tra cứu (DDInter 2.0) chiếm phần lớn dung lượng CSDL:

| Bảng | Số dòng (production, 01/09/2026) |
|---|---:|
| `interactions` (thuốc–thuốc) | 160.227 |
| `disease_interactions` (thuốc–bệnh nền) | 7.672 |
| `food_interactions` (thuốc–thực phẩm) | 803 |

Supabase free tier chỉ có 0.5 GB. Đưa cả ba bảng này vào cùng DB với dữ liệu vận hành
(users, products, interaction_checks…) là vượt quota. Vì vậy ba bảng được tách sang một
CockroachDB Serverless riêng — gọi là **facts DB**: dữ liệu tra cứu, chỉ đọc trong lúc
chạy, chỉ ghi bởi các script ETL trong [`scripts/`](../scripts/).

## 2. Cấu hình

| Biến | Trỏ tới | Chứa |
|---|---|---|
| `DATABASE_URL` | Postgres trên Supabase | Toàn bộ bảng vận hành (users, products, patient_*, interaction_checks, pharmacist_reviews, cache…) |
| `DATABASE_URL_FACTS` | CockroachDB Serverless | `interactions`, `food_interactions`, `disease_interactions` |

Danh sách bảng thuộc facts DB nằm ở hằng `FACTS_TABLE_NAMES` trong
[`src/db/session.py`](../src/db/session.py).

**Để trống `DATABASE_URL_FACTS`** → code tự fallback dùng chung `DATABASE_URL` cho cả ba
bảng (`SessionLocalFacts = SessionLocal`). Đây là chế độ cho dev/test/CI với một file
SQLite duy nhất. **Không dùng fallback này khi `DATABASE_URL` trỏ Supabase** — bản ba
bảng còn sót trong Supabase là dữ liệu cũ đã tách đi.

Driver: `sqlalchemy-cockroachdb` (đã có trong [`requirements.txt`](../requirements.txt)),
URL dạng `cockroachdb://…?sslmode=require`.

## 3. Hệ quả trong code

- `init_db()` tạo bảng trên **hai** engine: bảng thường trên `engine`, ba bảng facts trên
  `engine_facts`.
- Không JOIN được giữa hai DB. Chỗ nào trước đây JOIN `medications` với
  `food_interactions`/`disease_interactions` thì nay query riêng từng DB rồi ghép bằng
  dict trong Python — xem [`src/services/food_disease_lookup.py`](../src/services/food_disease_lookup.py).
  Ngữ nghĩa giữ nguyên INNER JOIN: dòng facts không khớp `medication_id` bị bỏ.
- Route cần đọc facts dùng dependency `get_db_facts()` thay cho `get_db()`.

## 4. Script liên quan

| Script | Việc |
|---|---|
| [`scripts/import_ddinter.py`](../scripts/import_ddinter.py) | ETL `medications` + `interactions` từ `data/raw/vmec12_ddinter_*.db` |
| [`scripts/import_ddinter_dfi_ddsi.py`](../scripts/import_ddinter_dfi_ddsi.py) | ETL `food_interactions` + `disease_interactions` |
| [`scripts/migrate_sqlite_to_postgres.py`](../scripts/migrate_sqlite_to_postgres.py) | Copy dữ liệu từ SQLite local lên Postgres khi deploy |
| [`scripts/migrate_postgres_to_sqlite.py`](../scripts/migrate_postgres_to_sqlite.py) | Chiều ngược lại — dựng lại `data/app.db` để dev offline (đọc đúng facts từ CockroachDB) |
