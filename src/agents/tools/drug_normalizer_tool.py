import json

from langchain_core.tools import tool
from sqlalchemy import func

from src.db.models import Medication, MedicationAlias
from src.db.session import SessionLocal


@tool
def drug_normalizer(medication_names: list[str]) -> str:
    """Chuẩn hóa tên thuốc: viết tắt/biệt dược -> tên chuẩn (INN) trong CSDL DDInter 2.0.

    Args:
        medication_names: Danh sách tên thuốc thô do người dùng nhập

    Returns:
        Chuỗi JSON danh sách dict, mỗi dict gồm ten_goc, ten_chuan, medication_id và
        khong_du_du_lieu. Nếu không tìm thấy tên trong CSDL/bảng alias, trả về
        ten_chuan=null, medication_id=null, khong_du_du_lieu=true. KHÔNG dùng
        fuzzy/semantic similarity để đoán — tên gần giống có thể là 2 thuốc khác
        nhau (VD "Ferrous fumarate" vs "Ferrous gluconate").
    """
    db = SessionLocal()
    try:
        results = []
        for ten_goc in medication_names:
            key = ten_goc.strip().lower()

            medication = (
                db.query(Medication)
                .filter(func.lower(Medication.ten_chuan_hoa) == key)
                .first()
            )
            if medication is None:
                alias = db.query(MedicationAlias).filter_by(alias=key).first()
                if alias is not None:
                    medication = db.get(Medication, alias.medication_id)

            if medication is None:
                results.append(
                    {
                        "ten_goc": ten_goc,
                        "ten_chuan": None,
                        "medication_id": None,
                        "khong_du_du_lieu": True,
                    }
                )
            else:
                results.append(
                    {
                        "ten_goc": ten_goc,
                        "ten_chuan": medication.ten_chuan_hoa,
                        "medication_id": medication.id,
                        "khong_du_du_lieu": False,
                    }
                )
        return json.dumps(results, ensure_ascii=False)
    finally:
        db.close()
