"""Backfill cột interaction_checks.thuoc_da_kiem_tra cho các check tạo TRƯỚC khi
cột này tồn tại - trích lại tên thuốc từ ket_qua_json (xem
src/api/routes.py::_checked_drug_names) rồi lưu vào cột nhẹ, để list_patient_checks
(trang "Lịch sử") không còn phải SELECT cột ket_qua_json nặng (thực đo trung bình
~260KB/dòng) chỉ để hiển thị vài tên thuốc trong danh sách.

Idempotent - chỉ cập nhật các dòng có thuoc_da_kiem_tra IS NULL, chạy lại nhiều
lần không sao. Chạy từ thư mục gốc dự án:
    python scripts/backfill_checked_drug_names.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.api.routes import _checked_drug_names
from src.db.models import InteractionCheck
from src.db.session import SessionLocal, init_db


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        rows = db.query(InteractionCheck).filter(InteractionCheck.thuoc_da_kiem_tra.is_(None)).all()
        print(f"So dong can backfill: {len(rows)}")
        for row in rows:
            row.thuoc_da_kiem_tra = _checked_drug_names(row.ket_qua_json)
        db.commit()
        print("Da backfill xong.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
