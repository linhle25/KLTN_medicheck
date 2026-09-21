#!/usr/bin/env python3
"""ETL: nap 61 hoat chat con thieu trong bang medications (Supabase) so voi
merged_ddinter.db - da phat hien tu docs/database-split.md (viec doc lap,
chua lam) va xac nhan lai cu the khi doi chieu file thuoc_final_project.csv
(2026-08-22): 28/61 hoat chat nay bi chinh file san pham tham chieu toi nhung
khong khop duoc medication_id vi chua co trong medications.

CHI dung medications - KHONG dong toi interactions/food_interactions/
disease_interactions (da nam tren CockroachDB tu sau khi tach DB, xem
docs/database-split.md - script nay dung SessionLocal/engine chinh, dung
cho medications, KHONG dung cho 3 bang facts do).

Idempotent (upsert theo Drug_ID = medications.id) - chay lai an toan.

Usage:
  python scripts/import_missing_medications.py
"""
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import insert

from src.db.models import Medication
from src.db.session import SessionLocal

MERGED_DB = Path(r"C:\Users\Quan\Documents\AIthucchien\Projects\Dataaaaaaaaa\merged_ddinter.db")


def main() -> None:
    if not MERGED_DB.exists():
        raise FileNotFoundError(f"Khong tim thay {MERGED_DB}")

    conn = sqlite3.connect(MERGED_DB)
    cur = conn.cursor()
    cur.execute("SELECT Drug_ID, Drug_name, Description FROM drugs")
    all_drugs = cur.fetchall()
    conn.close()
    print(f"Tong so hoat chat trong merged_ddinter.db: {len(all_drugs)}")

    db = SessionLocal()
    try:
        existing_ids = {m.id for m in db.query(Medication.id).all()}
        print(f"Da co san trong Supabase: {len(existing_ids)}")

        missing = [
            {
                "id": did,
                "ten_chuan_hoa": name,
                "mo_ta": desc,
                "nguon_du_lieu": "DDInter 2.0 (merged_ddinter.db)",
            }
            for did, name, desc in all_drugs
            if did not in existing_ids
        ]
        print(f"Con thieu, se them: {len(missing)}")
        for row in missing:
            print(f"  - {row['id']} {row['ten_chuan_hoa']}")

        if missing:
            db.execute(insert(Medication), missing)
            db.commit()
            print(f"=== Da them {len(missing)} hoat chat vao medications ===")
        else:
            print("=== Khong co gi de them ===")
    finally:
        db.close()


if __name__ == "__main__":
    main()
