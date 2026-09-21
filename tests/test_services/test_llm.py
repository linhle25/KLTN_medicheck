from src.services.llm import get_llm


def test_get_llm_returns_cached_singleton():
    """get_llm() phải trả về đúng 1 instance dùng lại - trước đây tạo ChatOpenAI mới
    mỗi lần gọi, mất khả năng tái dùng connection pool giữa các lệnh gọi LLM."""
    assert get_llm() is get_llm()
