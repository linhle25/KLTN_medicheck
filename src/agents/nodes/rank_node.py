import json

from src.agents.state import MedCheckState
from src.agents.tools.severity_ranker_tool import severity_ranker


async def rank_node(state: MedCheckState) -> dict:
    """Xếp hạng mức độ nghiêm trọng của các kết quả tương tác."""
    interaction_results = state.get("interaction_results", [])

    result = await severity_ranker.ainvoke({"interaction_results": interaction_results})
    ranked = json.loads(result)

    return {
        "ranked_results": ranked["ranked_results"],
        "has_severe": ranked["has_severe"],
        "has_unclassified": ranked["has_unclassified"],
    }
