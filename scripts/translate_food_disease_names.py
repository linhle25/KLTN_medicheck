#!/usr/bin/env python3
"""Dich 1 LAN ten thuc pham (food_interactions.thuc_pham) va ten benh nen
(disease_interactions.ten_benh) sang tieng Viet, luu vao cot thuc_pham_vi/ten_benh_vi.

So luong ten KHAC NHAU trong toan CSDL rat nho (29 thuc pham, ~450 benh nen - it hon
nhieu so voi so dong trong 2 bang, vi nhieu hoat chat dung chung 1 ten thuc pham/benh
nen), nen dich 1 lan roi cache lai trong DB la hop ly, thay vi goi LLM dich lai moi
lan sinh giai thich (ton kem + co the dich khac nhau giua cac lan goi).

Usage:
  python scripts/translate_food_disease_names.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.models import DiseaseInteraction, FoodInteraction
from src.db.session import SessionLocal, init_db
from src.services.llm import get_llm

_BATCH_SIZE = 40

_SYSTEM_PROMPT = (
    "Ban la duoc si kiem bien dich y khoa. Dich danh sach thuat ngu tieng Anh duoi "
    "day (ten thuc pham hoac ten benh/tinh trang benh ly) sang tieng Viet tu nhien, "
    "ngan gon (toi da vai tu), dung thuat ngu y khoa/doi thuong pho bien tai Viet "
    "Nam. Tra loi DUNG theo dinh dang: moi dong 1 ban dich, theo DUNG thu tu va so "
    "luong dong voi danh sach dau vao, KHONG danh so, KHONG them giai thich, KHONG "
    "them dong trong, KHONG lap lai tu tieng Anh goc."
)


def _chunk(items: list[str], size: int) -> list[list[str]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


async def _translate_batch(terms: list[str]) -> list[str] | None:
    llm = get_llm()
    prompt = "\n".join(terms)
    response = await llm.ainvoke(
        [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]
    )
    lines = [line.strip() for line in (response.content or "").strip().splitlines() if line.strip()]
    if len(lines) != len(terms):
        return None
    return lines


async def translate_all(terms: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for batch in _chunk(terms, _BATCH_SIZE):
        translated = await _translate_batch(batch)
        if translated is None:
            # LLM tra khong dung so dong - dich lai tung tu rieng le de khong mat ban dich.
            for term in batch:
                single = await _translate_batch([term])
                result[term] = single[0] if single else term
        else:
            for term, vi in zip(batch, translated):
                result[term] = vi
    return result


async def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        foods = [row[0] for row in db.query(FoodInteraction.thuc_pham).distinct().all()]
        diseases = [row[0] for row in db.query(DiseaseInteraction.ten_benh).distinct().all()]
        print(f"Can dich {len(foods)} ten thuc pham, {len(diseases)} ten benh nen...")

        food_translations = await translate_all(foods)
        print("Da dich xong thuc pham, mau:", list(food_translations.items())[:5])
        disease_translations = await translate_all(diseases)
        print("Da dich xong benh nen, mau:", list(disease_translations.items())[:5])

        for term, vi in food_translations.items():
            db.query(FoodInteraction).filter_by(thuc_pham=term).update({"thuc_pham_vi": vi})
        for term, vi in disease_translations.items():
            db.query(DiseaseInteraction).filter_by(ten_benh=term).update({"ten_benh_vi": vi})
        db.commit()
        print(f"Da luu ban dich vao DB: {len(food_translations)} thuc pham, {len(disease_translations)} benh nen.")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
