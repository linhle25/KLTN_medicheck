#!/usr/bin/env python3
"""Metric tự động (Pha 2) — đọc kết quả run_eval, tính metric 3, 7, 8, 9, 10.

    python -m eval.harness.metrics_auto                 # gộp mọi run dưới eval/results/runs/
    python -m eval.harness.metrics_auto <run_dir> ...   # chỉ các run chỉ định

Đọc: <run_dir>/capture.jsonl + <run_dir>/outputs/*.json (+ run_meta.json).
Xuất: eval/results/scorecard_auto.md + scorecard_auto.json

Không gọi LLM. Dùng lại filter_banned_language + _parse_highlights của code thật.
"""
from __future__ import annotations

import json
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

from src.agents.nodes.guardrail_node import _NEUTRAL_FALLBACK, filter_banned_language
from src.services.rollup_explain import _parse_highlights

ROOT = Path(__file__).resolve().parent.parent.parent
RUNS_DIR = ROOT / "eval" / "results" / "runs"
OUT_MD = ROOT / "eval" / "results" / "scorecard_auto.md"
OUT_JSON = ROOT / "eval" / "results" / "scorecard_auto.json"

# Giá DeepSeek (USD / 1M token) - KIỂM LẠI tại platform.deepseek.com trước khi trích báo cáo.
PRICE = {
    "deepseek-chat": {"in": 0.27, "out": 1.10},
    "deepseek-reasoner": {"in": 0.55, "out": 2.19},
}

# Marker/cấu trúc KHÔNG được lọt vào text hiển thị cho người dùng.
LEAK_MARKERS = ["[BẢN_DỊCH]", "[BAN_DICH]", "PHẦN 1", "PHẦN 2", "PHAN 1", "PHAN 2", "{{", "}}"]
NARRATIVE_PATHS = [
    ("product_explanations", "giai_thich"),
    ("food_interactions", "giai_thich"),
    ("disease_interactions", "giai_thich"),
]


# ---------------------------------------------------------------- load

def _load_run(run_dir: Path) -> dict:
    caps = []
    cap_path = run_dir / "capture.jsonl"
    if cap_path.exists():
        caps = [json.loads(x) for x in cap_path.read_text(encoding="utf-8").splitlines() if x.strip()]
    outs = []
    for p in sorted((run_dir / "outputs").glob("*.json")):
        outs.append(json.loads(p.read_text(encoding="utf-8")))
    meta = {}
    if (run_dir / "run_meta.json").exists():
        meta = json.loads((run_dir / "run_meta.json").read_text(encoding="utf-8"))
    phase = meta.get("phase") or run_dir.name.split("__")[-1]
    return {"dir": run_dir.name, "phase": phase, "caps": caps, "outs": outs, "meta": meta}


# ---------------------------------------------------------------- percentiles

def _pcts(values: list[float]) -> dict:
    if not values:
        return {}
    s = sorted(values)

    def q(p: float) -> float:
        i = min(len(s) - 1, int(round(p / 100 * (len(s) - 1))))
        return round(s[i], 3)

    return {"n": len(s), "p50": q(50), "p90": q(90), "p95": q(95), "p99": q(99),
            "max": round(s[-1], 3), "mean": round(statistics.fmean(s), 3)}


# ---------------------------------------------------------------- metric 3 + G4

def _narrative_part(call_site: str, raw: str) -> str:
    """Phần văn xuôi mà filter_banned_language THỰC SỰ chạy lên. product_edge nối
    PART1 (giải thích) + [BẢN_DỊCH] + PART2 (dịch nguyên văn tiếng Anh) — chỉ PART1
    bị lọc; PART2 chứa 'discontinue'/'should not…' là dịch trung thực, không tính.
    literal_merge là dịch thuần → bỏ hẳn."""
    if call_site == "literal_merge":
        return ""
    if call_site == "product_edge":
        return raw.split("[BẢN_DỊCH]", 1)[0]
    return raw  # overview / food_edge / disease_edge: raw = narrative


def metric_guardrail(runs: list[dict]) -> dict:
    raw_hits, scored_calls = [], 0
    fallback_hits, slipped, total_narratives = 0, [], 0
    for r in runs:
        for c in r["caps"]:
            part = _narrative_part(c.get("call_site") or "", c.get("raw_response") or "")
            if not part.strip():
                continue
            scored_calls += 1
            if filter_banned_language(part) != part:
                raw_hits.append({"case_id": c.get("case_id"), "call_site": c.get("call_site"),
                                 "snippet": part[:220]})
        for o in r["outs"]:
            res = o.get("result") or {}
            for key, field in NARRATIVE_PATHS + [("overview", "giai_thich")]:
                node = res.get(key)
                items = [node] if isinstance(node, dict) else (node or [])
                for it in items:
                    txt = ((it or {}).get(field) or "").strip()
                    if not txt:
                        continue
                    total_narratives += 1
                    if txt == _NEUTRAL_FALLBACK:
                        fallback_hits += 1
                    elif filter_banned_language(txt) != txt:
                        slipped.append({"case_id": o.get("case_id"), "path": key, "snippet": txt[:220]})
    return {
        "llm_narrative_banned_hits": len(raw_hits),
        "llm_narrative_banned_rate": round(len(raw_hits) / scored_calls, 4) if scored_calls else None,
        "slipped_past_filter": len(slipped),  # target 0 — đoạn hiển thị còn dính regex
        "fallback_nuke_count": fallback_hits,
        "fallback_nuke_rate": round(fallback_hits / total_narratives, 4) if total_narratives else None,
        "catch_rate": round(1 - len(slipped) / max(1, len(raw_hits)), 4) if raw_hits else 1.0,
        "hit_examples": raw_hits[:12],
        "slipped_examples": slipped[:12],
        "_note": "llm_narrative_banned = phần văn xuôi (đã tách PART2 dịch) khớp regex "
                 "TRƯỚC lọc. slipped = đoạn HIỂN THỊ còn khớp regex (lỗi thật). Regex "
                 "FP/FN thật cần bộ câu gán nhãn — Pha sau.",
    }


# ---------------------------------------------------------------- metric 7

def metric_latency(runs: list[dict]) -> dict:
    by_phase_wall: dict[str, list[float]] = defaultdict(list)
    by_tag_wall: dict[str, list[float]] = defaultdict(list)
    by_callsite: dict[str, list[float]] = defaultdict(list)
    for r in runs:
        for o in r["outs"]:
            if o.get("wall_s") is None or o.get("error") or o.get("skipped"):
                continue
            by_phase_wall[r["phase"]].append(o["wall_s"])
            tag = o.get("rep")
            if isinstance(tag, str) and tag.startswith(("cold", "warm")):
                by_tag_wall["warm" if tag.startswith("warm") else "cold"].append(o["wall_s"])
        for c in r["caps"]:
            if c.get("latency_s") is not None:
                by_callsite[c.get("call_site") or "?"].append(c["latency_s"])
    return {
        "end_to_end_by_phase": {k: _pcts(v) for k, v in sorted(by_phase_wall.items())},
        "end_to_end_latency_phase_cold_vs_warm": {k: _pcts(v) for k, v in sorted(by_tag_wall.items())},
        "per_llm_call_by_call_site": {k: _pcts(v) for k, v in sorted(by_callsite.items())},
    }


# ---------------------------------------------------------------- metric 8

def metric_format(runs: list[dict]) -> dict:
    leaks, empty_dich, checked = [], [], 0
    for r in runs:
        for o in r["outs"]:
            res = o.get("result") or {}
            for key, field in NARRATIVE_PATHS + [("overview", "giai_thich")]:
                node = res.get(key)
                items = [node] if isinstance(node, dict) else (node or [])
                for it in items:
                    txt = (it or {}).get(field) or ""
                    if not txt:
                        continue
                    checked += 1
                    hit = [m for m in LEAK_MARKERS if m in txt]
                    if hit:
                        leaks.append({"case_id": o.get("case_id"), "path": key, "markers": hit,
                                      "snippet": txt[:160]})
            # mo_ta_dich rỗng cho cặp classified (product_edge)
            for it in res.get("product_explanations") or []:
                if it.get("muc_do") in ("nang", "trung_binh", "nhe") and not (it.get("mo_ta_dich") or "").strip():
                    empty_dich.append({"case_id": o.get("case_id"),
                                       "pair": f'{it.get("thuoc_a")} + {it.get("thuoc_b")}'})
    return {
        "narratives_checked": checked,
        "marker_leak_count": len(leaks),
        "marker_leak_rate": round(len(leaks) / checked, 4) if checked else None,
        "empty_mo_ta_dich_classified": len(empty_dich),
        "leak_examples": leaks[:10],
        "empty_dich_examples": empty_dich[:10],
    }


# ---------------------------------------------------------------- metric 9

_RANK_KEY = {"nang": "so_cap_nang", "trung_binh": "so_cap_trung_binh",
             "nhe": "so_cap_nhe", "chua_phan_loai": "so_cap_chua_phan_loai"}


def metric_overview_consistency(runs: list[dict]) -> dict:
    checked, count_mismatch, hl_mismatch, examples = 0, 0, 0, []
    for r in runs:
        for o in r["outs"]:
            res = o.get("result") or {}
            ov = res.get("overview")
            if not isinstance(ov, dict):
                continue
            pe = res.get("product_explanations") or []
            checked += 1
            by_level = Counter(x.get("muc_do") for x in pe)
            bad = []
            for level, key in _RANK_KEY.items():
                if (ov.get(key) or 0) != by_level.get(level, 0):
                    bad.append(f"{level}: overview={ov.get(key)} vs cards={by_level.get(level, 0)}")
            if (ov.get("tong_so_cap") or 0) != len(pe):
                bad.append(f"tong={ov.get('tong_so_cap')} vs {len(pe)} cards")
            if bad:
                count_mismatch += 1
            # highlight ⊆ card pairs
            clean, hls = _parse_highlights(ov.get("giai_thich") or "")
            card_names = {(x.get("thuoc_a") or "").lower() for x in pe} | {(x.get("thuoc_b") or "").lower() for x in pe}
            stray = [h["text"] for h in hls
                     if not any(part in card_names for part in _split_pair(h["text"]))]
            if stray:
                hl_mismatch += 1
                bad.append(f"highlight lạ: {stray}")
            if bad:
                examples.append({"case_id": o.get("case_id"), "issues": bad})
    return {
        "overviews_checked": checked,
        "count_mismatch": count_mismatch,
        "highlight_stray": hl_mismatch,
        "pass_rate": round((checked - count_mismatch - hl_mismatch) / checked, 4) if checked else None,
        "examples": examples[:10],
    }


def _split_pair(text: str) -> list[str]:
    for sep in (" và ", " + ", " and "):
        if sep in text:
            return [p.strip().lower() for p in text.split(sep)]
    return [text.strip().lower()]


# ---------------------------------------------------------------- metric 10

def metric_cost(runs: list[dict]) -> dict:
    by_phase: dict[str, dict] = defaultdict(lambda: {"in": 0, "out": 0, "calls": 0, "cases": set()})
    for r in runs:
        for c in r["caps"]:
            b = by_phase[r["phase"]]
            b["in"] += c.get("input_tokens") or 0
            b["out"] += c.get("output_tokens") or 0
            b["calls"] += 1
            if c.get("case_id"):
                b["cases"].add(c["case_id"])
    out = {}
    p = PRICE["deepseek-chat"]
    for phase, b in by_phase.items():
        ncases = len(b["cases"]) or 1
        usd = b["in"] / 1e6 * p["in"] + b["out"] / 1e6 * p["out"]
        out[phase] = {
            "llm_calls": b["calls"], "cases": len(b["cases"]),
            "input_tokens": b["in"], "output_tokens": b["out"],
            "usd_total": round(usd, 4), "usd_per_case": round(usd / ncases, 5),
            "calls_per_case": round(b["calls"] / ncases, 2),
            "tokens_per_case": round((b["in"] + b["out"]) / ncases),
        }
    out["_price_note"] = f"deepseek-chat {p} USD/1M — KIỂM LẠI platform.deepseek.com"
    return out


# ---------------------------------------------------------------- render

def _md(scorecard: dict) -> str:
    md = ["# Scorecard tự động (metric 3, 7, 8, 9, 10)", ""]
    md.append(f"Nguồn: {', '.join(scorecard['runs'])}")
    md.append(f"Sinh lúc: {scorecard['generated']}")
    md.append("")

    g = scorecard["m3_guardrail"]
    md += ["## 3 — Guardrail", "",
          f"- Văn xuôi LLM khớp regex cấm (trước lọc, đã tách PART2 dịch): "
          f"**{g['llm_narrative_banned_hits']}** (tỉ lệ {g['llm_narrative_banned_rate']})",
          f"- **Lọt qua filter** (đoạn hiển thị còn khớp regex): **{g['slipped_past_filter']}**  "
          f"→ catch rate **{g['catch_rate']}**",
          f"- Fallback nuốt cả đoạn (G4): **{g['fallback_nuke_count']}** "
          f"(tỉ lệ {g['fallback_nuke_rate']})", ""]

    lat = scorecard["m7_latency"]
    md += ["## 7 — Latency (end-to-end, giây)", "", "| phase | n | p50 | p90 | p95 | p99 | max |",
          "|---|---|---|---|---|---|---|"]
    for k, v in lat["end_to_end_by_phase"].items():
        md.append(f"| {k} | {v.get('n')} | {v.get('p50')} | {v.get('p90')} | {v.get('p95')} | {v.get('p99')} | {v.get('max')} |")
    md += ["", "Per-call theo call_site (giây):", "", "| call_site | n | p50 | p95 | max |", "|---|---|---|---|---|"]
    for k, v in lat["per_llm_call_by_call_site"].items():
        md.append(f"| {k} | {v.get('n')} | {v.get('p50')} | {v.get('p95')} | {v.get('max')} |")
    md.append("")

    f = scorecard["m8_format"]
    md += ["## 8 — Format", "",
          f"- Lộ marker: **{f['marker_leak_count']}** / {f['narratives_checked']} đoạn ({f['marker_leak_rate']})",
          f"- `mo_ta_dich` rỗng ở cặp classified: **{f['empty_mo_ta_dich_classified']}**", ""]
    if f["leak_examples"]:
        md.append("Ví dụ lộ marker:")
        for e in f["leak_examples"]:
            md.append(f"- `{e['case_id']}` [{e['path']}] {e['markers']} — {e['snippet']!r}")
        md.append("")

    o = scorecard["m9_overview"]
    md += ["## 9 — Overview khớp số", "",
          f"- Overview kiểm: {o['overviews_checked']}",
          f"- Lệch số đếm: **{o['count_mismatch']}** · highlight lạ: **{o['highlight_stray']}** · pass rate {o['pass_rate']}", ""]
    if o["examples"]:
        for e in o["examples"]:
            md.append(f"- `{e['case_id']}`: {e['issues']}")
        md.append("")

    c = scorecard["m10_cost"]
    md += ["## 10 — Cost", "", "| phase | calls | cases | tok in | tok out | USD | USD/case | calls/case |",
          "|---|---|---|---|---|---|---|---|"]
    for k, v in c.items():
        if k.startswith("_"):
            continue
        md.append(f"| {k} | {v['llm_calls']} | {v['cases']} | {v['input_tokens']} | {v['output_tokens']} | "
                 f"{v['usd_total']} | {v['usd_per_case']} | {v['calls_per_case']} |")
    md += ["", f"_{c['_price_note']}_", ""]
    return "\n".join(md)


# ---------------------------------------------------------------- main

def main() -> None:
    from datetime import UTC, datetime

    args = sys.argv[1:]
    if args:
        run_dirs = [Path(a) for a in args]
    else:
        run_dirs = sorted(p for p in RUNS_DIR.glob("*__*") if p.is_dir())
    if not run_dirs:
        raise SystemExit("Không có run nào — chạy `python -m eval.harness.run_eval` trước.")

    runs = [_load_run(d) for d in run_dirs]
    scorecard = {
        "generated": datetime.now(UTC).isoformat(timespec="seconds"),
        "runs": [r["dir"] for r in runs],
        "m3_guardrail": metric_guardrail(runs),
        "m7_latency": metric_latency(runs),
        "m8_format": metric_format(runs),
        "m9_overview": metric_overview_consistency(runs),
        "m10_cost": metric_cost(runs),
    }
    OUT_JSON.write_text(json.dumps(scorecard, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_MD.write_text(_md(scorecard), encoding="utf-8")
    print(_md(scorecard))
    print(f"\n-> {OUT_MD}\n-> {OUT_JSON}")


if __name__ == "__main__":
    main()
