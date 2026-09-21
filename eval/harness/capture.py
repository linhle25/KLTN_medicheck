"""Capture harness — ghi lại mỗi lần gọi LLM ra JSONL để phục vụ đánh giá.

Chỉ hoạt động khi biến môi trường ``EVAL_CAPTURE_PATH`` được set (trỏ tới 1 file
``.jsonl`` sẽ được ghi nối tiếp). Khi biến này trống, ``src/services/llm.py`` không
import module này và toàn bộ ở đây là no-op — luồng sản xuất không đổi hành vi.

Cách dùng từ runner (Pha 1):

    from eval.harness.capture import eval_context

    with eval_context(request_id="dd-nang-001#cold", audience="patient",
                      case_id="dd-nang-001", run_tag="cold"):
        await _run_product_check(...)

``contextvars`` tự lan sang các task tạo bên trong ``asyncio.gather`` nên chỉ cần bọc
ở tầng ngoài cùng. ``call_site`` (product_edge / overview / food_edge / disease_edge /
literal_merge) được suy ra từ nội dung system prompt, không cần sửa rollup_explain.py
hay food_disease_explain.py.

Xem ``eval/PLAN.md``.
"""
from __future__ import annotations

import contextvars
import json
import os
import threading
import time
from contextlib import contextmanager

_request_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("eval_request_id", default=None)
_audience: contextvars.ContextVar[str | None] = contextvars.ContextVar("eval_audience", default=None)
_case_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("eval_case_id", default=None)
_run_tag: contextvars.ContextVar[str | None] = contextvars.ContextVar("eval_run_tag", default=None)

# open(..., "a") nối tiếp là an toàn khi nhiều coroutine trong cùng event loop ghi
# xen kẽ (ghi đồng bộ, không await ở giữa), nhưng latency test có thể chạy nhiều
# tiến trình/luồng - giữ 1 lock để chắc chắn mỗi dòng JSONL không bị cắt ngang.
_write_lock = threading.Lock()


def capture_path() -> str | None:
    return os.environ.get("EVAL_CAPTURE_PATH") or None


def capture_enabled() -> bool:
    return capture_path() is not None


@contextmanager
def eval_context(
    *,
    request_id: str,
    audience: str | None = None,
    case_id: str | None = None,
    run_tag: str | None = None,
):
    """Gắn request_id/audience/case_id/run_tag cho mọi call LLM chạy bên trong khối."""
    tokens = (
        _request_id.set(request_id),
        _audience.set(audience),
        _case_id.set(case_id),
        _run_tag.set(run_tag),
    )
    try:
        yield
    finally:
        _request_id.reset(tokens[0])
        _audience.reset(tokens[1])
        _case_id.reset(tokens[2])
        _run_tag.reset(tokens[3])


# Mỗi nơi gọi LLM có 1 cụm cố định trong system prompt — dùng để phân loại mà không
# phải chạm vào code sản xuất. Thứ tự: cụm đặc trưng nhất trước.
_CALL_SITE_MARKERS: tuple[tuple[str, str], ...] = (
    ("Bạn là dược sĩ kiêm biên dịch y khoa", "literal_merge"),
    ("GIỮA 1 THUỐC và 1 LOẠI THỰC PHẨM", "food_edge"),
    ("GIỮA 1 THUỐC và 1 BỆNH NỀN", "disease_edge"),
    ("GIỮA HAI THUỐC (cấp thuốc)", "product_edge"),
    ("tóm tắt kết quả phân tích tương tác thuốc", "overview"),
)


def classify_call_site(system_prompt: str) -> str:
    for marker, name in _CALL_SITE_MARKERS:
        if marker in system_prompt:
            return name
    return "unknown"


def _join_role(messages: list[dict], role: str) -> str:
    return "\n\n".join(str(m.get("content", "")) for m in messages if m.get("role") == role)


def record_call(messages: list[dict], response: object, latency_s: float) -> None:
    """Ghi 1 dòng JSONL cho 1 lần gọi LLM.

    Gọi từ ``src/services/llm.py::ainvoke_llm`` ngay sau khi có ``response`` (đối
    tượng ``AIMessage`` của langchain: có ``.content`` và ``.usage_metadata``).
    """
    path = capture_path()
    if not path:
        return

    system_prompt = _join_role(messages, "system")
    usage = getattr(response, "usage_metadata", None) or {}
    row = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "run_tag": _run_tag.get(),
        "request_id": _request_id.get(),
        "case_id": _case_id.get(),
        "audience": _audience.get(),
        "call_site": classify_call_site(system_prompt),
        "system_prompt": system_prompt,
        "user_prompt": _join_role(messages, "user"),
        "raw_response": getattr(response, "content", "") or "",
        "latency_s": round(latency_s, 4),
        "input_tokens": usage.get("input_tokens"),
        "output_tokens": usage.get("output_tokens"),
    }
    line = json.dumps(row, ensure_ascii=False)
    with _write_lock:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
