#!/usr/bin/env python3
"""Runner đánh giá — chạy từng case gold set qua _run_product_check (luồng thật của
/products/check), bọc eval_context để capture.py ghi lại mọi call LLM.

    python -m eval.harness.run_eval --phase cold
    python -m eval.harness.run_eval --phase warm
    python -m eval.harness.run_eval --phase consistency
    python -m eval.harness.run_eval --phase latency
    python -m eval.harness.run_eval --phase cold --limit 3          # smoke test

Đầu ra: eval/results/runs/<timestamp>__<phase>/
    capture.jsonl                      (mọi call LLM — do capture.py ghi)
    outputs/<case_id>[__rep].json      (result dict + unknown/no_data + wall_s)
    run_meta.json                      (phase, datasets, số case, git sha)

Ghi chú:
  cold        EVAL_NO_CACHE=1, mỗi case 1 lần.
  warm        cache bật, mỗi case 1 lần — chạy SAU cold để cache đã đầy.
  consistency EVAL_NO_CACHE=1, 20 case (drug_drug/food/disease) × 3 lần.
  latency     3 scenario × N lần (mặc định 30 warm + 5 cold), đo wall-clock tuần tự.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATASET_DIR = ROOT / "eval" / "datasets"
DEFAULT_OUT = ROOT / "eval" / "results" / "runs"
ALL_DATASETS = ["drug_drug", "food", "disease", "overview", "red_team", "edge"]


def _load(names: list[str]) -> list[dict]:
    cases: list[dict] = []
    for name in names:
        path = DATASET_DIR / f"{name}.jsonl"
        if not path.exists():
            raise SystemExit(f"Thiếu {path} — chạy `python -m eval.harness.build_dataset` trước.")
        cases += [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return cases


def _git_sha() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except Exception:
        return None


async def _run_case(case: dict, rep: int | None, out_dir: Path) -> dict:
    # import trễ: EVAL_* env phải được set trước khi module llm/explanation_cache đọc
    from eval.harness.capture import eval_context
    from src.api.routes import _run_product_check
    from src.db.session import SessionLocal
    from src.models.schemas import PrescriptionInput

    cid = case["id"]
    audience = case.get("audience", "patient")
    tag = f"{_PHASE}" if rep is None else f"{_PHASE}-r{rep}"
    stem = cid if rep is None else f"{cid}__r{rep}"

    # Chỉ giữ đúng nhánh mà case cần: food case bỏ disease, disease case bỏ food,
    # còn lại (drug_drug/overview/red_team/edge) bỏ cả hai — mỗi thuốc kéo theo hàng
    # chục edge/call LLM không liên quan. Xem EVAL_SKIP_FOOD_DISEASE trong src/api/routes.py.
    os.environ["EVAL_SKIP_FOOD_DISEASE"] = {
        "food": "disease", "disease": "food"
    }.get(case["nhom"], "both")

    try:
        prescriptions = [PrescriptionInput(**p) for p in case["input"]["prescriptions"]]
    except Exception as exc:  # noqa: BLE001 — case edge cố tình gửi input không hợp lệ
        record = {"case_id": cid, "phase": _PHASE, "rep": rep, "skipped": f"input_invalid: {exc}"}
        (out_dir / "outputs" / f"{stem}.json").write_text(
            json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return record

    db = SessionLocal()
    t0 = time.perf_counter()
    try:
        with eval_context(request_id=f"{cid}#{tag}", audience=audience, case_id=cid, run_tag=tag):
            result, unknown, no_data = await _run_product_check(
                prescriptions, db, for_pharmacist=(audience == "pharmacist"), disease_ids=None
            )
        wall_s = round(time.perf_counter() - t0, 4)
        record = {
            "case_id": cid, "phase": _PHASE, "rep": rep, "audience": audience,
            "wall_s": wall_s, "unknown_products": unknown, "no_interaction_data_products": no_data,
            "result": result,
        }
    except Exception as exc:  # noqa: BLE001
        record = {
            "case_id": cid, "phase": _PHASE, "rep": rep, "audience": audience,
            "wall_s": round(time.perf_counter() - t0, 4), "error": f"{type(exc).__name__}: {exc}",
        }
    finally:
        db.close()

    (out_dir / "outputs" / f"{stem}.json").write_text(
        json.dumps(record, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )
    status = record.get("error") or record.get("skipped") or f'{record.get("wall_s")}s'
    print(f"  {stem:32s} {status}")
    return record


def _consistency_subset(cases: list[dict]) -> list[dict]:
    pool = [
        c for c in cases
        if c["nhom"] in ("drug_drug", "food", "disease")
        and (c.get("nguon") or {}).get("mo_ta") not in (None, "", "N/A")
    ]
    step = max(1, len(pool) // 20)
    return pool[::step][:20]


def _latency_scenarios(cases: list[dict]) -> list[dict]:
    by_id = {c["id"]: c for c in cases}
    want = [
        ("s1_2thuoc", next((c for c in cases if c["nhom"] == "drug_drug" and not c["stratum"]["multi_rx"]), None)),
        ("s2_5thuoc", by_id.get("ov-multi-001") or next((c for c in cases if c["id"].startswith("ov-multi")), None)),
        ("s3_dadon", by_id.get("ov-multirx-003") or next((c for c in cases if c["id"].startswith("ov-multirx")), None)),
    ]
    out = []
    for label, c in want:
        if c is not None:
            c = dict(c, id=label)
            out.append(c)
    return out


_PHASE = "cold"


async def _main() -> None:
    global _PHASE
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=["cold", "warm", "consistency", "latency"], default="cold")
    ap.add_argument("--datasets", nargs="*", default=ALL_DATASETS)
    ap.add_argument("--limit", type=int, default=0, help="0 = tất cả")
    ap.add_argument("--reps", type=int, default=30, help="latency: số lần đo mỗi scenario")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    _PHASE = args.phase

    cases = _load(args.datasets)
    if args.limit:
        cases = cases[: args.limit]

    ts = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    out_dir = args.out / f"{ts}__{args.phase}"
    (out_dir / "outputs").mkdir(parents=True, exist_ok=True)
    os.environ["EVAL_CAPTURE_PATH"] = str(out_dir / "capture.jsonl")
    if args.phase in ("cold", "consistency"):
        os.environ["EVAL_NO_CACHE"] = "1"
    else:
        os.environ.pop("EVAL_NO_CACHE", None)

    print(f"=== {args.phase} · {out_dir.name} ===")
    records: list[dict] = []

    if args.phase in ("cold", "warm"):
        for c in cases:
            records.append(await _run_case(c, None, out_dir))

    elif args.phase == "consistency":
        subset = _consistency_subset(cases)
        print(f"  {len(subset)} case × 3 lần")
        for rep in (1, 2, 3):
            for c in subset:
                records.append(await _run_case(c, rep, out_dir))

    elif args.phase == "latency":
        scenarios = _latency_scenarios(cases)
        # cold
        os.environ["EVAL_NO_CACHE"] = "1"
        for c in scenarios:
            for rep in range(1, 6):
                records.append(await _run_case(dict(c, audience="patient"), f"cold{rep}", out_dir))
        # warm: 1 lần làm nóng cache rồi đo N lần
        os.environ.pop("EVAL_NO_CACHE", None)
        for c in scenarios:
            await _run_case(dict(c, audience="patient"), "warmup", out_dir)
            for rep in range(1, args.reps + 1):
                records.append(await _run_case(dict(c, audience="patient"), f"warm{rep}", out_dir))

    meta = {
        "phase": args.phase, "datasets": args.datasets, "limit": args.limit,
        "n_records": len(records), "git_sha": _git_sha(),
        "started_utc": ts, "finished_utc": datetime.now(UTC).strftime("%Y%m%d-%H%M%S"),
        "capture_lines": sum(1 for _ in (out_dir / "capture.jsonl").open(encoding="utf-8"))
        if (out_dir / "capture.jsonl").exists() else 0,
    }
    (out_dir / "run_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{meta['n_records']} record · {meta['capture_lines']} dòng capture.jsonl")
    print(f"-> {out_dir}")


if __name__ == "__main__":
    asyncio.run(_main())
