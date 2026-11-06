#!/usr/bin/env python3
"""Kiểm tra tính nhất quán của dữ liệu tương tác ngay trên PostgreSQL đang dùng.

Đây KHÔNG phải đánh giá LLM - là kiểm dữ liệu sau ETL (import_ddinter.py). Script đọc
trực tiếp các bảng interactions / food_interactions / disease_interactions qua đúng
session mà ứng dụng dùng (SessionLocal), không cần file SQLite gốc trong data/raw.

Lưu ý giới hạn: CSDL chỉ lưu mức độ ĐÃ ánh xạ (muc_do), không lưu trường Level gốc của
DDInter, nên script không thể tự chứng minh Major -> nang, Moderate -> trung_binh...
Thay vào đó nó kiểm các ràng buộc mà dữ liệu đúng bắt buộc phải thỏa:

  1. muc_do chỉ nhận 4 giá trị hợp lệ, không NULL.
  2. "chưa phân loại" <=> mô tả gốc rỗng/N/A (DDInter không có mô tả cho cặp Unknown);
     cặp đã phân loại luôn có mô tả.
  3. Quy ước medication_a_id < medication_b_id, không có cặp tự thân, không trùng cặp.
  4. Mọi medication_id tham chiếu đều tồn tại trong bảng medications.
  Cảnh báo (không làm fail): mô tả của cặp đã phân loại trùng y hệt cột trích dẫn
  (lỗi nguồn DDInter đã biết, xem eval/harness/build_dataset.py::is_real_description).

Chạy:
    python scripts/check_severity_mapping.py

Chỉ SELECT, không đụng schema. Exit code 1 nếu có vi phạm ràng buộc (1-4).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func, or_  # noqa: E402

from src.db.models import DiseaseInteraction, FoodInteraction, Interaction, Medication  # noqa: E402
from src.db.session import SessionLocal  # noqa: E402

VALID_LEVELS = ("nang", "trung_binh", "nhe", "chua_phan_loai")
_EMPTY = ("", "n/a", "-", "none", "null", "na")


def _is_empty(col):
    """Ô mô tả rỗng theo quy ước DDInter ('N/A', '-') hoặc NULL."""
    return or_(col.is_(None), func.lower(func.trim(col)).in_(_EMPTY))


def main() -> None:
    facts = SessionLocal()
    main_db = SessionLocal()
    failures: list[str] = []
    warnings: list[str] = []

    try:
        med_ids = {r[0] for r in main_db.query(Medication.id).all()}
        total = facts.query(func.count(Interaction.id)).scalar() or 0
        print(f"CSDL PostgreSQL: {total} cặp thuốc–thuốc, {len(med_ids)} hoạt chất\n")

        print("=== Phân bố mức độ ===")
        for model, label in ((Interaction, "thuốc–thuốc"), (FoodInteraction, "thuốc–thực phẩm"), (DiseaseInteraction, "thuốc–bệnh nền")):
            rows = dict(facts.query(model.muc_do, func.count(model.id)).group_by(model.muc_do).all())
            print(f"  {label:18s} " + ", ".join(f"{k}={rows.get(k, 0)}" for k in VALID_LEVELS))
            bad = sum(v for k, v in rows.items() if k not in VALID_LEVELS)
            if bad:
                failures.append(f"{label}: {bad} dòng có muc_do ngoài 4 giá trị hợp lệ hoặc NULL")

        print("\n=== Ràng buộc mô tả <-> mức độ (thuốc–thuốc) ===")
        unclassified_with_desc = (
            facts.query(func.count(Interaction.id))
            .filter(Interaction.muc_do == "chua_phan_loai", ~_is_empty(Interaction.mo_ta))
            .scalar()
        )
        classified_no_desc = (
            facts.query(func.count(Interaction.id))
            .filter(Interaction.muc_do.in_(("nang", "trung_binh", "nhe")), _is_empty(Interaction.mo_ta))
            .scalar()
        )
        print(f"  chưa phân loại nhưng có mô tả:      {unclassified_with_desc}")
        print(f"  đã phân loại nhưng thiếu mô tả:     {classified_no_desc}")
        if unclassified_with_desc:
            failures.append(f"{unclassified_with_desc} cặp 'chưa phân loại' lại có mô tả")
        if classified_no_desc:
            failures.append(f"{classified_no_desc} cặp đã phân loại nhưng thiếu mô tả")

        dup_desc = (
            facts.query(func.count(Interaction.id))
            .filter(
                Interaction.muc_do.in_(("nang", "trung_binh", "nhe")),
                Interaction.mo_ta == Interaction.nguon_trich_dan,
            )
            .scalar()
        )
        print(f"  mô tả trùng cột trích dẫn (lỗi nguồn): {dup_desc}")
        if dup_desc:
            warnings.append(f"{dup_desc} cặp đã phân loại có mô tả trùng y hệt cột trích dẫn (lỗi nguồn DDInter)")

        print("\n=== Quy ước cặp ===")
        wrong_order = facts.query(func.count(Interaction.id)).filter(Interaction.medication_a_id >= Interaction.medication_b_id).scalar()
        dups = (
            facts.query(func.count())
            .select_from(
                facts.query(Interaction.medication_a_id, Interaction.medication_b_id)
                .group_by(Interaction.medication_a_id, Interaction.medication_b_id)
                .having(func.count(Interaction.id) > 1)
                .subquery()
            )
            .scalar()
        )
        print(f"  vi phạm a_id < b_id (gồm tự thân):  {wrong_order}")
        print(f"  cặp bị trùng:                       {dups}")
        if wrong_order:
            failures.append(f"{wrong_order} cặp vi phạm quy ước medication_a_id < medication_b_id")
        if dups:
            failures.append(f"{dups} cặp bị trùng")

        print("\n=== Tham chiếu hoạt chất ===")
        used = {r[0] for r in facts.query(Interaction.medication_a_id).distinct().all()}
        used |= {r[0] for r in facts.query(Interaction.medication_b_id).distinct().all()}
        used |= {r[0] for r in facts.query(FoodInteraction.medication_id).distinct().all()}
        used |= {r[0] for r in facts.query(DiseaseInteraction.medication_id).distinct().all()}
        orphan = used - med_ids
        print(f"  medication_id không có trong medications: {len(orphan)}")
        if orphan:
            failures.append(f"{len(orphan)} medication_id tham chiếu không tồn tại (ví dụ {sorted(orphan)[:3]})")
    finally:
        facts.close()
        main_db.close()

    print()
    for w in warnings:
        print(f"⚠️  CẢNH BÁO: {w}")
    if failures:
        for f in failures:
            print(f"❌ {f}")
        print(f"\n❌ FAIL — {len(failures)} vi phạm ràng buộc.")
        sys.exit(1)
    print("✅ PASS — dữ liệu tương tác thỏa mọi ràng buộc kiểm tra.")
    sys.exit(0)


if __name__ == "__main__":
    main()
