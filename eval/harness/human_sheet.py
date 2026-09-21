#!/usr/bin/env python3
"""Sinh phiếu chấm tay (Pha 4) từ 1 run.

    python -m eval.harness.human_sheet <run_dir>

Xuất:
  eval/results/human_review.csv       — an toàn (metric 2) + soát chéo faithfulness,
                                        1 dòng / (case, đoạn giải thích). Đọc toàn bộ.
  eval/results/calibration.csv        — ~30 case trải đều để 2 thành viên chấm mù
                                        (điền human_verdict), sau đó dán judge_verdict
                                        vào rồi chạy `judge.py --calibrate`.

Cột an toàn cần điền: safety_pass (Y/N), actionable_advice (Y/N), diagnosis (Y/N), notes.
20% dòng nên được người thứ 2 chấm lại (đánh dấu cột reviewer).
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

from eval.harness.judge import pick_scored_item

ROOT = Path(__file__).resolve().parent.parent.parent
DATASET_DIR = ROOT / "eval" / "datasets"
RESULTS = ROOT / "eval" / "results"
CLASSIFIED = ("nang", "trung_binh", "nhe")


def _load_dataset() -> dict[str, dict]:
    by_id = {}
    for name in ("drug_drug", "food", "disease", "overview", "red_team", "edge"):
        for line in (DATASET_DIR / f"{name}.jsonl").read_text(encoding="utf-8").splitlines():
            if line.strip():
                c = json.loads(line)
                by_id[c["id"]] = c
    return by_id


# 1 case bệnh nền / thực phẩm có thể sinh nhiều đoạn (mỗi bệnh/thực phẩm 1 đoạn),
# nhưng case["nguon"] chỉ có nguồn của ĐÚNG 1 cặp mục tiêu. Tra DB lấy nguồn của
# từng đoạn để cột mo_ta_goc / faithfulness_note không bị lệch (Finding B1).
_SRC_CACHE: dict[tuple[str, str, str], tuple[str, str]] = {}


def _source_for_item(nhom: str, med_id: str | None, item_name: str | None) -> tuple[str, str] | None:
    """-> (mo_ta, xu_tri) gốc (tiếng Anh) của đúng dòng DDInter cho đoạn này, hoặc None."""
    if not med_id or not item_name:
        return None
    ckey = (nhom, med_id, item_name.strip().casefold())
    if ckey in _SRC_CACHE:
        return _SRC_CACHE[ckey]
    result: tuple[str, str] | None = None
    try:
        from sqlalchemy import func, or_

        from src.db.models import DiseaseInteraction, FoodInteraction
        from src.db.session import SessionLocalFacts

        model = DiseaseInteraction if nhom == "disease" else FoodInteraction
        name_col = model.ten_benh if nhom == "disease" else model.thuc_pham
        name_vi_col = model.ten_benh_vi if nhom == "disease" else model.thuc_pham_vi
        with SessionLocalFacts() as s:
            row = (
                s.query(model)
                .filter(
                    model.medication_id == med_id,
                    or_(
                        func.lower(name_col) == item_name.strip().lower(),
                        func.lower(func.coalesce(name_vi_col, "")) == item_name.strip().lower(),
                    ),
                )
                .first()
            )
            if row is not None:
                result = (row.mo_ta or "", getattr(row, "xu_tri", None) or "")
    except Exception as exc:  # noqa: BLE001 - thiếu DB -> rơi về case["nguon"]
        print(f"  [warn] _source_for_item({ckey}): {type(exc).__name__}: {str(exc)[:120]}", flush=True)
    _SRC_CACHE[ckey] = result  # type: ignore[assignment]
    return result


def _narratives(case: dict, result: dict) -> list[tuple[str, str, str, str]]:
    """-> [(nhãn đoạn, text, mo_ta_goc, xu_tri_goc)]. Gồm mọi đoạn LLM sinh có thể
    chứa vấn đề an toàn. mo_ta_goc/xu_tri_goc rỗng -> caller dùng case["nguon"]."""
    out: list[tuple[str, str, str, str]] = []
    med_id = (case.get("pair") or {}).get("med_id")
    for x in result.get("product_explanations") or []:
        if (x.get("giai_thich") or "").strip():
            out.append((f"thuoc: {x.get('thuoc_a')} + {x.get('thuoc_b')}", x["giai_thich"], "", ""))
    for x in result.get("food_interactions") or []:
        if (x.get("giai_thich") or "").strip():
            src = _source_for_item("food", med_id, x.get("thuc_pham")) or ("", "")
            out.append((f"thuc_pham: {x.get('thuc_pham')}", x["giai_thich"], src[0], src[1]))
    for x in result.get("disease_interactions") or []:
        if (x.get("giai_thich") or "").strip():
            src = _source_for_item("disease", med_id, x.get("ten_benh")) or ("", "")
            out.append((f"benh_nen: {x.get('ten_benh')}", x["giai_thich"], src[0], src[1]))
    ov = result.get("overview") or {}
    if (ov.get("giai_thich") or "").strip():
        out.append(("overview", ov["giai_thich"], "", ""))
    return out


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Cần <run_dir>")
    run_dir = Path(sys.argv[1])
    dataset = _load_dataset()
    RESULTS.mkdir(parents=True, exist_ok=True)

    review_rows, calib_src = [], []
    outs = sorted((run_dir / "outputs").glob("*.json"))
    for p in outs:
        if "__r" in p.stem:  # bỏ các rep của consistency
            continue
        rec = json.loads(p.read_text(encoding="utf-8"))
        case = dataset.get(rec.get("case_id"))
        if not case or rec.get("error") or rec.get("skipped"):
            continue
        src = case.get("nguon") or {}
        result = rec.get("result") or {}
        for label, text, mo_ta_item, xu_tri_item in _narratives(case, result):
            review_rows.append({
                "case_id": case["id"], "nhom": case["nhom"], "audience": case.get("audience"),
                "doan": label,
                "probe": case.get("probe", ""),
                # đoạn food/disease dùng nguồn của ĐÚNG dòng đó (tra DB); còn lại
                # dùng nguồn cặp mục tiêu trong case.
                "mo_ta_goc_EN": mo_ta_item or src.get("mo_ta", ""),
                "xu_tri_goc_EN": xu_tri_item or src.get("xu_tri", ""),
                "doan_giai_thich_TV": text,
                "safety_pass": "", "actionable_advice": "", "diagnosis": "",
                "faithfulness_note": "", "reviewer": "", "notes": "",
            })

        # calibration: chấm ĐÚNG đoạn + nguồn mà judge chấm (pick_scored_item) để κ
        # người-vs-judge so trên cùng đối tượng. Bỏ case chưa phân loại / nguồn N/A.
        if case["nhom"] in ("drug_drug", "food", "disease"):
            item = pick_scored_item(case, result)
            if item and item["mo_ta"] and item["mo_ta"].strip().lower() not in ("n/a", "-", ""):
                calib_src.append((case, item))

    calib_rows = []
    step = max(1, len(calib_src) // 10)
    for case, item in calib_src[::step][:10]:
        for metric in ("faithfulness", "relevance", "completeness"):
            calib_rows.append({
                "case_id": case["id"], "metric": metric, "doan": item["doan"],
                "mo_ta_goc_EN": item["mo_ta"], "xu_tri_goc_EN": item["xu_tri"],
                "doan_giai_thich_TV": item["narrative"],
                "human_verdict": "", "judge_verdict": "",
            })

    _write(RESULTS / "human_review.csv", review_rows)
    _write(RESULTS / "calibration.csv", calib_rows)
    print(f"  human_review.csv : {len(review_rows)} dòng")
    print(f"  calibration.csv  : {len(calib_rows)} dòng ({len(calib_rows)//3} case × 3 metric)")


def _write(path: Path, rows: list[dict]) -> None:
    if not rows:
        return
    with path.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    main()
