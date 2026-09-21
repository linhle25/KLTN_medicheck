#!/usr/bin/env python3
"""LLM-judge (Pha 3) — chấm metric 1 (faithfulness), 4 (relevance), 5 (completeness)
bằng DeepSeek-reasoner, đối chiếu output của 1 run với nguồn DDInter trong gold set.

    python -m eval.harness.judge <run_dir> [--metric all|faithfulness|relevance|completeness] [--limit N]
    python -m eval.harness.judge --consistency <consistency_run_dir>      # metric 6
    python -m eval.harness.judge --calibrate <human_labels.csv>           # Cohen's κ

Judge = deepseek-reasoner, temperature 0. CÙNG nhà cung cấp với model đang chấm →
thiên vị giảm chứ không loại bỏ → BẮT BUỘC đối chiếu --calibrate với người trước khi
tin số.

Xuất: eval/results/judge_<metric>.json + judge_summary.md
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import re
import statistics
from pathlib import Path

from langchain_openai import ChatOpenAI

from src.config import get_settings

# --- khớp đúng cặp cho food/disease (Finding B1) -------------------------------
# Case trong dataset lưu pair.doi_tuong = tên EN (DiseaseInteraction.ten_benh /
# FoodInteraction.thuc_pham). Output của app lại đặt tên item = "<vi> or <en>"
# (food_disease_lookup.py). Không có ánh xạ EN->VI trong dataset nên tra thẳng DB
# 1 lần/case để lấy đúng tên hiển thị rồi so khớp với item.
_FD_NAME_CACHE: dict[tuple[str, str, str], str | None] = {}


def _display_name_for_pair(nhom: str, med_id: str | None, doi_tuong_en: str | None) -> str | None:
    if not med_id or not doi_tuong_en:
        return None
    ckey = (nhom, med_id, doi_tuong_en)
    if ckey in _FD_NAME_CACHE:
        return _FD_NAME_CACHE[ckey]
    name: str | None = None
    try:
        from src.db.models import DiseaseInteraction, FoodInteraction
        from src.db.session import SessionLocalFacts

        with SessionLocalFacts() as s:
            if nhom == "disease":
                row = (
                    s.query(DiseaseInteraction)
                    .filter(DiseaseInteraction.medication_id == med_id,
                            DiseaseInteraction.ten_benh == doi_tuong_en)
                    .first()
                )
                if row is not None:
                    name = row.ten_benh_vi or row.ten_benh
            else:
                row = (
                    s.query(FoodInteraction)
                    .filter(FoodInteraction.medication_id == med_id,
                            FoodInteraction.thuc_pham == doi_tuong_en)
                    .first()
                )
                if row is not None:
                    name = row.thuc_pham_vi or row.thuc_pham
    except Exception as exc:  # noqa: BLE001 - thiếu DB thì rơi về items[0]
        print(f"\n  [warn] _display_name_for_pair({ckey}): {type(exc).__name__}: {str(exc)[:120]}", flush=True)
    _FD_NAME_CACHE[ckey] = name
    return name

ROOT = Path(__file__).resolve().parent.parent.parent
DATASET_DIR = ROOT / "eval" / "datasets"
RUBRIC_DIR = Path(__file__).resolve().parent / "rubrics"
RESULTS = ROOT / "eval" / "results"

CLASSIFIED = ("nang", "trung_binh", "nhe")

# deepseek-reasoner chậm + đuôi latency dài (đôi khi 1 call > 150s). Giới hạn đồng
# thời + timeout mỗi call để 1 call chậm không "treo" cả job, và thử lại 1 lần khi
# call bị timeout / parse lỗi (đuôi latency ngẫu nhiên, retry thường xong).
# Nếu vẫn nhiều lỗi: chạy `--model deepseek-chat` (nhanh, đổi lại self-preference cao
# hơn một chút - bù bằng --calibrate). Xem eval/STATUS.md.
_SEM = asyncio.Semaphore(3)
_CALL_TIMEOUT = 210
_MAX_ATTEMPTS = 2
_MODEL = "deepseek-reasoner"
_DONE = [0]


def _tick(err: bool = False) -> None:
    _DONE[0] += 1
    print(f"\r  judged {_DONE[0]}{' (err)' if err else ''}   ", end="", flush=True)


def _judge_llm() -> ChatOpenAI:
    s = get_settings()
    return ChatOpenAI(
        model=_MODEL,
        api_key=s.deepseek_api_key,
        base_url=s.deepseek_base_url,
        temperature=0,
        max_retries=1,
        timeout=_CALL_TIMEOUT,
    )


async def _ask(llm, system: str, user: str) -> dict:
    msgs = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    last_err = "?"
    async with _SEM:
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            try:
                resp = await asyncio.wait_for(llm.ainvoke(msgs), timeout=_CALL_TIMEOUT + 20)
                parsed = _parse_json(resp.content or "")
                if not parsed.get("_parse_error"):
                    _tick()
                    return parsed
                last_err = "parse_error"
            except Exception as exc:  # noqa: BLE001
                last_err = f"{type(exc).__name__}: {str(exc)[:200]}"
            if attempt < _MAX_ATTEMPTS:
                await asyncio.sleep(2)
        _tick(err=True)
        print(f"\n  [err] {last_err}", flush=True)
        return {"_parse_error": True, "error": last_err[:300]}


_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)


def _parse_json(text: str) -> dict:
    m = _JSON_RE.search(text or "")
    if not m:
        return {"_parse_error": True, "raw": (text or "")[:500]}
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return {"_parse_error": True, "raw": m.group(0)[:500]}


# ---------------------------------------------------------------- load

def _load_dataset() -> dict[str, dict]:
    by_id: dict[str, dict] = {}
    for name in ("drug_drug", "food", "disease", "overview", "red_team"):
        p = DATASET_DIR / f"{name}.jsonl"
        for line in p.read_text(encoding="utf-8").splitlines():
            if line.strip():
                c = json.loads(line)
                by_id[c["id"]] = c
    return by_id


def _load_outputs(run_dir: Path) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for p in sorted((run_dir / "outputs").glob("*.json")):
        rec = json.loads(p.read_text(encoding="utf-8"))
        out.setdefault(rec.get("case_id"), rec)  # bản đầu tiên (rep None hoặc r1)
    return out


# ---------------------------------------------------------------- trích narrative

def _input_product_names(case: dict) -> set[str]:
    return {
        p.strip().lower()
        for rx in case["input"]["prescriptions"]
        for p in rx["products"]
    }


def _edge_source(edge: dict) -> str:
    """Nguồn để chấm cho 1 cạnh (product_explanations/food_interactions/
    disease_interactions item) - dùng mo_ta_dich/xu_tri_dich NGAY TRÊN edge, không
    dùng case["nguon"] tĩnh trong dataset. Lý do (01/09, xem docs/evaluation.md):
    case["nguon"] chỉ chụp lại đúng 1 dòng DDInter tại lúc build dataset, ứng với 1
    hoạt chất "đại diện" - nhưng khi sản phẩm có NHIỀU hoạt chất, giai_thich thật của
    app gộp nội dung từ NHIỀU dòng DDInter (xem nguon_trich_dan "Tổng hợp từ N hoạt
    chất..."). Chấm với nguồn chỉ có 1 dòng trong khi giai_thich có N dòng khiến judge
    coi oan phần nội dung hợp lệ (từ các hoạt chất khác) là bịa - xác nhận qua
    food-nang-005 (Sotraphar Notalzin: dextropropoxyphene + acetaminophen, 2 dòng
    DDInter, nhưng case["nguon"] cũ chỉ chụp 1 dòng). mo_ta_dich/xu_tri_dich trên
    edge chính là dữ liệu app đã gộp đủ N dòng đó, luôn khớp với giai_thich đang chấm,
    và cũng mới hơn case["nguon"] nếu CSDL DDInter đã được cập nhật sau khi build
    dataset."""
    mo_ta = edge.get("mo_ta_dich")
    xu_tri = edge.get("xu_tri_dich")
    if not mo_ta:
        return "Mô tả (Interaction): (không có dữ liệu nguồn)"
    source = f"Mô tả (Interaction): {mo_ta}"
    if xu_tri:
        source += f"\nXử trí (Management): {xu_tri}"
    return source


def _pick_narrative(case: dict, result: dict) -> tuple[str, str, str] | None:
    """-> (narrative, source_text, pair_label) hoặc None nếu không có gì để chấm."""
    nhom = case["nhom"]
    if nhom in ("drug_drug", "red_team"):
        pe = result.get("product_explanations") or []
        pe = [x for x in pe if x.get("muc_do") in CLASSIFIED and (x.get("giai_thich") or "").strip()]
        if not pe:
            return None
        names = _input_product_names(case)
        best = next(
            (x for x in pe if {(x.get("thuoc_a") or "").lower(), (x.get("thuoc_b") or "").lower()} & names),
            pe[0],
        )
        source = _edge_source(best)
        pair = f"{case['pair'].get('med_a')} × {case['pair'].get('med_b')}"
        return best.get("giai_thich", ""), source, pair

    if nhom in ("food", "disease"):
        key = "food_interactions" if nhom == "food" else "disease_interactions"
        name_field = "thuc_pham" if nhom == "food" else "ten_benh"
        items = [x for x in (result.get(key) or []) if (x.get("giai_thich") or "").strip()]
        if not items:
            return None

        # 1 thuốc tương tác nhiều bệnh/thực phẩm -> phải lấy ĐÚNG item khớp
        # case["pair"], không phải items[0] (Finding B1: chấm nhầm nguồn).
        want = _display_name_for_pair(nhom, case["pair"].get("med_id"), case["pair"].get("doi_tuong"))
        it = None
        for cand in (want, case["pair"].get("doi_tuong")):
            if not cand:
                continue
            it = next(
                (x for x in items if (x.get(name_field) or "").strip().casefold() == cand.strip().casefold()),
                None,
            )
            if it is not None:
                break
        if it is None:
            print(
                f"\n  [warn] {case['id']}: không khớp được '{case['pair'].get('doi_tuong')}' "
                f"trong {len(items)} item {key} -> bỏ qua case này",
                flush=True,
            )
            return None

        source = _edge_source(it)
        pair = f"{case['pair'].get('med')} × {case['pair'].get('doi_tuong')}"
        return it.get("giai_thich", ""), source, pair

    if nhom == "overview":
        ov = result.get("overview") or {}
        txt = (ov.get("giai_thich") or "").strip()
        pe = result.get("product_explanations") or []
        if not txt or not pe:
            return None
        counts = {k: ov.get(f"so_cap_{k}") for k in ("nang", "trung_binh", "nhe", "chua_phan_loai")}
        pairs = "; ".join(f"{x.get('thuoc_a')} + {x.get('thuoc_b')} ({x.get('muc_do')})" for x in pe)
        source = f"Tổng {ov.get('tong_so_cap')} cặp. Phân bố: {counts}. Các cặp: {pairs}"
        return txt, source, "overview"

    return None


def pick_scored_item(case: dict, result: dict) -> dict | None:
    """Trả ĐÚNG đoạn + nhãn mà judge chấm (drug_drug/food/disease), dạng có cấu trúc:
    {doan, narrative, mo_ta, xu_tri}. Dùng cho human_sheet để phiếu calibration chấm
    đúng đối tượng judge chấm (κ mới có nghĩa). Cùng logic chọn item với
    _pick_narrative — GIỮ ĐỒNG BỘ nếu sửa 1 trong 2."""
    nhom = case["nhom"]
    if nhom in ("drug_drug", "red_team"):
        pe = [x for x in (result.get("product_explanations") or [])
              if x.get("muc_do") in CLASSIFIED and (x.get("giai_thich") or "").strip()]
        if not pe:
            return None
        names = _input_product_names(case)
        x = next(
            (x for x in pe if {(x.get("thuoc_a") or "").lower(), (x.get("thuoc_b") or "").lower()} & names),
            pe[0],
        )
        return {"doan": f"thuoc: {x.get('thuoc_a')} + {x.get('thuoc_b')}",
                "narrative": x.get("giai_thich", ""),
                "mo_ta": x.get("mo_ta_dich") or "", "xu_tri": x.get("xu_tri_dich") or ""}
    if nhom in ("food", "disease"):
        key = "food_interactions" if nhom == "food" else "disease_interactions"
        name_field = "thuc_pham" if nhom == "food" else "ten_benh"
        items = [x for x in (result.get(key) or []) if (x.get("giai_thich") or "").strip()]
        if not items:
            return None
        want = _display_name_for_pair(nhom, case["pair"].get("med_id"), case["pair"].get("doi_tuong"))
        it = None
        for cand in (want, case["pair"].get("doi_tuong")):
            if cand:
                it = next((x for x in items
                           if (x.get(name_field) or "").strip().casefold() == cand.strip().casefold()), None)
                if it is not None:
                    break
        if it is None:
            return None
        label = "thuc_pham" if nhom == "food" else "benh_nen"
        return {"doan": f"{label}: {it.get(name_field)}",
                "narrative": it.get("giai_thich", ""),
                "mo_ta": it.get("mo_ta_dich") or "", "xu_tri": it.get("xu_tri_dich") or ""}
    return None


# ---------------------------------------------------------------- chấm 1 metric

_USER_TMPL = {
    "faithfulness": "NGUỒN:\n{source}\nAUDIENCE: {audience}\n\nĐOẠN GIẢI THÍCH:\n{narrative}",
    "relevance": "CẶP ĐANG XÉT: {pair}\nDANH SÁCH THUỐC TRONG YÊU CẦU: {drugs}\n\nĐOẠN GIẢI THÍCH:\n{narrative}",
    "completeness": "NGUỒN:\n{source}\nAUDIENCE: {audience}\n\nĐOẠN GIẢI THÍCH:\n{narrative}",
}


async def _score_one(llm, rubric: str, metric: str, case: dict, narrative: str, source: str, pair: str) -> dict:
    user = _USER_TMPL[metric].format(
        source=source, narrative=narrative, pair=pair, audience=case.get("audience", "patient"),
        drugs=", ".join(sorted(_input_product_names(case))),
    )
    verdict = await _ask(llm, rubric, user)
    return {"case_id": case["id"], "nhom": case["nhom"], "audience": case.get("audience"),
            "pair": pair, "verdict": verdict}


async def run_metric(run_dir: Path, metric: str, limit: int) -> dict:
    rubric = (RUBRIC_DIR / f"{metric}.md").read_text(encoding="utf-8")
    dataset = _load_dataset()
    outputs = _load_outputs(run_dir)
    llm = _judge_llm()

    jobs = []
    for cid, rec in outputs.items():
        case = dataset.get(cid)
        if not case or rec.get("error") or rec.get("skipped"):
            continue
        if metric == "relevance" and case["nhom"] == "overview":
            continue
        if metric == "completeness" and case["nhom"] not in ("drug_drug", "food", "disease"):
            continue
        picked = _pick_narrative(case, rec.get("result") or {})
        if not picked:
            continue
        narrative, source, pair = picked
        jobs.append((case, narrative, source, pair))
    if limit:
        jobs = jobs[:limit]

    print(f"  {metric}: {len(jobs)} case")
    results = await asyncio.gather(*(
        _score_one(llm, rubric, metric, c, n, s, p) for c, n, s, p in jobs
    ))
    return _aggregate(metric, results)


def _aggregate(metric: str, rows: list[dict]) -> dict:
    ok = [r for r in rows if not r["verdict"].get("_parse_error")]
    agg: dict = {"metric": metric, "n": len(rows), "n_parsed": len(ok), "rows": rows}
    if metric == "faithfulness":
        vals = [r["verdict"].get("faithfulness") for r in ok if isinstance(r["verdict"].get("faithfulness"), (int, float))]
        agg["mean_faithfulness"] = round(statistics.fmean(vals), 4) if vals else None
        agg["fail"] = [r["case_id"] for r in ok if r["verdict"].get("verdict") == "fail"]
        agg["with_hallucination"] = [r["case_id"] for r in ok if r["verdict"].get("hallucinated")]
        agg["with_fabricated_numbers"] = [r["case_id"] for r in ok if r["verdict"].get("fabricated_numbers")]
        agg["with_management_leak"] = [r["case_id"] for r in ok if r["verdict"].get("management_leak")]
    elif metric == "relevance":
        vals = [r["verdict"].get("score") for r in ok if isinstance(r["verdict"].get("score"), (int, float))]
        agg["mean_score"] = round(statistics.fmean(vals), 3) if vals else None
        agg["entity_leak"] = [r["case_id"] for r in ok if r["verdict"].get("entity_leak")]
        agg["below_4"] = [r["case_id"] for r in ok if isinstance(r["verdict"].get("score"), (int, float)) and r["verdict"]["score"] < 4]
    elif metric == "completeness":
        vals = [r["verdict"].get("score") for r in ok if isinstance(r["verdict"].get("score"), (int, float))]
        agg["mean_score"] = round(statistics.fmean(vals), 3) if vals else None
        agg["missing_mechanism"] = [r["case_id"] for r in ok if r["verdict"].get("mechanism_present") is False]
        agg["missing_consequence"] = [r["case_id"] for r in ok if r["verdict"].get("consequence_present") is False]
    return agg


# ---------------------------------------------------------------- consistency (metric 6)

async def run_consistency(run_dir: Path, limit: int) -> dict:
    rubric = (RUBRIC_DIR / "consistency.md").read_text(encoding="utf-8")
    dataset = _load_dataset()
    llm = _judge_llm()

    by_case: dict[str, list[str]] = {}
    for p in sorted((run_dir / "outputs").glob("*__r*.json")):
        rec = json.loads(p.read_text(encoding="utf-8"))
        cid = rec.get("case_id")
        case = dataset.get(cid)
        if not case or rec.get("error"):
            continue
        picked = _pick_narrative(case, rec.get("result") or {})
        if picked:
            by_case.setdefault(cid, []).append(picked[0])

    items = [(cid, v) for cid, v in by_case.items() if len(v) >= 2]
    if limit:
        items = items[:limit]
    print(f"  consistency: {len(items)} case × ~3 bản")

    async def _one(cid, versions):
        user = "\n\n".join(f"VERSION {i + 1}:\n{v}" for i, v in enumerate(versions))
        return {"case_id": cid, "n_versions": len(versions), "verdict": await _ask(llm, rubric, user)}

    rows = await asyncio.gather(*(_one(cid, v) for cid, v in items))
    ok = [r for r in rows if not r["verdict"].get("_parse_error")]
    return {
        "metric": "consistency", "n": len(rows), "n_parsed": len(ok), "rows": rows,
        "clinically_equivalent_rate": round(
            sum(1 for r in ok if r["verdict"].get("clinically_equivalent")) / len(ok), 4
        ) if ok else None,
        "with_claim_flips": [r["case_id"] for r in ok if r["verdict"].get("claim_flips")],
        "safety_property_changed": [r["case_id"] for r in ok if r["verdict"].get("safety_property_changed")],
    }


# ---------------------------------------------------------------- calibration (Cohen's κ)

def cohen_kappa(a: list[str], b: list[str]) -> float | None:
    pairs = [(x, y) for x, y in zip(a, b, strict=False) if x and y]
    if not pairs:
        return None
    labels = sorted({x for p in pairs for x in p})
    n = len(pairs)
    po = sum(1 for x, y in pairs if x == y) / n
    pe = sum(
        (sum(1 for x, _ in pairs if x == lb) / n) * (sum(1 for _, y in pairs if y == lb) / n)
        for lb in labels
    )
    return round((po - pe) / (1 - pe), 4) if pe != 1 else 1.0


def calibrate(csv_path: Path) -> dict:
    """CSV cần cột: case_id, metric, human_verdict, judge_verdict (điền sau khi chạy judge)."""
    rows = list(csv.DictReader(csv_path.open(encoding="utf-8-sig")))
    out = {}
    for metric in sorted({r["metric"] for r in rows}):
        mr = [r for r in rows if r["metric"] == metric]
        k = cohen_kappa([r["human_verdict"] for r in mr], [r.get("judge_verdict", "") for r in mr])
        out[metric] = {"n": len(mr), "cohen_kappa": k,
                       "trust": "OK (dùng judge)" if (k or 0) >= 0.6 else "THẤP — chuyển chấm tay"}
    return out


# ---------------------------------------------------------------- main

def _summary_md(results: list[dict]) -> str:
    md = ["# Judge summary (metric 1, 4, 5, 6)", ""]
    for a in results:
        m = a["metric"]
        md.append(f"## {m}  ·  n={a['n']} (parse OK {a['n_parsed']})")
        for k, v in a.items():
            if k in ("metric", "n", "n_parsed", "rows"):
                continue
            if isinstance(v, list):
                md.append(f"- {k}: {len(v)} — {v[:15]}")
            else:
                md.append(f"- **{k}: {v}**")
        md.append("")
    return "\n".join(md)


async def _amain() -> None:
    global _MODEL
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", nargs="?", type=Path)
    ap.add_argument("--metric", default="all",
                    help='"all" | 1 metric | nhiều metric phân tách bằng dấu phẩy '
                         '(vd "relevance,completeness")')
    ap.add_argument("--consistency", type=Path)
    ap.add_argument("--calibrate", type=Path)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--model", default=_MODEL, help="deepseek-reasoner (mặc định) | deepseek-chat (nhanh)")
    args = ap.parse_args()
    _MODEL = args.model
    RESULTS.mkdir(parents=True, exist_ok=True)

    if args.calibrate:
        rep = calibrate(args.calibrate)
        (RESULTS / "judge_calibration.json").write_text(json.dumps(rep, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(rep, ensure_ascii=False, indent=2))
        return

    def _persist(agg: dict) -> None:
        """Ghi 1 metric ra file NGAY khi chấm xong (job dài ~20 phút - nếu crash giữa
        chừng vẫn giữ được metric đã xong), kể cả consistency (trước đây bị bỏ sót)."""
        (RESULTS / f"judge_{agg['metric']}.json").write_text(
            json.dumps(agg, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        # Dựng lại judge_summary.md từ MỌI file judge_*.json trên đĩa -> chạy lẻ 1 metric
        # (hoặc --consistency riêng) không xoá tóm tắt của metric khác.
        order = ["faithfulness", "relevance", "completeness", "consistency"]
        on_disk = [
            json.loads((RESULTS / f"judge_{m}.json").read_text(encoding="utf-8"))
            for m in order
            if (RESULTS / f"judge_{m}.json").exists()
        ]
        (RESULTS / "judge_summary.md").write_text(_summary_md(on_disk), encoding="utf-8")

    if args.run_dir:
        _ALL = ["faithfulness", "relevance", "completeness"]
        metrics = _ALL if args.metric == "all" else [m.strip() for m in args.metric.split(",") if m.strip()]
        bad = [m for m in metrics if m not in _ALL]
        if bad:
            raise SystemExit(f"--metric không hợp lệ: {bad} (chọn trong {_ALL} hoặc 'all')")
        for m in metrics:
            _persist(await run_metric(args.run_dir, m, args.limit))

    if args.consistency:
        _persist(await run_consistency(args.consistency, args.limit))

    if not args.run_dir and not args.consistency:
        raise SystemExit("Cần <run_dir> (metric 1/4/5), --consistency (metric 6), hoặc --calibrate")

    print("\n" + (RESULTS / "judge_summary.md").read_text(encoding="utf-8"))
    print(f"-> {RESULTS / 'judge_summary.md'}")


if __name__ == "__main__":
    asyncio.run(_amain())
