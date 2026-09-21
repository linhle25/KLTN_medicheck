#!/usr/bin/env python3
"""Dựng tập HELD-OUT: case hoàn toàn mới, KHÔNG trùng cặp nào với gold set 135 case cũ.

Vì sao cần: toàn bộ quá trình tìm lỗi + vá (regex guardrail, rule prompt) trong các
phiên trước đều dựa trên chính 135 case của gold set - nên điểm số đo lại trên chính
tập đó bị thổi phồng (overfit vào tập test). Tập này dùng để trả lời câu hỏi khác:
"hệ thống chạy thế nào với case CHƯA AI TỪNG XEM?"

QUY TẮC BẮT BUỘC khi dùng tập này: sinh -> chấm -> báo cáo. KHÔNG được sửa code/prompt
dựa trên kết quả nhìn thấy ở đây, nếu không nó lại thành tập train và mất hết ý nghĩa.

    python -m eval.harness.build_heldout
    -> eval/datasets/heldout_20260901.jsonl
"""
from __future__ import annotations

import json
import random
from pathlib import Path

from sqlalchemy import func

from eval.harness.build_dataset import (
    OUT_DIR as DATASET_DIR,
    has_text,
    load_medication_products,
    med_names,
    _rx,
)
from src.db.models import DiseaseInteraction, FoodInteraction, Interaction
from src.db.session import SessionLocal, SessionLocalFacts

SEED = 20260902  # KHÁC seed gold set (20260828)
OUT = DATASET_DIR / "heldout_20260901.jsonl"

# Số case mỗi nhóm - nhỏ hơn gold set (chỉ cần đủ để ước lượng, không cần phủ hết
# mọi tầng như gold set gốc).
DD_PER_LEVEL = {"nang": 6, "trung_binh": 6, "nhe": 4, "chua_phan_loai": 4}
FOOD_PER_LEVEL = {"nang": 4, "trung_binh": 4, "nhe": 2}
DIS_PER_LEVEL = {"nang": 4, "trung_binh": 4, "nhe": 2}


def _audience(rng: random.Random) -> str:
    return "pharmacist" if rng.random() < 0.35 else "patient"


def load_existing_pairs() -> dict[str, set]:
    """Lấy TẤT CẢ cặp đã dùng trong gold set cũ để loại trừ - loại theo CẶP THẬT
    (med_a_id/med_b_id, hoặc med_id+đối tượng), không chỉ theo case_id, vì 2 case_id
    khác nhau vẫn có thể trỏ về cùng 1 dòng tương tác."""
    dd, food, dis = set(), set(), set()
    for name in ("drug_drug", "food", "disease", "overview", "red_team", "edge"):
        p = DATASET_DIR / f"{name}.jsonl"
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            c = json.loads(line)
            pair = c.get("pair") or {}
            if c["nhom"] in ("drug_drug", "red_team") and pair.get("med_a_id"):
                dd.add(frozenset([pair["med_a_id"], pair["med_b_id"]]))
            elif c["nhom"] == "food" and pair.get("med_id"):
                food.add((pair["med_id"], pair.get("doi_tuong")))
            elif c["nhom"] == "disease" and pair.get("med_id"):
                dis.add((pair["med_id"], pair.get("doi_tuong")))
    return {"dd": dd, "food": food, "dis": dis}


def _rows_per_med(f, model) -> dict[str, int]:
    return dict(f.query(model.medication_id, func.count(model.id)).group_by(model.medication_id).all())


def main() -> None:
    rng = random.Random(SEED)
    used = load_existing_pairs()
    print(f"Loại trừ: {len(used['dd'])} cặp thuốc-thuốc, {len(used['food'])} cặp thực phẩm, {len(used['dis'])} cặp bệnh nền")

    with SessionLocal() as m, SessionLocalFacts() as f:
        prods = load_medication_products(m)
        names = med_names(m)
        covered = set(prods)
        cases: list[dict] = []

        # --- drug_drug ---
        n = 0
        for level, want in DD_PER_LEVEL.items():
            rows = (
                f.query(Interaction.id, Interaction.medication_a_id, Interaction.medication_b_id)
                .filter(Interaction.muc_do == level)
                .all()
            )
            pool = [
                (rid, a, b) for rid, a, b in rows
                if a in covered and b in covered and a != b
                and frozenset([a, b]) not in used["dd"]
            ]
            rng.shuffle(pool)
            for k, (rid, a, b) in enumerate(pool[:want]):
                row = f.get(Interaction, rid)
                n += 1
                pa, pb = prods[a]["name"], prods[b]["name"]
                cases.append({
                    "id": f"ho-dd-{level}-{n:03d}",
                    "nhom": "drug_drug",
                    "audience": _audience(rng),
                    "muc_do_ky_vong": level,
                    "stratum": {"mo_ta_present": has_text(row.mo_ta),
                                "combo": prods[a]["n_ing"] > 1 or prods[b]["n_ing"] > 1,
                                "multi_rx": False},
                    "input": {"prescriptions": _rx([[pa, pb]])},
                    "pair": {"med_a_id": a, "med_a": names.get(a), "med_b_id": b, "med_b": names.get(b)},
                    "nguon": {"muc_do": row.muc_do, "mo_ta": row.mo_ta, "xu_tri": row.xu_tri},
                    "ghi_chu": "heldout - chua tung dung de tim/va loi",
                })

        # --- food ---
        per_med_food = _rows_per_med(f, FoodInteraction)
        n = 0
        for level, want in FOOD_PER_LEVEL.items():
            rows = f.query(FoodInteraction).filter(FoodInteraction.muc_do == level).all()
            pool = [
                r for r in rows
                if r.medication_id in covered
                and (r.medication_id, r.thuc_pham) not in used["food"]
                and per_med_food.get(r.medication_id, 99) <= 6
            ]
            rng.shuffle(pool)
            for r in pool[:want]:
                n += 1
                cases.append({
                    "id": f"ho-food-{level}-{n:03d}",
                    "nhom": "food",
                    "audience": _audience(rng),
                    "muc_do_ky_vong": level,
                    "stratum": {"combo": prods[r.medication_id]["n_ing"] > 1},
                    "input": {"prescriptions": _rx([[prods[r.medication_id]["name"]]])},
                    "pair": {"med_id": r.medication_id, "med": names.get(r.medication_id),
                             "doi_tuong": r.thuc_pham},
                    "nguon": {"muc_do": r.muc_do, "mo_ta": r.mo_ta, "xu_tri": r.xu_tri},
                    "ghi_chu": "heldout - chua tung dung de tim/va loi",
                })

        # --- disease ---
        per_med_dis = _rows_per_med(f, DiseaseInteraction)
        n = 0
        for level, want in DIS_PER_LEVEL.items():
            rows = f.query(DiseaseInteraction).filter(DiseaseInteraction.muc_do == level).all()
            pool = [
                r for r in rows
                if r.medication_id in covered
                and (r.medication_id, r.ten_benh) not in used["dis"]
                and per_med_dis.get(r.medication_id, 99) <= 8
            ]
            rng.shuffle(pool)
            for r in pool[:want]:
                n += 1
                cases.append({
                    "id": f"ho-dis-{level}-{n:03d}",
                    "nhom": "disease",
                    "audience": _audience(rng),
                    "muc_do_ky_vong": level,
                    "stratum": {"combo": prods[r.medication_id]["n_ing"] > 1},
                    "input": {"prescriptions": _rx([[prods[r.medication_id]["name"]]])},
                    "pair": {"med_id": r.medication_id, "med": names.get(r.medication_id),
                             "doi_tuong": r.ten_benh},
                    "nguon": {"muc_do": r.muc_do, "mo_ta": r.mo_ta},
                    "ghi_chu": "heldout - chua tung dung de tim/va loi",
                })

    OUT.write_text("\n".join(json.dumps(c, ensure_ascii=False) for c in cases) + "\n", encoding="utf-8")
    by_group: dict[str, int] = {}
    for c in cases:
        by_group[c["nhom"]] = by_group.get(c["nhom"], 0) + 1
    print(f"Đã ghi {len(cases)} case -> {OUT}")
    print("Phân bố:", by_group)


if __name__ == "__main__":
    main()
