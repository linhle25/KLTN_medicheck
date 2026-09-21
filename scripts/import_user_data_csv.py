#!/usr/bin/env python3
"""Nhập dữ liệu từ các file CSV export thủ công trên Neon Console (SQL Editor ->
chạy `SELECT * FROM <bang>` -> Download CSV) vào 1 file SQLite local mới - dùng khi
không kết nối trực tiếp được tới Neon (VD hết quota) nhưng vẫn cần dữ liệu mới nhất.

Xử lý MỌI bảng có sẵn trong models.py miễn có file CSV tương ứng trong thư mục truyền
vào (thiếu file nào thì bỏ qua bảng đó, không bắt buộc đủ cả 13) - theo đúng thứ tự
khóa ngoại (Base.metadata.sorted_tables) để insert không bị lỗi FK.

Cách export CSV trên Neon Console:
  1. Vào Neon Console -> project -> SQL Editor
  2. Chạy: SELECT * FROM users;  (đổi tên bảng cho từng bảng)
  3. Bấm nút Download/Export ra CSV, lưu đúng tên file <ten_bang>.csv vào 1 thư mục
  4. Lặp lại cho từng bảng cần lấy

Usage (chạy SAU KHI đã init_db() cho database SQLite đích, tức đã chạy app hoặc
scripts/import_ddinter.py + import_products.py ít nhất 1 lần với DATABASE_URL trỏ
tới file này, để schema đã tồn tại):
  python scripts/import_user_data_csv.py <thu_muc_chua_csv> [duong_dan_file_sqlite_dich]

Mặc định file đích: data/app.db
"""
import csv
import json
import shutil
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import Boolean, Date, DateTime, Float, Integer, JSON, create_engine, text

from src.db.models import Base

_CHUNK_SIZE = 2000

# Mac dinh Python gioi han field CSV o 128KB - cot ket_qua_json (JSON day du 1 lan
# kiem tra) do thuc te trung binh ~260KB/dong, co dong con lon hon, vuot han mac
# dinh -> phai nang gioi han len truoc khi doc bat ky file CSV nao.
_maxInt = sys.maxsize
while True:
    try:
        csv.field_size_limit(_maxInt)
        break
    except OverflowError:
        _maxInt = int(_maxInt / 10)


def _coerce(value: str | None, col_type) -> object:
    """Chuyển 1 ô CSV (luôn là string hoặc None) về đúng kiểu Python theo cột."""
    if value is None or value == "":
        return None
    if isinstance(col_type, Boolean):
        return value.strip().lower() in ("t", "true", "1", "yes")
    if isinstance(col_type, JSON):
        return json.loads(value)
    if isinstance(col_type, DateTime):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    if isinstance(col_type, Date):
        return date.fromisoformat(value[:10])
    if isinstance(col_type, Integer):
        return int(value)
    if isinstance(col_type, Float):
        return float(value)
    return value


def _load_csv_rows(csv_path: Path, table) -> list[dict]:
    rows = []
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for raw_row in reader:
            row = {}
            for col in table.columns:
                if col.name not in raw_row:
                    continue
                row[col.name] = _coerce(raw_row[col.name], col.type)
            rows.append(row)
    return rows


def main() -> None:
    if len(sys.argv) < 2:
        print(f"Usage: python {Path(__file__).name} <thu_muc_chua_csv> [duong_dan_sqlite_dich]", file=sys.stderr)
        sys.exit(1)

    csv_dir = Path(sys.argv[1])
    if not csv_dir.is_dir():
        print(f"Loi: '{csv_dir}' khong phai thu muc.", file=sys.stderr)
        sys.exit(1)

    dest_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("data/app.db")
    if not dest_path.exists():
        print(
            f"Loi: chua co '{dest_path}' - chay app hoac scripts/import_ddinter.py "
            "truoc de tao schema (DATABASE_URL trong .env phai tro toi file SQLite nay).",
            file=sys.stderr,
        )
        sys.exit(1)

    # Build vao 1 file tam truoc, chi thay the app.db that neu import THANH CONG hoan
    # toan - tranh tinh trang lam hong file dang dung giua chung neu 1 CSV bi loi.
    tmp_path = dest_path.with_suffix(".importing.db")
    shutil.copy(str(dest_path), str(tmp_path))
    tmp_engine = create_engine(f"sqlite:///{tmp_path.as_posix()}", connect_args={"check_same_thread": False})

    # File dich co the tao tu lau, truoc nhieu dot them bang/cot moi vao models.py -
    # create_all() chi tao BANG con thieu, khong ALTER bang da ton tai de them COT
    # con thieu, nen phai tu ra soat + ALTER TABLE thu cong truoc khi insert, neu
    # khong INSERT se loi "no such column" cho tung cot moi hon file nay.
    Base.metadata.create_all(bind=tmp_engine)
    _sqlite_ddl_type = {
        Boolean: "BOOLEAN",
        Integer: "INTEGER",
        Float: "REAL",
        Date: "DATE",
        DateTime: "DATETIME",
        JSON: "TEXT",
    }
    with tmp_engine.connect() as conn:
        for table in Base.metadata.sorted_tables:
            existing_cols = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table.name})"))}
            if not existing_cols:
                continue  # bang moi tao bởi create_all() o tren, da du cot
            for col in table.columns:
                if col.name in existing_cols:
                    continue
                ddl_type = next(
                    (ddl for py_type, ddl in _sqlite_ddl_type.items() if isinstance(col.type, py_type)),
                    "TEXT",
                )
                conn.execute(text(f"ALTER TABLE {table.name} ADD COLUMN {col.name} {ddl_type}"))
                print(f"  (da them cot thieu {table.name}.{col.name} kieu {ddl_type})")
        conn.commit()

    try:
        with tmp_engine.begin() as conn:
            for table in Base.metadata.sorted_tables:
                csv_path = csv_dir / f"{table.name}.csv"
                if not csv_path.exists():
                    print(f"  {table.name}: khong co file {csv_path.name}, bo qua")
                    continue

                rows = _load_csv_rows(csv_path, table)
                if not rows:
                    print(f"  {table.name}: file rong, bo qua")
                    continue

                conn.execute(table.delete())
                for i in range(0, len(rows), _CHUNK_SIZE):
                    conn.execute(table.insert(), rows[i : i + _CHUNK_SIZE])
                print(f"  {table.name}: da nhap {len(rows)} dong (ghi de du lieu cu trong bang nay)")
    except Exception:
        tmp_engine.dispose()
        tmp_path.unlink(missing_ok=True)
        raise

    tmp_engine.dispose()  # Windows giu file khoa neu connection pool con mo - phai dong truoc khi move/xoa
    backup_path = dest_path.with_name(f"{dest_path.stem}.bak-{datetime.now():%Y%m%d-%H%M%S}{dest_path.suffix}")
    shutil.move(str(dest_path), str(backup_path))
    shutil.move(str(tmp_path), str(dest_path))
    print(f"\nDa sao luu file cu: {backup_path}")
    print(f"Xong. File SQLite da co du lieu nguoi dung moi nhat: {dest_path}")


if __name__ == "__main__":
    main()
