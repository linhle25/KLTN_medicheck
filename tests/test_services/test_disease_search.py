from src.db.models import Disease
from src.services.disease_search import (
    normalize_disease_search_text,
    rank_disease_matches,
)


def test_normalize_disease_search_text_removes_diacritics_and_noise():
    assert normalize_disease_search_text("  BỆNH   Đái-tháo đường ") == "benh dai thao duong"


def test_rank_disease_matches_supports_alias_and_typo_without_false_short_match():
    diseases = [
        Disease(id=1, ten_benh="Diabetes mellitus", ten_benh_vi="Đái tháo đường"),
        Disease(id=2, ten_benh="Asthma", ten_benh_vi="Hen suyễn"),
    ]

    assert rank_disease_matches(diseases, "bệnh tiểu đường", 20)[0].id == 1
    assert rank_disease_matches(diseases, "đái tháo đườn", 20)[0].id == 1
    assert rank_disease_matches(diseases, "bệnh hen phế quảnh", 20)[0].id == 2
    assert rank_disease_matches(diseases, "hen suyễn", 20)[0].id == 2
    assert rank_disease_matches(diseases, "xyz", 20) == []
