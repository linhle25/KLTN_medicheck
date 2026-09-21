#!/usr/bin/env python3
"""Dich 1 LAN mo_ta/xu_tri cua bang food_interactions (DDInter 2.0 DFI - tuong tac
thuoc-thuc pham) va mo_ta cua bang disease_interactions (DDSI - tuong tac thuoc-benh
nen) sang tieng Viet, luu vao cot mo_ta_dich/xu_tri_dich.

Cung co che voi scripts/translate_interaction_texts.py (dich theo tung to hop distinct
- rat nhieu dong dung chung 1 mau mo ta - ghi+commit ngay sau moi cap, tu thu lai khi
ghi loi de khong crash ca job) - ap dung cho ca 2 bang trong 1 lan chay.

Usage:
  python scripts/translate_food_disease_texts.py
"""
import asyncio
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.models import DiseaseInteraction, FoodInteraction
from src.db.session import SessionLocal, init_db
from src.services.llm import get_llm

_CLASSIFIED_LEVELS = ["nhe", "trung_binh", "nang"]

_CONCURRENCY = 8
_CHUNK_SIZE = 20
_WRITE_RETRIES = 3
_WRITE_RETRY_DELAY_SECONDS = 2.0

_SYSTEM_PROMPT_FOOD = (
    "Ban la duoc si kiem bien dich y khoa. Dich nguyen van (khong dien giai lai, "
    "khong rut gon, khong them/bot thong tin) tu tieng Anh sang tieng Viet 2 doan du "
    "lieu duoi day (Mo ta CSDL va Xu tri CSDL cua 1 tuong tac thuoc-thuc pham thuc te). "
    "Tra loi DUNG theo dinh dang sau, khong them chu nao khac:\n"
    "Mo ta: <ban dich nguyen van Mo ta CSDL>\n"
    "Xu tri: <ban dich nguyen van Xu tri CSDL, de trong sau dau hai cham neu khong co Xu tri CSDL>"
)

_SYSTEM_PROMPT_DISEASE = (
    "Ban la duoc si kiem bien dich y khoa. Dich nguyen van (khong dien giai lai, "
    "khong rut gon, khong them/bot thong tin) tu tieng Anh sang tieng Viet doan du "
    "lieu duoi day (Mo ta CSDL cua 1 tuong tac thuoc-benh nen thuc te). Tra loi DUNG "
    "theo dinh dang sau, khong them chu nao khac:\n"
    "Mo ta: <ban dich nguyen van Mo ta CSDL>"
)


def _chunk(items: list, size: int) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


# DeepSeek thinh thoang "lech ngon ngu" - tra loi bang tieng Trung thay vi tieng Viet
# du prompt yeu cau ro tieng Viet (quan sat thuc te tren du lieu that, xem
# translate_interaction_texts.py). Vi 1 ban dich duoc CACHE va dung chung cho nhieu
# dong co cung mo_ta/xu_tri, 1 lan loi se "lan" sang toan bo cac dong dung chung ban
# dich do - nen PHAI chan o day, coi nhu dich that bai (tra ve None) de lan chay sau
# tu dong dich lai.
_CJK_PATTERN = re.compile(r"[一-鿿]")


def _contains_cjk(text: str | None) -> bool:
    return bool(text) and bool(_CJK_PATTERN.search(text))


def _parse(raw: str) -> tuple[str | None, str | None]:
    mo_ta_dich, xu_tri_dich = None, None
    for line in (raw or "").strip().splitlines():
        line = line.strip()
        lower = line.lower()
        if lower.startswith("mô tả:") or lower.startswith("mo ta:"):
            mo_ta_dich = line.split(":", 1)[1].strip() or None
        elif lower.startswith("xử trí:") or lower.startswith("xu tri:"):
            xu_tri_dich = line.split(":", 1)[1].strip() or None
    if _contains_cjk(mo_ta_dich) or _contains_cjk(xu_tri_dich):
        return None, None
    return mo_ta_dich, xu_tri_dich


async def _translate(
    sem: asyncio.Semaphore, system_prompt: str, mo_ta: str, xu_tri: str | None, include_xu_tri: bool
) -> tuple[str | None, str | None]:
    async with sem:
        llm = get_llm()
        user_prompt = (
            f"Mo ta CSDL: {mo_ta}\nXu tri CSDL: {xu_tri or '(khong co)'}" if include_xu_tri else f"Mo ta CSDL: {mo_ta}"
        )
        response = await llm.ainvoke(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]
        )
        return _parse(response.content or "")


def _write_food(db, mo_ta: str, xu_tri: str | None, mo_ta_dich: str | None, xu_tri_dich: str | None) -> bool:
    for attempt in range(1, _WRITE_RETRIES + 1):
        try:
            db.query(FoodInteraction).filter(
                FoodInteraction.mo_ta == mo_ta,
                FoodInteraction.xu_tri == xu_tri,
            ).update({"mo_ta_dich": mo_ta_dich, "xu_tri_dich": xu_tri_dich}, synchronize_session=False)
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            if attempt == _WRITE_RETRIES:
                print(f"[food] Loi ghi DB sau {attempt} lan thu (bo qua, se thu lai o lan chay sau): {e}")
                return False
            time.sleep(_WRITE_RETRY_DELAY_SECONDS)
    return False


def _write_disease(db, mo_ta: str, mo_ta_dich: str | None) -> bool:
    for attempt in range(1, _WRITE_RETRIES + 1):
        try:
            db.query(DiseaseInteraction).filter(DiseaseInteraction.mo_ta == mo_ta).update(
                {"mo_ta_dich": mo_ta_dich}, synchronize_session=False
            )
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            if attempt == _WRITE_RETRIES:
                print(f"[disease] Loi ghi DB sau {attempt} lan thu (bo qua, se thu lai o lan chay sau): {e}")
                return False
            time.sleep(_WRITE_RETRY_DELAY_SECONDS)
    return False


async def _translate_food_interactions(db) -> None:
    rows = (
        db.query(FoodInteraction.mo_ta, FoodInteraction.xu_tri)
        .filter(FoodInteraction.muc_do.in_(_CLASSIFIED_LEVELS))
        .filter(FoodInteraction.mo_ta_dich.is_(None))
        .distinct()
        .all()
    )
    pairs = [(mo_ta, xu_tri) for mo_ta, xu_tri in rows if mo_ta]
    print(f"[food] Can dich {len(pairs)} to hop (mo_ta, xu_tri) chua co ban dich...")
    if not pairs:
        return

    sem = asyncio.Semaphore(_CONCURRENCY)
    done, failed = 0, 0
    for batch in _chunk(pairs, _CHUNK_SIZE):
        tasks = [_translate(sem, _SYSTEM_PROMPT_FOOD, mo_ta, xu_tri, True) for mo_ta, xu_tri in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for (mo_ta, xu_tri), result in zip(batch, results):
            if isinstance(result, Exception) or result[0] is None:
                failed += 1
                if isinstance(result, Exception):
                    print(f"[food] Loi dich 1 to hop: {result}")
                continue
            mo_ta_dich, xu_tri_dich = result
            if _write_food(db, mo_ta, xu_tri, mo_ta_dich, xu_tri_dich):
                done += 1
            else:
                failed += 1
        print(f"[food] Tien do: {done + failed}/{len(pairs)} (da luu: {done}, loi: {failed})")
    print(f"[food] Hoan tat: {done} thanh cong, {failed} loi/thieu.")


async def _translate_disease_interactions(db) -> None:
    rows = (
        db.query(DiseaseInteraction.mo_ta)
        .filter(DiseaseInteraction.muc_do.in_(_CLASSIFIED_LEVELS))
        .filter(DiseaseInteraction.mo_ta_dich.is_(None))
        .distinct()
        .all()
    )
    texts = [mo_ta for (mo_ta,) in rows if mo_ta]
    print(f"[disease] Can dich {len(texts)} doan mo_ta chua co ban dich...")
    if not texts:
        return

    sem = asyncio.Semaphore(_CONCURRENCY)
    done, failed = 0, 0
    for batch in _chunk(texts, _CHUNK_SIZE):
        tasks = [_translate(sem, _SYSTEM_PROMPT_DISEASE, mo_ta, None, False) for mo_ta in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for mo_ta, result in zip(batch, results):
            if isinstance(result, Exception) or result[0] is None:
                failed += 1
                if isinstance(result, Exception):
                    print(f"[disease] Loi dich 1 doan: {result}")
                continue
            mo_ta_dich, _ = result
            if _write_disease(db, mo_ta, mo_ta_dich):
                done += 1
            else:
                failed += 1
        print(f"[disease] Tien do: {done + failed}/{len(texts)} (da luu: {done}, loi: {failed})")
    print(f"[disease] Hoan tat: {done} thanh cong, {failed} loi/thieu.")


async def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        await _translate_food_interactions(db)
        await _translate_disease_interactions(db)
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
