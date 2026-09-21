import pytest

from src.agents.nodes.explain_node import explain_node
from src.agents.nodes.guardrail_node import guardrail_node
from src.agents.nodes.lookup_node import lookup_node
from src.agents.nodes.normalize_node import normalize_node
from src.agents.nodes.rank_node import rank_node
from src.db.models import Medication
from src.db.session import SessionLocal

# ID DDInter cố định, đã xác minh thực tế trong data/raw/vmec12_ddinter.db (GD6 mục 7.0).
ACETYLSALICYLIC_ACID_ID = "DDInter20"  # alias "aspirin"/"asp"
WARFARIN_ID = "DDInter1951"
ETHANOL_ID = "DDInter690"  # alias "ruou"/"rượu"
ACETAMINOPHEN_ID = "DDInter14"  # alias "paracetamol"/"panadol"/"tylenol"
IBUPROFEN_ID = "DDInter900"
FOLIC_ACID_ID = "DDInter771"
AMOXICILLIN_ID = "DDInter83"


def _has_real_data() -> bool:
    db = SessionLocal()
    try:
        return db.query(Medication).count() > 0
    except Exception:
        return False
    finally:
        db.close()


_requires_real_data = pytest.mark.skipif(
    not _has_real_data(),
    reason=(
        "Can chay `python scripts/import_ddinter.py` de nap du lieu that DDInter 2.0 "
        "vao data/app.db truoc (file nguon vmec12_ddinter.db khong nam trong git)."
    ),
)


# TC-N01: normalize_node chuẩn hóa alias/viết tắt thành tên chuẩn thật trong CSDL.
@_requires_real_data
@pytest.mark.asyncio
async def test_normalize_node_known_drugs():
    result = await normalize_node({"raw_medications": ["asp", "paracetamol"]})
    normalized = result["normalized_medications"]

    assert [m["ten_chuan"] for m in normalized] == ["Acetylsalicylic acid", "Acetaminophen"]
    assert [m["medication_id"] for m in normalized] == [
        ACETYLSALICYLIC_ACID_ID,
        ACETAMINOPHEN_ID,
    ]
    assert all(not m["khong_du_du_lieu"] for m in normalized)


# TC-N02: normalize_node không crash với thuốc không hợp lệ, gắn cờ thiếu dữ liệu.
@_requires_real_data
@pytest.mark.asyncio
async def test_normalize_node_unknown_drug():
    result = await normalize_node({"raw_medications": ["thuocxyzkhonghople"]})
    normalized = result["normalized_medications"]

    assert len(normalized) == 1
    assert normalized[0]["khong_du_du_lieu"] is True
    assert normalized[0]["ten_chuan"] is None
    assert normalized[0]["medication_id"] is None


# TC-N03: lookup_node trả đúng tương tác mức "nang" cho Warfarin + Aspirin (thật, DDInter).
@_requires_real_data
@pytest.mark.asyncio
async def test_lookup_node_finds_severe_interaction():
    result = await lookup_node(
        {
            "normalized_medications": [
                {
                    "ten_goc": "warfarin",
                    "ten_chuan": "Warfarin",
                    "medication_id": WARFARIN_ID,
                    "khong_du_du_lieu": False,
                },
                {
                    "ten_goc": "asp",
                    "ten_chuan": "Acetylsalicylic acid",
                    "medication_id": ACETYLSALICYLIC_ACID_ID,
                    "khong_du_du_lieu": False,
                },
            ]
        }
    )
    interaction_results = result["interaction_results"]

    assert len(interaction_results) == 1
    assert interaction_results[0]["khong_du_du_lieu"] is False
    assert interaction_results[0]["muc_do"] == "nang"
    assert interaction_results[0]["nguon_trich_dan"]


# TC-N04: lookup_node không bịa tương tác khi 2 thuốc thật không có cặp trong CSDL.
# Da 2 lan phai doi cap "thuc" dung de test (Ethanol+Acetaminophen roi
# Amoxicillin+Acetaminophen) vi moi lan nap them du lieu that (mo rong ATC, roi
# migrate_to_cockroach.py gop merged_ddinter.db tu 70.424 len 160.227 cap - xem
# docs/database-split.md) lai vo tinh lam cap dang dung "co du lieu that". Dung
# 1 medication_id gia (khong ton tai) thay vi 1 cap thuoc that de test nay khong con
# phu thuoc vao tinh trang du lieu con thieu tai 1 thoi diem - se luon dung du DB co
# mo rong bao nhieu di nua.
@_requires_real_data
@pytest.mark.asyncio
async def test_lookup_node_no_data_for_unknown_pair():
    result = await lookup_node(
        {
            "normalized_medications": [
                {
                    "ten_goc": "amoxicillin",
                    "ten_chuan": "Amoxicillin",
                    "medication_id": AMOXICILLIN_ID,
                    "khong_du_du_lieu": False,
                },
                {
                    "ten_goc": "thuoc khong ton tai",
                    "ten_chuan": "ThuocKhongTonTai",
                    "medication_id": "DDInter_KHONG_TON_TAI",
                    "khong_du_du_lieu": False,
                },
            ]
        }
    )
    interaction_results = result["interaction_results"]

    assert len(interaction_results) == 1
    assert interaction_results[0]["khong_du_du_lieu"] is True
    assert "muc_do" not in interaction_results[0]


# TC-N09: lookup_node trả đúng mức "chua_phan_loai" cho Ibuprofen + Folic acid (Level=Unknown thật).
@_requires_real_data
@pytest.mark.asyncio
async def test_lookup_node_finds_unclassified_interaction():
    result = await lookup_node(
        {
            "normalized_medications": [
                {
                    "ten_goc": "ibuprofen",
                    "ten_chuan": "Ibuprofen",
                    "medication_id": IBUPROFEN_ID,
                    "khong_du_du_lieu": False,
                },
                {
                    "ten_goc": "folic acid",
                    "ten_chuan": "Folic acid",
                    "medication_id": FOLIC_ACID_ID,
                    "khong_du_du_lieu": False,
                },
            ]
        }
    )
    interaction_results = result["interaction_results"]

    assert len(interaction_results) == 1
    assert interaction_results[0]["khong_du_du_lieu"] is False
    assert interaction_results[0]["muc_do"] == "chua_phan_loai"


# TC-N05: rank_node đặt has_severe = True khi có tương tác mức nang.
@pytest.mark.asyncio
async def test_rank_node_flags_severe():
    result = await rank_node(
        {
            "interaction_results": [
                {
                    "thuoc_a": "Warfarin",
                    "thuoc_b": "Acetylsalicylic acid",
                    "muc_do": "nang",
                    "nguon_trich_dan": "DDInter 2.0",
                    "khong_du_du_lieu": False,
                }
            ]
        }
    )

    assert result["has_severe"] is True
    assert result["has_unclassified"] is False
    assert result["ranked_results"][0]["muc_do"] == "nang"


# TC-N10: rank_node đặt has_unclassified = True cho "chua_phan_loai", KHÔNG tính là has_severe.
@pytest.mark.asyncio
async def test_rank_node_flags_unclassified():
    result = await rank_node(
        {
            "interaction_results": [
                {
                    "thuoc_a": "Ibuprofen",
                    "thuoc_b": "Folic acid",
                    "muc_do": "chua_phan_loai",
                    "nguon_trich_dan": "DDInter 2.0",
                    "khong_du_du_lieu": False,
                }
            ]
        }
    )

    assert result["has_severe"] is False
    assert result["has_unclassified"] is True


# TC-N06: explain_node luôn gán nguon_trich_dan không rỗng cho mỗi giải thích.
@pytest.mark.asyncio
async def test_explain_node_always_has_citation():
    # explain_node không còn gọi LLM (chỉ giữ field cấu trúc) - không cần mock nữa.
    result = await explain_node(
        {
            "ranked_results": [
                {
                    "thuoc_a": "Warfarin",
                    "thuoc_b": "Acetylsalicylic acid",
                    "muc_do": "nang",
                    "mo_ta": "Warfarin va Aspirin dung chung lam tang dang ke nguy co chay mau noi tang.",
                    "nguon_trich_dan": "DDInter 2.0",
                    "khong_du_du_lieu": False,
                }
            ]
        }
    )

    explanations = result["explanations"]
    assert len(explanations) == 1
    assert explanations[0]["nguon_trich_dan"]


# TC-N11: explain_node trả câu cố định cho mức "chua_phan_loai" - node này không
# còn gọi LLM ở bất kỳ nhánh nào (xem TC-N06 test_explain_node_always_has_citation).
@pytest.mark.asyncio
async def test_explain_node_unclassified_skips_llm():
    result = await explain_node(
        {
            "ranked_results": [
                {
                    "thuoc_a": "Ibuprofen",
                    "thuoc_b": "Folic acid",
                    "muc_do": "chua_phan_loai",
                    "nguon_trich_dan": "DDInter 2.0",
                    "khong_du_du_lieu": False,
                }
            ]
        }
    )

    explanations = result["explanations"]
    assert len(explanations) == 1
    assert "chưa phân loại" in explanations[0]["giai_thich"].lower()


# TC-N07: guardrail_node chặn ngôn ngữ khuyên ngừng/đổi thuốc, thay bằng câu trung lập.
@pytest.mark.asyncio
async def test_guardrail_node_blocks_medical_advice():
    result = await guardrail_node(
        {
            "explanations": [
                {
                    "thuoc_a": "Warfarin",
                    "thuoc_b": "Acetylsalicylic acid",
                    "giai_thich": "Bạn nên ngừng dùng Aspirin ngay lập tức.",
                    "nguon_trich_dan": "DDInter 2.0",
                }
            ]
        }
    )

    assert "error" not in result
    giai_thich = result["explanations"][0]["giai_thich"]
    assert "ngừng" not in giai_thich.lower()
    assert "dược sĩ" in giai_thich.lower() or "bác sĩ" in giai_thich.lower()


# TC-N12: guardrail_node cũng chặn cụm tiếng Anh còn sót từ dữ liệu gốc (Management/Interaction).
@pytest.mark.asyncio
async def test_guardrail_node_blocks_english_medical_advice():
    result = await guardrail_node(
        {
            "explanations": [
                {
                    "thuoc_a": "Dolutegravir",
                    "thuoc_b": "Iron",
                    "giai_thich": "Dolutegravir should be administered 2 hours before iron.",
                    "nguon_trich_dan": "DDInter 2.0",
                }
            ]
        }
    )

    assert "error" not in result
    giai_thich = result["explanations"][0]["giai_thich"]
    assert "should be administered" not in giai_thich.lower()
    assert "dược sĩ" in giai_thich.lower() or "bác sĩ" in giai_thich.lower()


# TC-N08: guardrail_node set error khi thiếu nguon_trich_dan (route thẳng tới END).
@pytest.mark.asyncio
async def test_guardrail_node_blocks_missing_citation():
    result = await guardrail_node(
        {
            "explanations": [
                {
                    "thuoc_a": "Warfarin",
                    "thuoc_b": "Acetylsalicylic acid",
                    "giai_thich": "Hai thuốc này có thể tương tác với nhau.",
                    "nguon_trich_dan": "",
                }
            ]
        }
    )

    assert result.get("error")
