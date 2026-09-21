import re
import unicodedata
from collections.abc import Iterable
from difflib import SequenceMatcher

from src.db.models import Disease

_NON_ALPHANUMERIC = re.compile(r"[^a-z0-9]+")
_GENERIC_PREFIXES = ("benh ly nen ", "benh nen ", "benh ly ", "benh ")

# Nhóm thuật ngữ y khoa tương đương, độc lập với disease_id. Đây là lớp từ vựng
# bổ sung cho tên chính thức trong CSDL; thuật toán tìm kiếm bên dưới vẫn chạy trên
# mọi Disease, kể cả bệnh không có mặt trong các nhóm này.
_EQUIVALENT_TERMS = (
    frozenset(("tieu duong", "dai thao duong", "diabetes", "diabetes mellitus")),
    frozenset(("cao huyet ap", "tang huyet ap", "hypertension")),
    frozenset(("hen suyen", "hen phe quan", "asthma")),
    frozenset(("dot quy", "tai bien mach mau nao", "stroke")),
)


def normalize_disease_search_text(value: str) -> str:
    """Chuẩn hóa chuỗi để so khớp tên bệnh có/không dấu một cách ổn định."""
    decomposed = unicodedata.normalize("NFD", value.casefold().replace("đ", "d"))
    without_marks = "".join(char for char in decomposed if unicodedata.category(char) != "Mn")
    return _NON_ALPHANUMERIC.sub(" ", without_marks).strip()


def _without_generic_prefix(value: str) -> str:
    for prefix in _GENERIC_PREFIXES:
        if value.startswith(prefix):
            return value[len(prefix) :].strip()
    return value


def _query_variants(query: str) -> set[str]:
    normalized = normalize_disease_search_text(query)
    core = _without_generic_prefix(normalized)
    variants = {value for value in (normalized, core) if value}
    for group in _EQUIVALENT_TERMS:
        is_equivalent = core in group or (
            len(core) >= 5
            and any(SequenceMatcher(None, core, term).ratio() >= 0.9 for term in group)
        )
        if is_equivalent:
            variants.update(group)
    return variants


def _name_variants(disease: Disease) -> set[str]:
    variants: set[str] = set()
    for name in (disease.ten_benh_vi, disease.ten_benh):
        if not name:
            continue
        normalized = normalize_disease_search_text(name)
        if normalized:
            variants.add(normalized)
            variants.add(_without_generic_prefix(normalized))
    return variants


def _match_score(query: str, candidate: str) -> float:
    if query == candidate:
        return 1.0
    if candidate.startswith(query):
        return 0.96
    if query in candidate:
        return 0.9

    query_tokens = query.split()
    candidate_tokens = set(candidate.split())
    if len(query_tokens) > 1 and all(token in candidate_tokens for token in query_tokens):
        return 0.86

    # Không fuzzy-match từ quá ngắn vì dễ trả về bệnh không liên quan. Với chuỗi
    # dài, ngưỡng 0.84 đủ nhận typo nhẹ như "đái tháo đườn" nhưng vẫn chặt.
    if len(query) < 5:
        return 0.0
    ratio = SequenceMatcher(None, query, candidate).ratio()
    threshold = 0.84 if len(query) >= 8 else 0.9
    return ratio if ratio >= threshold else 0.0


def rank_disease_matches(
    diseases: Iterable[Disease], query: str, limit: int
) -> list[Disease]:
    """Lọc và xếp hạng bệnh theo tên Việt, tên Anh, bí danh và typo nhẹ."""
    query_variants = _query_variants(query)
    if not query_variants:
        return []

    ranked: list[tuple[float, str, Disease]] = []
    for disease in diseases:
        score = max(
            (
                _match_score(query_variant, name_variant)
                for query_variant in query_variants
                for name_variant in _name_variants(disease)
            ),
            default=0.0,
        )
        if score <= 0:
            continue
        display_name = disease.ten_benh_vi or disease.ten_benh
        ranked.append((-score, normalize_disease_search_text(display_name), disease))

    ranked.sort(key=lambda item: (item[0], item[1], item[2].id))
    return [item[2] for item in ranked[:limit]]
