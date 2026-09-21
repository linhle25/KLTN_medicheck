#!/usr/bin/env python3
"""Dich 1 LAN mo_ta/xu_tri cua bang interactions (DDInter 2.0 - tuong tac thuoc-thuoc)
sang tieng Viet, luu vao cot mo_ta_dich/xu_tri_dich.

So luong to hop (mo_ta, xu_tri) KHAC NHAU trong cac dong da phan loai muc do (nhe/
trung_binh/nang - "chua_phan_loai" khong can dich, xem explain_node.py) chi khoang
~3000, it hon nhieu so voi ~54000 dong thuc te trong bang (DDInter dung chung 1 mau
mo ta cho nhieu cap thuoc cung nhom duoc ly), nen dich 1 lan roi cache lai trong DB
la hop ly, thay vi goi LLM dich lai MOI LAN sinh giai thich cho tung request nguoi
dung (xem src/agents/nodes/explain_node.py truoc khi co script nay - moi request
phai cho them 1 luot goi LLM chi de dich lai dung 1 trong ~3000 doan van co san).

Cung co che voi scripts/translate_food_disease_names.py (dich ten thuc pham/benh
nen) nhung dich TUNG to hop rieng le (khong gop nhieu doan vao 1 lan goi) vi day la
doan van dai (toi da ~18k ky tu) - gop nhieu doan dai vao 1 prompt de LLM tra ve
theo dung thu tu de bi lech/nham dong hon nhieu so voi gop cac ten ngan.

Usage:
  python scripts/translate_interaction_texts.py
"""
import asyncio
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db.models import Interaction
from src.db.session import SessionLocal, init_db
from src.services.llm import get_llm

_CLASSIFIED_LEVELS = ["nhe", "trung_binh", "nang"]

# Gioi han so luong goi LLM chay dong thoi - day la job chay 1 lan ngoai request nguoi
# dung nen khong ap luc ve do tre, chi can tranh vuot rate limit DeepSeek. Tang/giam
# tuy gioi han tai khoan.
_CONCURRENCY = 8

# Dich + ghi DB theo tung dot nho (thay vi dich het ~3000 cap roi moi bat dau ghi) -
# neu 1 lan ghi loi (vd tranh chap file SQLite khi backend Docker dang chay dong thoi
# mount cung file data/app.db), chi mat toi da 1 dot dang xu ly thay vi mat toan bo
# phan da dich nhung chua kip ghi cua ca lan chay.
_CHUNK_SIZE = 20
_WRITE_RETRIES = 3
_WRITE_RETRY_DELAY_SECONDS = 2.0


def _chunk(items: list, size: int) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]

_SYSTEM_PROMPT = (
    "Ban la duoc si kiem bien dich y khoa. Dich nguyen van (khong dien giai lai, "
    "khong rut gon, khong them/bot thong tin) tu tieng Anh sang tieng Viet 2 doan du "
    "lieu duoi day (Mo ta CSDL va Xu tri CSDL cua 1 tuong tac thuoc-thuoc thuc te). "
    "Tra loi DUNG theo dinh dang sau, khong them chu nao khac:\n"
    "Mo ta: <ban dich nguyen van Mo ta CSDL>\n"
    "Xu tri: <ban dich nguyen van Xu tri CSDL, de trong sau dau hai cham neu khong co Xu tri CSDL>"
)


def _user_prompt(mo_ta: str, xu_tri: str | None) -> str:
    return f"Mo ta CSDL: {mo_ta}\nXu tri CSDL: {xu_tri or '(khong co)'}"


# DeepSeek thinh thoang "lech ngon ngu" - tra loi bang tieng Trung thay vi tieng Viet
# du prompt yeu cau ro tieng Viet (quan sat thuc te tren du lieu that: ~3% so lan
# goi). Vi 1 ban dich duoc CACHE va dung chung cho nhieu dong co cung mo_ta/xu_tri, 1
# lan loi se "lan" sang toan bo cac dong dung chung ban dich do - nen PHAI chan o day,
# coi nhu dich that bai (tra ve None) de lan chay sau tu dong dich lai, thay vi luu
# nham 1 ban dich sai ngon ngu vao cache dung chung.
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


async def _translate_pair(
    sem: asyncio.Semaphore, mo_ta: str, xu_tri: str | None
) -> tuple[str | None, str | None]:
    async with sem:
        llm = get_llm()
        response = await llm.ainvoke(
            [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": _user_prompt(mo_ta, xu_tri)},
            ]
        )
        return _parse(response.content or "")


def _write_pair(db, mo_ta: str, xu_tri: str | None, mo_ta_dich: str, xu_tri_dich: str | None) -> bool:
    """Ghi + commit ngay 1 cap da dich, thu lai vai lan neu SQLite bao loi thoang qua
    (vd tranh chap khoa file voi backend Docker dang chay dong thoi tren cung file
    data/app.db qua bind-mount) truoc khi bo qua han cap nay."""
    for attempt in range(1, _WRITE_RETRIES + 1):
        try:
            db.query(Interaction).filter(
                Interaction.mo_ta == mo_ta,
                Interaction.xu_tri == xu_tri,
                Interaction.muc_do.in_(_CLASSIFIED_LEVELS),
            ).update({"mo_ta_dich": mo_ta_dich, "xu_tri_dich": xu_tri_dich}, synchronize_session=False)
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            if attempt == _WRITE_RETRIES:
                print(f"Loi ghi DB sau {attempt} lan thu (bo qua, se thu lai o lan chay script sau): {e}")
                return False
            time.sleep(_WRITE_RETRY_DELAY_SECONDS)
    return False


async def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        rows = (
            db.query(Interaction.mo_ta, Interaction.xu_tri)
            .filter(Interaction.muc_do.in_(_CLASSIFIED_LEVELS))
            .filter(Interaction.mo_ta_dich.is_(None))
            .distinct()
            .all()
        )
        pairs = [(mo_ta, xu_tri) for mo_ta, xu_tri in rows if mo_ta]
        print(
            f"Can dich {len(pairs)} to hop (mo_ta, xu_tri) chua co ban dich "
            f"(concurrency={_CONCURRENCY}, chunk={_CHUNK_SIZE})..."
        )
        if not pairs:
            print("Khong co gi de dich - da dich het hoac CSDL chua co du lieu.")
            return

        sem = asyncio.Semaphore(_CONCURRENCY)
        done, failed = 0, 0
        for batch in _chunk(pairs, _CHUNK_SIZE):
            tasks = [_translate_pair(sem, mo_ta, xu_tri) for mo_ta, xu_tri in batch]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for (mo_ta, xu_tri), result in zip(batch, results):
                if isinstance(result, Exception) or result[0] is None:
                    failed += 1
                    if isinstance(result, Exception):
                        print(f"Loi dich 1 to hop (se thu lai o lan chay sau): {result}")
                    continue
                mo_ta_dich, xu_tri_dich = result
                if _write_pair(db, mo_ta, xu_tri, mo_ta_dich, xu_tri_dich):
                    done += 1
                else:
                    failed += 1

            print(f"Tien do: {done + failed}/{len(pairs)} (da luu: {done}, loi: {failed})")

        print(
            f"Hoan tat: {done} to hop dich va luu thanh cong, {failed} loi/thieu "
            "(chay lai script se tu dich tiep phan con thieu, khong dich lai phan da xong)."
        )
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
