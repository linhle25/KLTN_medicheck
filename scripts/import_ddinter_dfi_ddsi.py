#!/usr/bin/env python3
"""ETL: nap du lieu tuong tac thuoc-thuc pham (DFI) va thuoc-benh nen (DDSI) tu
DDInter 2.0 vao CSDL du an (FoodInteraction/DiseaseInteraction, src/db/models.py).

Doc data/raw/ddinter2_dfi_processed.json va ddinter2_ddsi_processed.json (da xac
minh cung dung drug_id "DDInterNNNN" nhu bang medications hien co - khong can chuan
hoa ten lai). Bo qua (dem lai) cac dong co drug_id chua co trong CSDL cuc bo (vi du
CSDL chi import 1 phan cac file vmec12_ddinter_*.db). Idempotent nho UniqueConstraint
(medication_id, thuc_pham)/(medication_id, ten_benh) - chay lap lai an toan.

Usage:
  python scripts/import_ddinter_dfi_ddsi.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.models import Disease, DiseaseInteraction, FoodInteraction, Medication
from src.db.session import SessionLocal, init_db

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
DFI_PATH = RAW_DIR / "ddinter2_dfi_processed.json"
DDSI_PATH = RAW_DIR / "ddinter2_ddsi_processed.json"

# Muc do nghiem trong DDInter -> quy uoc du an (dung chung LEVEL_MAP voi import_ddinter.py)
LEVEL_MAP = {
    "Major": "nang",
    "Moderate": "trung_binh",
    "Minor": "nhe",
    "Unknown": "chua_phan_loai",
}


def _load(path: Path) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Khong tim thay {path}.")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)["interactions"]


def import_food_interactions(db) -> tuple[int, int, int]:
    rows = _load(DFI_PATH)
    inserted = skipped_existing = skipped_no_medication = 0
    # Nạp trước các cặp (medication_id, thuc_pham) đã có + theo dõi luôn các cặp MỚI
    # thêm trong lần chạy này bằng 1 set Python - session dùng autoflush=False (xem
    # src/db/session.py) nên query DB giữa chừng KHÔNG thấy được các dòng vừa add()
    # nhưng chưa commit, dễ insert trùng nếu chỉ dựa vào query. Đồng thời JSON nguồn
    # tự nó cũng có thể có (medication_id, thuc_pham) trùng lặp giữa các dòng khác nhau.
    seen: set[tuple[str, str]] = {
        (m_id, food) for (m_id, food) in db.query(FoodInteraction.medication_id, FoodInteraction.thuc_pham)
    }

    for row in rows:
        medication_id = row["drug_id"]
        if db.get(Medication, medication_id) is None:
            skipped_no_medication += 1
            continue

        key = (medication_id, row["food_name"])
        if key in seen:
            skipped_existing += 1
            continue
        seen.add(key)

        db.add(
            FoodInteraction(
                medication_id=medication_id,
                thuc_pham=row["food_name"],
                muc_do=LEVEL_MAP.get(row["severity"], "chua_phan_loai"),
                mo_ta=row.get("interaction"),
                xu_tri=row.get("management"),
                nguon_trich_dan=row.get("references"),
            )
        )
        inserted += 1
        if inserted % 200 == 0:
            db.commit()

    db.commit()
    return inserted, skipped_existing, skipped_no_medication


def import_disease_interactions(db) -> tuple[int, int, int]:
    rows = _load(DDSI_PATH)
    inserted = skipped_existing = skipped_no_medication = 0
    existing: dict[tuple[str, str], DiseaseInteraction] = {
        (interaction.medication_id, interaction.ten_benh): interaction
        for interaction in db.query(DiseaseInteraction).all()
    }
    diseases_by_name: dict[str, Disease] = {
        disease.ten_benh.strip().lower(): disease for disease in db.query(Disease).all()
    }

    for row in rows:
        medication_id = row["drug_id"]
        if db.get(Medication, medication_id) is None:
            skipped_no_medication += 1
            continue

        disease_name = row["disease_name"].strip()
        disease_key = disease_name.lower()
        disease = diseases_by_name.get(disease_key)
        if disease is None:
            disease = Disease(ten_benh=disease_name)
            diseases_by_name[disease_key] = disease
            db.add(disease)
            db.flush()

        key = (medication_id, row["disease_name"])
        if key in existing:
            if existing[key].disease_id is None:
                existing[key].disease_id = disease.id
            skipped_existing += 1
            continue

        interaction = DiseaseInteraction(
            medication_id=medication_id,
            disease_id=disease.id,
            ten_benh=row["disease_name"],
            muc_do=LEVEL_MAP.get(row["severity"], "chua_phan_loai"),
            mo_ta=row.get("interaction"),
            nguon_trich_dan=row.get("references"),
        )
        existing[key] = interaction
        db.add(interaction)
        inserted += 1
        if inserted % 1000 == 0:
            db.commit()

    db.commit()
    return inserted, skipped_existing, skipped_no_medication


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        print("=== Nap tuong tac thuoc-thuc pham (DFI) ===")
        inserted, skipped_existing, skipped_no_med = import_food_interactions(db)
        print(
            f"  -> da them {inserted}, bo qua (da ton tai) {skipped_existing}, "
            f"bo qua (hoat chat chua co trong CSDL) {skipped_no_med}"
        )

        print("=== Nap tuong tac thuoc-benh nen (DDSI) ===")
        inserted, skipped_existing, skipped_no_med = import_disease_interactions(db)
        print(
            f"  -> da them {inserted}, bo qua (da ton tai) {skipped_existing}, "
            f"bo qua (hoat chat chua co trong CSDL) {skipped_no_med}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
