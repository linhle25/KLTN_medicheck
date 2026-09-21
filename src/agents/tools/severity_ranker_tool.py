import json

from langchain_core.tools import tool

# Thang xếp hạng mức độ nghiêm trọng đã chốt (GD6 mục 7.1) - khớp 4 mức Level thật
# của DDInter 2.0 (Major/Moderate/Minor/Unknown). "chua_phan_loai" xếp thấp nhất
# về độ ưu tiên hiển thị nhưng KHÔNG được coi là "nhẹ" — vẫn cần cảnh báo giới hạn
# dữ liệu riêng (has_unclassified), không tự đoán mức độ thật.
_SEVERITY_ORDER = {"nang": 3, "trung_binh": 2, "nhe": 1, "chua_phan_loai": 0}


@tool
def severity_ranker(interaction_results: list[dict]) -> str:
    """Xếp hạng các kết quả tương tác theo mức độ nghiêm trọng có sẵn.

    Chỉ đọc field muc_do đã có trong CSDL (nhe/trung_binh/nang/chua_phan_loai),
    KHÔNG tự gán mức độ mới cho các cặp chưa xác định.

    Args:
        interaction_results: Kết quả thô từ interaction_lookup

    Returns:
        Chuỗi JSON gồm ranked_results (đã sắp xếp giảm dần theo mức độ),
        has_severe (true nếu có ít nhất 1 tương tác mức "nang"), và
        has_unclassified (true nếu có ít nhất 1 cặp "chua_phan_loai" - cần cảnh
        báo giới hạn dữ liệu riêng, khác với "khong_du_du_lieu").
    """
    ranked_results = sorted(
        interaction_results,
        key=lambda r: _SEVERITY_ORDER.get(r.get("muc_do"), 0),
        reverse=True,
    )
    has_severe = any(r.get("muc_do") == "nang" for r in interaction_results)
    has_unclassified = any(
        r.get("muc_do") == "chua_phan_loai" for r in interaction_results
    )

    return json.dumps(
        {
            "ranked_results": ranked_results,
            "has_severe": has_severe,
            "has_unclassified": has_unclassified,
        },
        ensure_ascii=False,
    )
