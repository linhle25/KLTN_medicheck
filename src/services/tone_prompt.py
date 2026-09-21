"""Khung prompt dùng chung cho mọi cấp (hoạt chất/thuốc/đơn thuốc/thực phẩm/bệnh
nền): quy tắc an toàn bắt buộc, để các nơi gọi LLM sinh giải thích không lặp lại
và không lệch nhau.

Trước đây module này còn giữ FORMAT_INSTRUCTIONS/parse_tones/2 marker để 1 lệnh
gọi LLM sinh CẢ 2 giọng điệu (bệnh nhân + dược sĩ) cùng lúc - đã bỏ vì audience
không dùng tới luôn bị vứt đi ở MỌI luồng trong app (guest không lưu + bị strip
trước khi gửi; patient-check được dược sĩ review vẫn hiện giọng bệnh nhân theo
đúng thiết kế; pharmacist-lookup không patient nào xem được) - tốn gấp đôi token
output vô ích. Giờ mỗi lệnh gọi chỉ sinh 1 giọng khớp audience đã biết trước tại
nơi gọi (xem src/agents/state.py::audience, src/agents/nodes/explain_node.py)."""

import re

SAFETY_RULES = (
    "QUY TẮC BẮT BUỘC:\n"
    "- TUYỆT ĐỐI KHÔNG khuyên ngừng, đổi, kê đơn, hoặc tự ý điều chỉnh liều/thời "
    "điểm dùng bất kỳ thuốc nào - kể cả gợi ý mơ hồ, không nêu con số cụ thể (ví dụ "
    "\"uống cách xa nhau\", \"đừng dùng gần nhau\", \"giãn cách ra\"). Quyết định xử "
    "trí luôn thuộc về bác sĩ/dược sĩ.\n"
    "- TUYỆT ĐỐI KHÔNG chẩn đoán bệnh hay tình trạng sức khỏe của người dùng.\n"
    "- CHỈ diễn giải lại đúng thông tin dữ liệu được cung cấp trong tin nhắn tiếp "
    "theo - không thêm dữ kiện y khoa, tên hoạt chất, cơ chế, hay con số nào không "
    "có trong đó.\n"
    "- Nếu dữ liệu dùng từ ngữ mơ hồ/khái quát (\"một số loại\", \"certain\", \"some\", "
    "\"may\") mà KHÔNG xác nhận riêng cho đúng hoạt chất/thuốc đang xét, PHẢI giữ "
    "nguyên mức mơ hồ đó khi viết lại - KHÔNG khẳng định chắc chắn như thể đã được "
    "xác nhận riêng cho thuốc này.\n"
    "- KHÔNG mượn cơ chế/kết luận của một hoạt chất hay tương tác KHÁC (dù nghe liên "
    "quan) để giải thích cho tương tác đang xét, trừ khi dữ liệu được cung cấp xác "
    "nhận rõ điều đó áp dụng đúng cho cặp này.\n"
    "- Nếu dữ liệu liệt kê tên các hoạt chất/thuốc KHÁC chỉ để làm VÍ DỤ minh hoạ "
    "cho một nhóm thuốc chung (vd \"như azathioprine hoặc mercaptopurine\", \"như "
    "cortisone, hydrocortisone\", \"như diltiazem, verapamil\"), KHÔNG nêu tên các "
    "hoạt chất ví dụ đó trong đoạn giải thích - chỉ nói tên nhóm chung nếu cần "
    "(vd \"nhóm ức chế miễn dịch khác\"), trừ khi hoạt chất đó chính là 1 trong 2 "
    "đối tượng đang xét trong cặp này.\n"
    "- Dữ liệu nguồn (Mô tả/Xử trí CSDL) viết bằng tên HOẠT CHẤT hoặc tên NHÓM DƯỢC LÝ "
    "(vd \"cyanocobalamin\", \"nitrat\", \"alkaloid vinca\", \"glucocorticoid\") vì đó "
    "là cách CSDL DDInter ghi nhận - nhưng khi viết đoạn giải thích, PHẢI luôn gọi "
    "thuốc đang xét bằng đúng tên thuốc/biệt dược đã cho ở đầu prompt (vd \"B12 "
    "Ankermann\", \"Biresort 10\"), XUYÊN SUỐT toàn bộ đoạn - không được lặp lại tên "
    "hoạt chất/tên nhóm dược lý của CHÍNH thuốc này ở bất kỳ câu nào, kể cả câu sau "
    "câu đầu, vì người đọc (bệnh nhân) không biết tên hoạt chất tương ứng với thuốc "
    "họ đang cầm trên tay."
)


# Marker cho phần dịch nguyên văn (không qua diễn giải) - dùng ở những nơi cần dịch
# thẳng mô tả/xử trí gốc từ CSDL DDInter (hoạt chất-hoạt chất, hoạt chất-thực phẩm,
# hoạt chất-bệnh nền) song song với đoạn giải thích ở trên, chỉ dược sĩ mới thấy.
TRANSLATION_MARKER = "[BẢN_DỊCH]"


# Lọc câu mang tính xử trí (khuyên ngừng/đổi/chỉnh liều) lẫn trong Mô tả (Interaction)
# TRƯỚC khi đưa vào prompt sinh văn tổng hợp (PART 1/giai_thich) - áp dụng cho MỌI
# cấp có mo_ta (thuốc-thuốc, thực phẩm, bệnh nền), không chỉ bệnh nền như bản đầu.
#
# Ban đầu tưởng chỉ bệnh nền (DDSI) mới bị lỗi này vì DDInter không có cột Management
# riêng cho bảng đó (xem eval/results/report.md Finding 15/§4.5) - nhưng query trực
# tiếp CSDL production (01/09, review kiến trúc trước khi eval quy mô lớn) cho thấy
# Interaction.mo_ta (thuốc-thuốc, CÓ cột xu_tri riêng) vẫn dính 213/160 227 dòng
# (0.13%), FoodInteraction.mo_ta (CÓ cột xu_tri riêng) dính 2/803 dòng (0.25%) -
# tức DDInter thỉnh thoảng trộn câu xử trí vào Interaction ngay cả khi có cột
# Management riêng, không chỉ ở bảng thiếu cột đó. Quy mô nhỏ nhưng cùng loại lỗi -
# lọc luôn cho đồng bộ, hàm này vô hại khi không khớp (không tốn gì thêm).
#
# CHỈ áp dụng cho prompt sinh PART 1 (giai_thich) - KHÔNG áp dụng cho input của
# literal_merge_translate/PART 2 (bản dịch bám sát nghĩa gốc dành cho dược sĩ) vì
# sẽ làm mất nội dung thật ở đúng nơi cần giữ nguyên văn nhất. Riêng cấp thuốc-thuốc
# (_explain_product_edge, rollup_explain.py) sinh PART 1+PART 2 chung 1 lệnh gọi từ
# CHUNG 1 prompt - không áp dụng hàm này ở đó được (sẽ làm hỏng PART 2), thay vào đó
# dựa vào filter_banned_language hậu kiểm (guardrail_node.py) đã mở rộng pattern để
# bắt tốt hơn các biến thể tiếng Anh còn sót (discontinuation, dose reduction...).
#
# Bắt theo KHUÔN ngữ pháp (modal + động từ hành động cụ thể) thay vì liệt kê từng
# cụm cố định - danh sách cụm cứng cũ bỏ sót "doses should be titrated" (soát tay
# 01/09, xem eval/results/report.md §4.4). Chỉ đưa vào danh sách động từ nào CHẮC
# CHẮN là hành động xử trí (ngừng/đổi/chỉnh liều...) - không đưa các từ mơ hồ như
# "monitor"/"manage"/"observe" vì SAFETY_RULES cho phép câu theo dõi/thận trọng
# chung (không phải chỉ định hành động cụ thể).
_MANAGEMENT_ACTION_VERBS = (
    r"administer|suspend|discontinue|avoid|reduce|initiate|titrate|adjust"
    r"|modify|increase|decrease|switch|limit|restrict|withhold|withdraw"
)
_MANAGEMENT_SENTENCE_RE = re.compile(
    rf"\b("
    rf"(?:should|must|need(?:s)?\s+to)\s+(?:be\s+|not\s+be\s+)?"
    rf"(?:{_MANAGEMENT_ACTION_VERBS})\w*"
    rf"|dosage\s+reduction|dose\s+reduction"
    rf"|alternative\s+therap\w*\s+should\s+be\s+considered"
    rf"|is\s+contraindicated|are\s+contraindicated"
    rf"|should\s+not\s+be\s+used"
    # Bổ sung 01/09 (pilot review trước eval quy mô lớn) - phát hiện qua case
    # dis-nang-001 (Benazepril + Kidney Diseases): câu "Patients with moderate to
    # severe renal impairment usually require lower or less frequent doses and
    # smaller increments in dose" lọt được vào giai_thich vì dùng "require" thay vì
    # "should/must/need to" - né hết pattern modal ở trên. "require" đi kèm liều
    # lượng gần như luôn là chỉ dẫn xử trí (chỉnh liều), khác các câu mô tả cơ chế
    # thuần tuý không đề cập tới liều.
    rf"|requir\w*.{{0,60}}?\bdos(?:e|age|es)\b"
    # Bổ sung 01/09 (cùng đợt, phát hiện qua case dis-trung_binh-012 - cephalosporin
    # + lọc máu): câu "Doses should be scheduled to be given after dialysis or a
    # supplemental dose should be given after dialysis" lọt qua vì "scheduled"/
    # "given" không nằm trong _MANAGEMENT_ACTION_VERBS - liệt kê thêm từng động từ
    # mới gặp là trò chơi đuổi bắt không hồi kết. Tổng quát hoá: modal verb
    # (should/must/need to) xuất hiện GẦN "dose/dosage/doses" trong cùng câu hầu
    # như luôn là chỉ dẫn liều lượng, bất kể động từ cụ thể là gì.
    # LƯU Ý thứ tự: "Doses should be..." đặt danh từ TRƯỚC modal verb (chủ ngữ
    # trước động từ, khác "require lower doses" ở trên có động từ trước tân ngữ) -
    # phải bắt CẢ 2 chiều, bản đầu chỉ bắt modal-trước-dose nên bỏ sót chính câu
    # dùng để viết comment này (đã tự phát hiện khi viết unit check, sửa lại đây).
    rf"|\bdos(?:e|age|es)\b.{{0,40}}?(?:should|must|need(?:s)?\s+to)\b"
    rf"|(?:should|must|need(?:s)?\s+to)\b.{{0,40}}?\bdos(?:e|age|es)\b"
    rf")\b",
    re.IGNORECASE,
)


def strip_management_sentences(mo_ta: str | None) -> str:
    if not mo_ta:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", mo_ta.strip())
    kept = [s for s in sentences if not _MANAGEMENT_SENTENCE_RE.search(s)]
    return " ".join(kept).strip()


def split_translation_block(raw: str, labels: list[tuple[str, str]]) -> tuple[str, dict[str, str | None]]:
    """Tách phần dịch nguyên văn (bắt đầu bằng TRANSLATION_MARKER) ra khỏi phần còn
    lại của phản hồi LLM.

    labels: danh sách (nhãn dòng viết thường có dấu ':', tên field kết quả), ví dụ
    [("mô tả:", "mo_ta_dich"), ("xử trí:", "xu_tri_dich")] - đúng thứ tự đã yêu cầu
    LLM trả về trong phần hướng dẫn định dạng. Trả về (phần còn lại, dict tên field
    -> giá trị hoặc None nếu thiếu/không có).
    """
    values: dict[str, str | None] = {key: None for _, key in labels}
    if TRANSLATION_MARKER not in raw:
        return raw, values
    rest, block = raw.split(TRANSLATION_MARKER, 1)
    for line in block.strip().splitlines():
        line = line.strip()
        lower = line.lower()
        for label, key in labels:
            if lower.startswith(label):
                values[key] = line.split(":", 1)[1].strip() or None
                break
    return rest, values
