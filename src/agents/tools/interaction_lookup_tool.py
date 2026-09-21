import itertools
import json

from langchain_core.tools import tool

from src.db.models import Interaction, Medication
from src.db.session import SessionLocal, SessionLocalFacts


@tool
def interaction_lookup(medication_ids: list[str]) -> str:
    """Tra cứu tương tác thuốc giữa các thuốc trong danh sách qua CSDL SQL (DDInter 2.0).

    Tra cứu chính xác theo khóa (medication_a_id, medication_b_id) trong bảng
    interactions, KHÔNG dùng semantic similarity/ChromaDB để suy đoán tương tác
    gần giống.

    Args:
        medication_ids: Danh sách medication_id (Drug_ID) đã chuẩn hóa qua drug_normalizer

    Returns:
        Chuỗi JSON danh sách các cặp tương tác tìm thấy kèm nguồn trích dẫn.
        Nếu không tìm thấy, trả về "khong_du_du_lieu": true cho cặp đó.
    """
    db = SessionLocal()
    db_facts = SessionLocalFacts()
    try:
        results = []
        for id_1, id_2 in itertools.combinations(medication_ids, 2):
            id_a, id_b = sorted([id_1, id_2])
            med_a = db.get(Medication, id_a)
            med_b = db.get(Medication, id_b)
            ten_a = med_a.ten_chuan_hoa if med_a else id_a
            ten_b = med_b.ten_chuan_hoa if med_b else id_b

            interaction = (
                db_facts.query(Interaction)
                .filter_by(medication_a_id=id_a, medication_b_id=id_b)
                .first()
            )

            if interaction is None:
                results.append(
                    {
                        "thuoc_a": ten_a,
                        "thuoc_b": ten_b,
                        "medication_a_id": id_a,
                        "medication_b_id": id_b,
                        "khong_du_du_lieu": True,
                    }
                )
            else:
                results.append(
                    {
                        "thuoc_a": ten_a,
                        "thuoc_b": ten_b,
                        "medication_a_id": id_a,
                        "medication_b_id": id_b,
                        "mo_ta": interaction.mo_ta,
                        "muc_do": interaction.muc_do,
                        "nguon_trich_dan": interaction.nguon_trich_dan,
                        "xu_tri": interaction.xu_tri,
                        "mo_ta_dich": interaction.mo_ta_dich,
                        "xu_tri_dich": interaction.xu_tri_dich,
                        "thay_the_a": interaction.thay_the_a,
                        "thay_the_b": interaction.thay_the_b,
                        "khong_du_du_lieu": False,
                    }
                )
        return json.dumps(results, ensure_ascii=False)
    finally:
        db.close()
        db_facts.close()
