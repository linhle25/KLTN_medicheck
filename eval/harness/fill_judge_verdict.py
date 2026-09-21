#!/usr/bin/env python3
"""Điền cột `judge_verdict` vào (các) file calibration CSV từ kết quả judge_*.json.

    python -m eval.harness.fill_judge_verdict [calib1.csv calib2.csv ...]

Không truyền file -> tự tìm eval/results/calibration*.csv.

Quy ước nhãn nhị phân (khớp với human_verdict trong HUONG_DAN_CHAM_TAY.md), để
`judge.py --calibrate` tính Cohen's κ:
  faithfulness : pass nếu verdict == "pass"; còn "warn"/"fail" -> fail
  relevance    : pass nếu score >= 4 và không entity_leak; còn lại fail
  completeness : pass nếu score == 1.0; còn lại fail
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

RESULTS = Path(__file__).resolve().parent.parent.parent / "eval" / "results"


def _binary(metric: str, v: dict) -> str | None:
    if not v or v.get("_parse_error"):
        return None
    if metric == "faithfulness":
        return "pass" if v.get("verdict") == "pass" else "fail"
    if metric == "relevance":
        s = v.get("score")
        if not isinstance(s, (int, float)):
            return None
        return "pass" if (s >= 4 and not v.get("entity_leak")) else "fail"
    if metric == "completeness":
        s = v.get("score")
        if not isinstance(s, (int, float)):
            return None
        return "pass" if s >= 1.0 else "fail"
    return None


def _load_verdicts() -> dict[tuple[str, str], str]:
    out: dict[tuple[str, str], str] = {}
    for metric in ("faithfulness", "relevance", "completeness"):
        p = RESULTS / f"judge_{metric}.json"
        if not p.exists():
            print(f"  (bỏ qua) chưa có {p.name}")
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        for row in data.get("rows", []):
            label = _binary(metric, row.get("verdict") or {})
            if label:
                out[(row.get("case_id"), metric)] = label
    return out


def main() -> None:
    args = sys.argv[1:]
    files = [Path(a) for a in args] if args else sorted(RESULTS.glob("calibration*.csv"))
    if not files:
        raise SystemExit("Không tìm thấy file calibration*.csv")

    verdicts = _load_verdicts()
    print(f"  {len(verdicts)} verdict từ judge_*.json")

    for f in files:
        rows = list(csv.DictReader(f.open(encoding="utf-8-sig")))
        if not rows:
            continue
        filled = 0
        for r in rows:
            label = verdicts.get((r.get("case_id"), r.get("metric")))
            if label:
                r["judge_verdict"] = label
                filled += 1
        with f.open("w", newline="", encoding="utf-8-sig") as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        print(f"  {f.name}: điền {filled}/{len(rows)} dòng")


if __name__ == "__main__":
    main()
