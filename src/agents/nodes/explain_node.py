from src.agents.state import MedCheckState

_UNCLASSIFIED_MESSAGE = (
    "DDInter chưa phân loại mức độ nghiêm trọng cho cặp thuốc này — cần thận "
    "trọng, hãy hỏi dược sĩ/bác sĩ trước khi tiếp tục dùng đồng thời."
)

_NO_DATA_MESSAGE = (
    "Chưa có dữ liệu trong CSDL DDInter 2.0 để đánh giá tương tác giữa hai thuốc "
    "này. Vui lòng hỏi dược sĩ/bác sĩ để được tư vấn cụ thể."
)


def _base_fields(result: dict) -> dict:
    """Các field dùng lại cho mọi nhánh — kèm xu_tri/thay_the/mo_ta chỉ để pharmacist
    xem sau (mo_ta là mô tả khoa học nguyên văn từ CSDL DDInter 2.0, KHÔNG qua AI
    diễn giải lại).

    mo_ta_dich/xu_tri_dich (bản dịch tiếng Việt nguyên văn) đã được dịch sẵn 1 lần
    và lưu trong CSDL (interaction_lookup_tool đọc thẳng từ cột interactions.mo_ta_dich/
    xu_tri_dich - xem scripts/translate_interaction_texts.py), KHÔNG còn dịch lại qua
    LLM ở node này - chỉ pass-through. NULL nếu script dịch chưa chạy qua cặp này."""
    return {
        "thuoc_a": result.get("thuoc_a"),
        "thuoc_b": result.get("thuoc_b"),
        "medication_a_id": result.get("medication_a_id"),
        "medication_b_id": result.get("medication_b_id"),
        "xu_tri": result.get("xu_tri"),
        "thay_the_a": result.get("thay_the_a"),
        "thay_the_b": result.get("thay_the_b"),
        "mo_ta": result.get("mo_ta"),
        "mo_ta_dich": result.get("mo_ta_dich"),
        "xu_tri_dich": result.get("xu_tri_dich"),
    }


def _explain_one(result: dict, audience: str) -> dict:
    """KHÔNG còn gọi LLM ở cấp hoạt chất - giai_thich cấp này chưa từng hiển thị ở
    bất kỳ luồng nào trong app (chỉ dùng làm dữ liệu gốc để dựng đồ thị + rollup lên
    cấp thuốc, xem rollup_explain.py::_explain_product_edge đọc thẳng mo_ta/xu_tri
    bên dưới thay vì đọc giai_thich cấp này như trước). Node chỉ còn giữ các field
    cấu trúc (mã hoạt chất, mức độ, nguồn trích dẫn, mô tả gốc...) mà đồ thị và cấp
    thuốc vẫn cần - cắt hẳn 1 lượt gọi LLM cho MỖI cặp hoạt chất."""
    if result.get("khong_du_du_lieu"):
        return {
            **_base_fields(result),
            "giai_thich": _NO_DATA_MESSAGE,
            "giai_thich_duoc_si": _NO_DATA_MESSAGE if audience == "pharmacist" else None,
            "nguon_trich_dan": "Không tìm thấy trong CSDL DDInter 2.0",
        }

    if result.get("muc_do") == "chua_phan_loai":
        return {
            **_base_fields(result),
            "muc_do": result.get("muc_do"),
            "giai_thich": _UNCLASSIFIED_MESSAGE,
            "giai_thich_duoc_si": _UNCLASSIFIED_MESSAGE if audience == "pharmacist" else None,
            "nguon_trich_dan": result.get("nguon_trich_dan"),
        }

    return {
        **_base_fields(result),
        "muc_do": result.get("muc_do"),
        "nguon_trich_dan": result.get("nguon_trich_dan"),
    }


async def explain_node(state: MedCheckState) -> dict:
    """Gắn field cấu trúc cho từng kết quả tương tác (cấp hoạt chất) - không còn
    sinh giai_thich bằng LLM ở cấp này (xem _explain_one). Vẫn giữ hàm async để
    khớp chữ ký node LangGraph hiện có, dù bên trong không còn await nào."""
    audience = state.get("audience", "patient")
    ranked_results = state.get("ranked_results", [])
    explanations = [_explain_one(result, audience) for result in ranked_results]
    return {"explanations": explanations}
