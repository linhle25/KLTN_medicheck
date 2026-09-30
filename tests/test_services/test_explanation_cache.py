from unittest.mock import AsyncMock

import pytest
from sqlalchemy.orm import sessionmaker

import src.services.explanation_cache as explanation_cache
import src.services.rollup_explain as rollup_explain
from src.db.models import Base, ProductExplanationCache
from src.services.explanation_cache import lookup_cached, save_cached
from tests.conftest import isolated_postgres_engine


@pytest.fixture
def cache_db(monkeypatch):
    """SessionLocal ở explanation_cache.py được import theo giá trị (không qua
    Depends), nên phải monkeypatch trực tiếp module đó để trỏ vào 1 schema Postgres
    riêng cho test - giống cách tests/conftest.py::client patch SessionLocal ở mọi
    module đã import nó."""
    with isolated_postgres_engine() as engine:
        Base.metadata.create_all(bind=engine)
        testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        monkeypatch.setattr(explanation_cache, "SessionLocal", testing_session)
        yield testing_session


def test_lookup_cached_returns_none_on_miss(cache_db):
    assert lookup_cached(ProductExplanationCache, product_a="a", product_b="b", muc_do="nhe", audience="patient") is None


def test_save_then_lookup_cached_hits(cache_db):
    save_cached(
        ProductExplanationCache,
        product_a="aspirin",
        product_b="warfarin",
        muc_do="nang",
        audience="patient",
        giai_thich="test giai thich",
        giai_thich_duoc_si=None,
        nguon_trich_dan="Tổng hợp từ 1 cặp hoạt chất tương tác trong CSDL DDInter 2.0.",
        mo_ta_dich="test mo ta",
        xu_tri_dich="test xu tri",
    )
    cached = lookup_cached(
        ProductExplanationCache, product_a="aspirin", product_b="warfarin", muc_do="nang", audience="patient"
    )
    assert cached == {
        "giai_thich": "test giai thich",
        "giai_thich_duoc_si": None,
        "nguon_trich_dan": "Tổng hợp từ 1 cặp hoạt chất tương tác trong CSDL DDInter 2.0.",
        # ProductExplanationCache không có cột này (chỉ FoodDiseaseExplanationCache
        # có) - lookup_cached dùng getattr nên rơi về None thay vì lỗi.
        "nguon_trich_dan_chi_tiet": None,
        "mo_ta_dich": "test mo ta",
        "xu_tri_dich": "test xu tri",
    }


def test_save_cached_ignores_duplicate_key_race(cache_db):
    fields = dict(
        product_a="aspirin",
        product_b="warfarin",
        muc_do="nang",
        audience="patient",
        giai_thich="bản ghi đầu",
        giai_thich_duoc_si=None,
        nguon_trich_dan="nguồn",
        mo_ta_dich=None,
        xu_tri_dich=None,
    )
    save_cached(ProductExplanationCache, **fields)
    # Giả lập 2 coroutine cùng miss cache rồi cùng ghi - lần ghi thứ 2 không được raise.
    save_cached(ProductExplanationCache, **{**fields, "giai_thich": "bản ghi thứ 2 (đè lên phải bị bỏ qua)"})
    cached = lookup_cached(
        ProductExplanationCache, product_a="aspirin", product_b="warfarin", muc_do="nang", audience="patient"
    )
    assert cached["giai_thich"] == "bản ghi đầu"


_FAKE_LLM_CONTENT = "Đây là giải thích test.\n[BẢN_DỊCH]\nmô tả: test mo ta\nxử trí: test xu tri"


def _fake_edge(product_a="Aspirin", product_b="Warfarin", muc_do="nang"):
    return {
        "product_a": product_a,
        "product_b": product_b,
        "muc_do": muc_do,
        "pair_count": 1,
        "contributing_pairs": [
            {
                "thuoc_a": "acetylsalicylic acid",
                "thuoc_b": "warfarin",
                "muc_do": muc_do,
                "mo_ta": "Test mo ta CSDL.",
                "xu_tri": "Test xu tri CSDL.",
            }
        ],
    }


@pytest.mark.asyncio
async def test_explain_product_edge_second_call_hits_cache_skips_llm(cache_db, monkeypatch):
    mock_llm = AsyncMock(return_value=AsyncMock(content=_FAKE_LLM_CONTENT))
    monkeypatch.setattr(rollup_explain, "ainvoke_llm", mock_llm)

    first = await rollup_explain._explain_product_edge(_fake_edge(), "patient")
    assert mock_llm.await_count == 1
    assert first["giai_thich"] == "Đây là giải thích test."

    # Thứ tự product_a/product_b đảo ngược - vẫn phải trúng cache nhờ key đã sort.
    second = await rollup_explain._explain_product_edge(_fake_edge("Warfarin", "Aspirin"), "patient")
    assert mock_llm.await_count == 1  # không gọi LLM lần 2
    assert second["giai_thich"] == "Đây là giải thích test."

    # audience khác -> cache miss, phải gọi LLM lại.
    await rollup_explain._explain_product_edge(_fake_edge(), "pharmacist")
    assert mock_llm.await_count == 2
