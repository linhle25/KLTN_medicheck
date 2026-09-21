#!/usr/bin/env python3
"""Đối chiếu interactions.muc_do (CSDL dự án) vs Level gốc DDInter (data/raw/*.db).

Đây KHÔNG phải đánh giá LLM — là kiểm ETL, xác nhận bước import_ddinter.py ánh xạ
mức độ nghiêm trọng đúng (Major->nang, Moderate->trung_binh, Minor->nhe,
Unknown/khác->chua_phan_loai). Dùng làm "sidebar" cho phần factual correctness
trong eval/PLAN.md.

Chạy:
    python scripts/check_severity_mapping.py

Đọc bảng interactions qua SessionLocalFacts (đúng DB mà app dùng - CockroachDB nếu
DATABASE_URL_FACTS được set, ngược lại là DB chính). Chỉ SELECT, không đụng schema.

Exit code 1 nếu có bất kỳ cặp nào LỆCH mức độ (không tính cặp "thiếu trong CSDL" -
đó chỉ nghĩa là file raw tương ứng chưa được nạp / không có mặt ở data/raw/).
"""
import sqlite3
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.models import Interaction
from src.db.session import SessionLocalFacts

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
RAW_DBS = sorted(RAW_DIR.glob("vmec12_ddinter_*.db"))

# Giữ khớp đúng import_ddinter.py::LEVEL_MAP + default.
LEVEL_MAP = {
    "Major": "nang",
    "Moderate": "trung_binh",
    "Minor": "nhe",
    "Unknown": "chua_phan_loai",
}
DEFAULT_MUC_DO = "chua_phan_loai"

MISMATCH_EXAMPLE_LIMIT = 50


def load_app_pairs() -> dict[tuple[str, str], str]:
    """(medication_a_id, medication_b_id) -> muc_do. Quy ước a_id < b_id đã đảm bảo
    lúc import nên không cần chuẩn hoá lại ở đây."""
    db = SessionLocalFacts()
    try:
        rows = db.query(
            Interaction.medication_a_id,
            Interaction.medication_b_id,
            Interaction.muc_do,
        ).all()
    finally:
        db.close()
    return {(a, b): muc_do for a, b, muc_do in rows}


def iter_raw_rows():
    """Sinh (tên file, (id_a, id_b) đã sort, Level) cho từng dòng interactions raw."""
    for db_path in RAW_DBS:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        try:
            for row in conn.execute("SELECT Drug_ID_A, Drug_ID_B, Level FROM interactions"):
                a, b = row["Drug_ID_A"], row["Drug_ID_B"]
                if a > b:
                    a, b = b, a
                yield db_path.name, (a, b), row["Level"]
        finally:
            conn.close()


def main() -> None:
    if not RAW_DBS:
        print("Không tìm thấy data/raw/vmec12_ddinter_*.db — không có gì để đối chiếu.")
        sys.exit(0)

    app_pairs = load_app_pairs()
    print(f"CSDL dự án (facts): {len(app_pairs)} cặp tương tác")
    print(f"File raw có mặt:   {', '.join(p.name for p in RAW_DBS)}\n")

    matched = mismatched = missing_in_app = 0
    seen_raw: set[tuple[str, str]] = set()
    unknown_levels: Counter[str] = Counter()
    examples: list[str] = []

    for fname, pair, level in iter_raw_rows():
        if pair in seen_raw:
            continue
        seen_raw.add(pair)

        if level not in LEVEL_MAP:
            unknown_levels[str(level)] += 1
        expected = LEVEL_MAP.get(level, DEFAULT_MUC_DO)
        actual = app_pairs.get(pair)

        if actual is None:
            missing_in_app += 1
        elif actual == expected:
            matched += 1
        else:
            mismatched += 1
            if len(examples) < MISMATCH_EXAMPLE_LIMIT:
                examples.append(
                    f"  {pair[0]} + {pair[1]}: raw Level={level!r} -> kỳ vọng {expected!r}, "
                    f"CSDL có {actual!r}   ({fname})"
                )

    extra_in_app = len(app_pairs) - (matched + mismatched)

    print("=== KẾT QUẢ ===")
    print(f"  Khớp mức độ:                         {matched}")
    print(f"  LỆCH mức độ:                         {mismatched}")
    print(f"  Có trong raw, thiếu ở CSDL:          {missing_in_app}")
    print(f"  Có ở CSDL, không có trong file raw này: {extra_in_app}")
    if unknown_levels:
        print(f"  Level lạ trong raw (ánh xạ -> {DEFAULT_MUC_DO!r}): {dict(unknown_levels)}")

    if examples:
        print(f"\n=== VÍ DỤ LỆCH (tối đa {MISMATCH_EXAMPLE_LIMIT}) ===")
        print("\n".join(examples))

    print()
    if mismatched:
        print(f"❌ FAIL — {mismatched} cặp lệch mức độ so với DDInter gốc.")
        sys.exit(1)
    print("✅ PASS — không có cặp nào lệch mức độ.")
    sys.exit(0)


if __name__ == "__main__":
    main()
