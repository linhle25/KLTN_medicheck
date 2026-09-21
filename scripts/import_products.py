#!/usr/bin/env python3
"""ETL: nap CSDL ten thuoc (biet duoc) -> hoat chat vao Product/ProductIngredient.

Doc data/raw/thuoc_final_project.csv (moi dong = 1 thuoc; cot Hoat_chat_list la JSON
list [{"ten": ..., "ddinter_id": "DDInterXXX" | null}, ...] da duoc pre-match san
ddinter_id) -> voi moi thuoc, tao 1 Product + N ProductIngredient (1 phan tu JSON = 1
hoat chat). ProductIngredient.medication_id duoc gan truc tiep bang ddinter_id neu id
do da co trong bang medications (nap tu import_ddinter.py), nguoc lai de NULL - van luu
ten hoat chat de hien thi thanh phan, nhung khong dung de tra tuong tac (cung nguyen tac
"khong suy doan ngoai CSDL" nhu drug_normalizer_tool.py).

Thay the du lieu cu (thuoc_hoat_chat_clean.csv): sau khi nap xong, xoa het Product nao
co ten_thuoc KHONG con xuat hien trong file CSV moi, de dung nghia "thay the" thay vi
"cong don". Product nao ten_thuoc trung voi du lieu cu se giu nguyen id (upsert), nen
khong lam vo cac PatientMedication.product_id da tro toi no.

PHAI chay sau scripts/import_ddinter.py (can bang medications day du truoc khi so khop).

Usage:
  python scripts/import_products.py
"""
import csv
import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import bindparam, insert, update

from src.db.models import Medication, Product, ProductIngredient
from src.db.session import SessionLocal, init_db

RAW_CSV = Path(__file__).resolve().parent.parent / "data" / "raw" / "thuoc_final_project.csv"

# ~41k dong: lam tung dong 1 (SELECT + INSERT/UPDATE + DELETE + INSERT rieng le) tung
# do mat hang chuc phut vi moi dong la vai round-trip mang toi Supabase (~150k+ tong
# cong). Batch lai theo dung bai hoc rut ra tu migrate_to_cockroach.py (xem
# docs/database-split.md) - it round-trip hon nhieu, cung 1 ket qua cuoi.
_SQL_BATCH = 1000


def load_rows() -> list[dict]:
    if not RAW_CSV.exists():
        raise FileNotFoundError(
            f"Khong tim thay {RAW_CSV}. Copy thuoc_final_project.csv vao data/raw/ truoc khi chay script nay."
        )
    rows = []
    with open(RAW_CSV, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            ten_thuoc = (row.get("Ten_thuoc") or "").strip()
            if not ten_thuoc:
                continue
            rows.append(row)
    return rows


def build_medication_id_set(db) -> set[str]:
    return {m.id for m in db.query(Medication.id).all()}


def delete_stale_products(db, current_names: set[str]) -> int:
    """Xoa Product (+ ProductIngredient con) khong con trong file CSV moi.

    Tinh phan bu o phia Python (khong dung IN/NOT IN voi ~44k gia tri - vuot gioi han
    so bien cua SQLite), roi xoa theo id thanh tung batch nho.
    """
    existing = db.query(Product.id, Product.ten_thuoc).all()
    stale_ids = [pid for pid, ten_thuoc in existing if ten_thuoc not in current_names]
    if not stale_ids:
        return 0

    for i in range(0, len(stale_ids), _SQL_BATCH):
        batch = stale_ids[i : i + _SQL_BATCH]
        db.query(ProductIngredient).filter(ProductIngredient.product_id.in_(batch)).delete(
            synchronize_session=False
        )
        db.query(Product).filter(Product.id.in_(batch)).delete(synchronize_session=False)
    return len(stale_ids)


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        print("Doc CSV...")
        rows = load_rows()
        print(f"  -> {len(rows)} thuoc")

        print("Nap medication id set de so khop...")
        medication_ids = build_medication_id_set(db)
        print(f"  -> {len(medication_ids)} hoat chat trong CSDL")

        print("Nap product hien co (de biet dong nao moi, dong nao thuc su can cap nhat)...")
        existing_ids: dict[str, str] = {}
        existing_is_duoc_lieu: dict[str, bool] = {}
        for ten_thuoc, pid, is_duoc_lieu in db.query(
            Product.ten_thuoc, Product.id, Product.is_duoc_lieu
        ).all():
            existing_ids[ten_thuoc] = pid
            existing_is_duoc_lieu[ten_thuoc] = is_duoc_lieu
        print(f"  -> {len(existing_ids)} product da co san")

        # Gom tat ca thay doi trong bo nho truoc, chi ghi xuong DB theo batch - thay
        # cho cach cu (1 dong CSV = vai round-trip mang rieng le, ~41k dong -> hang
        # chuc phut). Ket qua cuoi cung giong het ban cu (upsert theo ten_thuoc, giu
        # nguyen id cu, ghi de toan bo ingredient theo CSV hien tai).
        new_products: list[dict] = []
        update_products: list[dict] = []
        all_ingredients: list[dict] = []
        current_names: set[str] = set()
        total_matched, total_unmatched = 0, 0
        products_with_data = 0

        for row in rows:
            ten_thuoc = row["Ten_thuoc"].strip()
            current_names.add(ten_thuoc)
            is_duoc_lieu = (row.get("Is_Duoc_Lieu") or "").strip() == "True"
            try:
                ingredients = json.loads(row.get("Hoat_chat_list") or "[]")
            except json.JSONDecodeError:
                ingredients = []

            product_id = existing_ids.get(ten_thuoc)
            if product_id is None:
                product_id = str(uuid.uuid4())
                existing_ids[ten_thuoc] = product_id
                new_products.append(
                    {
                        "id": product_id,
                        "ten_thuoc": ten_thuoc,
                        "is_duoc_lieu": is_duoc_lieu,
                        "nguon_du_lieu": "VMEC12 crawl",
                    }
                )
            elif existing_is_duoc_lieu.get(ten_thuoc) != is_duoc_lieu:
                # Chi update khi THUC SU khac gia tri hien co - tranh executemany bulk
                # UPDATE hang chuc nghin dong khong can thiet (da gap treo that khi chay
                # UPDATE hang loat qua connection pooler cua Supabase, xem ghi chu lenh
                # UPDATE ben duoi).
                update_products.append({"pid": product_id, "is_duoc_lieu": is_duoc_lieu})

            matched, unmatched = 0, 0
            seen: set[str] = set()
            for ing in ingredients:
                ten = (ing.get("ten") or "").strip()
                if not ten or ten.lower() in seen:
                    continue
                seen.add(ten.lower())

                ddinter_id = ing.get("ddinter_id")
                medication_id = ddinter_id if ddinter_id in medication_ids else None
                if medication_id:
                    matched += 1
                else:
                    unmatched += 1

                all_ingredients.append(
                    {
                        "id": str(uuid.uuid4()),
                        "product_id": product_id,
                        "ten_hoat_chat_raw": ten,
                        "ten_hoat_chat_clean": ten,
                        "medication_id": medication_id,
                    }
                )
            total_matched += matched
            total_unmatched += unmatched
            if matched > 0:
                products_with_data += 1

        print(f"  -> {len(new_products)} product moi, {len(update_products)} product can cap nhat")

        print("Ghi product moi...")
        for i in range(0, len(new_products), _SQL_BATCH):
            db.execute(insert(Product), new_products[i : i + _SQL_BATCH])
            db.commit()
            print(f"  ... {min(i + _SQL_BATCH, len(new_products))}/{len(new_products)}")

        print("Cap nhat product cu (is_duoc_lieu)...")
        # Core-level update (khong phai update(Product) o tang ORM) - tranh bulk-update
        # cua ORM doi tham so phai dat ten dung "id" (khoa chinh) thay vi "pid".
        update_stmt = (
            Product.__table__.update()
            .where(Product.__table__.c.id == bindparam("pid"))
            .values(is_duoc_lieu=bindparam("is_duoc_lieu"))
        )
        for i in range(0, len(update_products), _SQL_BATCH):
            db.execute(update_stmt, update_products[i : i + _SQL_BATCH])
            db.commit()
            print(f"  ... {min(i + _SQL_BATCH, len(update_products))}/{len(update_products)}")

        print("Xoa toan bo ingredient cu (se nap lai het theo CSV hien tai)...")
        # 1 lenh DELETE khong dieu kien, khong phai 45 lenh DELETE...IN theo batch id (moi
        # lenh co the phai full-scan neu product_id khong co index) - nhanh hon nhieu, va
        # dung ngu nghia vi toan bo all_ingredients sap ghi lai tu dau cho MOI product hien
        # co; product nao la "stale" se bi delete_stale_products xoa het (ca Product lan
        # ProductIngredient con lai, neu co) ngay sau day.
        db.query(ProductIngredient).delete(synchronize_session=False)
        db.commit()

        print("Ghi ingredient moi...")
        for i in range(0, len(all_ingredients), _SQL_BATCH):
            db.execute(insert(ProductIngredient), all_ingredients[i : i + _SQL_BATCH])
            db.commit()
            print(f"  ... {min(i + _SQL_BATCH, len(all_ingredients))}/{len(all_ingredients)}")

        print("Xoa product cu khong con trong file moi...")
        deleted = delete_stale_products(db, current_names)
        db.commit()
        print(f"  -> da xoa {deleted} product cu")

        print(
            f"=== Tong: {len(rows)} thuoc ({products_with_data} co >=1 hoat chat "
            f"khop DDInter), {total_matched} dong hoat chat khop, {total_unmatched} khong khop ==="
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
