import re

from src.agents.state import MedCheckState

# Các cụm từ mang tính khuyên đổi/ngừng/kê thuốc - tuyệt đối không để lọt ra ngoài.
_BANNED_PATTERNS = [
    # Mọi kiểu "cần/nên/hãy/phải (được) (tạm) ngừng/ngưng" - thay cho danh sách cụm
    # cứng cũ ("nên ngừng"/"hãy ngừng"...) vốn bỏ sót nhiều cách viết thật gặp qua
    # verify 31/08 ("cần được ngừng hẳn", "nên được tạm ngưng", "cần ngừng" - xem
    # eval/results/report.md Finding 15). "ngưng" là từ đồng nghĩa với "ngừng".
    r"(?:cần|nên|hãy|phải)\s+(?:được\s+)?(?:tạm\s+)?ng(?:ừng|ưng)",
    # Bổ sung 01/09 (cùng ngày, phát hiện qua chạy consistency 3 lần/case -
    # dis-trung_binh-016 rep3) - câu GHÉP kiểu "cần [mệnh đề A] và ngừng [mệnh đề B]"
    # lọt qua pattern trên vì "ngừng" không đứng NGAY sau modal verb (có "và" và
    # mệnh đề A xen giữa). Neo bằng cùng modal verb + "và" trong phạm vi 1 câu (giới
    # hạn 40 ký tự, không vượt qua dấu chấm) để không bắt nhầm câu mô tả sự kiện
    # thuần tuý dùng "ngừng thuốc"/"và ngừng" không do modal verb chi phối (vd "sau
    # khi ngừng thuốc 2 tuần, nồng độ trở về bình thường").
    r"(?:cần|nên|hãy|phải)\b(?:(?!\.).){0,40}?\bvà\s+(?:được\s+)?(?:tạm\s+)?ng(?:ừng|ưng)",
    r"ngừng dùng",
    r"nên đổi",
    r"đổi sang thuốc khác",
    r"kê đơn",
    r"kê thuốc",
    r"nên dùng thay",
    r"thay thế bằng thuốc",
    # Gợi ý điều chỉnh thời điểm/khoảng cách dùng thuốc - dù không nêu con số cụ
    # thể vẫn là một hình thức "khuyên xử trí" mà AI không được phép tự đưa ra
    # (việc này thuộc về bác sĩ/dược sĩ). Bỏ "cách nhau"/"gần nhau" trần trụi (01/09,
    # xem eval/results/report.md) - 2 cụm này quá phổ biến trong tiếng Việt, không
    # liên quan gì đến liều/thời điểm dùng thuốc cũng dùng được (vd mô tả khoảng
    # cách giữa 2 lần đo), khác "giãn cách"/"tách ..." bên dưới vốn đã tự neo đúng
    # ngữ cảnh liều dùng.
    r"giãn cách",
    r"tách (?:thời điểm|thời gian|liều|giờ|ra)",
    # Bổ sung 01/09 (cùng ngày, phát hiện qua subagent-judge case rt-sokieu-009) -
    # "cách nhau"/"cách xa nhau" trần trụi đã bỏ ở trên vì quá rộng, nhưng khi đi
    # kèm 1 con số + đơn vị thời gian ngay sau ("cách xa nhau ít nhất 2 giờ") thì
    # gần như chắc chắn là chỉ dẫn giãn liều cụ thể - leak thật lọt qua cả 2 pattern
    # "giãn cách"/"tách ..." phía trên (không dùng đúng 2 từ khoá đó). Neo bằng số +
    # đơn vị thời gian ngay sau để không lặp lại lỗi quá rộng của bản gốc.
    #
    # Bổ sung lần 2 cùng ngày (chấm lại bằng subagent Claude trên batch lớn, cùng
    # case rt-sokieu-009 nhưng 1 lần sinh KHÁC): câu thật là "...tách thời gian
    # uống hai thuốc RA XA NHAU khoảng 2 giờ" - dùng "ra xa nhau" thay vì "cách xa
    # nhau", né được pattern trên (chỉ neo "cách"). Thêm "ra" làm điểm neo tương
    # đương "cách" - cùng lý do (đi kèm số + đơn vị thời gian mới bắt, không bắt
    # "ra xa nhau" trần trụi).
    r"(?:cách|ra)(?:\s+xa)?\s+nhau\s+(?:ít nhất\s+|khoảng\s+)?\d+[\s-]*(?:giờ|phút|tiếng|ngày)",
    # Bổ sung lần 3 cùng ngày (phát hiện qua metric consistency 3-lần/case, không
    # phải qua leak-hunting trực tiếp - dd-trung_binh-017 rep3): "cần lưu ý thời
    # điểm dùng erlotinib CÁCH XA liều của thuốc kháng H2" - "cách xa" đứng MỘT
    # MÌNH, không có "nhau" và không có số + đơn vị thời gian đi kèm - né cả pattern
    # "cách/ra xa nhau + số" lẫn "tách thời điểm/...". Ghi chú: đây là cuộc rượt
    # đuổi liên tục giữa cách diễn đạt của LLM và regex hậu kiểm (temperature=0.7
    # sinh ra vô số cách paraphrase) - nêu trong eval/results/report.md như một hạn
    # chế cấu trúc, không kỳ vọng vá hết mọi biến thể bằng regex. Neo bằng "thời
    # điểm dùng ... cách xa" (không cần "nhau"/số) vì cụm "thời điểm dùng X" đứng
    # trước gần như chỉ xuất hiện khi đang nói về giãn cách liều dùng thuốc.
    r"thời điểm dùng\b(?:(?!\.).){0,40}?\bcách\s*xa",
    # Bổ sung lần 4 (verify sau khi nạp lại ví, cùng case dd-trung_binh-017, 2 lần
    # sinh khác của cùng case, temperature=0.3): 2 câu leak thật đều né được:
    # (a) "APO-Erlotinib CÁCH XA THỜI ĐIỂM dùng thuốc kháng H2" - thứ tự NGƯỢC với
    #     pattern trên (bản trên chỉ bắt "thời điểm dùng...cách xa", không bắt
    #     chiều "cách xa...thời điểm dùng") - cùng lỗi thiếu 2 chiều đã gặp ở modal
    #     +liều (tone_prompt.py) trước đó, giờ lặp lại ở đây.
    # (b) "dùng erlotinib..., CÁCH ÍT NHẤT 2 GIỜ TRƯỚC HOẶC 10 GIỜ SAU liều thuốc
    #     kháng H2" - chỉ liều rất cụ thể nhưng không có chữ "nhau" (pattern dòng
    #     49 bắt buộc phải có "nhau") vì đây là quan hệ 1 CHIỀU với 1 mốc neo (liều
    #     thuốc khác), không phải "each other" nên ngữ pháp tự nhiên không cần
    #     "nhau" - khác hẳn giả định ban đầu khi viết pattern đó.
    r"\bcách\s*xa\b(?:(?!\.).){0,40}?\bthời điểm dùng",
    r"cách\s+(?:ít nhất\s+|khoảng\s+)?\d+[\s-]*(?:giờ|phút|tiếng|ngày)\s+(?:trước|sau)",
    # Bổ sung 31/08 - các cụm leak thật tìm được qua κ/soát tay mà bộ pattern cũ
    # chưa bắt (dd-nang-016, dis-nang-006, dis-nhe-019, dis-trung_binh-018 - xem
    # eval/results/report.md Finding 15). Thêm điều kiện tình thái (01/09, cùng
    # nguồn) theo đúng khuôn pattern "ngừng/ngưng" ở trên - bản cũ bắt trần trụi
    # "giảm liều"/"tăng liều"/... nên chặn nhầm cả câu mô tả sự kiện thuần túy
    # (vd "khi giảm liều thuốc X thì nồng độ Y cũng giảm theo", không phải AI
    # đang khuyên đổi liều). Thêm "khuyến cáo/khuyến nghị" vì DDInter hay viết
    # kiểu đó (vd dis-nang-006 mục thần kinh ngoại biên: "...nhưng khuyến cáo
    # giảm liều").
    r"(?:cần|nên|hãy|phải|khuyến cáo|khuyến nghị)\s+(?:được\s+)?(?:giảm|tăng|điều chỉnh|chỉnh)\s+liều",
    # Bổ sung 01/09 (phát hiện qua metric consistency, 2 case độc lập
    # dis-trung_binh-011 và food-nang-007 cùng dùng cụm "cân nhắc giảm liều...") -
    # "cân nhắc" không nằm trong danh sách modal cũ. Chỉ thêm "cân nhắc" (không
    # thêm "có thể" - quá rộng, sẽ bắt nhầm nhiều câu mô tả khả năng thuần tuý)
    # ghép với đúng {giảm|tăng|điều chỉnh|chỉnh} + liều nên vẫn hẹp, không lặp lại
    # lỗi bắt trần trụi "giảm liều"/"tăng liều" đã sửa trước đó.
    r"cân nhắc\s+(?:được\s+)?(?:giảm|tăng|điều chỉnh|chỉnh)\s+liều",
    r"chuyển (?:sang )?phương án điều trị",
    r"đổi phương án điều trị",
    # Cụm tiếng Anh tương đương - dữ liệu thật DDInter 2.0 (Interaction/Management)
    # là tiếng Anh, LLM có thể lỡ giữ nguyên/paraphrase gần với câu gốc (GD6 mục 7.6).
    r"should be administered",
    r"should not be (?:used|taken) together",
    r"discontinu\w*",
    r"stop taking",
    r"switch to",
    r"should be avoided",
    r"avoid (?:concurrent|concomitant) use",
    r"space (?:out|apart)",
    r"separate (?:the )?(?:doses|administration)",
    # Bổ sung 01/09 (rà soát kiến trúc trước eval quy mô lớn) - "discontinue" (cụm
    # cũ) không khớp "discontinuation"/"discontinued" (thiếu hậu tố), và "dose/
    # dosage reduction" chưa có pattern nào bắt - xác nhận qua query trực tiếp CSDL
    # production: 213/160 227 dòng Interaction.mo_ta và 2/803 dòng
    # FoodInteraction.mo_ta (2 bảng CÓ cột xu_tri riêng, giả định trước đây là
    # "sạch") vẫn dính câu xử trí kiểu này lẫn trong mô tả. Cấp thuốc-thuốc
    # (_explain_product_edge) không lọc được ở tầng prompt như food/disease vì
    # PART 1 (giai_thich)+PART 2 (bản dịch) sinh chung 1 lệnh gọi từ chung 1 prompt -
    # lọc trước sẽ làm mất nội dung PART 2 dành cho dược sĩ. Đây là lớp phòng thủ
    # hậu kiểm duy nhất cho trường hợp đó, cũng áp dụng chung cho mọi cấp khác.
    r"dosage\s+reduction",
    r"dose\s+reduction",
    # Bổ sung 01/09 (cùng đợt, phát hiện qua case dis-nang-001 - Benazepril + Kidney
    # Diseases): câu nguồn "Patients ... usually require lower or less frequent
    # doses and smaller increments in dose" không dùng "should/must/need to" nên
    # né được _MANAGEMENT_SENTENCE_RE (tone_prompt.py, chỉ áp cho food/disease
    # trước prompt) VÀ né hết pattern cũ ở đây - lọt thẳng vào giai_thich tiếng
    # Việt ("thường cần liều thấp hơn..."). Thêm cả bản tiếng Anh (phòng khi model
    # giữ nguyên/paraphrase gần nguyên văn) lẫn bản tiếng Việt tương ứng - đây là
    # lớp phòng thủ DUY NHẤT cho cấp thuốc-thuốc (không lọc pre-prompt được, xem
    # comment ở dòng dosage/dose reduction phía trên).
    r"requir\w*.{0,60}?dos(?:e|age|es)\b",
    r"(?:cần|nên|thường cần|yêu cầu)\s+liều\s+(?:thấp|cao|nhỏ|lớn)\s*hơn",
]
_BANNED_REGEX = re.compile("|".join(_BANNED_PATTERNS), re.IGNORECASE)

_NEUTRAL_FALLBACK = (
    "Không thể đưa ra khuyến nghị thay đổi thuốc. Vui lòng hỏi dược sĩ hoặc "
    "bác sĩ để được tư vấn phù hợp."
)


def filter_banned_language(text: str) -> str:
    """Chặn ngôn ngữ khuyên đổi/ngừng thuốc trong 1 đoạn text - dùng chung cho mọi
    cấp (hoạt chất trong guardrail_node bên dưới, và thuốc/đơn thuốc trong
    rollup_explain, nơi không chạy qua node LangGraph này).

    Lọc theo TỪNG CÂU (01/09, xem eval/results/report.md) thay vì xoá nguyên cả
    đoạn khi chỉ 1 câu dính - bản cũ hễ dính là thay cả đoạn bằng
    _NEUTRAL_FALLBACK, xoá oan luôn cả những câu cơ chế/hậu quả sạch và có nguồn,
    verify qua eval pilot cho thấy việc này xảy ra khá thường xuyên (case
    dis-nang-006 mục thần kinh ngoại biên bị nuốt trắng dù 4/5 câu còn lại an
    toàn). Chỉ rơi về fallback khi TẤT CẢ câu đều dính (hiếm)."""
    if not text:
        return text
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    kept = [s for s in sentences if not _BANNED_REGEX.search(s)]
    if not kept:
        return _NEUTRAL_FALLBACK
    return " ".join(kept).strip()


async def guardrail_node(state: MedCheckState) -> dict:
    """Chặn hallucination (thiếu citation) và ngôn ngữ khuyên đổi/ngừng thuốc."""
    explanations = state.get("explanations", [])

    for explanation in explanations:
        if not explanation.get("nguon_trich_dan"):
            return {
                "error": (
                    "Giải thích thiếu nguồn trích dẫn - chặn để tránh hallucination."
                )
            }

    filtered_explanations = []
    for explanation in explanations:
        updated = dict(explanation)
        if updated.get("giai_thich"):
            updated["giai_thich"] = filter_banned_language(updated["giai_thich"])
        if updated.get("giai_thich_duoc_si"):
            updated["giai_thich_duoc_si"] = filter_banned_language(updated["giai_thich_duoc_si"])
        filtered_explanations.append(updated)

    return {"explanations": filtered_explanations}
