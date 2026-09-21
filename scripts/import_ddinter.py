#!/usr/bin/env python3
"""ETL: nap du lieu that DDInter 2.0 vao CSDL du an (medications + interactions).

Doc tat ca data/raw/vmec12_ddinter_*.db (moi file = 1 nhom ATC, bang drugs/interactions
cung schema) -> ghi vao Medication/Interaction/MedicationAlias (src/db/models.py) qua
session cua du an. Cung mot hoat chat/cap thuoc co the xuat hien o nhieu file (nhom) khac
nhau - import_medications (get-or-update theo Drug_ID) va import_interactions (bo qua neu
cap (a,b) da ton tai) da an toan de dedup xuyen nhieu file, chi can goi lap tuan tu.

Thay the hoan toan seed mo phong cu (data/seed/interactions_seed.json).

Usage:
  python scripts/import_ddinter.py
"""
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.models import Interaction, Medication, MedicationAlias
from src.db.session import SessionLocal, init_db

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
# Uu tien cac file da chia nhom (_B/_D/_P/_V&R...); fallback ve file don le cu neu chua
# co file nhom nao (giu script chay duoc tren checkout cu chua co du lieu moi).
RAW_DBS = sorted(RAW_DIR.glob("vmec12_ddinter_*.db")) or [RAW_DIR / "vmec12_ddinter.db"]

# Muc do nghiem trong DDInter -> quy uoc du an (da chot o GD6 muc 7.1)
LEVEL_MAP = {
    "Major": "nang",
    "Moderate": "trung_binh",
    "Minor": "nhe",
    "Unknown": "chua_phan_loai",
}

# Alias/biet duoc pho bien -> ten chuan DDInter da xac minh ton tai that trong CSDL
# (khong suy doan ngoai CSDL - moi target da duoc tra cuu va xac nhan co trong bang drugs)
ALIASES: dict[str, str] = {
    "aspirin": "Acetylsalicylic acid",
    "asp": "Acetylsalicylic acid",
    "paracetamol": "Acetaminophen",
    "panadol": "Acetaminophen",
    "tylenol": "Acetaminophen",
    "glucophage": "Metformin",
    "coumadin": "Warfarin",
    "advil": "Ibuprofen",
    "ruou": "Ethanol",
    "rượu": "Ethanol",
    "bia": "Ethanol",
    "ruou/bia": "Ethanol",
    "rượu/bia": "Ethanol",
}


def connect_raw(db_path: Path) -> sqlite3.Connection:
    if not db_path.exists():
        raise FileNotFoundError(
            f"Khong tim thay {db_path}. Copy cac file vmec12_ddinter_*.db vao data/raw/ truoc khi chay script nay."
        )
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def import_medications(raw_conn: sqlite3.Connection, db) -> dict[str, str]:
    """Nap bang drugs -> medications. Tra ve map Drug_name(lower) -> Drug_ID de tra alias."""
    name_to_id: dict[str, str] = {}
    rows = raw_conn.execute("SELECT Drug_ID, Drug_name, Description FROM drugs").fetchall()
    for row in rows:
        name_to_id[row["Drug_name"].strip().lower()] = row["Drug_ID"]
        existing = db.get(Medication, row["Drug_ID"])
        if existing is None:
            db.add(
                Medication(
                    id=row["Drug_ID"],
                    ten_chuan_hoa=row["Drug_name"],
                    mo_ta=row["Description"],
                    nguon_du_lieu="DDInter 2.0",
                )
            )
        else:
            existing.ten_chuan_hoa = row["Drug_name"]
            existing.mo_ta = row["Description"]
            existing.nguon_du_lieu = "DDInter 2.0"
    db.commit()
    return name_to_id


def import_aliases(db, name_to_id: dict[str, str]) -> None:
    for alias, target_name in ALIASES.items():
        medication_id = name_to_id.get(target_name.strip().lower())
        if medication_id is None:
            print(f"  [bo qua] alias '{alias}' -> '{target_name}' khong tim thay trong CSDL that")
            continue
        existing = db.query(MedicationAlias).filter_by(alias=alias).first()
        if existing is None:
            db.add(MedicationAlias(alias=alias, medication_id=medication_id))
        else:
            existing.medication_id = medication_id
    db.commit()


def import_interactions(raw_conn: sqlite3.Connection, db) -> tuple[int, int]:
    rows = raw_conn.execute(
        "SELECT Drug_ID_A, Drug_ID_B, Level, Interaction, Management, "
        "References_info, Alt_for_A, Alt_for_B FROM interactions"
    ).fetchall()

    inserted, skipped = 0, 0
    for row in rows:
        id_a, id_b = row["Drug_ID_A"], row["Drug_ID_B"]
        alt_a, alt_b = row["Alt_for_A"], row["Alt_for_B"]
        # Chuan hoa thu tu: medication_a_id < medication_b_id (so sanh chuoi) -
        # khi swap phai swap luon Alt_for tuong ung de dung vai tro A/B.
        if id_a > id_b:
            id_a, id_b = id_b, id_a
            alt_a, alt_b = alt_b, alt_a

        existing = (
            db.query(Interaction)
            .filter_by(medication_a_id=id_a, medication_b_id=id_b)
            .first()
        )
        if existing is not None:
            skipped += 1
            continue

        db.add(
            Interaction(
                medication_a_id=id_a,
                medication_b_id=id_b,
                muc_do=LEVEL_MAP.get(row["Level"], "chua_phan_loai"),
                mo_ta=row["Interaction"],
                xu_tri=row["Management"],
                nguon_trich_dan=row["References_info"],
                thay_the_a=alt_a,
                thay_the_b=alt_b,
            )
        )
        inserted += 1
        if inserted % 1000 == 0:
            db.commit()

    db.commit()
    return inserted, skipped


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        name_to_id: dict[str, str] = {}
        total_inserted, total_skipped = 0, 0

        for db_path in RAW_DBS:
            print(f"=== {db_path.name} ===")
            raw_conn = connect_raw(db_path)
            try:
                print("Nap medications...")
                file_name_to_id = import_medications(raw_conn, db)
                print(f"  -> {len(file_name_to_id)} thuoc")
                name_to_id.update(file_name_to_id)

                print("Nap interactions...")
                inserted, skipped = import_interactions(raw_conn, db)
                print(f"  -> da them {inserted}, bo qua (da ton tai) {skipped}")
                total_inserted += inserted
                total_skipped += skipped
            finally:
                raw_conn.close()

        print("Nap alias...")
        import_aliases(db, name_to_id)

        print(
            f"=== Tong: {len(name_to_id)} hoat chat, da them {total_inserted} tuong tac, "
            f"bo qua (da ton tai) {total_skipped} ==="
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
