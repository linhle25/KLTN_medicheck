import json

from src.agents.state import MedCheckState
from src.agents.tools.drug_normalizer_tool import drug_normalizer


async def normalize_node(state: MedCheckState) -> dict:
    """Chuẩn hóa danh sách tên thuốc thô người dùng nhập."""
    raw_medications = state.get("raw_medications", [])

    result = await drug_normalizer.ainvoke({"medication_names": raw_medications})
    normalized_medications = json.loads(result)

    return {"normalized_medications": normalized_medications}
