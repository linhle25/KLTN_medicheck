#!/usr/bin/env python3
"""Đồng bộ dữ liệu Postgres (Supabase, DATABASE_URL) + CockroachDB (facts,
DATABASE_URL_FACTS) hiện tại về 1 file SQLite local, để chạy app hoàn toàn local
(dev, hoặc khi cloud DB không truy cập được / hết quota).

Bảng interactions/food_interactions/disease_interactions được đọc từ
DATABASE_URL_FACTS khi biến này có giá trị - đúng theo cách production đang thực
sự đọc 3 bảng đó (xem FACTS_TABLE_NAMES + SessionLocalFacts trong
src/db/session.py). Trước đây script này đọc cả 3 bảng facts từ DATABASE_URL
(Supabase) như mọi bảng khác - sau khi tách CockroachDB, Supabase chỉ còn giữ bản
cũ của 3 bảng đó (chưa dọn), nên bản SQLite sinh ra bị sai/thiếu đúng phần dữ liệu
tương tác thuốc mà không báo lỗi gì. Các bảng còn lại vẫn đọc từ DATABASE_URL như
cũ. Nếu DATABASE_URL_FACTS để trống, script in cảnh báo và dùng lại DATABASE_URL
cho facts (giống hệt fallback production dùng khi chưa tách CockroachDB).

Tự động sao lưu file SQLite đích nếu đã tồn tại (đổi tên kèm timestamp) trước khi
ghi đè - không xóa mất dữ liệu local cũ.

Usage (chạy từ thư mục gốc dự án, .env đã có DATABASE_URL/DATABASE_URL_FACTS trỏ
tới Supabase/CockroachDB thật):
  python scripts/migrate_postgres_to_sqlite.py [duong_dan_file_sqlite_dich]

Mặc định file đích: data/app.db
"""
import shutil
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine

from src.config import get_settings
from src.db.models import Base
from src.db.session import FACTS_TABLE_NAMES

_CHUNK_SIZE = 2000


def _check_connection(engine, label: str) -> None:
    print(f"Kiem tra ket noi {label}...")
    try:
        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
    except Exception as e:
        print(f"Khong ket noi duoc {label}: {e}", file=sys.stderr)
        print("DB co the dang bi chan (het quota) - thu lai sau hoac nang cap goi.", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    settings = get_settings()
    main_url = settings.database_url
    facts_url = settings.database_url_facts
    if not main_url.startswith("postgresql"):
        print(
            f"Loi: DATABASE_URL trong .env dang la '{main_url}', khong phai Postgres. "
            "Script nay dung de keo du lieu TU Postgres/CockroachDB VE SQLite - kiem tra lai .env.",
            file=sys.stderr,
        )
        sys.exit(1)

    dest_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/app.db")

    print(f"Ket noi DB chinh (Supabase): {main_url.split('@')[-1]}")
    main_engine = create_engine(main_url)

    if facts_url:
        print(f"Ket noi DB facts (CockroachDB): {facts_url.split('@')[-1]}")
        facts_engine = create_engine(facts_url)
    else:
        print(
            "CANH BAO: DATABASE_URL_FACTS dang de trong - bang interactions/"
            "food_interactions/disease_interactions se duoc doc tu DATABASE_URL "
            "(Supabase), co the la ban cu neu du lieu facts da tach sang CockroachDB.",
            file=sys.stderr,
        )
        facts_engine = main_engine

    # QUAN TRONG: kiem tra ket noi truoc, truoc khi dung toi file dich - neu khong
    # se sao luu/ghi de file SQLite cu roi moi phat hien khong ket noi duoc, khien
    # nguoi dung mat ca file cu lan file moi (da tung xay ra khi test).
    _check_connection(main_engine, "DB chinh (Supabase)")
    if facts_engine is not main_engine:
        _check_connection(facts_engine, "DB facts (CockroachDB)")

    if dest_path.exists():
        backup_path = dest_path.with_name(
            f"{dest_path.stem}.bak-{datetime.now():%Y%m%d-%H%M%S}{dest_path.suffix}"
        )
        shutil.move(str(dest_path), str(backup_path))
        print(f"Da sao luu file cu: {dest_path} -> {backup_path}")

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    sqlite_url = f"sqlite:///{dest_path.as_posix()}"
    dst_engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

    print("Tao bang tren SQLite (theo dung models.py hien tai)...")
    Base.metadata.create_all(bind=dst_engine)

    with dst_engine.begin() as dst_conn:
        for table in Base.metadata.sorted_tables:
            table_src_engine = facts_engine if table.name in FACTS_TABLE_NAMES else main_engine
            source_label = "facts/CockroachDB" if table_src_engine is facts_engine else "main/Supabase"
            # In truoc khi query - bang nhieu cot text dai (vd "interactions") co the
            # mat vai chuc giay de tai ve, khong in gi trong luc do se trong nhu treo.
            print(f"  {table.name}: dang doc tu {source_label}...", end="", flush=True)
            with table_src_engine.connect() as src_conn:
                rows = [dict(row._mapping) for row in src_conn.execute(table.select())]
            if not rows:
                print(f"\r  {table.name}: 0 dong, bo qua" + " " * 20)
                continue
            for i in range(0, len(rows), _CHUNK_SIZE):
                dst_conn.execute(table.insert(), rows[i : i + _CHUNK_SIZE])
            print(f"\r  {table.name}: da copy {len(rows)} dong ({source_label})" + " " * 20)

    print(f"\nXong. File SQLite moi: {dest_path}")
    print("De chay app voi file nay, sua .env thanh:")
    print(f"  DATABASE_URL=sqlite:///./{dest_path.as_posix()}")
    print("  DATABASE_URL_FACTS=   (de trong - gio da gop chung vao 1 file SQLite)")


if __name__ == "__main__":
    main()
