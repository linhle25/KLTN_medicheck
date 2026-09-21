#!/usr/bin/env python3
"""One-time migration: copy toan bo du lieu tu SQLite (data/app.db) sang Postgres,
dung khi deploy - khong chay lai pipeline import_ddinter.py/translate_*.py (cham,
goi LLM), chi copy thang du lieu da co san trong data/app.db local.

Thu tu bang lay tu Base.metadata.sorted_tables (SQLAlchemy tu topological-sort theo
FK) nen luon dung thu tu insert du them bang moi trong models.py sau nay.

Usage:
  DATABASE_URL_POSTGRES="postgresql://user:pass@host/db?sslmode=require" \
    python scripts/migrate_sqlite_to_postgres.py
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine

from src.db.models import Base

SQLITE_URL = "sqlite:///./data/app.db"
_CHUNK_SIZE = 2000


def main() -> None:
    postgres_url = os.environ.get("DATABASE_URL_POSTGRES")
    if not postgres_url:
        print("Loi: chua set bien moi truong DATABASE_URL_POSTGRES.", file=sys.stderr)
        sys.exit(1)

    src_engine = create_engine(SQLITE_URL)
    dst_engine = create_engine(postgres_url)

    print("Tao bang tren Postgres (theo dung models.py hien tai)...")
    Base.metadata.create_all(bind=dst_engine)

    # SQLite khong ep FK theo mac dinh nen data cu co the co ban ghi mo coi (vd user
    # test da bi xoa nhung con don thuoc/thong bao tro toi id do). Postgres ep FK
    # cung nen phai loc bo truoc khi insert, neu khong se ForeignKeyViolation giua
    # chung va rollback toan bo transaction.
    valid_ids: dict[str, set] = {}

    with src_engine.connect() as src_conn, dst_engine.begin() as dst_conn:
        for table in Base.metadata.sorted_tables:
            rows = [dict(row._mapping) for row in src_conn.execute(table.select())]
            if not rows:
                print(f"  {table.name}: 0 dong, bo qua")
                valid_ids[table.name] = set()
                continue

            fk_checks = [
                (col.name, fk.column.table.name)
                for col in table.columns
                for fk in col.foreign_keys
                if fk.column.table.name in valid_ids
            ]
            kept = []
            skipped = 0
            for row in rows:
                ok = True
                for col_name, parent_table in fk_checks:
                    val = row.get(col_name)
                    if val is not None and val not in valid_ids[parent_table]:
                        ok = False
                        break
                if ok:
                    kept.append(row)
                else:
                    skipped += 1

            for i in range(0, len(kept), _CHUNK_SIZE):
                dst_conn.execute(table.insert(), kept[i : i + _CHUNK_SIZE])

            pk_col = list(table.primary_key.columns)[0].name if table.primary_key.columns else None
            valid_ids[table.name] = {row[pk_col] for row in kept} if pk_col else set()

            msg = f"  {table.name}: da copy {len(kept)} dong"
            if skipped:
                msg += f" (BO QUA {skipped} dong mo coi - FK tro toi ban ghi khong ton tai)"
            print(msg)

    print("Xong. Kiem tra lai bang cach tro DATABASE_URL cua app sang Postgres nay va chay thu.")


if __name__ == "__main__":
    main()
