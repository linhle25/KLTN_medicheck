"""Gộp (rollup) các dòng tương tác hoạt chất-thực phẩm/hoạt chất-bệnh nền (DDInter
2.0 DFI/DDSI) lên cấp THUỐC (biệt dược) rồi gọi LLM sinh 1 đoạn giải thích RIÊNG cho
từng cạnh thuốc-thực phẩm/thuốc-bệnh nền - cùng cơ chế gộp như build_product_edges
(src/services/rollup_explain.py) áp dụng cho thuốc-thuốc: nếu 1 thuốc có nhiều hoạt
chất cùng kỵ 1 loại thực phẩm/bệnh nền, gộp thành 1 thẻ duy nhất thay vì hiện riêng
từng hoạt chất.

Gọi từ src/api/routes.py sau khi có kết quả lookup_food_interactions/
lookup_disease_interactions (src/services/food_disease_lookup.py)."""

import asyncio

from src.agents.nodes.guardrail_node import filter_banned_language
from src.db.models import FoodDiseaseExplanationCache
from src.services.explanation_cache import lookup_cached, save_cached
from src.services.llm import ainvoke_llm
from src.services.rollup_explain import _severity_rank, _tone_fields, literal_merge_translate
from src.services.tone_prompt import SAFETY_RULES, strip_management_sentences

_MAX_TEXT_CHARS = 1500

# Chỉ đưa tối đa từng này dòng hoạt chất (đã sắp nặng nhất trước) vào prompt sinh
# giải thích cấp thuốc, để tránh phình prompt khi 1 thuốc phối hợp có nhiều hoạt
# chất - giống hệt _MAX_CONTRIBUTING_PAIRS ở rollup_explain.py.
_MAX_CONTRIBUTING_ROWS = 5


def _truncate(text: str | None, max_chars: int) -> str:
    if not text:
        return ""
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "... (đã rút gọn)"


# DiseaseInteraction (DDSI) không có cột xu_tri riêng (nguồn DDInter cho bệnh nền
# không có trường Management) - câu mang tính xử trí đôi khi bị DDInter trộn thẳng
# vào Interaction/mo_ta (vd "Therapy should be suspended if..."). Đưa nguyên mo_ta
# này vào prompt sẽ khiến LLM "trung thành với nguồn" nhưng vô tình lộ xử trí -
# xác nhận qua case dis-nang-006/dis-nhe-019/dis-trung_binh-018 (eval/results/
# report.md Finding 15). Lọc câu ở tầng dữ liệu TRƯỚC khi đưa vào prompt, thay vì
# chỉ dặn LLM đừng dùng - không sửa mo_ta gốc trong DB, chỉ lọc bản đưa vào prompt.
# Hàm dùng chung `strip_management_sentences` (tone_prompt.py) - giờ áp dụng luôn
# cho cả food (xem _food_edge_user_prompt), không chỉ disease. Xem docstring hàm
# đó để biết vì sao mở rộng.


def _edge_key(product: str, name: str) -> str:
    return f"{product.lower()}::{name.lower()}"


def _group_rows(rows: list[dict], name_field: str, ingredient_to_products: dict[str, list[str]]) -> list[dict]:
    """Gộp các dòng (hoạt_chất, name_field) thành cạnh (thuốc, name_field) - mỗi cạnh
    giữ mức độ nặng nhất và danh sách dòng hoạt chất góp phần, port của
    build_product_edges (rollup_explain.py) cho thuốc-thuốc. 1 hoạt chất có thể
    thuộc nhiều thuốc đang kiểm tra -> tạo cạnh riêng cho MỖI thuốc (không gộp lẫn
    các thuốc khác nhau vào 1 thẻ), khớp đúng cách build_product_edges xử lý
    san_pham_a/san_pham_b."""
    edges: dict[str, dict] = {}
    for row in rows:
        muc_do = row.get("muc_do")
        if not muc_do:
            continue
        products = ingredient_to_products.get(row["hoat_chat"]) or [row["hoat_chat"]]
        name = row[name_field]
        incomplete = muc_do == "chua_phan_loai"

        for product in dict.fromkeys(products):
            key = _edge_key(product, name)
            edge = edges.get(key)
            if edge is None:
                edges[key] = {
                    "san_pham": product,
                    name_field: name,
                    "muc_do": muc_do,
                    "has_incomplete_pair": incomplete,
                    "contributing_rows": [row],
                }
                continue
            edge["contributing_rows"].append(row)
            edge["has_incomplete_pair"] = edge["has_incomplete_pair"] or incomplete
            if _severity_rank(muc_do) > _severity_rank(edge["muc_do"]):
                edge["muc_do"] = muc_do

    for edge in edges.values():
        edge["pair_count"] = len(edge["contributing_rows"])
        edge["contributing_rows"].sort(key=lambda r: _severity_rank(r.get("muc_do")), reverse=True)

    return list(edges.values())


def build_food_edges(rows: list[dict], ingredient_to_products: dict[str, list[str]]) -> list[dict]:
    return _group_rows(rows, "thuc_pham", ingredient_to_products)


def build_disease_edges(rows: list[dict], ingredient_to_products: dict[str, list[str]]) -> list[dict]:
    return _group_rows(rows, "ten_benh", ingredient_to_products)


def _fd_citation(pair_count: int) -> str:
    return f"Tổng hợp từ {pair_count} hoạt chất tương tác trong CSDL DDInter 2.0."


# Nối nguon_trich_dan GỐC (không qua tóm tắt) của từng dòng hoạt chất đã gộp vào
# cạnh này bằng "|" - dòng food/disease trong DDInter vốn đã dùng "|" nối nhiều
# mục con bên trong 1 dòng (khác thuốc-thuốc dùng "[N]"), nên nối thêm giữa CÁC
# DÒNG cũng bằng "|" vẫn ra đúng 1 chuỗi tách được từng mục ở tầng hiển thị
# (frontend buildCitationReferences không phân biệt mục đó gốc từ dòng nào).
def _fd_citation_detail(contributing_rows: list[dict]) -> str | None:
    parts = [row["nguon_trich_dan"] for row in contributing_rows if row.get("nguon_trich_dan")]
    return "|".join(parts) if parts else None


_FD_STYLE_PATIENT = (
    "Giọng gần gũi, thân thiện, dùng từ ngữ đời thường - viết sao cho người "
    "không có chuyên môn y dược đọc cũng hiểu ngay. Độ dài co giãn theo độ "
    "phức tạp của dữ liệu gốc: cơ chế đơn giản thì viết 2 câu ngắn (~50-70 "
    "từ); dữ liệu có nhiều hoạt chất góp phần hoặc nhiều cơ chế/yếu tố nguy "
    "cơ thì viết 3-4 câu (~90-130 từ) để giải thích đủ ý, không cắt bớt "
    "thông tin quan trọng chỉ để cho ngắn - nếu nguồn liệt kê từ 3 điều kiện/"
    "yếu tố nguy cơ/hậu quả trở lên, PHẢI nêu tên đủ TẤT CẢ (có thể liệt kê "
    "ngắn gọn trong 1 câu), không chỉ chọn 1-2 cái nổi bật nhất rồi bỏ qua "
    "phần còn lại. Mỗi câu là 1 ý, viết câu đơn, "
    "không cần từ nối cầu kỳ - nhưng ý câu sau phải liên quan trực tiếp và "
    "làm rõ thêm cho ý câu trước (VD: câu nêu rủi ro xong thì câu tiếp theo "
    "giải thích vì sao xảy ra), không viết những ý rời rạc, không ăn nhập "
    "với nhau. Nếu cần nhắc thuật ngữ y khoa (tên enzyme, cơ chế chuyển hóa, "
    "chỉ số xét nghiệm...), giải thích ngắn gọn bằng lời dễ hiểu ngay trong "
    "câu thay vì dùng thuật ngữ trần trụi. Nếu Mô tả CSDL có số liệu cụ thể "
    "quan trọng thể hiện mức độ tác động (tỷ lệ %, mức tăng nguy cơ...), hãy "
    "giữ đúng số liệu đó trong câu giải thích để cụ thể, đáng tin hơn - "
    "nhưng KHÔNG lấy số liệu về liều lượng/ngưỡng dùng thuốc từ phần Xử trí, "
    "vì đó thuộc phạm vi khuyên xử trí không được phép đưa vào đoạn này. "
    "KHÔNG nhắc lại mức độ nghiêm trọng (nặng/trung bình/nhẹ...) - thẻ hiển "
    "thị đã có sẵn nhãn mức độ ở tiêu đề, nhắc lại là thừa. Diễn đạt tự "
    "nhiên, đa dạng cách nói giữa các lần trả lời - tránh dùng đi dùng lại "
    "một câu công thức y hệt."
)
_FD_STYLE_PHARMACIST = (
    "Giọng khoa học, chuyên nghiệp, súc tích. Độ dài co giãn theo độ phức "
    "tạp của dữ liệu gốc: cơ chế đơn giản thì viết 2 câu (~40-50 từ); nhiều "
    "hoạt chất góp phần hoặc nhiều cơ chế cần gộp thì viết 3 câu (~70-90 "
    "từ), không cắt bớt thông tin quan trọng chỉ để cho ngắn - nếu nguồn liệt "
    "kê từ 3 điều kiện/yếu tố nguy cơ/hậu quả trở lên, PHẢI nêu tên đủ TẤT CẢ "
    "(có thể liệt kê ngắn gọn trong 1 câu), không chỉ chọn 1-2 cái nổi bật "
    "nhất rồi bỏ qua phần còn lại. Mỗi câu 1 ý, "
    "viết câu đơn - nhưng ý câu sau phải liên quan trực tiếp và làm rõ thêm "
    "cho ý câu trước, không viết những ý rời rạc, không ăn nhập với nhau. "
    "Nếu Mô tả CSDL có số liệu cụ thể quan trọng thể hiện mức độ tác động "
    "(tỷ lệ %, mức tăng nguy cơ...), hãy giữ đúng số liệu đó trong câu giải "
    "thích để cụ thể, đáng tin hơn - nhưng KHÔNG lấy số liệu về liều lượng/ "
    "ngưỡng dùng thuốc từ phần Xử trí, vì đó thuộc phạm vi khuyên xử trí "
    "không được phép đưa vào đoạn này. KHÔNG nhắc lại mức độ nghiêm trọng "
    "(nặng/trung bình/nhẹ...) - thẻ hiển thị đã có sẵn nhãn mức độ ở tiêu "
    "đề, nhắc lại là thừa. Diễn đạt tự nhiên, đa dạng cách nói giữa các lần "
    "trả lời - tránh dùng đi dùng lại một câu công thức y hệt."
)


def _food_edge_system_prompt(audience: str) -> str:
    style = _FD_STYLE_PHARMACIST if audience == "pharmacist" else _FD_STYLE_PATIENT
    return (
        "Bạn là dược sĩ đang tổng hợp cảnh báo tương tác GIỮA 1 THUỐC và 1 LOẠI THỰC "
        "PHẨM, dựa trên các mô tả tương tác hoạt chất CÓ THẬT giữa thuốc này và thực "
        "phẩm này (dữ liệu CSDL DDInter 2.0) được liệt kê ở tin nhắn tiếp theo — đó là "
        "nguồn duy nhất bạn được dùng, không thêm dữ kiện y khoa nào khác. Hãy TỔNG HỢP "
        "LẠI thành 1 đoạn nói về việc dùng THUỐC này cùng THỰC PHẨM này (xưng tên thuốc "
        "là chính, không cần liệt kê lại từng hoạt chất).\n\n"
        f"{style}\n\n"
        "Trả lời CHỈ đúng đoạn văn giải thích, không thêm tiêu đề hay chữ nào khác.\n\n"
        f"{SAFETY_RULES}"
    )


def _disease_edge_system_prompt(audience: str) -> str:
    style = _FD_STYLE_PHARMACIST if audience == "pharmacist" else _FD_STYLE_PATIENT
    return (
        "Bạn là dược sĩ đang tổng hợp cảnh báo tương tác GIỮA 1 THUỐC và 1 BỆNH NỀN "
        "(tình trạng bệnh lý cần thận trọng khi dùng thuốc này), dựa trên các mô tả "
        "tương tác hoạt chất CÓ THẬT giữa thuốc này và bệnh nền này (dữ liệu CSDL "
        "DDInter 2.0) được liệt kê ở tin nhắn tiếp theo — đó là nguồn duy nhất bạn được "
        "dùng, không thêm dữ kiện y khoa nào khác. Hãy TỔNG HỢP LẠI thành 1 đoạn nói về "
        "việc dùng THUỐC này khi có tiền sử/đang mắc BỆNH NỀN này (xưng tên thuốc là "
        "chính, không cần liệt kê lại từng hoạt chất). TUYỆT ĐỐI KHÔNG khẳng định hay "
        "chẩn đoán người đọc có bệnh này — chỉ nói về việc dùng thuốc NẾU có tiền sử/"
        "đang mắc bệnh đó.\n\n"
        f"{style}\n\n"
        "Trả lời CHỈ đúng đoạn văn giải thích, không thêm tiêu đề hay chữ nào khác.\n\n"
        f"{SAFETY_RULES}"
    )

_UNCLASSIFIED_FOOD_EDGE_MESSAGE = (
    "Giữa {a} và {b} có tương tác hoạt chất mà DDInter chưa phân loại mức độ nghiêm "
    "trọng — cần thận trọng, hãy hỏi dược sĩ/bác sĩ trước khi dùng chung."
)

_UNCLASSIFIED_DISEASE_EDGE_MESSAGE = (
    "Giữa {a} và {b} có tương tác hoạt chất mà DDInter chưa phân loại mức độ nghiêm "
    "trọng — cần thận trọng, hãy hỏi dược sĩ/bác sĩ nếu bạn thuộc trường hợp này."
)


def _food_edge_user_prompt(
    product: str, food: str, muc_do: str, contributing_rows: list[dict], audience: str
) -> str:
    # Xử trí CSDL chỉ đưa cho audience=pharmacist - xem lý do ở
    # rollup_explain.py::_product_user_prompt (cùng finding, cùng cách sửa).
    include_xu_tri = audience == "pharmacist"
    lines = [f"Thuốc: {product}", f"Thực phẩm: {food}", f"Mức độ nghiêm trọng cao nhất: {muc_do}", ""]
    lines.append("Các mô tả tương tác hoạt chất có thật giữa thuốc này và thực phẩm này (CSDL DDInter 2.0):")
    for row in contributing_rows[:_MAX_CONTRIBUTING_ROWS]:
        mo_ta_filtered = strip_management_sentences(row.get("mo_ta"))
        block = (
            f"- Hoạt chất {row.get('hoat_chat')} (mức {row.get('muc_do')}):\n"
            f"  Mô tả CSDL: {_truncate(mo_ta_filtered, _MAX_TEXT_CHARS)}"
        )
        if include_xu_tri:
            block += f"\n  Xử trí CSDL: {_truncate(row.get('xu_tri'), _MAX_TEXT_CHARS) or '(không có)'}"
        lines.append(block)
    lines.append("")
    lines.append(
        "Hãy viết đoạn giải thích theo đúng hướng dẫn đã nêu, bằng tiếng Việt, tổng "
        "hợp lại đúng nội dung ở trên - không thêm dữ kiện nào ngoài đó."
    )
    return "\n".join(lines)


def _disease_edge_user_prompt(product: str, disease: str, muc_do: str, contributing_rows: list[dict]) -> str:
    lines = [f"Thuốc: {product}", f"Bệnh nền: {disease}", f"Mức độ nghiêm trọng cao nhất: {muc_do}", ""]
    lines.append("Các mô tả tương tác hoạt chất có thật giữa thuốc này và bệnh nền này (CSDL DDInter 2.0):")
    for row in contributing_rows[:_MAX_CONTRIBUTING_ROWS]:
        mo_ta_filtered = strip_management_sentences(row.get("mo_ta"))
        lines.append(
            f"- Hoạt chất {row.get('hoat_chat')} (mức {row.get('muc_do')}):\n"
            f"  Mô tả CSDL: {_truncate(mo_ta_filtered, _MAX_TEXT_CHARS)}"
        )
    lines.append("")
    lines.append(
        "Hãy viết đoạn giải thích theo đúng hướng dẫn đã nêu, bằng tiếng Việt, tổng "
        "hợp lại đúng nội dung ở trên - không thêm dữ kiện nào ngoài đó."
    )
    return "\n".join(lines)


async def _explain_food_edge(edge: dict, audience: str) -> dict:
    """Cache theo (kind="food", san_pham, thuc_pham, muc_do, audience) đã chuẩn hóa
    lowercase - xem docstring _explain_product_edge (rollup_explain.py) cho lý do
    dùng key gọn thay vì hash nguyên văn contributing_rows."""
    product, food = edge["san_pham"], edge["thuc_pham"]
    muc_do, pair_count = edge["muc_do"], edge["pair_count"]

    if muc_do == "chua_phan_loai":
        message = _UNCLASSIFIED_FOOD_EDGE_MESSAGE.format(a=product, b=food)
        return {
            "san_pham": [product],
            "thuc_pham": food,
            "muc_do": muc_do,
            **_tone_fields(message, audience),
            "nguon_trich_dan": _fd_citation(pair_count),
            "nguon_trich_dan_chi_tiet": _fd_citation_detail(edge["contributing_rows"]),
            "mo_ta_dich": None,
            "xu_tri_dich": None,
        }

    cache_filters = {
        "kind": "food",
        "san_pham": product.lower(),
        "doi_tuong": food.lower(),
        "muc_do": muc_do,
        "audience": audience,
    }
    cached = lookup_cached(FoodDiseaseExplanationCache, **cache_filters)
    if cached is not None:
        return {"san_pham": [product], "thuc_pham": food, "muc_do": muc_do, **cached}

    narrative_response, (mo_ta_dich, xu_tri_dich) = await asyncio.gather(
        ainvoke_llm(
            [
                {"role": "system", "content": _food_edge_system_prompt(audience)},
                {
                    "role": "user",
                    "content": _food_edge_user_prompt(product, food, muc_do, edge["contributing_rows"], audience),
                },
            ]
        ),
        literal_merge_translate(edge["contributing_rows"], include_xu_tri=True),
    )
    text = filter_banned_language((narrative_response.content or "").strip())
    result = {
        **_tone_fields(text, audience),
        "nguon_trich_dan": _fd_citation(pair_count),
        "nguon_trich_dan_chi_tiet": _fd_citation_detail(edge["contributing_rows"]),
        "mo_ta_dich": mo_ta_dich,
        "xu_tri_dich": xu_tri_dich,
    }
    save_cached(FoodDiseaseExplanationCache, **cache_filters, **result)
    return {"san_pham": [product], "thuc_pham": food, "muc_do": muc_do, **result}


async def _explain_disease_edge(edge: dict, audience: str) -> dict:
    """Cache theo (kind="disease", san_pham, ten_benh, muc_do, audience) - xem
    docstring _explain_food_edge phía trên."""
    product, disease = edge["san_pham"], edge["ten_benh"]
    muc_do, pair_count = edge["muc_do"], edge["pair_count"]

    if muc_do == "chua_phan_loai":
        message = _UNCLASSIFIED_DISEASE_EDGE_MESSAGE.format(a=product, b=disease)
        return {
            "san_pham": [product],
            "ten_benh": disease,
            "muc_do": muc_do,
            **_tone_fields(message, audience),
            "nguon_trich_dan": _fd_citation(pair_count),
            "nguon_trich_dan_chi_tiet": _fd_citation_detail(edge["contributing_rows"]),
            "mo_ta_dich": None,
        }

    cache_filters = {
        "kind": "disease",
        "san_pham": product.lower(),
        "doi_tuong": disease.lower(),
        "muc_do": muc_do,
        "audience": audience,
    }
    cached = lookup_cached(FoodDiseaseExplanationCache, **cache_filters)
    if cached is not None:
        cached.pop("xu_tri_dich", None)  # disease không có field này (xem docstring class)
        return {"san_pham": [product], "ten_benh": disease, "muc_do": muc_do, **cached}

    narrative_response, (mo_ta_dich, _) = await asyncio.gather(
        ainvoke_llm(
            [
                {"role": "system", "content": _disease_edge_system_prompt(audience)},
                {
                    "role": "user",
                    "content": _disease_edge_user_prompt(product, disease, muc_do, edge["contributing_rows"]),
                },
            ]
        ),
        literal_merge_translate(edge["contributing_rows"], include_xu_tri=False),
    )
    text = filter_banned_language((narrative_response.content or "").strip())
    result = {
        **_tone_fields(text, audience),
        "nguon_trich_dan": _fd_citation(pair_count),
        "nguon_trich_dan_chi_tiet": _fd_citation_detail(edge["contributing_rows"]),
        "mo_ta_dich": mo_ta_dich,
    }
    save_cached(FoodDiseaseExplanationCache, **cache_filters, **result, xu_tri_dich=None)
    return {"san_pham": [product], "ten_benh": disease, "muc_do": muc_do, **result}


async def build_food_interaction_explanations(
    rows: list[dict], ingredient_to_products: dict[str, list[str]], audience: str = "patient"
) -> list[dict]:
    edges = build_food_edges(rows, ingredient_to_products)
    if not edges:
        return []
    return list(await asyncio.gather(*(_explain_food_edge(edge, audience) for edge in edges)))


async def build_disease_interaction_explanations(
    rows: list[dict], ingredient_to_products: dict[str, list[str]], audience: str = "patient"
) -> list[dict]:
    edges = build_disease_edges(rows, ingredient_to_products)
    if not edges:
        return []
    return list(await asyncio.gather(*(_explain_disease_edge(edge, audience) for edge in edges)))


def build_food_disease_warning_line(
    food_explanations: list[dict], disease_explanations: list[dict], audience: str = "patient"
) -> list[str] | None:
    """Danh sách 1-3 câu CỐ ĐỊNH (không qua LLM) liệt kê tên thực phẩm/bệnh nền cần
    lưu ý, hiện thành các đoạn riêng SAU đoạn LLM sinh về tương tác thuốc-thuốc ở
    tóm tắt tổng quan - không có rủi ro bịa dữ kiện vì chỉ liệt kê thẳng tên đã
    khớp được trong DDInter. Thứ tự: dòng thực phẩm (nếu có) -> dòng bệnh nền (nếu
    có) -> câu mời trao đổi dược sĩ (nếu có ít nhất 1 trong 2 dòng trên, CHỈ với
    audience="patient" - dược sĩ đang là người thực hiện tra cứu nên câu mời tự
    trao đổi với chính mình vô nghĩa, và giọng văn hướng "bạn/bệnh nhân của bạn"
    thay vì xưng hô như đang nói chuyện trực tiếp với bệnh nhân)."""
    foods = sorted({item["thuc_pham"] for item in food_explanations})
    diseases = sorted({item["ten_benh"] for item in disease_explanations})
    if not foods and not diseases:
        return None

    lines = []
    if audience == "pharmacist":
        if foods:
            lines.append(f"Ngoài ra, cần khuyến cáo bệnh nhân tránh dùng chung với: {', '.join(foods)}.")
        if diseases:
            lines.append(f"Cũng cần thận trọng nếu bệnh nhân có tiền sử/đang mắc: {', '.join(diseases)}.")
        return lines

    prefix = "Ngoài ra, cần"
    if foods:
        lines.append(f"{prefix} lưu ý tránh dùng chung với: {', '.join(foods)}.")
        prefix = "Cũng cần"
    if diseases:
        lines.append(f"{prefix} thận trọng nếu có tiền sử/đang mắc: {', '.join(diseases)}.")
    lines.append("Hãy trao đổi với dược sĩ/bác sĩ nếu bạn thuộc trường hợp này.")
    return lines
