import json

from src.agents.state import MedCheckState
from src.agents.tools.interaction_lookup_tool import interaction_lookup


async def lookup_node(state: MedCheckState) -> dict:
    """Tra cứu tương tác giữa các thuốc đã chuẩn hóa qua CSDL SQL (DDInter 2.0)."""
    normalized_medications = state.get("normalized_medications", [])
    valid_ids = [
        med["medication_id"]
        for med in normalized_medications
        if not med.get("khong_du_du_lieu")
    ]

    if len(valid_ids) < 2:
        return {"interaction_results": []}

    result = await interaction_lookup.ainvoke({"medication_ids": valid_ids})
    interaction_results = json.loads(result)

    return {"interaction_results": interaction_results}
