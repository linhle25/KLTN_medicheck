"""Tra cứu tương tác thuốc-thực phẩm/thuốc-bệnh nền qua CSDL SQL (DDInter 2.0 DFI/DDSI).

Khác interaction_lookup_tool.py (tương tác thuốc-thuốc, chạy TRONG LangGraph agent):
2 hàm này là SQL thuần, gọi TRỰC TIẾP từ src/api/routes.py SAU khi agent chạy xong -
vì đây là tra cứu đơn giản theo 1 hoạt chất (không cần rank/guardrail) và cần
ingredient_to_products (map hoạt chất -> tên biệt dược) vốn chỉ có ở tầng request,
giống hệt cách product_explanations/overview được tính ở rollup_explain.py.

FoodInteraction/DiseaseInteraction nằm trên CockroachDB (facts DB), Medication nằm
trên Supabase (DB chính) - 2 DB vật lý khác nhau nên không JOIN được trong 1 câu SQL
nữa (xem docs/database-split.md). Tra riêng từng DB rồi ghép tên bằng dict
trong Python - giữ nguyên ngữ nghĩa INNER JOIN cũ (bỏ dòng nào không khớp được
medication_id, phòng dữ liệu facts tham chiếu tới medication_id đã xoá/đổi)."""

from sqlalchemy.orm import Session

from src.db.models import DiseaseInteraction, FoodInteraction, Medication
from src.db.session import SessionLocalFacts


def lookup_food_interactions(medication_ids: list[str], db: Session) -> list[dict]:
    if not medication_ids:
        return []
    db_facts = SessionLocalFacts()
    try:
        food_rows = (
            db_facts.query(FoodInteraction)
            .filter(FoodInteraction.medication_id.in_(medication_ids))
            .all()
        )
    finally:
        db_facts.close()
    if not food_rows:
        return []
    names = dict(
        db.query(Medication.id, Medication.ten_chuan_hoa)
        .filter(Medication.id.in_({food.medication_id for food in food_rows}))
        .all()
    )
    return [
        {
            "hoat_chat": names[food.medication_id],
            "medication_id": food.medication_id,
            # Ưu tiên bản dịch tiếng Việt đã cache sẵn (scripts/translate_food_disease_names.py)
            # - rơi về tên gốc tiếng Anh nếu vì lý do gì đó chưa dịch (script chưa chạy qua dòng này).
            "thuc_pham": food.thuc_pham_vi or food.thuc_pham,
            "muc_do": food.muc_do,
            "mo_ta": food.mo_ta,
            "xu_tri": food.xu_tri,
            "mo_ta_dich": food.mo_ta_dich,
            "xu_tri_dich": food.xu_tri_dich,
            "nguon_trich_dan": food.nguon_trich_dan,
        }
        for food in food_rows
        if food.medication_id in names
    ]


def lookup_disease_interactions(
    medication_ids: list[str], db: Session, disease_ids: list[int] | None = None
) -> list[dict]:
    """Tra tương tác thuốc-bệnh, tùy chọn giới hạn theo bệnh nền chuẩn hóa.

    ``disease_ids=None`` giữ hành vi tổng quát cũ để làm fallback cho bệnh nhân
    chưa khai báo bệnh nền và cho các luồng guest/dược sĩ. Danh sách rỗng có
    nghĩa là chủ động lọc ra không kết quả.
    """
    if not medication_ids or disease_ids == []:
        return []
    db_facts = SessionLocalFacts()
    try:
        query = db_facts.query(DiseaseInteraction).filter(
            DiseaseInteraction.medication_id.in_(medication_ids)
        )
        if disease_ids is not None:
            query = query.filter(DiseaseInteraction.disease_id.in_(disease_ids))
        disease_rows = query.all()
    finally:
        db_facts.close()
    if not disease_rows:
        return []
    names = dict(
        db.query(Medication.id, Medication.ten_chuan_hoa)
        .filter(Medication.id.in_({disease.medication_id for disease in disease_rows}))
        .all()
    )
    return [
        {
            "hoat_chat": names[disease.medication_id],
            "medication_id": disease.medication_id,
            "ten_benh": disease.ten_benh_vi or disease.ten_benh,
            "muc_do": disease.muc_do,
            "mo_ta": disease.mo_ta,
            "mo_ta_dich": disease.mo_ta_dich,
            "nguon_trich_dan": disease.nguon_trich_dan,
        }
        for disease in disease_rows
        if disease.medication_id in names
    ]
