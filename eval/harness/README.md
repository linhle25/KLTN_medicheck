# eval/harness

Bộ công cụ đánh giá phần LLM sinh giải thích tương tác thuốc. Xem kế hoạch đầy đủ ở
[../PLAN.md](../PLAN.md).

## Trạng thái

| Pha | File | Xong |
|---|---|---|
| 0 | `capture.py` — ghi mỗi call LLM ra JSONL (gated `EVAL_CAPTURE_PATH`) | ✅ |
| 0 | hook `src/services/llm.py` + `src/services/explanation_cache.py` + `src/api/routes.py` | ✅ |
| 0 | `../../scripts/check_severity_mapping.py` — đối chiếu ETL mức độ (0 lệch / 52 104 cặp) | ✅ |
| 1 | `build_dataset.py` + `../datasets/*.jsonl` (135 case + template) | ✅ |
| 1 | `run_eval.py` (cold / warm / consistency / latency) | ✅ |
| 2 | `metrics_auto.py` — metric 3, 7, 8, 9, 10 | ✅ **đã chạy** (cold+warm) |
| 2 | run cold / warm / consistency | ✅ (3 thư mục trong `../results/runs/`) |
| 3 | `judge.py` + `rubrics/*.md` — metric 1, 4, 5, 6 | ✅ đã chấm bằng 24 phiên Claude độc lập (bỏ DeepSeek-reasoner vì tự thiên vị) |
| 4 | `human_sheet.py` — phiếu an toàn + calibration CSV | ✅ đã chạy soát tay 31 case (1 người, không tính κ) |
| 5 | `../../docs/evaluation.md` — báo cáo chính thức (Deliverable #10) | ✅ 01/09: 135 case tối ưu + 40 case held-out |

**➡️ Phương pháp và kết quả đầy đủ: xem [`../../docs/evaluation.md`](../../docs/evaluation.md).**

## Biến môi trường

| Biến | Tác dụng |
|---|---|
| `EVAL_CAPTURE_PATH` | Trỏ tới file `.jsonl`. Khi set: mỗi call `ainvoke_llm` ghi 1 dòng (prompt, raw_response, latency_s, token). Khi trống: `llm.py` không import harness, hành vi không đổi. |
| `EVAL_NO_CACHE` | `=1` → `lookup_cached` luôn trả `None` (bỏ cache giải thích cấp thuốc/thực phẩm/bệnh nền). Cần cho consistency và cold run. |
| `EVAL_SKIP_FOOD_DISEASE` | `both`/`1` bỏ cả 2 nhánh, `food` bỏ thực phẩm, `disease` bỏ bệnh nền. Runner tự set theo `nhom` của case — mỗi thuốc kéo theo hàng chục edge/call LLM không liên quan tới case đang chấm. |
| `LLM_TEMPERATURE` | Có sẵn trong `src/config.py`. Đặt `0` ở `.env` cho vòng chạy so sánh phần dịch. |

Cả 3 biến `EVAL_*` mặc định trống → luồng sản xuất không đổi hành vi (`pytest tests/ -q` vẫn 60/60).

## Định dạng 1 dòng capture.jsonl

```json
{
  "ts": "2026-08-29T10:00:01Z",
  "run_tag": "cold",
  "request_id": "dd-nang-001#cold",
  "case_id": "dd-nang-001",
  "audience": "patient",
  "call_site": "product_edge",
  "system_prompt": "…",
  "user_prompt": "…",
  "raw_response": "…",
  "latency_s": 2.41,
  "input_tokens": 2760,
  "output_tokens": 233
}
```

`call_site` ∈ `product_edge | overview | food_edge | disease_edge | literal_merge | unknown`
— suy ra từ cụm cố định trong system prompt, không sửa code sản xuất.

## Dùng từ runner (Pha 1)

```python
from eval.harness.capture import eval_context

with eval_context(request_id=f"{case['id']}#{tag}", audience=case["audience"],
                  case_id=case["id"], run_tag=tag):
    await _run_product_check(prescriptions, db, for_pharmacist=(audience == "pharmacist"))
```

`contextvars` tự lan sang các task trong `asyncio.gather` nên chỉ cần bọc tầng ngoài cùng.

## Chạy

```bash
# Pha 0 — hook inert + đối chiếu ETL
pytest tests/ -q                                   # 60/60 pass, không set EVAL_*
python scripts/check_severity_mapping.py           # 0 lệch

# Pha 1 — dựng gold set + smoke
python -m eval.harness.build_dataset
python -m eval.harness.run_eval --phase cold --limit 3 --datasets drug_drug

# Pha 2 (khi có metrics_auto.py) — chạy đầy đủ
python -m eval.harness.run_eval --phase cold          # ~450 call LLM
python -m eval.harness.run_eval --phase warm
python -m eval.harness.run_eval --phase consistency
python -m eval.harness.run_eval --phase latency
```

Ước tính 1 vòng đầy đủ (cold+warm+consistency+latency) ≈ 800–900 call DeepSeek,
~$1–2. 3–4 vòng khi chỉnh prompt vẫn < 10 USD.
