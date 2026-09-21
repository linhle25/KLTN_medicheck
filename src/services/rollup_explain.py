"""Gộp (rollup) các cặp hoạt chất lên cấp thuốc/sản phẩm, rồi gọi LLM sinh 1 đoạn
giải thích RIÊNG cho cấp thuốc — chỉ nhắc tên thuốc, không lộ tên hoạt chất cụ thể
— đọc thẳng mo_ta/xu_tri gốc (tiếng Anh) của các cặp hoạt chất góp phần thay vì qua
1 lớp giai_thich trung gian cấp hoạt chất (đã bỏ, xem explain_node.py). Sống ngoài
LangGraph (gọi từ src/api/routes.py sau khi agent chạy xong) vì việc nhóm đơn thuốc
là khái niệm của request, agent chỉ biết tên hoạt chất.

Không còn rollup cấp đơn thuốc (đơn-với-đơn) - tính năng đó không có UI nào hiển
thị, đã xoá hẳn cùng lệnh gọi LLM tương ứng."""

import asyncio
import re

from src.agents.nodes.guardrail_node import filter_banned_language
from src.db.models import ProductExplanationCache
from src.services.explanation_cache import lookup_cached, save_cached
from src.services.llm import ainvoke_llm
from src.services.tone_prompt import SAFETY_RULES, TRANSLATION_MARKER, split_translation_block

# Cú pháp nhấn mạnh riêng cho đoạn tóm tắt tổng quan: LLM tự bọc cụm từ muốn nhấn
# mạnh trong đoạn văn bằng {{muc_do:cụm từ}} (muc_do phải khớp đúng 1 trong 4 mức đã
# cho sẵn trong prompt - không tự bịa mức mới). Server tách marker ra khỏi text
# thường (client không cần biết cú pháp này) và trả về danh sách (text, muc_do) theo
# ĐÚNG thứ tự xuất hiện để frontend tô màu lại đúng chỗ trong bản text đã làm sạch.
_HIGHLIGHT_PATTERN = re.compile(r"\{\{(nang|trung_binh|nhe|chua_phan_loai):([^{}]+?)\}\}")


def _parse_highlights(raw: str) -> tuple[str, list[dict]]:
    highlights: list[dict] = []

    def _replace(match: re.Match) -> str:
        muc_do, text = match.group(1), match.group(2).strip()
        if text:
            highlights.append({"text": text, "muc_do": muc_do})
        return text

    clean_text = _HIGHLIGHT_PATTERN.sub(_replace, raw)
    return clean_text, highlights


def _tone_fields(text: str, audience: str) -> dict:
    """Giống hệt src/agents/nodes/explain_node.py::_tone_fields - giai_thich luôn là
    bản đúng giọng điệu của audience hiện tại; giai_thich_duoc_si chỉ trùng giá trị
    khi audience="pharmacist" (khớp type contract cũ ở frontend, không sinh thêm
    lệnh gọi LLM thứ 2)."""
    return {
        "giai_thich": text,
        "giai_thich_duoc_si": text if audience == "pharmacist" else None,
    }

_SEVERITY_RANK = {"nang": 3, "trung_binh": 2, "nhe": 1, "chua_phan_loai": 0}


def _severity_rank(muc_do: str | None) -> int:
    return _SEVERITY_RANK.get(muc_do, -1)


def _truncate(text: str | None, max_chars: int) -> str:
    if not text:
        return ""
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "... (đã rút gọn)"


def _edge_key(a: str, b: str) -> str:
    return "::".join(sorted([a.lower(), b.lower()]))


# ---- Gộp + dịch bám sát nghĩa (dùng chung cho cấp thuốc/thực phẩm/bệnh nền khi 1
# cạnh có NHIỀU cặp hoạt chất góp phần) ----

# Chỉ đưa tối đa từng này cặp vào 1 lượt dịch gộp - tránh phình prompt.
_MAX_LITERAL_MERGE_ITEMS = 5

_LITERAL_MERGE_SYSTEM_PROMPT_WITH_XU_TRI = (
    "Bạn là dược sĩ kiêm biên dịch y khoa. Dưới đây là Mô tả CSDL và Xử trí CSDL "
    "(tiếng Anh) của nhiều cặp tương tác khác nhau, cùng góp phần vào 1 cảnh báo tổng "
    "hợp. Hãy TỔNG HỢP các ý và DỊCH sang tiếng Việt, bám sát ĐÚNG ngữ nghĩa gốc — "
    "KHÔNG diễn giải lại theo văn phong tự nhiên/trò chuyện như một đoạn giải thích, "
    "KHÔNG thêm/bớt thông tin y khoa nào ngoài nội dung đã cho, chỉ gộp các ý trùng "
    "lặp và dịch trung thực, sát nghĩa nhất có thể. Trả lời ĐÚNG theo định dạng, "
    "không thêm chữ nào khác:\n"
    "Mô tả: <tổng hợp + dịch bám sát nghĩa Mô tả CSDL>\n"
    "Xử trí: <tổng hợp + dịch bám sát nghĩa Xử trí CSDL, để trống sau dấu hai chấm nếu không có>"
)

_LITERAL_MERGE_SYSTEM_PROMPT_MO_TA_ONLY = (
    "Bạn là dược sĩ kiêm biên dịch y khoa. Dưới đây là Mô tả CSDL (tiếng Anh) của "
    "nhiều cặp tương tác khác nhau, cùng góp phần vào 1 cảnh báo tổng hợp. Hãy TỔNG "
    "HỢP các ý và DỊCH sang tiếng Việt, bám sát ĐÚNG ngữ nghĩa gốc — KHÔNG diễn giải "
    "lại theo văn phong tự nhiên/trò chuyện như một đoạn giải thích, KHÔNG thêm/bớt "
    "thông tin y khoa nào ngoài nội dung đã cho, chỉ gộp các ý trùng lặp và dịch "
    "trung thực, sát nghĩa nhất có thể. Trả lời ĐÚNG theo định dạng, không thêm chữ "
    "nào khác:\n"
    "Mô tả: <tổng hợp + dịch bám sát nghĩa Mô tả CSDL>"
)


def _literal_merge_parse(raw: str) -> tuple[str | None, str | None]:
    mo_ta_dich, xu_tri_dich = None, None
    for line in (raw or "").strip().splitlines():
        line = line.strip()
        lower = line.lower()
        if lower.startswith("mô tả:") or lower.startswith("mo ta:"):
            mo_ta_dich = line.split(":", 1)[1].strip() or None
        elif lower.startswith("xử trí:") or lower.startswith("xu tri:"):
            xu_tri_dich = line.split(":", 1)[1].strip() or None
    return mo_ta_dich, xu_tri_dich


async def literal_merge_translate(
    items: list[dict], include_xu_tri: bool, max_items: int = _MAX_LITERAL_MERGE_ITEMS
) -> tuple[str | None, str | None]:
    """Gộp Mô tả/Xử trí CSDL (tiếng Anh, từ nhiều cặp góp phần đã sort severity-desc)
    thành 1 bản dịch DUY NHẤT, bám sát nghĩa gốc - KHÔNG đổi giọng điệu/cách viết tự
    nhiên như phần giai_thich (văn xuôi, đa dạng cách nói giữa các lần). Dùng chung
    cho cả 3 cấp (thuốc-thuốc/thực phẩm/bệnh nền) khi 1 cạnh có nhiều cặp góp phần
    cần gộp thành 1 thẻ - thay cho cách cũ chỉ lấy nguyên bản dịch của 1 cặp đại diện."""
    usable = [item for item in items[:max_items] if item.get("mo_ta")]
    if not usable:
        return None, None

    lines = []
    for i, item in enumerate(usable, start=1):
        block = f"Cặp {i}:\nMô tả CSDL: {_truncate(item.get('mo_ta'), 800)}"
        if include_xu_tri:
            block += f"\nXử trí CSDL: {_truncate(item.get('xu_tri'), 800) or '(không có)'}"
        lines.append(block)

    system_prompt = (
        _LITERAL_MERGE_SYSTEM_PROMPT_WITH_XU_TRI if include_xu_tri else _LITERAL_MERGE_SYSTEM_PROMPT_MO_TA_ONLY
    )
    # temperature=0: đây là bản dịch bám sát nghĩa gốc (không sáng tạo/diễn giải lại
    # như giai_thich) - dùng chung temperature=0.7 mặc định sẽ khiến bản dịch trôi
    # nghĩa giữa các lần sinh dù cùng 1 nguồn (rà soát kiến trúc 01/09 trước eval
    # quy mô lớn - gia thuyết đã ghi từ PLAN.md, chưa từng được xử lý). Đây là bản
    # dịch dược sĩ dùng làm trích dẫn tin cậy nên cần ổn định/nhất quán hơn văn tổng
    # hợp giai_thich (vẫn giữ 0.7 để đa dạng cách nói).
    response = await ainvoke_llm(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "\n\n".join(lines)},
        ],
        temperature=0,
    )
    return _literal_merge_parse(response.content or "")


def build_product_edges(explanations: list[dict]) -> list[dict]:
    """Port của buildProductGraph (frontend/lib/interactionGraph.ts): gộp các cặp
    hoạt chất (đã enrich san_pham_a/san_pham_b) thành cạnh cấp thuốc — mỗi cạnh giữ
    mức độ nặng nhất và danh sách các giải thích cấp hoạt chất góp phần (dùng làm
    dữ liệu gốc để sinh giải thích cấp thuốc - xem _explain_product_edge)."""
    edges: dict[str, dict] = {}
    for exp in explanations:
        muc_do = exp.get("muc_do")
        if not muc_do:
            continue
        prods_a = exp.get("san_pham_a") or ([exp["thuoc_a"]] if exp.get("thuoc_a") else [])
        prods_b = exp.get("san_pham_b") or ([exp["thuoc_b"]] if exp.get("thuoc_b") else [])
        incomplete = muc_do == "chua_phan_loai"

        for product_a in prods_a:
            for product_b in prods_b:
                if product_a.lower() == product_b.lower():
                    continue
                key = _edge_key(product_a, product_b)
                edge = edges.get(key)
                if edge is None:
                    edges[key] = {
                        "product_a": product_a,
                        "product_b": product_b,
                        "muc_do": muc_do,
                        "has_incomplete_pair": incomplete,
                        "contributing_pairs": [exp],
                    }
                    continue
                edge["contributing_pairs"].append(exp)
                edge["has_incomplete_pair"] = edge["has_incomplete_pair"] or incomplete
                if _severity_rank(muc_do) > _severity_rank(edge["muc_do"]):
                    edge["muc_do"] = muc_do

    for edge in edges.values():
        edge["pair_count"] = len(edge["contributing_pairs"])
        edge["contributing_pairs"].sort(key=lambda e: _severity_rank(e.get("muc_do")), reverse=True)

    return list(edges.values())


def filter_cross_prescription_edges(
    product_edges: list[dict], product_origins: dict[str, set[int]]
) -> list[dict]:
    """Chỉ giữ lại cạnh cấp thuốc có ÍT NHẤT 1 cặp chỉ số đơn khác nhau chứa 2 đầu
    cạnh - bỏ cạnh mà 2 thuốc chỉ CÙNG xuất hiện trong đúng 1 đơn (tương tác trong
    cùng 1 đơn). Dùng cho luồng bệnh nhân khi so từ 2 đơn trở lên: chỉ tính tương
    tác GIỮA các đơn khác nhau cho cấp thuốc + tóm tắt tổng quan."""
    filtered = []
    for edge in product_edges:
        set_a = product_origins.get(edge["product_a"].lower())
        set_b = product_origins.get(edge["product_b"].lower())
        if not set_a or not set_b:
            continue
        if any(rx_a != rx_b for rx_a in set_a for rx_b in set_b):
            filtered.append(edge)
    return filtered


def severity_counts(edges: list[dict]) -> dict[str, int]:
    """Đếm số cạnh theo từng mức độ - dùng cho thống kê tóm tắt (build_overview_explanation)."""
    counts = {"nang": 0, "trung_binh": 0, "nhe": 0, "chua_phan_loai": 0}
    for edge in edges:
        muc_do = edge.get("muc_do")
        if muc_do in counts:
            counts[muc_do] += 1
    return counts


# ---- Cấp thuốc (sản phẩm) ----

# Chỉ đưa tối đa từng này cặp hoạt chất (đã sắp nặng nhất trước) vào prompt cấp
# thuốc, để tránh phình prompt khi 2 thuốc phối hợp có nhiều hoạt chất - vẫn đủ
# đại diện vì các cặp còn lại thường nhẹ hơn cặp đã đưa vào.
_MAX_CONTRIBUTING_PAIRS = 5

_PRODUCT_STYLE_PATIENT = (
    "Phần bệnh nhân: giọng gần gũi, thân thiện, dùng từ ngữ đời thường - viết "
    "sao cho người không có chuyên môn y dược đọc cũng hiểu ngay. Độ dài co "
    "giãn theo độ phức tạp của dữ liệu gốc: cơ chế đơn giản thì viết 2 câu "
    "ngắn (~50-70 từ); dữ liệu có nhiều cặp hoạt chất hoặc nhiều cơ chế/yếu tố "
    "nguy cơ thì viết 3-4 câu (~90-130 từ) để giải thích đủ ý, không cắt bớt "
    "thông tin quan trọng chỉ để cho ngắn - nếu nguồn liệt kê từ 3 điều kiện/"
    "yếu tố nguy cơ/hậu quả trở lên, PHẢI nêu tên đủ TẤT CẢ (có thể liệt kê "
    "ngắn gọn trong 1 câu), không chỉ chọn 1-2 cái nổi bật nhất rồi bỏ qua "
    "phần còn lại. Mỗi câu là 1 ý, viết câu đơn, không "
    "cần từ nối cầu kỳ - nhưng ý câu sau phải liên quan trực tiếp và làm rõ "
    "thêm cho ý câu trước (VD: câu nêu rủi ro xong thì câu tiếp theo giải "
    "thích vì sao xảy ra), không viết những ý rời rạc, không ăn nhập với "
    "nhau. Nếu cần nhắc thuật ngữ y khoa (tên enzyme, cơ chế chuyển hóa, chỉ "
    "số xét nghiệm...), giải thích ngắn gọn bằng lời dễ hiểu ngay trong câu "
    "thay vì dùng thuật ngữ trần trụi. Nếu Mô tả CSDL có số liệu cụ thể quan "
    "trọng thể hiện mức độ tác động (tỷ lệ %, mức tăng nguy cơ...), hãy giữ "
    "đúng số liệu đó trong câu giải thích để cụ thể, đáng tin hơn - nhưng "
    "KHÔNG lấy số liệu về liều lượng/ngưỡng dùng thuốc từ phần Xử trí, vì đó "
    "thuộc phạm vi khuyên xử trí không được phép đưa vào đoạn này. KHÔNG "
    "nhắc lại mức độ nghiêm trọng (nặng/trung bình/nhẹ...) hay các cụm như "
    "\"mức độ được đánh giá là...\" - thẻ hiển thị đã có sẵn nhãn mức độ ở "
    "tiêu đề, nhắc lại là thừa. Diễn đạt tự nhiên, đa dạng cách nói giữa các "
    "lần trả lời - tránh dùng đi dùng lại một câu công thức y hệt."
)

_PRODUCT_STYLE_PHARMACIST = (
    "Phần dược sĩ: giọng khoa học, chuyên nghiệp, súc tích. Độ dài co giãn "
    "theo độ phức tạp của dữ liệu gốc: cơ chế đơn giản thì viết 2 câu (~40-50 "
    "từ); nhiều cặp hoạt chất hoặc nhiều cơ chế cần gộp thì viết 3 câu (~70-90 "
    "từ), không cắt bớt thông tin quan trọng chỉ để cho ngắn - nếu nguồn liệt "
    "kê từ 3 điều kiện/yếu tố nguy cơ/hậu quả trở lên, PHẢI nêu tên đủ TẤT CẢ "
    "(có thể liệt kê ngắn gọn trong 1 câu), không chỉ chọn 1-2 cái nổi bật "
    "nhất rồi bỏ qua phần còn lại. Mỗi câu 1 ý, "
    "viết câu đơn - nhưng ý câu sau phải liên quan trực tiếp và làm rõ thêm "
    "cho ý câu trước, không viết những ý rời rạc, không ăn nhập với nhau. "
    "Nếu Mô tả CSDL có số liệu cụ thể quan trọng thể hiện mức độ tác động "
    "(tỷ lệ %, mức tăng nguy cơ...), hãy giữ đúng số liệu đó trong câu giải "
    "thích để cụ thể, đáng tin hơn - nhưng KHÔNG lấy số liệu về liều lượng/"
    "ngưỡng dùng thuốc từ phần Xử trí, vì đó thuộc phạm vi khuyên xử trí "
    "không được phép đưa vào đoạn này. KHÔNG nhắc lại mức độ nghiêm trọng "
    "(nặng/trung bình/nhẹ...) - thẻ hiển thị đã có sẵn nhãn mức độ ở tiêu "
    "đề, nhắc lại là thừa. Diễn đạt tự nhiên, đa dạng cách nói giữa các lần "
    "trả lời - tránh dùng đi dùng lại một câu công thức y hệt."
)


def _product_system_prompt(audience: str) -> str:
    style = _PRODUCT_STYLE_PHARMACIST if audience == "pharmacist" else _PRODUCT_STYLE_PATIENT
    return (
        "Bạn là dược sĩ đang tổng hợp cảnh báo tương tác GIỮA HAI THUỐC (cấp thuốc), "
        "dựa trên Mô tả/Xử trí CSDL DDInter 2.0 (tiếng Anh) của các cặp hoạt chất CÓ "
        "THẬT góp phần vào 2 thuốc này, liệt kê ở tin nhắn tiếp theo — đó là nguồn "
        "duy nhất bạn được dùng, không thêm dữ kiện y khoa nào khác.\n\n"
        "Trả lời gồm ĐÚNG 2 phần theo thứ tự sau, không thêm chữ nào khác ngoài đó. "
        "\"PHẦN 1\"/\"PHẦN 2\" dưới đây chỉ là tên gọi để MÔ TẢ cấu trúc cho bạn hiểu "
        "- TUYỆT ĐỐI KHÔNG được viết các chữ \"PHẦN 1\", \"PHẦN 2\" vào câu trả lời:\n\n"
        "Phần đầu - đoạn giải thích TỔNG HỢP LẠI bằng tiếng Việt, nói về việc dùng "
        "chung THUỐC A và THUỐC B (xưng tên thuốc là chính, không cần liệt kê lại "
        "từng hoạt chất), không chỉ đơn thuần dịch nguyên văn 1 cặp. Bắt đầu thẳng "
        "vào nội dung, không thêm tiêu đề nào.\n"
        f"{style}\n\n"
        f"Phần sau - bắt đầu bằng đúng dòng {TRANSLATION_MARKER}, theo sau là bản DỊCH "
        "BÁM SÁT NGHĨA GỐC (không diễn giải, không đổi giọng điệu như phần đầu) của Mô "
        "tả/Xử trí CSDL đã gộp các cặp hoạt chất lại, đúng định dạng:\n"
        "mô tả: <tổng hợp + dịch sát nghĩa Mô tả CSDL>\n"
        "xử trí: <tổng hợp + dịch sát nghĩa Xử trí CSDL, để trống sau dấu hai chấm "
        "nếu không có>\n\n"
        f"{SAFETY_RULES}"
    )


_UNCLASSIFIED_PRODUCT_MESSAGE = (
    "Giữa {a} và {b} có tương tác hoạt chất mà DDInter chưa phân loại mức độ "
    "nghiêm trọng — cần thận trọng, hãy hỏi dược sĩ/bác sĩ trước khi dùng chung."
)


# Phòng hờ LLM lỡ chép nguyên văn nhãn cấu trúc "PHẦN 1"/"PHẦN 2" (xem
# _product_system_prompt) vào nội dung câu trả lời thay vì chỉ dùng chúng để hiểu
# thứ tự - dọn sạch trước khi hiển thị cho người dùng.
_LEADING_PART1_LABEL = re.compile(r"^\s*ph[aầ]n\s*1\s*[-:–]?\s*", re.IGNORECASE)
_TRAILING_PART2_LABEL = re.compile(r"\s*ph[aầ]n\s*2\s*[-:–]?\s*$", re.IGNORECASE)


def _strip_stray_part_labels(text: str) -> str:
    text = _LEADING_PART1_LABEL.sub("", text, count=1)
    text = _TRAILING_PART2_LABEL.sub("", text, count=1)
    return text


def _product_citation(pair_count: int) -> str:
    return f"Tổng hợp từ {pair_count} cặp hoạt chất tương tác trong CSDL DDInter 2.0."


def _product_user_prompt(product_a: str, product_b: str, contributing_pairs: list[dict], audience: str) -> str:
    # Không đưa "mức độ nghiêm trọng cao nhất" riêng - contributing_pairs đã sort
    # nặng nhất trước (xem build_product_edges) nên cặp đầu tiên dưới đây LUÔN
    # trùng đúng mức đó, đưa thêm 1 dòng riêng chỉ lặp lại vô ích.
    #
    # Xử trí CSDL CHỈ đưa vào cho audience=pharmacist - trước đây đưa cho cả patient
    # rồi trông chờ prompt (SAFETY_RULES) tự loại bỏ khi viết, nhưng eval phát hiện
    # LLM không tuân thủ 100% (case dd-nang-016, dd-nang-001, dd-trung_binh-027 - xem
    # eval/results/report.md Finding 15/14) - chặn từ gốc, không đưa dữ liệu vào thay
    # vì chỉ dặn đừng dùng.
    include_xu_tri = audience == "pharmacist"
    lines = [f"Cặp thuốc: {product_a} + {product_b}", ""]
    lines.append("Các cặp hoạt chất góp phần (CSDL DDInter 2.0, tiếng Anh):")
    for pair in contributing_pairs[:_MAX_CONTRIBUTING_PAIRS]:
        block = (
            f"- Hoạt chất {pair.get('thuoc_a')} + {pair.get('thuoc_b')} (mức {pair.get('muc_do')}):\n"
            f"  Mô tả CSDL: {_truncate(pair.get('mo_ta'), 800)}"
        )
        if include_xu_tri:
            block += f"\n  Xử trí CSDL: {_truncate(pair.get('xu_tri'), 800) or '(không có)'}"
        lines.append(block)
    lines.append("")
    lines.append("Hãy trả lời đúng 2 phần theo định dạng đã nêu, bằng tiếng Việt, không thêm dữ kiện nào ngoài đó.")
    return "\n".join(lines)


async def _explain_product_edge(edge: dict, audience: str) -> dict:
    """1 lượt gọi LLM DUY NHẤT cho mỗi cạnh thuốc - đọc thẳng mo_ta/xu_tri (tiếng
    Anh) của từng cặp hoạt chất góp phần, sinh cùng lúc PHẦN 1 (giai_thich, văn tự
    nhiên) và PHẦN 2 (mo_ta_dich/xu_tri_dich, dịch bám sát nghĩa) - thay vì 2 lượt
    gọi song song như trước (1 viết giai_thich dựa trên đoạn văn cấp hoạt chất đã
    bị bỏ, 1 literal_merge_translate riêng). split_translation_block tách PHẦN 2 ra
    khỏi PHẦN 1 dựa theo TRANSLATION_MARKER (xem tone_prompt.py).

    Cache theo (product_a, product_b, muc_do, audience) đã chuẩn hóa - thành phần
    hoạt chất của 1 thuốc cố định trong DB nên tập cặp hoạt chất góp phần vào 1 cạnh
    thuốc-thuốc luôn giống nhau giữa các request, dù CÁC THUỐC KHÁC trong request có
    khác nhau (không dùng contributing_pairs làm key vì thuoc_a/thuoc_b trong đó đã
    bị _brand_label ở routes.py gắn thêm brand từ những thuốc không liên quan khác
    trong cùng request - xem src/services/explanation_cache.py)."""
    product_a, product_b = edge["product_a"], edge["product_b"]
    muc_do, pair_count = edge["muc_do"], edge["pair_count"]

    if muc_do == "chua_phan_loai":
        message = _UNCLASSIFIED_PRODUCT_MESSAGE.format(a=product_a, b=product_b)
        return {
            "thuoc_a": product_a,
            "thuoc_b": product_b,
            "muc_do": muc_do,
            **_tone_fields(message, audience),
            "nguon_trich_dan": _product_citation(pair_count),
            "mo_ta_dich": None,
            "xu_tri_dich": None,
        }

    key_a, key_b = sorted([product_a.lower(), product_b.lower()])
    cached = lookup_cached(
        ProductExplanationCache, product_a=key_a, product_b=key_b, muc_do=muc_do, audience=audience
    )
    if cached is not None:
        return {"thuoc_a": product_a, "thuoc_b": product_b, "muc_do": muc_do, **cached}

    response = await ainvoke_llm(
        [
            {"role": "system", "content": _product_system_prompt(audience)},
            {
                "role": "user",
                "content": _product_user_prompt(product_a, product_b, edge["contributing_pairs"], audience),
            },
        ]
    )
    narrative, translated = split_translation_block(
        (response.content or "").strip(), [("mô tả:", "mo_ta_dich"), ("xử trí:", "xu_tri_dich")]
    )
    text = filter_banned_language(_strip_stray_part_labels(narrative.strip()).strip())
    result = {
        **_tone_fields(text, audience),
        "nguon_trich_dan": _product_citation(pair_count),
        "mo_ta_dich": translated["mo_ta_dich"],
        "xu_tri_dich": translated["xu_tri_dich"],
    }
    save_cached(
        ProductExplanationCache, product_a=key_a, product_b=key_b, muc_do=muc_do, audience=audience, **result
    )
    return {"thuoc_a": product_a, "thuoc_b": product_b, "muc_do": muc_do, **result}


async def build_product_explanations(product_edges: list[dict], audience: str = "patient") -> list[dict]:
    if not product_edges:
        return []
    return list(await asyncio.gather(*(_explain_product_edge(edge, audience) for edge in product_edges)))


# ---- Tóm tắt tổng quan (luồng bệnh nhân + luồng dược sĩ, 2 giọng điệu riêng) ----
#
# Chỉ đưa tối đa từng này cặp thuốc-thuốc (nặng nhất trước) vào prompt làm ví dụ
# "đáng chú ý" - không đưa cả danh sách để giữ prompt gọn/rẻ.
_MAX_OVERVIEW_NOTABLE_PAIRS = 3

_OVERVIEW_SEVERITY_LABELS: list[tuple[str, str]] = [
    ("nang", "nghiêm trọng"),
    ("trung_binh", "trung bình"),
    ("nhe", "nhẹ"),
    ("chua_phan_loai", "chưa phân loại"),
]

# Yêu cầu LLM tự đánh dấu cụm từ muốn nhấn mạnh bằng markup {{muc_do:...}} - server
# tách ra (xem _parse_highlights) để frontend tô màu đúng theo mức độ, KHÔNG phải
# markdown chung chung nên không xung đột với rule cấm markdown ở dưới.
_HIGHLIGHT_INSTRUCTIONS = (
    "ĐÁNH DẤU NHẤN MẠNH: bọc MỖI cụm nêu tên 1 cặp thuốc đáng chú ý (đúng cụm bạn "
    "vừa viết ở câu 2, ví dụ \"Aspirin và Warfarin\") bằng markup "
    "{{muc_do:cụm từ}}, dùng ĐÚNG mức độ đã cho của cặp đó (nang/trung_binh/nhe/"
    "chua_phan_loai - viết liền không dấu, đúng 4 giá trị này). Ví dụ: "
    "\"{{nang:Aspirin và Warfarin}}\". Không bọc số liệu hay câu khác, không tự "
    "tạo mức độ ngoài 4 giá trị trên."
)

_OVERVIEW_SYSTEM_PROMPT_PATIENT = (
    "Bạn là một dược sĩ đang tóm tắt kết quả phân tích tương tác thuốc cho bệnh "
    "nhân, dựa CHỈ trên số liệu và danh sách cặp đáng chú ý CÓ THẬT được cung cấp "
    "ở tin nhắn tiếp theo - không thêm dữ kiện y khoa nào khác, không bịa số.\n\n"
    "Viết 1 đoạn ngắn (3-5 câu) bằng tiếng Việt, giọng gần gũi, thân thiện, xưng "
    "\"mình\", gọi người đọc là \"bạn\":\n"
    "- Câu đầu mở bằng đúng ngữ cảnh được cung cấp (kiểm tra TRONG 1 đơn thuốc hay "
    "so sánh GIỮA nhiều đơn thuốc khác nhau - diễn đạt tự nhiên theo đúng ngữ cảnh, "
    "không dùng khẩu hiệu cố định), rồi nêu tổng số cặp tương tác và phân bố theo "
    "từng mức độ (nghiêm trọng/trung bình/nhẹ/chưa phân loại) - CHỈ nhắc mức nào có "
    "số liệu > 0.\n"
    "- 1-2 câu tiếp gọi tên các cặp đáng chú ý nhất trong danh sách được cung cấp "
    "(không cần giải thích cơ chế, chỉ nêu tên 2 thuốc + mức độ), KHÔNG liệt kê hết "
    "mọi cặp.\n"
    "- Câu cuối mời xem chi tiết từng cặp ở phần bên dưới, diễn đạt tự nhiên.\n\n"
    f"{_HIGHLIGHT_INSTRUCTIONS}\n\n"
    "QUY TẮC BẮT BUỘC:\n"
    "- TUYỆT ĐỐI KHÔNG khuyên ngừng, đổi, kê đơn, hoặc tự ý điều chỉnh liều/thời "
    "điểm dùng bất kỳ thuốc nào — kể cả gợi ý mơ hồ.\n"
    "- TUYỆT ĐỐI KHÔNG chẩn đoán bệnh hay tình trạng sức khỏe của người dùng.\n"
    "- CHỈ dùng đúng số liệu và tên cặp được cung cấp — không thêm dữ kiện y khoa "
    "nào khác.\n"
    "- Ngoài markup nhấn mạnh {{muc_do:...}} đã nêu, viết văn bản thuần (plain "
    "text) — KHÔNG dùng markdown/ký hiệu in đậm (**), gạch đầu dòng, hay bất kỳ "
    "định dạng nào khác."
)

_OVERVIEW_SYSTEM_PROMPT_PHARMACIST = (
    "Bạn là dược sĩ lâm sàng đang tóm tắt kết quả phân tích tương tác thuốc để "
    "trình bày cho một dược sĩ khác đang tra cứu, dựa CHỈ trên số liệu và danh "
    "sách cặp đáng chú ý CÓ THẬT được cung cấp ở tin nhắn tiếp theo - không thêm "
    "dữ kiện y khoa nào khác, không bịa số.\n\n"
    "Viết 1 đoạn ngắn (3-5 câu) bằng tiếng Việt, văn phong khoa học, chuyên "
    "nghiệp, hạn chế xưng hô trực tiếp:\n"
    "- Câu đầu mở bằng đúng ngữ cảnh được cung cấp (phân tích TRONG 1 đơn thuốc "
    "hay so sánh GIỮA nhiều đơn thuốc khác nhau - diễn đạt tự nhiên theo đúng ngữ "
    "cảnh, không dùng khẩu hiệu cố định), rồi nêu tổng số cặp tương tác và phân bố "
    "theo từng mức độ (nghiêm trọng/trung bình/nhẹ/chưa phân loại) - CHỈ nhắc mức "
    "nào có số liệu > 0.\n"
    "- 1-2 câu tiếp gọi tên các cặp đáng chú ý nhất trong danh sách được cung cấp "
    "(không cần giải thích cơ chế, chỉ nêu tên 2 thuốc + mức độ), KHÔNG liệt kê hết "
    "mọi cặp.\n"
    "- Câu cuối mời xem chi tiết từng cặp ở phần bên dưới để có đầy đủ căn cứ "
    "trước khi ra quyết định lâm sàng.\n\n"
    f"{_HIGHLIGHT_INSTRUCTIONS}\n\n"
    "QUY TẮC BẮT BUỘC:\n"
    "- TUYỆT ĐỐI KHÔNG khuyên ngừng, đổi, kê đơn, hoặc tự ý điều chỉnh liều/thời "
    "điểm dùng bất kỳ thuốc nào — kể cả gợi ý mơ hồ.\n"
    "- CHỈ dùng đúng số liệu và tên cặp được cung cấp — không thêm dữ kiện y khoa "
    "nào khác.\n"
    "- Ngoài markup nhấn mạnh {{muc_do:...}} đã nêu, viết văn bản thuần (plain "
    "text) — KHÔNG dùng markdown/ký hiệu in đậm (**), gạch đầu dòng, hay bất kỳ "
    "định dạng nào khác."
)

_NO_INTERACTION_OVERVIEW_MESSAGE_PATIENT = (
    "Mình không tìm thấy tương tác nào giữa các thuốc bạn đã chọn trong CSDL "
    "DDInter 2.0 lần này. Nếu có thêm thuốc mới hoặc thay đổi liều, hãy kiểm tra "
    "lại hoặc hỏi dược sĩ/bác sĩ để chắc chắn nhé."
)

_NO_INTERACTION_OVERVIEW_MESSAGE_PHARMACIST = (
    "Không ghi nhận tương tác nào giữa các thuốc đã chọn trong cơ sở dữ liệu "
    "DDInter 2.0 ở lần phân tích này. Khi danh mục thuốc thay đổi, khuyến nghị thực "
    "hiện tra cứu lại để đảm bảo dữ liệu được cập nhật đầy đủ."
)


def _overview_context_line(prescription_count: int) -> str:
    if prescription_count <= 1:
        return "Ngữ cảnh: phân tích các thuốc TRONG 1 đơn thuốc (không so sánh với đơn nào khác)."
    if prescription_count == 2:
        return (
            "Ngữ cảnh: so sánh tương tác GIỮA 2 đơn thuốc khác nhau - chỉ tính cặp "
            "thuốc thuộc 2 đơn khác nhau, KHÔNG tính cặp trong cùng 1 đơn."
        )
    return (
        f"Ngữ cảnh: so sánh tương tác GIỮA {prescription_count} đơn thuốc khác nhau - "
        "chỉ tính cặp thuốc thuộc các đơn khác nhau, KHÔNG tính cặp trong cùng 1 đơn."
    )


def _overview_user_prompt(counts: dict[str, int], product_edges: list[dict], prescription_count: int) -> str:
    total = sum(counts.values())
    lines = [
        _overview_context_line(prescription_count),
        "",
        f"Tổng số cặp thuốc-thuốc có tương tác: {total}",
    ]
    lines += [f"- Mức {label}: {counts[key]}" for key, label in _OVERVIEW_SEVERITY_LABELS if counts[key] > 0]

    sorted_edges = sorted(product_edges, key=lambda e: _severity_rank(e.get("muc_do")), reverse=True)
    notable = sorted_edges[:_MAX_OVERVIEW_NOTABLE_PAIRS]
    if notable:
        lines.append("")
        lines.append("Các cặp đáng chú ý nhất (nặng nhất trước) - chỉ nêu tên, KHÔNG liệt kê cặp nào ngoài danh sách này:")
        lines += [f"- {edge.get('product_a')} + {edge.get('product_b')} (mức {edge.get('muc_do')})" for edge in notable]

    lines.append("")
    lines.append("Hãy viết đoạn tổng quan theo đúng hướng dẫn ở trên, bằng tiếng Việt.")
    return "\n".join(lines)


async def build_overview_explanation(
    product_edges: list[dict], audience: str = "patient", prescription_count: int = 1
) -> dict:
    """Tóm tắt tổng quan toàn bộ lần phân tích - nêu tổng số cặp + phân bố theo mức
    độ + 2-3 cặp đáng chú ý nhất, ngôn ngữ linh hoạt theo ngữ cảnh 1 đơn hay nhiều
    đơn (prescription_count - truyền len(prescriptions) từ routes.py). Đọc THẲNG dữ
    liệu gốc trong product_edges (không đọc lại product_explanations của LLM khác
    viết) để chạy song song được với build_product_explanations, xem
    routes.py::_run_product_check."""
    counts = severity_counts(product_edges)
    total = sum(counts.values())
    is_pharmacist = audience == "pharmacist"

    if total == 0:
        giai_thich = (
            _NO_INTERACTION_OVERVIEW_MESSAGE_PHARMACIST if is_pharmacist else _NO_INTERACTION_OVERVIEW_MESSAGE_PATIENT
        )
        nhan_manh: list[dict] = []
    else:
        system_prompt = _OVERVIEW_SYSTEM_PROMPT_PHARMACIST if is_pharmacist else _OVERVIEW_SYSTEM_PROMPT_PATIENT
        response = await ainvoke_llm(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": _overview_user_prompt(counts, product_edges, prescription_count)},
            ]
        )
        clean_text, nhan_manh = _parse_highlights((response.content or "").strip())
        giai_thich = filter_banned_language(clean_text)
        # filter_banned_language hoạ hoằn mới thay nguyên đoạn bằng câu fallback
        # trung lập (chỉ khi lỡ dính ngôn ngữ cấm) - lúc đó các cụm đã đánh dấu
        # không còn nằm trong giai_thich nữa, phải bỏ để frontend không tìm nhầm.
        if giai_thich != clean_text:
            nhan_manh = []

    return {
        "giai_thich": giai_thich,
        "nhan_manh": nhan_manh,
        "so_cap_nang": counts["nang"],
        "so_cap_trung_binh": counts["trung_binh"],
        "so_cap_nhe": counts["nhe"],
        "so_cap_chua_phan_loai": counts["chua_phan_loai"],
        "tong_so_cap": total,
    }
