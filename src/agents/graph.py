import logging
import time
from collections.abc import Awaitable, Callable

from langgraph.graph import END, StateGraph

from src.agents.nodes.explain_node import explain_node
from src.agents.nodes.guardrail_node import guardrail_node
from src.agents.nodes.lookup_node import lookup_node
from src.agents.nodes.normalize_node import normalize_node
from src.agents.nodes.rank_node import rank_node
from src.agents.state import MedCheckState

logger = logging.getLogger(__name__)

NodeFn = Callable[[MedCheckState], Awaitable[dict]]


def _timed_node(name: str, node_fn: NodeFn) -> NodeFn:
    """Bọc 1 node LangGraph để đo + log thời gian chạy - không đổi hành vi/kết quả
    của node, chỉ thêm quan sát. explain là node duy nhất gọi LLM (các node còn lại
    chỉ SQL/regex) nên thời gian của nó gần như quyết định thời gian chạy cả agent."""

    async def wrapper(state: MedCheckState) -> dict:
        start = time.perf_counter()
        result = await node_fn(state)
        logger.info("[timing] agent.%s: %.3fs", name, time.perf_counter() - start)
        return result

    return wrapper


def should_continue(state: MedCheckState) -> str:
    """Route based on whether an error occurred during processing."""
    if state.get("error"):
        return END
    return "continue"


def build_graph() -> StateGraph:
    graph = StateGraph(MedCheckState)

    # Add nodes
    graph.add_node("normalize", _timed_node("normalize", normalize_node))
    graph.add_node("lookup", _timed_node("lookup", lookup_node))
    graph.add_node("rank", _timed_node("rank", rank_node))
    graph.add_node("explain", _timed_node("explain", explain_node))
    graph.add_node("guardrail", _timed_node("guardrail", guardrail_node))

    # Add edges
    graph.set_entry_point("normalize")
    graph.add_conditional_edges("normalize", should_continue, {END: END, "continue": "lookup"})
    graph.add_conditional_edges("lookup", should_continue, {END: END, "continue": "rank"})
    graph.add_conditional_edges("rank", should_continue, {END: END, "continue": "explain"})
    graph.add_conditional_edges("explain", should_continue, {END: END, "continue": "guardrail"})
    graph.add_conditional_edges("guardrail", should_continue, {END: END, "continue": END})

    return graph.compile()


agent = build_graph()
