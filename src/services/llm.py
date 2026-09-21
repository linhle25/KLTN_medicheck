import os
import time
from functools import lru_cache

from langchain_openai import ChatOpenAI

from src.config import get_settings

# Da tung thu gioi han so luot goi LLM dong thoi bang semaphore (01/09) de tim cach
# giam latency cho don nhieu thuoc - do lai bang capture.jsonl (log tung lenh goi)
# xac nhan so luot goi dong thoi THAT SU tao ra (1 o warm, toi da 6 o cold voi 5 thuoc)
# chua bao gio cham nguong 8, nen semaphore chua bao gio thuc su gioi han duoc gi -
# moi khac biet do duoc khi thu 8 va 24 deu la nhieu do luong. Da bo han (01/09) vi
# khong co bang chung loi ich nao cho cac truong hop da test. Xem eval/results/
# report.md Finding 10 / §4.4 / §5.3 neu can xem lai huong nay cho don RAT nhieu thuoc
# (chua test).


@lru_cache
def get_llm(temperature: float | None = None) -> ChatOpenAI:
    """Cache 1 instance duy nhất theo temperature - truoc day tao ChatOpenAI moi
    moi lenh goi, mat kha nang tai dung connection pool (moi lenh goi phai bat tay
    TCP+TLS lai tu dau voi DeepSeek). An toan khi nhieu coroutine cung goi ainvoke()
    dong thoi qua asyncio.gather - do chinh la muc dich cua connection pooling.

    temperature=None (mac dinh) -> dung settings.llm_temperature (0.7, van uu tien
    da dang cach dien dat cho van tong hop giai_thich). Nhung noi can dich bam sat
    nghia goc (khong duoc sang tao/dien giai lai) nen truyen temperature=0 rieng -
    xem ainvoke_llm + literal_merge_translate (rollup_explain.py)."""
    settings = get_settings()
    return ChatOpenAI(
        model=settings.model_name,
        api_key=settings.deepseek_api_key,
        base_url=settings.deepseek_base_url,
        temperature=settings.llm_temperature if temperature is None else temperature,
        # Tu thu lai (backoff tang dan, co san trong langchain-openai) khi gap loi tam
        # thoi tu DeepSeek, bao gom rate limit (429).
        max_retries=3,
    )


async def ainvoke_llm(messages: list[dict], *, temperature: float | None = None):
    """Goi LLM - khong gioi han so luot goi dong thoi (xem comment o dau file ve
    semaphore da thu roi bo), chi giu retry tu dong o get_llm().

    temperature: None (mac dinh) -> dung nhiet do sinh van tong hop chung
    (settings.llm_temperature). Truyen 0 cho cac lenh goi dich bam sat nghia goc
    (khong can da dang cach dien dat, chi can on dinh/nhat quan giua cac lan sinh -
    xem eval/PLAN.md gia thuyet "temperature=0.7 ap cho ca phan dich" va
    eval/results/report.md muc consistency).

    Khi EVAL_CAPTURE_PATH duoc set (che do danh gia - xem eval/PLAN.md): do thoi gian
    va ghi lai prompt/output/token ra JSONL. Khong set -> khong import gi them, hanh
    vi khong doi."""
    llm = get_llm(temperature)
    if not os.environ.get("EVAL_CAPTURE_PATH"):
        return await llm.ainvoke(messages)

    start = time.perf_counter()
    response = await llm.ainvoke(messages)
    try:
        from eval.harness.capture import record_call

        record_call(messages, response, time.perf_counter() - start)
    except Exception:  # noqa: BLE001 - capture khong bao gio duoc lam hong luong that
        pass
    return response
